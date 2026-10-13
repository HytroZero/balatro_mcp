import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { ScoringSandbox, ScoreInputSchema, scoreHandOnce as scoreHand, type ScoreInput } from '../env/sandbox/index.ts';
import { projectRoot } from '../src/config.ts';

const lua = process.env.LUAJIT ?? 'luajit';
const source = process.env.BALATRO_SANDBOX_SOURCE ??
  resolve(projectRoot, existsSync(resolve(projectRoot, 'env/sandbox/vendor/globals.lua')) ? 'env/sandbox/vendor' : 'env/balatro');
const skip = !existsSync(resolve(source, 'globals.lua')) ? 'Local Balatro source is required (sandbox:prepare)' :
  spawnSync(lua, ['-v']).status !== 0 ? 'LuaJIT is required (set LUAJIT)' : false;
const base: ScoreInput = { hand: ['S_K', 'H_K', 'D_A'], play: [0, 1] };
const { play: _basePlay, ...baseState } = base;
async function ok(input: ScoreInput) {
  const result = await scoreHand(input, { lua, sourceDir: source });
  if (result.status !== 'ok') throw new Error(result.message);
  return result;
}

test('sandbox validates selection and request shape before launching Lua', async () => {
  for (const play of [[], [0, 0], [3], [-1], [0.5], [0, 1, 2, 3, 4, 5]]) {
    assert.equal(ScoreInputSchema.safeParse({ ...base, play }).success, false);
  }
  assert.equal(ScoreInputSchema.safeParse({ ...base, game: { blind: {} } }).success, false);
  assert.equal(ScoreInputSchema.safeParse({ ...base, random: 'expectation' }).success, false);
  assert.equal(ScoreInputSchema.safeParse({ ...base, unexpected: true }).success, false);
  await assert.rejects(scoreHand(base, { timeoutMs: 0 }), /timeoutMs/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(scoreHand(base, { signal: controller.signal }), { name: 'AbortError' });
  await assert.rejects(scoreHand(base, { lua: resolve(projectRoot, 'build/nonexistent-luajit') }), /ENOENT/);
});

test('original scoring: poker hands, scoring subsets, Splash and Stone cards', { skip }, async () => {
  const pair = await ok(base);
  assert.equal(pair.score, 60); assert.equal(pair.chips, 30); assert.equal(pair.mult, 2);
  assert.deepEqual(pair.scoringCards, [0, 1]); assert.equal(pair.random, false);
  assert.deepEqual(await ok({ ...base, play: [1, 0] }), pair);
  assert.equal((await ok({ ...base, play: [0, 1, 2] })).score, 60);
  assert.equal((await ok({ ...base, play: [0, 1, 2], jokers: ['j_splash'] })).score, 82);
  const stone = await ok({ hand: ['S_A', { key: 'H_2', enhancement: 'm_stone' }], play: [0, 1] });
  assert.equal(stone.score, 66); assert.deepEqual(stone.scoringCards, [0, 1]);
  for (const [hand, name, score] of [
    [['S_A'], 'High Card', 16],
    [['S_2', 'H_2', 'D_2'], 'Three of a Kind', 108],
    [['S_2', 'H_2', 'S_3', 'H_3'], 'Two Pair', 60],
    [['S_2', 'H_2', 'D_2', 'S_3', 'H_3'], 'Full House', 208],
    [['S_2', 'H_2', 'D_2', 'C_2'], 'Four of a Kind', 476],
    [['S_2', 'H_3', 'D_4', 'C_5', 'S_6'], 'Straight', 200],
    [['S_2', 'S_4', 'S_6', 'S_8', 'S_T'], 'Flush', 260],
    [['S_T', 'S_J', 'S_Q', 'S_K', 'S_A'], 'Straight Flush', 1208],
    [['S_2', 'H_2', 'D_2', 'C_2', 'H_2'], 'Five of a Kind', 1560],
    [['S_2', 'S_2', 'S_2', 'S_3', 'S_3'], 'Flush House', 2128],
    [['S_2', 'S_2', 'S_2', 'S_2', 'S_2'], 'Flush Five', 2720],
  ] as const) {
    const result = await ok({ hand: [...hand], play: hand.map((_, i) => i) });
    assert.equal(result.hand, name); assert.equal(result.score, score, name);
  }
});

test('original scoring: Joker order, Blueprint, growth, retriggers and held cards', { skip }, async () => {
  assert.equal((await ok({ ...base, jokers: ['j_joker', 'j_cavendish'] })).score, 540);
  assert.equal((await ok({ ...base, jokers: ['j_cavendish', 'j_joker'] })).score, 300);
  assert.equal((await ok({ ...base, jokers: ['j_blueprint', 'j_joker'] })).score, 300);
  assert.equal((await ok({ ...base, jokers: [{ key: 'j_green_joker', ability: { mult: 3 } }] })).score, 180);
  assert.equal((await ok({ ...base, jokers: ['j_acrobat'], game: { current_round: { hands_left: 1 } } })).score, 180);
  const held: ScoreInput = { hand: ['S_A', { key: 'H_K', enhancement: 'm_steel', seal: 'Red' }], play: [0], jokers: ['j_baron'] };
  assert.equal((await ok(held)).score, 81); // 16 * (1.5 * 1.5)^2, floored
  assert.equal((await ok({ hand: [{ key: 'S_2', seal: 'Red' }], play: [0], jokers: ['j_hack'] })).score, 11);
  const foil = await ok({ hand: [{ key: 'S_A', edition: 'foil' }], play: [0] });
  assert.equal(foil.score, 66);
  assert.equal((await ok({ ...base, jokers: [{ key: 'j_joker', edition: 'holo' }] })).score, 480);
  assert.equal((await ok({ ...base, jokers: ['j_stencil'] })).score, 300);
  assert.equal((await ok({ ...base, jokers: ['j_stencil'], jokerSlots: 3 })).score, 180);
});

test('original scoring: hand upgrades, Boss effects, deck tallies and Observatory', { skip }, async () => {
  assert.equal((await ok({ ...base, hands: { Pair: { level: 2 } } })).score, 135);
  assert.equal((await ok({ ...base, hands: { Pair: { chips: 100, mult: 7 } } })).score, 840);
  assert.equal((await ok({ ...base, blind: 'bl_flint' })).score, 25);
  const blocked = await ok({ ...base, blind: 'bl_psychic' });
  assert.equal(blocked.score, 0); assert.equal(blocked.notAllowed, true);
  assert.equal((await ok({ ...base, blind: { key: 'bl_psychic', disabled: true } })).score, 60);
  assert.equal((await ok({ ...base, blind: 'bl_plant' })).score, 20);
  assert.equal((await ok({ ...base, blind: 'bl_arm', hands: { Pair: { level: 2 } } })).score, 60);
  assert.equal((await ok({ ...base, back: 'b_plasma' })).score, 256);
  assert.equal((await ok({ ...base, jokers: ['j_bull'], game: { dollars: 10 }, blind: 'bl_tooth' })).score, 92);
  assert.equal((await ok({ ...base, jokers: ['j_bull'], game: { dollars: 10 }, blind: 'bl_ox' })).score, 100); // default most-played is High Card
  assert.equal((await ok({ ...base, jokers: ['j_bull'], game: { dollars: 10, current_round: { most_played_poker_hand: 'Pair' } }, blind: 'bl_ox' })).score, 60);
  assert.equal((await ok({ ...base, jokers: ['j_stone'], deck: [{ key: 'D_2', enhancement: 'm_stone' }], discard: [{ key: 'C_2', enhancement: 'm_stone' }] })).score, 160);
  assert.equal((await ok({ ...base, jokers: ['j_blue_joker'], deck: ['D_2'], discard: ['C_2'] })).score, 64);
  assert.equal((await ok({ ...base, jokers: ['j_steel_joker'], deck: [{ key: 'D_2', enhancement: 'm_steel' }] })).score, 72);
  assert.equal((await ok({ ...base, jokers: ['j_swashbuckler', { key: 'j_joker', sell_cost: 8 }] })).score, 420);
  assert.equal((await ok({ ...base, blind: 'bl_hook', jokers: ['j_chicot'] })).score, 60);
  assert.equal((await ok({ ...base, blind: 'bl_tooth', jokers: ['j_chicot', 'j_bull'], game: { dollars: 10 } })).score, 100);
  assert.equal((await ok({ ...base, consumables: ['c_mercury'], game: { used_vouchers: { v_observatory: true } } })).score, 90);
});

test('sandbox trials are repeatable, independent, and explicit about unsupported cases', { skip }, async () => {
  const lucky: ScoreInput = { hand: [{ key: 'S_A', enhancement: 'm_lucky' }], play: [0], seed: 'REPEAT', trace: true };
  const original = structuredClone(lucky);
  const first = await ok(lucky);
  assert.equal(first.random, true);
  await ok({ ...base, jokers: ['j_green_joker'] });
  assert.deepEqual(await ok(lucky), first); assert.deepEqual(lucky, original);
  assert.equal((await ok({ ...lucky, random: 'fixed' })).score, 16);
  const probability: ScoreInput = { ...lucky, random: 'fixed', game: { probabilities: { normal: 3 } } };
  assert.equal((await ok({ ...probability, jokers: ['j_oops'] })).score, 336);
  assert.equal((await ok({ ...probability, jokers: [{ key: 'j_oops', debuff: true }] })).score, 16);
  assert.equal((await ok({ ...probability, jokers: [{ key: 'j_oops', ability: { perma_debuff: true } }] })).score, 16);
  for (const input of [
    { hand: ['S_A'], play: [0], jokers: ['j_dna'] },
    { ...base, blind: 'bl_hook' },
  ] satisfies ScoreInput[]) assert.equal((await scoreHand(input, { lua, sourceDir: source })).status, 'unsupported');
  assert.equal((await scoreHand({ hand: [{ key: 'S_A', facing: 'back' }], play: [0] }, { lua, sourceDir: source })).status, 'unavailable');
  assert.equal((await scoreHand({ hand: ['invalid'], play: [0] }, { lua, sourceDir: source })).status, 'error');
  assert.equal((await scoreHand({ ...base, game: { current_round: { hands_left: 0 } } }, { lua, sourceDir: source })).status, 'error');
  // A prior failed/unsupported trial cannot poison later trials.
  assert.equal((await ok(base)).score, 60);
});

test('sandbox kills timed-out and cancelled workers', { skip }, async () => {
  const source = await mkdtemp(resolve(tmpdir(), 'balatro-sandbox-timeout-'));
  try {
    await mkdir(resolve(source, 'engine'));
    await writeFile(resolve(source, 'engine/object.lua'), 'while true do end');
    await assert.rejects(scoreHand(base, { lua, sourceDir: source, timeoutMs: 50 }), /timed out/);
    const controller = new AbortController();
    const pending = scoreHand(base, { lua, sourceDir: source, signal: controller.signal });
    setTimeout(() => controller.abort(), 50);
    await assert.rejects(pending, { name: 'AbortError' });
  } finally { await rm(source, { recursive: true, force: true }); }
});

test('persistent sandbox reuses one VM and restores mutations across selections and loads', { skip }, async () => {
  const sandbox = new ScoringSandbox({ lua, sourceDir: source });
  try {
    const configurations: ScoreInput[] = [
      { ...base, jokers: ['j_green_joker', 'j_acrobat'] },
      { hand: [{ key: 'S_K', enhancement: 'm_bonus' }, 'H_K', 'D_A'], play: [0, 1], jokers: ['j_vampire', 'j_midas_mask', 'j_hiker'] },
      { hand: [{ key: 'S_A', enhancement: 'm_lucky' }, { key: 'H_K', enhancement: 'm_glass' }, 'D_3'], play: [0], seed: 'REPEAT', trace: true, jokers: ['j_space', 'j_lucky_cat'] },
      { ...base, hands: { Pair: { level: 2 } }, blind: 'bl_arm', trace: true },
      { ...base, jokers: ['j_bull'], blind: 'bl_tooth', game: { dollars: 10 } },
      { ...base, blind: { key: 'bl_eye', hands: { Pair: true } } },
    ];
    const plays = [[0, 1], [0], [2], [0, 1, 2]];
    let pid: number | undefined;
    for (const { play: _, ...state } of configurations) {
      const expected = await Promise.all(plays.map(play => scoreHand({ ...state, play }, { lua, sourceDir: source })));
      assert.equal((await sandbox.load(state)).status, 'ready');
      pid ??= sandbox.processId;
      assert.equal(sandbox.processId, pid);
      assert.deepEqual(await sandbox.scoreBatch(plays), expected);
      assert.deepEqual(await sandbox.scoreBatch([...plays].reverse()), [...expected].reverse());
      assert.deepEqual(await sandbox.scores(plays), expected.map(r => r.status === 'ok' ? r.score : r));
    }
    assert.equal((await sandbox.stats()).sourceLoads, 1);
    assert.equal((await sandbox.stats()).positionLoads, configurations.length);
    await sandbox.load({ ...baseState, jokers: ['j_green_joker'] });
    const queued = await Promise.all([sandbox.score([0, 1]), sandbox.score([2]), sandbox.score([0, 1])]);
    assert.deepEqual(queued.map(r => r.status === 'ok' ? r.score : r), [90, 32, 90]);
    const batch = Array.from({ length: 2048 }, (_, i) => i % 2 ? [0, 1] : [2]);
    for (let i = 0; i < 3; i++) assert.deepEqual(await sandbox.scores(batch), batch.map((_, i) => i % 2 ? 90 : 32));
    assert.equal(sandbox.processId, pid);
  } finally { await sandbox.close(); }
  await assert.rejects(sandbox.stats(), /closed/);
});

test('persistent sandbox recovers after scoring failures and invalidates failed loads', { skip }, async () => {
  const sandbox = new ScoringSandbox({ lua, sourceDir: source });
  try {
    await assert.rejects(sandbox.score([0]), /Load a position/);
    await sandbox.load({ ...baseState, jokers: ['j_dna'] });
    const result = await sandbox.scoreBatch([[0], [0, 1], [0], [0, 1]]);
    assert.deepEqual(result.map(r => r.status === 'ok' ? r.score : r.status), ['unsupported', 60, 'unsupported', 60]);
    await sandbox.load({ hand: ['S_K', { key: 'H_K', ability: { forced_selection: true } }] });
    assert.equal((await sandbox.score([0])).status, 'error');
    assert.equal((await sandbox.score([0, 1])).status, 'ok');
    await assert.rejects(sandbox.score([0, 0]), /unique/);
    await assert.rejects(sandbox.score([3]), /indices/);
    await assert.rejects(sandbox.scores([]), /1-2048/);
    assert.equal((await sandbox.load({ hand: ['invalid'] })).status, 'error');
    await assert.rejects(sandbox.score([0]), /Load a position/);
    await sandbox.load(baseState);
    assert.equal((await sandbox.score([0, 1])).status, 'ok');
    assert.equal((await sandbox.stats()).sourceLoads, 1);
  } finally { await sandbox.close(); }
});
