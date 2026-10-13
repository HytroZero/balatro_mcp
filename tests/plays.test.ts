import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { projectRoot } from '../src/config.ts';
import { ScoringSandbox, LiveScoreStateSchema, type ScoreResult, type ScoreState } from '../env/sandbox/index.ts';
import { ScoringSnapshotSchema } from '../play/plays.ts';

const lua = process.env.LUAJIT ?? 'luajit';
const source = process.env.BALATRO_SANDBOX_SOURCE ?? resolve(projectRoot, 'env/sandbox/vendor');
const skip = !existsSync(resolve(source, 'globals.lua')) ? 'Local original source required' :
  spawnSync(lua, ['-v']).status !== 0 ? 'LuaJIT required' : false;
const state: ScoreState = { hand: ['S_K','H_K','D_A'] };
const pairLines = [
  '0 1: Pair 60','0 1 2: Pair 60','2: High Card 16',
  '0 2: High Card 16','1 2: High Card 16','0: High Card 15','1: High Card 15',
];

// A hung source load makes queued deadlines deterministic without timing a real search.
async function stalledSource(): Promise<string> {
  const directory = await mkdtemp(resolve(tmpdir(), 'balatro-plays-timeout-'));
  await mkdir(resolve(directory, 'engine'));
  await writeFile(resolve(directory, 'engine/object.lua'), 'while true do end');
  return directory;
}

test('plays rejects invalid limits and deadlines before starting a worker', async () => {
  const sandbox = new ScoringSandbox();
  try {
    for (const limit of [-1, 1.5, 6, NaN, Infinity]) {
      assert.throws(() => sandbox.plays(state, limit));
    }
    for (const timeoutMs of [0, -1, NaN, Infinity, 2_147_483_648]) {
      assert.throws(() => sandbox.plays(state, 5, { timeoutMs }), /timeoutMs/);
    }
    const controller = new AbortController(); controller.abort();
    await assert.rejects(sandbox.plays(state, 5, { signal: controller.signal }), { name: 'AbortError' });
    assert.equal(sandbox.processId, undefined);
  } finally { await sandbox.close(); }
});

test('plays returns the global top 15 after scoring every size, including a late singleton', { skip }, async () => {
  const sandbox = new ScoringSandbox({ lua, sourceDir: source, timeoutMs: 30_000 });
  try {
    const hand: ScoreState['hand'] = Array.from({ length: 11 }, () => ({ key: 'S_K', debuff: true }));
    hand.push({ key: 'D_A', ability: { perma_bonus: 1000 } });
    const hands: NonNullable<ScoreState['hands']> = {};
    for (const name of ['Pair','Two Pair','Three of a Kind','Straight','Flush','Full House','Four of a Kind',
      'Straight Flush','Five of a Kind','Flush House','Flush Five']) hands[name] = { chips: 0, mult: 1 };
    const lines = await sandbox.plays({ hand, hands }, 5);
    assert.deepEqual(lines, [
      '11: High Card 1016',
      ...Array.from({ length: 11 }, (_, i) => `${i} 11: High Card 1016`),
      '0: High Card 5','1: High Card 5','2: High Card 5',
    ]);
    assert.equal((await sandbox.stats()).calculations, 1585);
  } finally { await sandbox.close(); }
});

test('plays obeys forced selections, ties and blind restrictions without partial advice', { skip }, async () => {
  const sandbox = new ScoringSandbox({ lua, sourceDir: source });
  try {
    assert.deepEqual(await sandbox.plays(state, 5), pairLines);
    const forced: ScoreState = { hand: [{ key: 'S_K', ability: { forced_selection: true } },'D_A'] };
    assert.deepEqual(await sandbox.plays(forced, 1), ['0: High Card 15']);
    assert.deepEqual(await sandbox.plays({ hand: [forced.hand[0]!, forced.hand[0]!] }, 1),
      ['unavailable: no legal selection']);
    assert.deepEqual(await sandbox.plays(state, 0), ['unavailable: no legal selection']);
    assert.deepEqual(await sandbox.plays({ ...state, blind: { key: 'bl_mouth', only_hand: 'High Card' } }, 2), [
      '2: High Card 16','0 2: High Card 16','1 2: High Card 16',
      '0: High Card 15','1: High Card 15','0 1: Pair 0 not allowed',
    ]);
    const failure = await sandbox.plays({ hand: ['S_A', { key: 'H_K', facing: 'back' }] }, 2);
    assert.equal(failure.length, 1);
    assert.match(failure[0]!, /^unavailable: /);
    assert.deepEqual(await sandbox.plays(state, 5), pairLines);
  } finally { await sandbox.close(); }
});

test('plays marks only selections that actually invoke minimal chance or ranged scoring', { skip }, async () => {
  const sandbox = new ScoringSandbox({ lua, sourceDir: source });
  try {
    const lucky: ScoreState = { hand: [{ key: 'S_A', enhancement: 'm_lucky' }], jokers: ['j_oops'],
      random: 'fixed', game: { probabilities: { normal: 3 } } };
    assert.deepEqual(await sandbox.plays(lucky, 1), ['0: High Card 16 minimal']);
    assert.deepEqual(await sandbox.plays({ hand: [lucky.hand[0]!, 'H_K'] }, 1), [
      '0: High Card 16 minimal', '1: High Card 15',
    ]);
    assert.deepEqual(await sandbox.plays({ ...lucky, blind: 'bl_psychic' }, 1), [
      '0: High Card 0 not allowed',
    ]);
    assert.deepEqual(await sandbox.plays({ hand: ['S_A'], jokers: ['j_dna'] }, 1), ['0: High Card 16']);
    assert.deepEqual(await sandbox.plays({ ...state, jokers: ['j_green_joker'] }, 2), [
      '0 1: Pair 90','2: High Card 32','0 2: High Card 32','1 2: High Card 32',
      '0: High Card 30','1: High Card 30',
    ]);
  } finally { await sandbox.close(); }
});

