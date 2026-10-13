import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/server';
import { projectRoot } from '../src/config.ts';
import { BackendError, record, type AnalysisRead, type Backend, type Data, type Observation } from '../env/contract.ts';
import { Analyzer, type Line } from '../env/analysis/index.ts';
import { economyLine, interest, rewardsLine, skipLine } from '../env/analysis/economy.ts';
import { selections } from '../env/analysis/hand.ts';
import type { Trace } from '../model/trace.ts';
import { registerGameTools } from '../tools/index.ts';
import { ForgeBridgeBackend } from '../play/client.ts';

const lua = process.env.LUAJIT ?? 'luajit';
const source = process.env.BALATRO_SANDBOX_SOURCE ?? resolve(projectRoot, 'env/sandbox/vendor');
const skip = !existsSync(resolve(source, 'globals.lua')) ? 'Local original source required' :
  spawnSync(lua, ['-v']).status !== 0 ? 'LuaJIT required' : false;

type Shown = { target?: number; chips?: number; hands?: number; discards?: number; jokers?: string[];
  consumables?: { key: string; label: string }[]; forced?: number[] };
/** The public observation fields the analysis reads, as playerState would deliver them. */
function shown(o: Shown = {}): Data {
  const consumables = (o.consumables ?? []).map((card, index) => ({ index, ...card, set: card.key.startsWith('c_') ? 'Planet' : 'Tarot' }));
  return { state: 'SELECTING_HAND', round: { chips: o.chips ?? 0, hands_left: o.hands ?? 4, discards_left: o.discards ?? 3 },
    blind: { name: 'Small Blind', chips: o.target ?? 300 }, jokers: { cards: (o.jokers ?? []).map((label, index) => ({ index, label })) },
    consumables: { cards: consumables, count: consumables.length, limit: 2 }, controls: { play: { forcedIndices: o.forced ?? [] } } };
}
function fixtures(positions: Data[]): Data[] {
  return JSON.parse(execFileSync(lua, ['tests/analysis-fixture.lua', source, JSON.stringify(positions)], { cwd: projectRoot, encoding: 'utf8' })) as Data[];
}
const read = (analysis: Data, state: Data, revision = 'i:1'): AnalysisRead => ({ analysis, observation: { contract: 1, backend: 'test', revision, runId: 'i:run:1',
  gameVersion: '1.0.1o', terminal: false, ready: true, outcome: 'ongoing', state, availableMethods: ['play'], legality: 'backend-authoritative' } });
const hand = ['S_K', 'H_K', 'S_9', { key: 'S_7', seal: 'Blue' }, 'S_5', 'S_4', 'D_3', 'S_2'];
const far = (): number => performance.now() + 60_000;

test('selections enumerate every legal subset and keep forced cards', () => {
  assert.equal(selections(8, 5).length, 218);
  assert.equal(selections(10, 5).length, 637);
  assert.deepEqual(selections(3, 2, [1]), [[0, 1], [1], [1, 2]]);
  assert.equal(selections(8, 5, [3]).every(s => s.includes(3)), true);
  assert.equal(selections(8, 5, [3]).length, 1 + 7 + 21 + 35 + 35);
});

test('economy lines follow the cash-out formula and the stake reward rules', () => {
  const economy = { dollars: 17, interestAmount: 1, interestCap: 25, noInterest: false, moneyPerHand: 1, moneyPerDiscard: 0, rentalRate: 3, rentals: 0,
    blindRewards: { Small: 0, Big: 4, Boss: 5 }, handsPlayed: 12, unusedDiscards: 7, skips: 1 };
  assert.equal(interest(economy), 3);
  assert.equal(interest({ ...economy, dollars: 200 }), 5);
  assert.equal(interest({ ...economy, dollars: 4 }), 0);
  assert.equal(economyLine(economy), '$17: interest $3 at cash-out; spend up to $2 keeps it; next step at $20; each $5 below costs $1/round');
  assert.equal(economyLine({ ...economy, dollars: 40, rentals: 2 }), '$40: interest $5 at cash-out; spend up to $15 keeps it; at the interest cap ($25); each $5 below costs $1/round; rent $6/round (2 Rental)');
  assert.equal(economyLine({ ...economy, dollars: 3 }), '$3: interest $0 at cash-out; next step at $5');
  assert.equal(economyLine({ ...economy, noInterest: true, moneyPerHand: 2 }), '$17: no interest on this deck');
  const blinds = { Small: { status: 'Select', skipReward: { key: 'tag_economy', displayName: 'Economy Tag' } }, Big: { status: 'Upcoming' }, Boss: { status: 'Upcoming' } };
  assert.equal(rewardsLine(economy, { blinds }), 'Small $0, Big $4, Boss $5; plus $1 per unused hand');
  assert.equal(rewardsLine(economy, { blinds: { ...blinds, Small: { status: 'Defeated' } } }), 'Big $4, Boss $5; plus $1 per unused hand');
  assert.equal(skipLine(economy, { state: 'BLIND_SELECT', currentBlind: 'Small', blinds }),
    "skip Small: gives Economy Tag ($17 now); forgoes $0 reward, $1 per unused hand, this round's Joker scaling and the shop after it");
  assert.equal(skipLine(economy, { state: 'BLIND_SELECT', currentBlind: 'Boss', blinds }), undefined);
  assert.equal(skipLine(economy, { state: 'SHOP', currentBlind: 'Small', blinds }), undefined);
});

