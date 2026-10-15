import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Value } from 'typebox/value';
import { ScoringSandbox, type ScoreState } from '../env/sandbox/index.ts';
import { DiscardsSchema, NextSchema, discardRates, validateDiscards, refillOrder, canonical, type DiscardCache } from '../env/analysis/discards.ts';
import { selections } from '../env/analysis/hand.ts';
import { projectRoot } from '../src/config.ts';

const sourceDir = process.env.BALATRO_ANALYSIS_TEST_SOURCE ?? process.env.BALATRO_SANDBOX_SOURCE ?? resolve(projectRoot, 'env/sandbox/vendor');
const lua = process.env.LUAJIT ?? 'luajit';
const skip = !existsSync(resolve(sourceDir, 'globals.lua')) || spawnSync(lua, ['-v']).status !== 0 ? 'Prepared engine and LuaJIT required' : false;
const options = () => ({ deadline: performance.now() + 30_000, limit: 5 });
const fixture: ScoreState = { hand: ['S_K', 'H_K', 'D_A'], deck: ['C_K', 'S_A', 'H_2', 'H_2'], discard: ['D_K'],
  handSize: 3, jokers: ['j_joker'], game: { current_round: { discards_left: 3, hands_left: 4 } }, random: 'expectation' };
const position = (state: ScoreState) => ({ state, hidden: 0, visible: state.hand.map((_, i) => i) });

test('discard schema accepts only 1-4 selections and a target hand, supplied together', () => {
  assert.equal(Value.Check(DiscardsSchema, [[0, 1, 3], [1, 2]]), true);
  for (const invalid of [[], [[0, 0]], [[-1]], [[0.5]], [[]], [[0, 1, 2, 3, 4, 5]], [[0], [0], [0], [0], [0]], [[{ method: 'play', cards: [0] }]]]) {
    assert.equal(Value.Check(DiscardsSchema, invalid), false);
  }
  assert.equal(Value.Check(NextSchema, 'straight'), true);
  for (const invalid of ['Straight', 'unknown', { kind: 'hand', hand: 'Straight' }, { samples: 64 }]) {
    assert.equal(Value.Check(NextSchema, invalid), false);
  }
  assert.throws(() => validateDiscards([[0]]), /supplied together/);
  assert.throws(() => validateDiscards(undefined, 'pair'), /supplied together/);
  validateDiscards(); validateDiscards([[0]], 'pair');
});

test('public samples are stable, paired across strategies and without replacement', async () => {
  const order = refillOrder('public-pool', 44, 12);
  assert.equal(new Set(order).size, 44);
  assert.deepEqual(order, refillOrder('public-pool', 44, 12));
  assert.notDeepEqual(order, refillOrder('public-pool', 44, 13));
  assert.equal(canonical({ b: { z: 1, a: 2 }, a: 3 }), canonical({ a: 3, b: { a: 2, z: 1 } }));
  const received = new Map<number, number[][]>();
  const sandbox = { discardHits: async (_state: ScoreState, cards: number[], draws: number[][]) => {
    received.set(cards.length, [...(received.get(cards.length) ?? []), ...draws]);
    return draws.map((_draw, i) => i % 4 === 0);
  } } as unknown as ScoringSandbox;
  const result = await discardRates(sandbox, position(fixture), [[0], [0, 1]], 'pair', options());
  assert.deepEqual(result, { rates: [.25, .25] });
  assert.equal(received.get(1)!.length, 64); assert.equal(received.get(2)!.length, 64);
  received.get(1)!.forEach((draw, i) => assert.deepEqual(draw, received.get(2)![i]!.slice(0, 1)));
});