test('repeated plays restores each baseline and old request signals cannot kill the reused VM', { skip }, async () => {
  const sandbox = new ScoringSandbox({ lua, sourceDir: source });
  const controller = new AbortController();
  try {
    assert.deepEqual(await sandbox.plays(state, 5, { signal: controller.signal }), pairLines);
    const pid = sandbox.processId;
    controller.abort();
    assert.deepEqual(await sandbox.plays({ hand: ['S_A'] }, 1), ['0: High Card 16']);
    assert.deepEqual(await sandbox.plays(state, 5), pairLines);
    assert.equal(sandbox.processId, pid);
    const stats = await sandbox.stats();
    assert.equal(stats.sourceLoads, 1);
    assert.equal(stats.positionLoads, 3);
    await assert.rejects(sandbox.score([0]), /Load a position/);
  } finally { await sandbox.close(); }
  await assert.rejects(sandbox.plays(state, 5), /closed/);
});

test('malformed plays protocol rejects rather than becoming unavailable or partial advice', { skip }, async () => {
  const directory = await stalledSource();
  try {
    for (const result of [[42], [], ['0: Pair 60 random'], ['unavailable: failed','0: Pair 60']]) {
      const sandbox = new ScoringSandbox({ lua, sourceDir: directory });
      const response = JSON.stringify({ id: 1, result }) + '\n';
      await writeFile(resolve(directory, 'engine/object.lua'),
        `io.write([==[${response}]==]); io.flush(); while true do end`);
      try {
        await assert.rejects(sandbox.plays(state, 5), { name: 'ZodError' });
      } finally { await sandbox.close(); }
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

// Real timers exercise cancellation of an OS child and queue deadlines; fake
// timers would not drive LuaJIT process startup or termination.
test('queued deadline and cancellation reject only that call and never interrupt its predecessor', { skip }, async () => {
  const directory = await stalledSource();
  try {
    for (const mode of ['deadline','cancel']) {
      const sandbox = new ScoringSandbox({ lua, sourceDir: directory, timeoutMs: 10_000 });
      const controller = new AbortController();
      let activeSettled = false;
      const active = sandbox.plays(state, 5);
      const activeRejected = assert.rejects(active, /closed/);
      void active.then(() => { activeSettled = true; }, () => { activeSettled = true; });
      try {
        const queued = sandbox.plays(state, 5, mode === 'deadline' ? { timeoutMs: 50 } : { signal: controller.signal });
        const rejected = assert.rejects(queued, mode === 'deadline' ? /timed out/ : { name: 'AbortError' });
        if (mode === 'cancel') controller.abort();
        await rejected;
        assert.equal(activeSettled, false);
      } finally { await sandbox.close(); await activeRejected; }
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('active deadline, cancellation and close terminate a worker instead of returning partial plays', { skip }, async () => {
  const directory = await stalledSource();
  try {
    for (const mode of ['deadline','cancel','close']) {
      const sandbox = new ScoringSandbox({ lua, sourceDir: directory, timeoutMs: 10_000 });
      const controller = new AbortController();
      try {
        const pending = sandbox.plays(state, 5, mode === 'deadline' ? { timeoutMs: 50 } : { signal: controller.signal });
        const expected = mode === 'deadline' ? /timed out/ : mode === 'close' ? /closed/ : { name: 'AbortError' };
        const rejected = assert.rejects(pending, expected);
        if (mode !== 'deadline') {
          await Promise.resolve();
          assert.notEqual(sandbox.processId, undefined);
          if (mode === 'cancel') controller.abort();
          else await sandbox.close();
        }
        await rejected;
        await assert.rejects(sandbox.stats(), expected);
      } finally { await sandbox.close(); }
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('live snapshot export round-trips original scores without applying passive effects twice', { skip }, async () => {
  const fixtures = JSON.parse(execFileSync(lua,['tests/score-snapshot-original.lua',source],{cwd:projectRoot,encoding:'utf8'})) as
    { snapshot: unknown; plays: number[][]; expected: ScoreResult[] }[];
  const sandbox = new ScoringSandbox({lua,sourceDir:source});
  try {
    for (const fixture of fixtures) {
      const snapshot = ScoringSnapshotSchema.parse(fixture.snapshot);
      assert.equal(snapshot.status,'ready');
      if (snapshot.status !== 'ready') continue;
      assert.equal(snapshot.state.passiveEffectsApplied,true);
      assert.equal(LiveScoreStateSchema.safeParse(snapshot.state).success,true);
      assert.equal(snapshot.state.game?.pseudorandom,undefined);
      assert.deepEqual(await sandbox.load(snapshot.state),{status:'ready'});
      assert.deepEqual(await sandbox.scoreBatch(fixture.plays),fixture.expected);
    }
  } finally { await sandbox.close(); }
});