test('hand brief scores every play, shows what each keeps and prices a held Planet', { skip }, async () => {
  const [analysis] = fixtures([{ hand, jokers: ['j_joker'], consumables: ['c_jupiter'] }]);
  const analyzer = new Analyzer({ lua, sourceDir: source });
  try {
    const state = shown({ target: 500, hands: 1, discards: 0, jokers: ['Joker'], consumables: [{ key: 'c_jupiter', label: 'Jupiter' }] });
    const { brief, predictions } = await analyzer.analyze(read(analysis!, state), { deadline: far(), trusted: true });
    assert.equal(brief.focus, 'hand'); assert.equal(brief.status, 'complete');
    if (brief.focus !== 'hand') return;
    assert.equal(brief.need, '500 to clear; hands 1, discards 0');
    assert.deepEqual(brief.plays, [
      '0 2 3 4 5: Flush 560 exact; clears; plays the Blue Seal',
      '0 2 4 5 7: Flush 520 exact; clears; holds Blue Seal (card 3) -> Jupiter at round end',
      '0 1: Pair 180 exact; short 320; up to 3 more cards can ride along at the same score',
      '0: High Card 75 exact; short 425; up to 4 more cards can ride along at the same score',
    ]);
    assert.deepEqual(brief.use, ['consumable 0 Jupiter, then 0 2 3 4 5: Flush 850 exact; clears; plays the Blue Seal (best now 560)']);
    assert.equal(brief.order, undefined); assert.equal(brief.notes, undefined);
    assert.equal(predictions.size, 218);
    assert.equal(predictions.get('0 2 3 4 5'), 560); assert.equal(predictions.get('0 1'), 180);
  } finally { await analyzer.close(); }
});