test('one-card, zero-card and all-card refills still use exactly 64 samples', async () => {
  const counts: number[] = [], sizes: number[][] = [];
  const sandbox = { discardHits: async (_state: ScoreState, _cards: number[], draws: number[][]) => {
    counts.push(draws.length); sizes.push(draws.map(draw => draw.length)); return draws.map(() => true);
  } } as unknown as ScoringSandbox;
  for (const state of [fixture, { ...fixture, handSize: 2 }, { ...fixture, handSize: 3 }]) {
    const before = counts.reduce((a, b) => a + b, 0);
    const cards = state === fixture ? [2] : state.handSize === 2 ? [2] : [0, 1, 2];
    assert.deepEqual(await discardRates(sandbox, position(state), [cards], 'pair', options()), { rates: [1] });
    assert.equal(counts.reduce((a, b) => a + b, 0) - before, 64);
  }
  assert.deepEqual(counts, [64, 64, 64], 'one worker request carries all samples of a strategy');
  assert.deepEqual([...new Set(sizes.flat())].sort(), [0, 1, 3]);
});

test('invalid state, incomplete sampling, failures and cancellation never produce rates', async () => {
  const state = position(fixture), opts = options();
  let calls = 0;
  const sandbox = { discardHits: async (_state: ScoreState, _cards: number[], draws: number[][]) => {
    calls++; opts.deadline = performance.now() - 1; return draws.map(() => true);
  } } as unknown as ScoringSandbox;
  await assert.rejects(discardRates(sandbox, state, [[2]], 'pair', opts), /64 samples/);
  assert.equal(calls, 1);
  await assert.rejects(discardRates(sandbox, { ...state, hidden: 1 }, [[2]], 'pair', options()), /Face-down/);
  await assert.rejects(discardRates(sandbox, position({ ...fixture, game: { current_round: { discards_left: 0 } } }), [[2]], 'pair', options()), /No discards/);
  await assert.rejects(discardRates(sandbox, state, [[3]], 'pair', options()), /missing card/);
  await assert.rejects(discardRates(sandbox, state, [[0, 1]], 'pair', { ...options(), limit: 1 }), /selection limit/);
  sandbox.discardHits = async () => { throw new Error('worker failed'); };
  await assert.rejects(discardRates(sandbox, state, [[2]], 'pair', options()), /worker failed/);
  const controller = new AbortController(); controller.abort(new Error('test cancelled'));
  await assert.rejects(discardRates(sandbox, state, [[2]], 'pair', { ...options(), signal: controller.signal }), /test cancelled/);
});

test('cache reuse and route/deck reordering preserve rates, copies and input state', { skip }, async () => {
  const sandbox = new ScoringSandbox({ sourceDir, lua }), cache: DiscardCache = new Map();
  const original = structuredClone(fixture);
  try {
    const first = await discardRates(sandbox, position(fixture), [[2], [0]], 'three_of_a_kind', { ...options(), cache });
    assert.ok(first.rates[0]! > .15 && first.rates[0]! < .35); assert.equal(first.rates[1], 0);
    assert.equal((await sandbox.stats()).calculations, 0, 'no score evaluation');
    const before = await sandbox.stats();
    assert.deepEqual(await discardRates(sandbox, position(fixture), [[0], [2]], 'three_of_a_kind', { ...options(), cache }), { rates: [...first.rates].reverse() });
    assert.equal((await sandbox.stats()).positionLoads, before.positionLoads, 'warm queries do not classify more hands');
    assert.deepEqual(await discardRates(sandbox, position({ ...fixture, deck: [...fixture.deck!].reverse() }), [[2], [0]], 'three_of_a_kind', options()), first);
    assert.deepEqual(fixture, original);
    assert.ok(first.rates.every(rate => Number.isInteger(rate * 64)));
  } finally { await sandbox.close(); }
});

