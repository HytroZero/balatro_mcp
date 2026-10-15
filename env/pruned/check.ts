import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { projectRoot } from '../../src/config.ts';
import { ScoringSandbox } from '../sandbox/index.ts';
import { selections } from '../analysis/hand.ts';
const original = resolve(projectRoot, 'env/sandbox/vendor'), pruned = resolve(projectRoot, 'env/pruned');
const lua = process.env.LUAJIT ?? 'luajit';

const jokers: string[] = JSON.parse(execFileSync(lua, [resolve(projectRoot, 'env/pruned/list-jokers.lua'), original], { cwd: projectRoot, encoding: 'utf8' }));
const hand = ['S_K', 'H_K', 'D_K', 'C_7', 'S_4', 'H_8', 'D_3', 'C_2'];
const cases: any[] = jokers.map(key => ({ name: key, hand, jokers: [key], dollars: 25 }));
for (const blind of ['bl_small', 'bl_psychic', 'bl_flint', 'bl_arm', 'bl_ox', 'bl_tooth', 'bl_eye', 'bl_mouth', 'bl_club', 'bl_plant', 'bl_final_leaf']) {
  for (const back of ['b_red', 'b_plasma']) cases.push({ name: blind + '/' + back, hand, blind, back,
    hands: { Pair: { level: 3 } }, jokers: ['j_bull', 'j_bootstraps', 'j_ride_the_bus', 'j_green_joker'], dollars: 25 });
}
for (const enhancement of ['m_lucky', 'm_steel', 'm_glass', 'm_stone', 'm_wild', 'm_bonus', 'm_mult', 'm_gold']) cases.push({
  name: enhancement, hand: hand.map((key, i) => i < 3 ? { key, enhancement, seal: 'Red', edition: 'polychrome' } : key),
  jokers: ['j_blueprint', 'j_bloodstone', 'j_lucky_cat', 'j_baron', 'j_mime'], dollars: 25,
});
cases.push({ name: 'brainstorm-vampire-midas', hand, jokers: ['j_brainstorm', 'j_midas_mask', 'j_vampire', 'j_hiker', 'j_baseball'] });
const fixtures = JSON.parse(execFileSync(lua, [resolve(projectRoot, 'tests/analysis-fixture.lua'), original, JSON.stringify(cases)], { cwd: projectRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
const workers = [new ScoringSandbox({ sourceDir: original, lua, timeoutMs: 30000 }), new ScoringSandbox({ sourceDir: pruned, lua, timeoutMs: 30000 })];
let count = 0;
const report: any = { cases: cases.length, jokers: jokers.length, scores: 0, errors: [] };
try {
  for (const [index, c] of cases.entries()) {
    const state = { ...fixtures[index].scoring.state, random: 'expectation' as const };
    const loaded = await workers[0].load(state), other = await workers[1].load(state);
    assert.deepEqual(other, loaded, c.name + ' load');
    if (loaded.status !== 'ready') continue;
    const plays = selections(state.hand.length, 5);
    const a = await workers[0].scoreBatch(plays), b = await workers[1].scoreBatch(plays);
    try { assert.deepEqual(b, a, c.name); }
    catch (error) { throw new Error('Pruned score mismatch: ' + c.name, { cause: error }); }
    // Exercise order preservation and restoration after many normal trials.
    const ordered = [plays[plays.length - 1]!, [2, 1, 0], [0, 1]];
    assert.deepEqual(await workers[1].scoreBatch(ordered, { ordered: true }), await workers[0].scoreBatch(ordered, { ordered: true }), c.name + ' ordered');
    count += a.length + ordered.length;
    if ((index + 1) % 25 === 0) console.log(JSON.stringify({ complete: index + 1, total: cases.length, scores: count }));
  }
  assert.equal((await workers[1].load({ hand, random: 'seeded' })).status, 'unsupported');
  assert.equal((await workers[1].load({ hand, random: 'expectation', trace: true })).status, 'unsupported');
  report.scores = count; report.status = 'passed';
  console.log(JSON.stringify(report));
} finally { for (const worker of workers) await worker.close(); }