test('hand brief finds Joker and hand orders, prices caller lines and reports Joker growth', { skip }, async () => {
  const [ordered, glass, bus] = fixtures([
    { hand: ['S_K', 'H_K', 'D_3'], jokers: ['j_cavendish', 'j_joker'], consumables: ['c_mercury', 'c_fool'] },
    { hand: [{ key: 'S_K', enhancement: 'm_glass' }, { key: 'H_K', enhancement: 'm_mult' }, 'D_3'] },
    { hand: ['S_K', 'H_K', 'D_3', 'C_4'], jokers: [{ key: 'j_ride_the_bus', ability: { mult: 6 } }, 'j_green_joker'] },
  ]);
  const analyzer = new Analyzer({ lua, sourceDir: source });
  try {
    // Pair of Kings: 30 chips; X3 then +4 Mult gives 10, +4 then X3 gives 18.
    const lines: Line[] = [
      [{ method: 'rearrange', jokers: [1, 0] }, { method: 'play', cards: [0, 1] }],
      [{ method: 'use', consumable: 0 }, { method: 'play', cards: [0, 1] }],
      [{ method: 'use', consumable: 0 }, { method: 'rearrange', jokers: [1, 0] }],
      [{ method: 'use', consumable: 1 }],
      [{ method: 'play', cards: [0, 1] }, { method: 'use', consumable: 0 }],
      [{ method: 'rearrange', hand: [2, 1, 0] }, { method: 'play', cards: [0, 2] }],
    ];
    const state = shown({ jokers: ['Cavendish', 'Joker'], consumables: [{ key: 'c_mercury', label: 'Mercury' }, { key: 'c_fool', label: 'The Fool' }] });
    const first = await analyzer.analyze(read(ordered!, state), { lines, deadline: far(), trusted: true });
    assert.equal(first.brief.focus, 'hand');
    if (first.brief.focus !== 'hand') return;
    assert.equal(first.brief.plays![0], '0 1: Pair 300 exact; clears; up to 1 more card can ride along at the same score');
    assert.deepEqual(first.brief.order, ['rearrange jokers [1,0], then 0 1: Pair 540 exact; clears; up to 1 more card can ride along at the same score (best now 300)']);
    assert.deepEqual(first.brief.lines, [
      'line 1: jokers [1,0] > play 0 1 -> 0 1: Pair 540 exact; clears',
      // Mercury: Pair level 2 is 25 chips x 3 Mult.
      'line 2: use Mercury > play 0 1 -> 0 1: Pair 585 exact; clears',
      'line 3: use Mercury > jokers [1,0] > best play -> 0 1: Pair 945 exact; clears; up to 1 more card can ride along at the same score',
      'line 4: unavailable; using The Fool is not analysed yet',
      'line 5: unavailable; step 2 follows the play',
      // King high: 15 chips; X3 then +4 Mult is 7.
      'line 6: hand [2,1,0] > play 0 2 -> 0 2: High Card 105 exact; short 195',
    ]);

    const second = await analyzer.analyze(read(glass!, shown()), { deadline: far(), trusted: true });
    assert.equal(second.brief.focus, 'hand');
    if (second.brief.focus !== 'hand') return;
    assert.equal(second.brief.plays![0]!.startsWith('0 1: Pair 240 exact'), true);
    assert.deepEqual(second.brief.order, ['rearrange hand [1,0,2], then play positions 0 1: Pair 360 exact (240 in the current order)']);

    const third = await analyzer.analyze(read(bus!, shown({ target: 60, jokers: ['Ride the Bus', 'Green Joker'] })), { deadline: far(), trusted: false });
    assert.equal(third.brief.focus, 'hand');
    if (third.brief.focus !== 'hand') return;
    // Green Joker's +1 applies to every play and is omitted; Ride the Bus differs by play.
    assert.equal(third.brief.plays![0], '0 1: Pair 90 conditional; reaches the target; Ride the Bus Mult 6 -> 0; up to 2 more cards can ride along at the same score');
    assert.equal(third.brief.plays!.some(row => /High Card \d+ conditional; reaches the target; Ride the Bus Mult 6 -> 7/.test(row)), true);
    assert.equal(third.brief.plays!.some(row => row.includes('Green Joker')), false);
    assert.equal(third.predictions.size, 0);
    assert.deepEqual(third.brief.notes, ['conditional: exact labels are suspended after a prediction mismatch in this run']);
  } finally { await analyzer.close(); }
});

test('hand brief keeps face-down cards out of plays and respects a forced card', { skip }, async () => {
  const [hidden, forced, allHidden, hook] = fixtures([
    { hand, jokers: ['j_joker'], hide: [1] },
    { hand, jokers: ['j_joker'], forced: 6 },
    { hand: ['S_K', 'H_K'], hide: [0, 1] },
    { hand: ['S_K', 'H_K', 'D_3'], blind: 'bl_hook' },
  ]);
  assert.doesNotMatch(JSON.stringify(record(record(hidden!.scoring).state).hand), /H_K/);
  const analyzer = new Analyzer({ lua, sourceDir: source });
  try {
    const a = await analyzer.analyze(read(hidden!, shown({ jokers: ['Joker'] })), { lines: [[{ method: 'play', cards: [0, 1] }]], deadline: far(), trusted: true });
    assert.equal(a.brief.focus, 'hand');
    if (a.brief.focus !== 'hand') return;
    assert.equal(a.brief.plays![0], '0 2 3 4 5: Flush 560 conditional; reaches the target; plays the Blue Seal');
    assert.equal(a.brief.plays!.some(row => /(^| )1[ :]/.test(row.split(':')[0]!) || row.includes('Pair')), false);
    assert.deepEqual(a.brief.lines, ['line 1: unavailable; play selects a missing or face-down card, or too many cards']);
    assert.match(a.brief.notes![0]!, /1 face-down card is held unscored/);
    assert.equal(a.predictions.size, 0);

    const b = await analyzer.analyze(read(forced!, shown({ jokers: ['Joker'], forced: [6] })), { deadline: far(), trusted: true });
    assert.equal(b.brief.focus, 'hand');
    if (b.brief.focus !== 'hand') return;
    assert.equal(b.brief.plays!.every(row => row.split(':')[0]!.split(' ').includes('6')), true);
    assert.equal([...b.predictions.keys()].every(key => key.split(' ').includes('6')), true);

    const c = await analyzer.analyze(read(allHidden!, shown()), { deadline: far(), trusted: true });
    assert.deepEqual(c.brief, { focus: 'hand', status: 'unavailable', notes: ['every held card is face down'] });

    const d = await analyzer.analyze(read(hook!, shown()), { deadline: far(), trusted: true });
    assert.equal(d.brief.focus, 'hand');
    if (d.brief.focus !== 'hand') return;
    assert.equal(d.brief.plays![0]!.startsWith('0 1: Pair 60 conditional'), true);
    assert.deepEqual(d.brief.notes, ['conditional: The Hook discards 2 random held cards before scoring; held-card effects may differ']);
    assert.equal(d.predictions.size, 0);
  } finally { await analyzer.close(); }
});

