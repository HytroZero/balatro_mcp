import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { ScoringSandbox, type ScoreState } from '../env/sandbox/index.ts';
import { projectRoot } from '../src/config.ts';

const source = resolve(projectRoot, 'env/pruned');
const vendor = resolve(projectRoot, 'env/sandbox/vendor');
const lua = process.env.LUAJIT ?? 'luajit';
const skip = !existsSync(resolve(source, 'worker.lua')) ? 'Local pruned engine required' :
  spawnSync(lua, ['-v']).status !== 0 ? 'LuaJIT required' : false;

test('pruned bundle executable hashes match its manifest', { skip: !existsSync(resolve(source, 'manifest.json')) }, async () => {
  const manifest = JSON.parse(await readFile(resolve(source, 'manifest.json'), 'utf8')) as {
    files: Record<string, string>; runtimeSha256: string;
  };
  assert.equal(Object.keys(manifest.files).length, 12);
  for (const [path, expected] of Object.entries(manifest.files)) {
    const actual = createHash('sha256').update(await readFile(resolve(source, path))).digest('hex');
    assert.equal(actual, expected, path);
  }
  assert.equal(manifest.files['runtime.lua'], manifest.runtimeSha256);
});

test('pruned worker runs from an isolated copy with no project or vendor files', { skip }, async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'balatro-pruned-'));
  try {
    const engine = resolve(root, 'engine with spaces');
    await cp(source, engine, { recursive: true });
    // No project root argument: the worker must find runtime and JSON beside itself.
    const requests = [
      { id: 1, method: 'load', state: { hand: ['S_K', 'H_K', 'D_A'], jokers: ['j_joker'], random: 'expectation' } },
      { id: 2, method: 'batch', plays: [[0, 1], [2], [0, 1]] },
      { id: 3, method: 'load', state: { hand: ['S_A'], random: 'seeded' } },
      { id: 4, method: 'score', play: [0] },
      { id: 5, method: 'discard_hits', state: { hand: ['S_K', 'H_K', { key: 'D_A', seal: 'Purple' }], deck: ['C_K'], jokers: ['j_trading'], blind: 'bl_hook', random: 'expectation' }, cards: [2], draws: [[0]], hand: 'Three of a Kind', limit: 5 },
      // Removed route endpoints must stay unavailable, even to direct worker callers.
      ...['materialize', 'transition', 'refill'].map((method, i) => ({ id: 6 + i, method })),
    ];
    const child = spawnSync(lua, [resolve(engine, 'worker.lua')], {
      cwd: root, input: requests.map(r => JSON.stringify(r)).join('\n') + '\n', encoding: 'utf8', timeout: 30_000,
    });
    assert.equal(child.status, 0, child.stderr);
    const responses = child.stdout.trim().split('\n').map(line => JSON.parse(line));
    assert.equal(responses.length, 8);
    assert.equal(responses[0].result.status, 'ready');
    assert.equal(responses[1].result[0].score, 180);
    assert.deepEqual(responses[1].result[2], responses[1].result[0]);
    assert.equal(responses[2].result.status, 'unsupported');
    assert.equal(responses[3].result.status, 'error', 'rejected load invalidates the old position');
    assert.deepEqual(responses[4].result, [true]);
    for (const response of responses.slice(5)) {
      assert.equal(response.result.status, 'error');
      assert.match(response.result.message, /Unknown sandbox method/);
    }
    // The TypeScript API must choose this copy's worker, from a different cwd.
    const program = `import assert from 'node:assert/strict';
      const {ScoringSandbox} = await import(${JSON.stringify(resolve(projectRoot, 'env/sandbox/index.ts'))});
      const sandbox = new ScoringSandbox({sourceDir:${JSON.stringify(engine)}, lua:${JSON.stringify(lua)}});
      try {
        assert.equal((await sandbox.load({hand:['S_K','H_K','D_A'], jokers:['j_joker'], random:'expectation'})).status,'ready');
        assert.equal((await sandbox.score([0,1])).score,180);
        assert.equal((await sandbox.load({hand:['S_A'],random:'fixed'})).status,'unsupported');
      } finally {await sandbox.close();}`;
    await promisify(execFile)(process.execPath, ['--input-type=module', '-e', program], { cwd: root, timeout: 30_000 });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('pruned API preserves random expectation, retriggers, ordering and restoration', {
  skip: skip || (!existsSync(resolve(vendor, 'globals.lua')) && 'Original engine required for differential check'),
}, async () => {
  const workers = [vendor, source].map(sourceDir => new ScoringSandbox({ sourceDir, lua, timeoutMs: 30_000 }));
  const states: ScoreState[] = [
    { hand: [{ key: 'H_A', enhancement: 'm_lucky' }, 'S_K', 'D_K'],
      jokers: ['j_bloodstone', 'j_oops', 'j_lucky_cat', 'j_space', 'j_bootstraps'], random: 'expectation' },
    { hand: ['S_A', { key: 'H_K', enhancement: 'm_steel', seal: 'Red' }, 'D_K'],
      jokers: ['j_blueprint', 'j_baron', 'j_mime'], random: 'expectation' },
    { hand: ['S_K', 'H_K', 'D_A'], jokers: ['j_joker'], random: 'minimal' },
  ];
  try {
    for (const state of states) {
      assert.deepEqual(await workers[1]!.load(state), await workers[0]!.load(state));
      const plays = [[0], [0, 1], [0, 1, 2], [2, 1, 0], [0]];
      for (const ordered of [false, true]) {
        const baseline = await workers[0]!.scoreBatch(plays, { ordered });
        const pruned = await workers[1]!.scoreBatch(plays, { ordered });
        assert.deepEqual(pruned, baseline);
        assert.deepEqual(pruned[4], pruned[0]);
      }
    }
    assert.equal((await workers[1]!.load({ hand: ['S_A'], random: 'expectation', trace: true })).status, 'unsupported');
  } finally { for (const worker of workers) await worker.close(); }
});