test('classification ignores unrelated Joker lifecycles, Purple Seals and Hook scoring', { skip }, async () => {
  const sandbox = new ScoringSandbox({ sourceDir, lua });
  try {
    const state: ScoreState = { ...fixture, blind: 'bl_hook', jokers: ['j_trading', 'j_seance', 'j_ramen', 'j_misprint'],
      hand: ['S_K', 'H_K', { key: 'D_A', seal: 'Purple' }] };
    assert.deepEqual(await discardRates(sandbox, position(state), [[2]], 'pair', options()), { rates: [1] });
    assert.equal((await sandbox.stats()).calculations, 0);
  } finally { await sandbox.close(); }
});

test('discard classification matches legal scored subsets for named hands and Boss history', { skip }, async () => {
  const sandbox = new ScoringSandbox({ sourceDir, lua });
  try {
    for (const blind of ['bl_small', 'bl_psychic', { key: 'bl_eye', hands: { Pair: true } }, { key: 'bl_mouth', only_hand: 'Flush' }]) {
      const state: ScoreState = { ...fixture, blind, handSize: 5, hand: ['S_K', 'H_K', 'S_2', 'S_3', 'S_4'], deck: ['S_5', 'C_K'] };
      for (const index of [0, 1]) {
        const full = { ...state, hand: [...state.hand.filter((_, i) => i !== 1), state.deck![index]!], deck: state.deck!.filter((_, i) => i !== index) };
        await sandbox.load(full);
        const legal = (await sandbox.scoreBatch(selections(5, 5))).filter(r => r.status === 'ok' && !r.notAllowed);
        for (const hand of ['Pair', 'Flush', 'Straight']) {
          assert.deepEqual(await sandbox.discardHits(state, [1], [[index]], hand, 5), [legal.some(r => r.status === 'ok' && r.hand === hand)]);
        }
      }
    }
    assert.deepEqual(await sandbox.discardHits(fixture, [2], [[0]], 'Pair', 5), [true], 'a pair subset counts even if three of a kind is stronger');
  } finally { await sandbox.close(); }
});

test('Four Fingers, Shortcut, Smeared, Wild, Stone and Serpent retain their hand rules', { skip }, async () => {
  const sandbox = new ScoringSandbox({ sourceDir, lua });
  try {
    const cases: [ScoreState, string, boolean][] = [
      [{ ...fixture, hand: ['S_2', 'H_3', 'D_4', 'C_K'], deck: ['C_5'], jokers: ['j_four_fingers'] }, 'Straight', true],
      [{ ...fixture, hand: ['S_2', 'H_3', 'D_4', 'C_K'], deck: ['C_5'], jokers: [{ key: 'j_four_fingers', debuff: true }] }, 'Straight', false],
      [{ ...fixture, hand: ['S_2', 'H_4', 'D_6', 'C_8', 'S_K'], deck: ['H_T'], jokers: ['j_shortcut'] }, 'Straight', true],
      [{ ...fixture, hand: ['S_2', 'C_4', 'S_6', 'C_8', 'S_K'], deck: ['C_T'], jokers: ['j_smeared'] }, 'Flush', true],
      [{ ...fixture, hand: ['S_2', 'S_4', 'S_6', 'S_8', 'S_K'], deck: [{ key: 'H_T', enhancement: 'm_wild' }] }, 'Flush', true],
      [{ ...fixture, hand: ['S_2', 'H_3', 'D_4', 'C_5', 'S_K'], deck: [{ key: 'H_6', enhancement: 'm_stone' }] }, 'Straight', false],
    ];
    for (const [state, hand, hit] of cases) {
      assert.deepEqual(await sandbox.discardHits(state, [state.hand.length - 1], [[0]], hand, 5), [hit], JSON.stringify(state));
    }
    const serpent = { ...fixture, blind: 'bl_serpent' };
    assert.deepEqual(await discardRates(sandbox, position(serpent), [[2]], 'pair', options()), { rates: [1] });
    await assert.rejects(discardRates(sandbox, position({ ...fixture, blind: 'bl_final_bell' }), [[2]], 'pair', options()), /Cerulean Bell/);
  } finally { await sandbox.close(); }
});