test('build phases return economy only and other phases are unavailable', async () => {
  const analyzer = new Analyzer();
  const economy = { dollars: 17, interestAmount: 1, interestCap: 25, noInterest: false, moneyPerHand: 1, moneyPerDiscard: 0, rentalRate: 3, rentals: 0, blindRewards: { Small: 3, Big: 4 } };
  const blinds = { Small: { status: 'Select', skipReward: { key: 'tag_investment', displayName: 'Investment Tag' } }, Big: { status: 'Upcoming' } };
  const shop = await analyzer.analyze(read({ phase: 'BLIND_SELECT', economy }, { state: 'BLIND_SELECT', currentBlind: 'Small', blinds }), { deadline: far(), trusted: true });
  assert.deepEqual(shop.brief, { focus: 'build', status: 'partial', notes: ['economy only: build pace and offer changes are not implemented in this version'],
    economy: '$17: interest $3 at cash-out; spend up to $2 keeps it; next step at $20; each $5 below costs $1/round', rewards: 'Small $3, Big $4; plus $1 per unused hand',
    skip: "skip Small: gives Investment Tag ($25 after the Boss is defeated); forgoes $3 reward, $1 per unused hand, this round's Joker scaling and the shop after it" });
  assert.equal((await analyzer.analyze(read({ phase: 'ROUND_EVAL', economy }, { state: 'ROUND_EVAL' }), { deadline: far(), trusted: true })).brief.status, 'unavailable');
  assert.equal((await analyzer.analyze(read({ phase: 7 }, { state: 'SHOP' }), { deadline: far(), trusted: true })).brief.status, 'unavailable');
  assert.equal((await analyzer.analyze(read({ phase: 'SHOP', economy }, { state: 'SHOP' }), { lines: [[{ method: 'use', consumable: 0 }]], deadline: far(), trusted: true })).brief.status, 'unavailable');
  await analyzer.close();
});

type Handler = (params: Data, context: { mcpReq: { signal?: AbortSignal } }) => Promise<{ isError?: boolean; structuredContent: Data }>;
/** registerGameTools over a scripted backend and analyzer; no game, worker or MCP transport. */
function harness(script: { reads: AnalysisRead[]; briefs?: { predictions: Map<string, number> }[]; acts?: Observation[]; analysis?: boolean }) {
  const handlers: Record<string, Handler> = {}, traced: Data[] = [];
  const calls = { observe: 0, analysis: 0, act: 0 };
  const server = { registerTool(name: string, _config: unknown, handler: Handler) { handlers[name] = handler; } };
  const backend: Backend = { name: 'test', close: async () => {},
    observe: async () => { calls.observe++; return script.reads[0]!.observation; },
    observeDeck: async () => { throw new Error('unused'); },
    act: async () => { calls.act++; return script.acts!.shift()!; },
    ...(script.analysis === false ? {} : { analysisSnapshot: async () => { const next = script.reads[Math.min(calls.analysis, script.reads.length - 1)]!; calls.analysis++; return next; } }) };
  const analyzer = { analyze: async (_read: AnalysisRead, options: { trusted: boolean }) => ({ brief: { focus: 'hand' as const, status: 'complete' as const, plays: [`trusted ${options.trusted}`] },
    predictions: script.briefs?.shift()?.predictions ?? new Map<string, number>() }), close: async () => {} };
  const trace = { encode: (value: unknown) => JSON.stringify(value), write: async (type: string, data: unknown) => { traced.push({ type, data }); } } as unknown as Trace;
  registerGameTools(server as unknown as McpServer, backend, trace, operation => operation(), 30000, analyzer as unknown as Analyzer);
  const call = async (name: string, params: Data = {}) => { const result = await handlers[name]!(params, { mcpReq: {} }); return record(result.structuredContent); };
  return { call, calls, traced };
}
const playing = (revision: string, chips: number): AnalysisRead => read({ phase: 'SELECTING_HAND' }, { state: 'SELECTING_HAND', round: { chips, hands_left: 3, discards_left: 3 } }, revision);

