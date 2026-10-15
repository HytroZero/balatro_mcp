import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Analyzer } from './index.ts';
import type { AnalysisRead, Data } from '../contract.ts';
import { projectRoot } from '../../src/config.ts';

const { values } = parseArgs({ options: { repetitions: { type: 'string', default: '3' } } });
const samples = 64, repetitions = Number(values.repetitions);
assert.ok(Number.isInteger(repetitions) && repetitions > 0 && repetitions <= 10);
const hand = ['S_K', 'H_K', 'D_K', 'C_7', 'S_4', 'H_8', 'D_3', 'C_2'];
const configurations = [
  { hand, jokers: ['j_joker', 'j_green_joker', 'j_blue_joker', 'j_abstract', 'j_cavendish'] },
  { hand: hand.map((key, i) => i < 3 ? { key, enhancement: 'm_steel', seal: 'Red' } : key), jokers: ['j_blueprint', 'j_baron', 'j_mime', 'j_steel_joker', 'j_cavendish'] },
  { hand: hand.map((key, i) => i < 3 ? { key, enhancement: 'm_lucky' } : key), jokers: ['j_bloodstone', 'j_oops', 'j_lucky_cat', 'j_space', 'j_bootstraps'] },
];
const fixtures: Data[] = JSON.parse(execFileSync(process.env.LUAJIT ?? 'luajit', [resolve(projectRoot, 'tests/analysis-fixture.lua'),
  resolve(projectRoot, 'env/sandbox/vendor'), JSON.stringify(configurations)], { cwd: projectRoot, encoding: 'utf8' }));
const out: unknown[] = [];
for (const [index, analysis] of fixtures.entries()) {
  const positions = [[0, 1, 2], [3, 4, 5], [0, 3, 6], [1, 4, 7]];
  const read: AnalysisRead = { analysis, observation: { contract: 1, backend: 'benchmark', revision: 'bench:1', runId: 'bench:run',
    gameVersion: '1.0.1o', ready: true, terminal: false, outcome: 'ongoing', availableMethods: ['play', 'discard'], legality: 'backend-authoritative',
    state: { state: 'SELECTING_HAND', round: { chips: 0, hands_left: 4, discards_left: 4 }, blind: { chips: 1_000_000 } } } };
  for (let repetition = 1; repetition <= repetitions; repetition++) {
    // Independent connection/cache for each run: measure real first-request work, including startup.
    const analyzer = new Analyzer();
    try {
      const started = performance.now();
      const result = await analyzer.analyze(read, { discards: positions, next: 'three_of_a_kind', deadline: started + 28_000, trusted: true });
      const elapsedMs = performance.now() - started;
      assert.ok('rates' in result.brief);
      const rates = 'rates' in result.brief ? result.brief.rates : [];
      assert.equal(rates.length, 4);
      out.push({ scenario: ['ordinary', 'held-retriggers', 'random-expectation'][index], repetition, elapsedMs, rates });
    } finally { await analyzer.close(); }
  }
}
console.log(JSON.stringify({ node: process.version, samples, repetitions, rows: out }, null, 2));
