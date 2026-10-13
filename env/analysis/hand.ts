import { Type, type Static, type TSchema } from 'typebox';
import { record, type Data } from '../contract.ts';
import type { ScoreResult, ScoreState, ScoringSandbox } from '../sandbox/index.ts';
import { position, type AnalysisState, type Position } from './snapshot.ts';

const index = Type.Integer({ minimum: 0 });
const indices = Type.Array(index, { minItems: 1, maxItems: 64, uniqueItems: true });
const object = <T extends Record<string, TSchema>>(properties: T) => Type.Object(properties, { additionalProperties: false });
/** The action variants a hypothetical line may contain; shapes match ActionSchema. */
export const AnalysisActionSchema = Type.Union([
  object({ method: Type.Literal('play'), cards: Type.Array(index, { minItems: 1, maxItems: 5, uniqueItems: true }) }),
  object({ method: Type.Literal('use'), consumable: index }),
  object({ method: Type.Literal('rearrange'), jokers: indices }),
  object({ method: Type.Literal('rearrange'), hand: indices }),
]);
export const LinesSchema = Type.Array(Type.Array(AnalysisActionSchema, { minItems: 1, maxItems: 3 }), { minItems: 1, maxItems: 4 });
export type Line = Static<typeof LinesSchema>[number];

type Scored = Extract<ScoreResult, { status: 'ok' }>;
/** `sel` indexes the sandbox hand; `real` is the same selection as indices of the observed hand. */
interface Entry { sel: number[]; real: number[]; r: Scored; }
export interface HandBrief {
  focus: 'hand'; status: 'complete' | 'partial' | 'unavailable';
  need?: string; plays?: string[]; use?: string[]; order?: string[]; lines?: string[]; notes?: string[];
}
export interface HandResult { brief: HandBrief; /** Exact scores by sorted real indices, for the play audit. */ predictions: Map<string, number>; }
export interface HandOptions { lines?: Line[]; deadline: number; /** False after a prediction mismatch in this run. */ trusted: boolean; }

const PLANETS: Record<string, string> = {
  c_pluto: 'High Card', c_mercury: 'Pair', c_uranus: 'Two Pair', c_venus: 'Three of a Kind', c_saturn: 'Straight', c_jupiter: 'Flush',
  c_earth: 'Full House', c_mars: 'Four of a Kind', c_neptune: 'Straight Flush', c_planet_x: 'Five of a Kind', c_ceres: 'Flush House', c_eris: 'Flush Five',
};
const PLANET_OF = Object.fromEntries(Object.entries(PLANETS).map(([key, hand]) => [hand, key.slice(2).replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())]));
const FIELD: Record<string, string> = { mult: 'Mult', x_mult: 'XMult', 'extra.chips': 'chips' };
const MAX_FAMILIES = 6, ORDER_BUDGET_MS = 1200;

const cardsOf = (value: unknown): Data[] => (Array.isArray(record(value).cards) ? record(value).cards as unknown[] : []).map(record);
const num = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
export const playKey = (cards: number[]): string => [...cards].sort((a, b) => a - b).join(' ');

/** Every subset of `count` cards with 1..limit members that contains all forced cards. */
export function selections(count: number, limit: number, forced: number[] = []): number[][] {
  const out: number[][] = [], picked: number[] = [], must = new Set(forced);
  const walk = (start: number): void => {
    if (picked.length && forced.every(i => picked.includes(i))) out.push([...picked]);
    if (picked.length === limit) return;
    for (let i = start; i < count; i++) {
      picked.push(i); walk(i + 1); picked.pop();
      if (must.has(i)) break; // Later branches would skip a forced card.
    }
  };
  walk(0);
  return out;
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map(rest => [item, ...rest]));
}
const isPermutation = (value: number[], length: number): boolean => value.length === length && new Set(value).size === length && value.every(i => i < length);

function better(a: Entry, b: Entry): boolean {
  if (a.r.notAllowed !== b.r.notAllowed) return !a.r.notAllowed;
  if (a.r.score !== b.r.score) return a.r.score > b.r.score;
  if (a.sel.length !== b.sel.length) return a.sel.length < b.sel.length;
  return a.sel.join() < b.sel.join();
}
const best = (entries: Entry[]): Entry | undefined => entries.reduce<Entry | undefined>((top, e) => !top || better(e, top) ? e : top, undefined);