test('game_analyze needs an issued revision, never moves the baseline and rejects state that changed', async () => {
  const stable = harness({ reads: [playing('i:1', 0)] });
  assert.equal((await stable.call('game_analyze', { revision: '1' })).code, 'stale_state');
  assert.equal(stable.calls.analysis, 0);
  await stable.call('game_observe');
  const value = record((await stable.call('game_analyze', { revision: '1' })).value);
  assert.deepEqual(value, { rev: '1', phase: 'SELECTING_HAND', focus: 'hand', status: 'complete', plays: ['trusted true'] });
  assert.equal(stable.calls.analysis, 2);
  assert.equal((await stable.call('game_analyze', { revision: '2' })).code, 'stale_state');
  assert.equal(stable.calls.observe, 1, 'analysis never calls the lock-releasing observe');

  const moved = harness({ reads: [playing('i:1', 0), playing('i:2', 0)] });
  await moved.call('game_observe');
  assert.deepEqual(await moved.call('game_analyze', { revision: '1' }), { ok: false, code: 'stale_state', applied: false, message: 'State changed during analysis; observe again.' });
  const edited = harness({ reads: [playing('i:1', 0), read({ phase: 'SELECTING_HAND', economy: { dollars: 1 } }, playing('i:1', 0).observation.state)] });
  await edited.call('game_observe');
  assert.equal((await edited.call('game_analyze', { revision: '1' })).code, 'stale_state', 'analysis inputs outside the fingerprint are compared directly');

  const waiting = playing('i:1', 0); waiting.observation.ready = false; waiting.observation.notReadyReason = 'Waiting for the card animation';
  const unready = harness({ reads: [waiting] });
  await unready.call('game_observe');
  assert.deepEqual(record((await unready.call('game_analyze', { revision: '1' })).value), { rev: '1', phase: 'SELECTING_HAND', status: 'unavailable', notes: ['Waiting for the card animation'] });
  const old = harness({ reads: [playing('i:1', 0)], analysis: false });
  await old.call('game_observe');
  assert.equal((await old.call('game_analyze', { revision: '1' })).code, 'incompatible_backend');
});

test('plays at an analysed revision are audited; a mismatch suspends exact labels for the run', async () => {
  const reads = [playing('i:1', 100)], acts: Observation[] = [];
  const h = harness({ reads, acts, briefs: [{ predictions: new Map([['0 1 2', 560]]) }, { predictions: new Map([['1', 10]]) }, { predictions: new Map() }] });
  // Each action returns the next observation, which then becomes the state the backend reads.
  const step = async (revision: string, next: AnalysisRead, cards: number[]) => {
    acts.push(next.observation);
    const result = await h.call('game_action', { revision, action: { method: 'play', cards } });
    reads[0] = next;
    return result;
  };
  const audits = () => h.traced.filter(row => row.type === 'score_audit').map(row => row.data);
  await h.call('game_observe');
  assert.equal(record((await h.call('game_analyze', { revision: '1' })).value).audit, undefined);
  // Selection order does not matter; predictions are keyed by sorted indices.
  assert.equal((await step('1', playing('i:2', 660), [2, 0, 1])).ok, true);
  assert.deepEqual(audits(), [{ revision: 'i:1', cards: [2, 0, 1], predicted: 560, scored: 560, matched: true }]);
  assert.equal(record((await h.call('game_analyze', { revision: '2' })).value).audit, 'exact 1/1 matched this run');
  await step('2', playing('i:3', 685), [1]);
  const suspended = record((await h.call('game_analyze', { revision: '3' })).value);
  assert.equal(suspended.audit, 'MISMATCH at rev 2 predicted 10, scored 25; 1/2 predictions matched this run, exact labels are suspended');
  assert.deepEqual(suspended.plays, ['trusted false']);
  // The last analysis predicted nothing for this selection, so nothing is compared.
  await step('3', playing('i:4', 900), [4]);
  assert.equal(audits().length, 2);
  // A new run starts with a clean audit.
  const fresh = playing('i:5', 0); fresh.observation.runId = 'i:run:2'; reads[0] = fresh;
  await h.call('game_observe');
  const restarted = record((await h.call('game_analyze', { revision: '5' })).value);
  assert.equal(restarted.audit, undefined); assert.deepEqual(restarted.plays, ['trusted true']);
});

