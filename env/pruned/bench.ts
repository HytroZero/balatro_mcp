import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { projectRoot } from '../../src/config.ts';
import { resolve } from 'node:path';
import { ScoringSandbox, type ScoreState } from '../sandbox/index.ts';
import { selections } from '../analysis/hand.ts';

const original=resolve(projectRoot, 'env/sandbox/vendor'), stripped=resolve(projectRoot, 'env/pruned');
const lua = process.env.LUAJIT ?? 'luajit';
const { values } = parseArgs({ options: { samples: {type:'string',default:'64'}, repetitions: {type:'string',default:'3'} } });
const samples = Number(values.samples), repetitions = Number(values.repetitions);
assert.ok(Number.isInteger(samples) && samples >= 1 && samples <= 64, 'samples must be 1..64');
assert.ok(Number.isInteger(repetitions) && repetitions >= 1 && repetitions <= 10, 'repetitions must be 1..10');
const counts=JSON.parse(readFileSync(resolve(stripped,"manifest.json"),"utf8"));
const hand = ['S_K', 'H_K', 'D_K', 'C_7', 'S_4', 'H_8', 'D_3', 'C_2'];
const configurations = [
  { name: 'ordinary', hand, jokers: ['j_joker', 'j_green_joker', 'j_blue_joker', 'j_abstract', 'j_cavendish'] },
  { name: 'held-retriggers', hand: hand.map((key, i) => i < 3 ? { key, enhancement: 'm_steel', seal: 'Red' } : key),
    jokers: ['j_blueprint', 'j_baron', 'j_mime', 'j_steel_joker', 'j_cavendish'] },
  { name: 'random-expectation', hand: hand.map((key, i) => i < 3 ? { key, enhancement: 'm_lucky' } : key),
    jokers: ['j_bloodstone', 'j_oops', 'j_lucky_cat', 'j_space', 'j_bootstraps'] },
];
const fixtures = JSON.parse(execFileSync(lua, [resolve(projectRoot, 'tests/analysis-fixture.lua'), original, JSON.stringify(configurations)], { cwd: projectRoot, encoding: 'utf8' }));
const plays = selections(8, 5); assert.equal(plays.length, 218);
const orders = Array.from({ length: samples }, (_, sample) => {
  let seed = (0x731f + sample * 104729) >>> 0;
  const order = Array.from({ length: 44 }, (_, i) => i);
  for (let i = 0; i < 3; i++) {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    const j = i + Math.floor(seed / 4294967296 * (order.length - i));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
});
const rows: any[] = [];
for (const [index, config] of configurations.entries()) {
  const base: ScoreState = fixtures[index].scoring.state;
  const states = orders.map(order => ({ ...base, random: 'expectation' as const,
    hand: [...base.hand.slice(0, 5), ...order.slice(0, 3).map(i => base.deck![i]!)],
    deck: order.slice(3).map(i => base.deck![i]!), discard: [...base.discard!, ...base.hand.slice(5)],
    game: { ...base.game, current_round: { ...(base.game!.current_round as object), discards_used: 1, discards_left: 2 } },
  }));
  const workers = [original, stripped].map(sourceDir => new ScoringSandbox({ sourceDir, lua, timeoutMs: 30000 }));
  let expectedDigest: string | undefined;
  try {
    for (const worker of workers) for (const state of states.slice(0, 4)) {
      assert.equal((await worker.load(state)).status, 'ready'); await worker.scoreBatch(plays);
    }
    for (let repetition = 1; repetition <= repetitions; repetition++) for (const variant of repetition % 2 ? [0, 1] : [1, 0]) {
      const worker = workers[variant]!, hash = createHash('sha256');
      let loadMs = 0, scoreMs = 0, count = 0;
      const started = performance.now();
      for (const state of states) {
        let at = performance.now(); assert.equal((await worker.load(state)).status, 'ready'); loadMs += performance.now() - at;
        at = performance.now(); const result = await worker.scoreBatch(plays); scoreMs += performance.now() - at;
        assert.ok(result.every(r => r.status === 'ok' && Number.isFinite(r.score)));
        count += result.length; hash.update(JSON.stringify(result));
      }
      const elapsedMs = performance.now() - started, digest = hash.digest('hex');
      expectedDigest ??= digest; assert.equal(digest, expectedDigest, 'Full structured results must match');
      const row = { scenario: config.name, variant: variant ? 'max-pruned' : 'baseline', repetition, count, elapsedMs, loadMs, scoreMs, digest };
      rows.push(row); console.error(JSON.stringify({scenario:row.scenario,variant:row.variant,repetition,elapsedMs}));

    }
  } finally { for (const worker of workers) await worker.close(); }
}

console.log(JSON.stringify({ node:process.version, samples, selections:218, jitPolicy:counts.jitPolicy, rows }, null, 2));