/** Scores for one loaded position: all selections, or the given ones. */
async function scoreAll(sandbox: ScoringSandbox, pos: Position, sels: number[][], ordered = false): Promise<{ entries: Entry[]; failed: string[] }> {
  const entries: Entry[] = [], failed = new Set<string>();
  for (let at = 0; at < sels.length; at += 2048) {
    const chunk = sels.slice(at, at + 2048), results = await sandbox.scoreBatch(chunk, { ordered });
    results.forEach((r, i) => {
      if (r.status === 'ok') entries.push({ sel: chunk[i]!, real: chunk[i]!.map(s => pos.visible[s]!), r });
      else failed.add(r.message);
    });
  }
  return { entries, failed: [...failed] };
}

export async function handBrief(sandbox: ScoringSandbox, observed: Data, scoring: { state: AnalysisState; selectionLimit: number }, options: HandOptions): Promise<HandResult> {
  const notes: string[] = [], predictions = new Map<string, number>();
  const unavailable = (reason: string): HandResult => ({ brief: { focus: 'hand', status: 'unavailable', notes: [reason] }, predictions });
  const pos = position(scoring.state), limit = scoring.selectionLimit;
  const round = record(observed.round), target = num(record(observed.blind).chips), chips = num(round.chips);
  const need = target !== null && chips !== null ? Math.max(0, target - chips) : null;
  const handsLeft = num(round.hands_left), discardsLeft = num(round.discards_left);
  const jokerNames = cardsOf(observed.jokers).map((card, i) => String(card.label ?? `Joker ${i}`));
  const consumables = cardsOf(observed.consumables), slots = record(observed.consumables);
  const forcedReal = (Array.isArray(record(record(observed.controls).play).forcedIndices) ? record(record(observed.controls).play).forcedIndices as unknown[] : [])
    .filter((value): value is number => typeof value === 'number');
  if (!pos.visible.length) return unavailable('every held card is face down');
  if (limit < 1) return unavailable('no card can be selected');
  if (forcedReal.some(i => !pos.visible.includes(i))) return unavailable('the forced card is face down');
  const forced = forcedReal.map(i => pos.visible.indexOf(i));

  // The Hook discards two random held cards before scoring; score as if it did not.
  let base = pos.state, hook = false;
  let loaded = await sandbox.load(base);
  if (loaded.status !== 'ready' && /The Hook/.test(loaded.message) && typeof base.blind === 'object') {
    base = { ...base, blind: { ...base.blind, disabled: true } }; hook = true;
    loaded = await sandbox.load(base);
  }
  if (loaded.status !== 'ready') return unavailable(/Missing Balatro source/.test(loaded.message)
    ? 'the original scoring source is not prepared on the server; run npm run sandbox:prepare' : loaded.message);
  const sels = selections(pos.visible.length, limit, forced);
  if (!sels.length) return unavailable('no legal selection');
  const { entries, failed } = await scoreAll(sandbox, pos, sels);
  if (!entries.length) return unavailable(failed[0] ?? 'no selection could be scored');
  if (failed.length) notes.push(`${sels.length - entries.length} of ${sels.length} selections could not be scored: ${failed[0]}`);

  const weakened = pos.hidden > 0 || hook || !options.trusted;
  const label = (r: Scored): 'exact' | 'conditional' => weakened || r.random ? 'conditional' : 'exact';
  if (pos.hidden) notes.push(`conditional: ${pos.hidden} face-down card${pos.hidden === 1 ? ' is' : 's are'} held unscored; any held effect of ${pos.hidden === 1 ? 'it' : 'them'} is not counted`);
  if (hook) notes.push('conditional: The Hook discards 2 random held cards before scoring; held-card effects may differ');
  if (!options.trusted) notes.push('conditional: exact labels are suspended after a prediction mismatch in this run');
  if (entries.some(e => e.r.random)) notes.push('conditional rows count random bonuses (Lucky, Bloodstone, Misprint and similar) as not triggering');
  if (!weakened) for (const e of entries) if (!e.r.random) predictions.set(playKey(e.real), e.r.score);

  // Changes every selection causes (Green Joker's +1 per hand) do not distinguish plays.
  // Jokers are named, not indexed, so the same change is recognised after a reorder.
  type Change = NonNullable<Scored['jokerChanges']>[number];
  const jokerName = (names: string[], c: Change): string => names[c.joker] ?? `Joker ${c.joker}`;
  const changeKey = (names: string[], c: Change): string => `${jokerName(names, c)}:${c.field}:${c.to}`;
  const common = new Set((entries[0]!.r.jokerChanges ?? []).map(c => changeKey(jokerNames, c))
    .filter(key => entries.every(e => (e.r.jokerChanges ?? []).some(c => changeKey(jokerNames, c) === key))));
  const changes = (e: Entry, names = jokerNames): Change[] => (e.r.jokerChanges ?? []).filter(c => !common.has(changeKey(names, c)));
  const resets = (e: Entry): boolean => changes(e).some(c => c.to < c.from);
  type HeldCard = Exclude<ScoreState['hand'][number], string>;
  const cardAt = (real: number): ScoreState['hand'][number] | undefined => base.hand[pos.visible.indexOf(real)];
  const held = (e: Entry, test: (card: HeldCard) => boolean): number[] =>
    pos.visible.filter(real => { const card = cardAt(real); return !e.real.includes(real) && typeof card === 'object' && test(card); });
  const blueHeld = (e: Entry): number[] => held(e, card => card.seal === 'Blue');
  const goldHeld = (e: Entry): number[] => held(e, card => card.enhancement === 'm_gold');
  const anyBlue = base.hand.some(card => typeof card === 'object' && card.seal === 'Blue');
  const clears = (e: Entry): boolean => need !== null && !e.r.notAllowed && e.r.score >= need;
  const slotFree = num(slots.count) === null || num(slots.limit) === null || Number(slots.count) < Number(slots.limit);

  const facts = (e: Entry, pool: Entry[], names: string[]): string[] => {
    const out: string[] = [];
    if (e.r.notAllowed) out.push('not allowed by the Boss');
    else if (need !== null) out.push(clears(e) ? (label(e.r) === 'exact' ? 'clears' : 'reaches the target') : `short ${need - e.r.score}`);
    if (clears(e)) {
      const blue = blueHeld(e), gold = goldHeld(e);
      if (blue.length) out.push(`holds Blue Seal (card ${blue.join(', ')}) -> ${PLANET_OF[e.r.hand] ?? 'Planet'} at round end${slotFree ? '' : ' if a consumable slot is free'}`);
      else if (anyBlue) out.push('plays the Blue Seal');
      if (gold.length) out.push(`holds ${gold.length} Gold ($3 each at round end)`);
    }
    for (const c of changes(e, names)) out.push(`${jokerName(names, c)} ${FIELD[c.field] ?? c.field} ${c.from} -> ${c.to}`);
    const riders = Math.max(0, ...pool.filter(o => o.r.score === e.r.score && o.r.hand === e.r.hand && o.sel.length > e.sel.length && e.sel.every(i => o.sel.includes(i)))
      .map(o => o.sel.length - e.sel.length));
    if (riders > 0 && !e.r.notAllowed) out.push(`up to ${riders} more card${riders === 1 ? '' : 's'} can ride along at the same score`);
    return out;
  };
  const row = (e: Entry, pool: Entry[] = entries, names = jokerNames): string =>
    `${e.real.join(' ')}: ${e.r.hand} ${e.r.score} ${label(e.r)}${facts(e, pool, names).map(f => '; ' + f).join('')}`;

  // One best play per poker hand, then plays that differ in what they keep.
  const families = new Map<string, Entry>();
  for (const e of entries) { const top = families.get(e.r.hand); if (!top || better(e, top)) families.set(e.r.hand, e); }
  const chosen = [...families.values()].sort((a, b) => better(a, b) ? -1 : 1).slice(0, MAX_FAMILIES);
  const add = (e: Entry | undefined): void => { if (e && !chosen.includes(e)) chosen.push(e); };
  const finishing = entries.filter(clears), topFinish = best(finishing);
  if (topFinish) {
    const kept = (e: Entry): number => blueHeld(e).length * 100 + goldHeld(e).length;
    const most = Math.max(...finishing.map(kept));
    if (most > kept(topFinish)) add(best(finishing.filter(e => kept(e) === most)));
  }
  if (chosen.some(resets)) add(best((finishing.some(e => !resets(e)) ? finishing : entries).filter(e => !resets(e))));
  const brief: HandBrief = { focus: 'hand', status: 'complete', plays: chosen.sort((a, b) => better(a, b) ? -1 : 1).map(e => row(e)) };
  if (need !== null) brief.need = `${need} to clear; hands ${handsLeft ?? '?'}, discards ${discardsLeft ?? '?'}`;
  const top = best(entries)!;

  const overBudget = (): boolean => performance.now() > options.deadline;
  const skipped: string[] = [];
  /** Score one edited position; `visible` lists the real hand index of each sandbox slot there. */
  const variant = async (state: ScoreState, visible: number[], play?: number[]): Promise<{ entry?: Entry; pool: Entry[]; error?: string }> => {
    const result = await sandbox.load(state);
    if (result.status !== 'ready') return { pool: [], error: result.message };
    const at: Position = { state, visible, hidden: pos.hidden };
    const wanted = play ? [play.map(i => visible.indexOf(i))] : selections(visible.length, limit, forcedReal.map(i => visible.indexOf(i)));
    const scored = await scoreAll(sandbox, at, wanted);
    return { entry: best(scored.entries), pool: scored.entries, error: scored.entries.length ? undefined : scored.failed[0] ?? 'no selection could be scored' };
  };
  /** The position after using a Planet: its hand one level up and the card gone from the consumables. */
  const afterPlanet = (state: ScoreState, used: number[]): { state: ScoreState; error?: string } => {
    const hands = { ...state.hands };
    for (const slot of used) {
      const name = PLANETS[String(consumables[slot]?.key)], current = name ? hands[name] : undefined;
      if (!name || !current || current.level === undefined) return { state, error: `${String(consumables[slot]?.label ?? `consumable ${slot}`)} cannot be applied` };
      hands[name] = { level: current.level + 1, played: current.played, played_this_round: current.played_this_round };
    }
    return { state: { ...state, hands, consumables: (state.consumables ?? []).filter((_, i) => !used.includes(i)) } };
  };
  const constellation = (base.jokers ?? []).some(joker => typeof joker === 'object' && joker.key === 'j_constellation');
  const planetNote = 'Planet rows do not include Constellation\'s own growth';

  // Planets held now: the best play after using each one.
  const use: string[] = [];
  for (const [slot, card] of consumables.entries()) {
    if (!PLANETS[String(card.key)]) continue;
    if (overBudget()) { skipped.push('use'); break; }
    const edited = afterPlanet(base, [slot]);
    if (edited.error) continue;
    const after = await variant(edited.state, pos.visible);
    if (after.entry && after.entry.r.score > top.r.score) {
      use.push(`consumable ${slot} ${String(card.label ?? card.key)}, then ${row(after.entry, after.pool)} (best now ${top.r.score})`);
      if (constellation && !notes.includes(planetNote)) notes.push(planetNote);
    }
  }
  if (use.length) brief.use = use;

  // Joker order: every permutation of up to five Jokers, pair swaps beyond that.
  const order: string[] = [], jokers = base.jokers ?? [];
  if (jokers.length >= 2 && !overBudget()) {
    const identity = jokers.map((_, i) => i), started = performance.now();
    const perms = jokers.length <= 5 ? permutations(identity).slice(1)
      : identity.flatMap(a => identity.filter(b => b > a).map(b => identity.map(i => i === a ? b : i === b ? a : i)));
    const probes = [...new Set([...chosen, ...[...entries].sort((a, b) => better(a, b) ? -1 : 1).slice(0, 6)].map(e => e.sel.join()))].map(key => key.split(',').map(Number));
    let found: { perm: number[]; score: number; moved: number } | undefined, complete = true;
    for (const perm of perms) {
      if (overBudget() || performance.now() - started > ORDER_BUDGET_MS) { complete = false; break; }
      if ((await sandbox.load({ ...base, jokers: perm.map(i => jokers[i]!) })).status !== 'ready') continue;
      const score = Math.max(...(await sandbox.scores(probes)).map(value => typeof value === 'number' ? value : -1));
      const moved = perm.filter((value, i) => value !== i).length;
      if (score > top.r.score && (!found || score > found.score || score === found.score && moved < found.moved)) found = { perm, score, moved };
    }
    if (!complete) notes.push('Joker order search stopped at its time budget');
    else if (jokers.length > 5) notes.push('Joker order search covered single swaps only');
    if (found) {
      const after = await variant({ ...base, jokers: found.perm.map(i => jokers[i]!) }, pos.visible);
      if (after.entry) order.push(`rearrange jokers [${found.perm.join(',')}], then ${row(after.entry, after.pool, found.perm.map(i => jokerNames[i]!))} (best now ${top.r.score})`);
    }
  }
  // Hand order: the top plays with their cards in every order.
  if (!overBudget() && (await sandbox.load(base)).status === 'ready') {
    for (const e of chosen.filter(c => !c.r.notAllowed && c.sel.length >= 2).slice(0, 2)) {
      const orders = await scoreAll(sandbox, pos, permutations(e.sel), true), reordered = best(orders.entries);
      if (!reordered || reordered.r.score <= e.r.score) continue;
      // The same cards rearranged inside their own hand slots.
      const slotsOf = [...e.real].sort((a, b) => a - b), hand = scoring.state.hand.map((_, i) => i);
      reordered.real.forEach((card, i) => { hand[slotsOf[i]!] = card; });
      order.push(`rearrange hand [${hand.join(',')}], then play positions ${slotsOf.join(' ')}: ${reordered.r.hand} ${reordered.r.score} ${label(reordered.r)} (${e.r.score} in the current order)`);
    }
  } else if (!skipped.includes('use')) skipped.push('order');
  if (order.length) brief.order = order;

  // Caller-supplied lines. Every index refers to the current observation.
  if (options.lines) {
    brief.lines = [];
    for (const [n, line] of options.lines.entries()) {
      const name = `line ${n + 1}`;
      if (overBudget()) { brief.lines.push(`${name}: unavailable; time budget exhausted`); continue; }
      let jokerOrder: number[] | undefined, handOrder: number[] | undefined, play: number[] | undefined, error: string | undefined;
      const used: number[] = [], told: string[] = [];
      for (const [k, step] of line.entries()) {
        if (play) { error = `step ${k + 1} follows the play`; break; }
        if (step.method === 'use') {
          const card = consumables[step.consumable];
          if (!card || used.includes(step.consumable)) { error = `consumable ${step.consumable} is not available`; break; }
          if (!PLANETS[String(card.key)]) { error = `using ${String(card.label ?? card.key)} is not analysed yet`; break; }
          used.push(step.consumable); told.push(`use ${String(card.label ?? card.key)}`);
        } else if (step.method === 'rearrange' && 'jokers' in step) {
          if (!isPermutation(step.jokers, jokers.length)) { error = 'jokers must be a full permutation'; break; }
          jokerOrder = step.jokers; told.push(`jokers [${step.jokers.join(',')}]`);
        } else if (step.method === 'rearrange') {
          if (!isPermutation(step.hand, scoring.state.hand.length)) { error = 'hand must be a full permutation'; break; }
          handOrder = step.hand; told.push(`hand [${step.hand.join(',')}]`);
        } else {
          if (step.cards.length > limit || step.cards.some(i => !pos.visible.includes(i))) { error = 'play selects a missing or face-down card, or too many cards'; break; }
          if (forcedReal.some(i => !step.cards.includes(i))) { error = 'play must include the forced card'; break; }
          play = step.cards; told.push(`play ${step.cards.join(' ')}`);
        }
      }
      if (error) { brief.lines.push(`${name}: unavailable; ${error}`); continue; }
      const planets = afterPlanet(base, used);
      if (planets.error) { brief.lines.push(`${name}: unavailable; ${planets.error}`); continue; }
      // After a hand rearrange, sandbox slots follow the new order while indices stay those of the observation.
      const visible = (handOrder ?? scoring.state.hand.map((_, i) => i)).filter(i => pos.visible.includes(i));
      const state: ScoreState = { ...planets.state, hand: visible.map(i => base.hand[pos.visible.indexOf(i)]!),
        jokers: jokerOrder ? jokerOrder.map(i => jokers[i]!) : planets.state.jokers };
      const outcome = await variant(state, visible, play);
      if (!outcome.entry) { brief.lines.push(`${name}: unavailable; ${outcome.error ?? 'could not be scored'}`); continue; }
      if (used.length && constellation && !notes.includes(planetNote)) notes.push(planetNote);
      brief.lines.push(`${name}: ${told.join(' > ')}${play ? '' : `${told.length ? ' > ' : ''}best play`} -> ${row(outcome.entry, outcome.pool, jokerOrder ? jokerOrder.map(i => jokerNames[i]!) : jokerNames)}`);
    }
  }
  if (skipped.length) { brief.status = 'partial'; notes.push(`time budget exhausted before: ${skipped.join(', ')}`); }
  if (notes.length) brief.notes = notes;
  return { brief, predictions };
}