test('game_analyze runs end to end over the HTTP bridge client and the scoring worker', { skip }, async () => {
  const [analysis] = fixtures([{ hand, jokers: ['j_joker'], consumables: ['c_jupiter'] }]);
  const state = shown({ target: 500, hands: 1, discards: 0, jokers: ['Joker'], consumables: [{ key: 'c_jupiter', label: 'Jupiter' }] });
  const observation = { contract: 1, backend: 'balatro_mcp_mod', revision: 'live:7', runId: 'live:run:1', gameVersion: '1.0.1o', terminal: false, outcome: 'ongoing',
    ready: true, state: { ...state, seed: 'HIDDEN_SEED' }, availableMethods: ['play', 'discard'], legality: 'backend-authoritative' };
  const methods: string[] = [];
  const http = createServer(async (incoming, response) => {
    let text = ''; for await (const chunk of incoming) text += chunk;
    const request = JSON.parse(text) as Data; methods.push(String(request.method));
    const value = request.method === 'sf.health' ? { status: 'ok', bridge: 'balatro_mcp_mod', protocol: 1, instanceId: 'live', gameVersion: '1.0.1o-FULL', preservesTiming: true,
      capabilities: ['observe', 'deck_observe', 'act', 'operation', 'analysis_snapshot'] } : request.method === 'sf.analysis_snapshot' ? { observation, analysis } : observation;
    response.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: value }));
  });
  await new Promise<void>(done => http.listen(0, '127.0.0.1', done));
  const address = http.address(); assert.ok(address && typeof address === 'object');
  const handlers: Record<string, Handler> = {};
  const backend = new ForgeBridgeBackend(`http://127.0.0.1:${address.port}`, 10_000);
  const trace = { encode: (value: unknown) => JSON.stringify(value), write: async () => {} } as unknown as Trace;
  const tools = registerGameTools({ registerTool(name: string, _config: unknown, handler: Handler) { handlers[name] = handler; } } as unknown as McpServer,
    backend, trace, operation => operation(), 10_000, new Analyzer({ lua, sourceDir: source }));
  try {
    const observed = record((await handlers.game_observe!({}, { mcpReq: {} })).structuredContent);
    assert.equal(record(observed.value).rev, '7');
    const result = await handlers.game_analyze!({ revision: '7', lines: [[{ method: 'use', consumable: 0 }, { method: 'play', cards: [0, 2, 4, 5, 7] }]] }, { mcpReq: {} });
    const value = record(record(result.structuredContent).value);
    assert.deepEqual(value, { rev: '7', phase: 'SELECTING_HAND', focus: 'hand', status: 'complete', need: '500 to clear; hands 1, discards 0',
      plays: ['0 2 3 4 5: Flush 560 exact; clears; plays the Blue Seal',
        '0 2 4 5 7: Flush 520 exact; clears; holds Blue Seal (card 3) -> Jupiter at round end',
        '0 1: Pair 180 exact; short 320; up to 3 more cards can ride along at the same score',
        '0: High Card 75 exact; short 425; up to 4 more cards can ride along at the same score'],
      use: ['consumable 0 Jupiter, then 0 2 3 4 5: Flush 850 exact; clears; plays the Blue Seal (best now 560)'],
      // Jupiter: Flush level 2 is 50 chips x 6 Mult; 80 chips x 10 Mult with the Joker.
      lines: ['line 1: use Jupiter > play 0 2 4 5 7 -> 0 2 4 5 7: Flush 800 exact; clears; holds Blue Seal (card 3) -> Jupiter at round end'] });
    assert.doesNotMatch(JSON.stringify(result), /HIDDEN_SEED|passiveEffectsApplied|ability/);
    assert.deepEqual(methods, ['sf.health', 'sf.observe', 'sf.analysis_snapshot', 'sf.analysis_snapshot']);
    assert.ok(JSON.stringify(value).length < 1500, 'the hand brief stays within its size target');
  } finally { await tools.close(); await backend.close(); http.closeAllConnections(); await new Promise<void>(done => http.close(() => done())); }
});

