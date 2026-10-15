import { record, type Data } from '../contract.ts';
import type { ScoreResult, ScoreState, ScoringSandbox } from '../sandbox/index.ts';
import { position, type AnalysisState, type Position } from './snapshot.ts';
import { PLANETS, TAROTS } from './consumables.ts';

type Scored = Extract<ScoreResult, { status: 'ok' }>;
/** `sel` indexes the sandbox hand; `real` is the same selection as indices of the observed hand. */
interface Entry { sel: number[]; real: number[]; r: Scored; }
export interface HandBrief {
  focus: 'hand'; status: 'complete' | 'partial' | 'unavailable';
  need?: string; plays?: string[]; use?: string[]; order?: string[]; notes?: string[];
}
export interface HandResult { brief: HandBrief; /** Exact scores by sorted real indices, for the play audit. */ predictions: Map<string, number>; }
export interface HandOptions { deadline: number; /** False after a prediction mismatch in this run. */ trusted: boolean; }

const PLANET_OF = Object.fromEntries(Object.entries(PLANETS).map(([key, hand]) => [hand, key.slice(2).replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())]));
const FIELD: Record<string, string> = { mult: 'Mult', x_mult: 'XMult', 'extra.chips': 'chips' };
const MAX_FAMILIES = 6, ORDER_BUDGET_MS = 1200, TAROT_SETS = 100;
/** Tarots with a deterministic effect on chosen hand cards, by target count. */
const HELD_EFFECTS = new Set(['j_baron', 'j_mime', 'j_raised_fist', 'j_shoot_the_moon', 'j_blackboard', 'j_reserved_parking']);

const cardsOf = (value: unknown): Data[] => (Array.isArray(record(value).cards) ? record(value).cards as unknown[] : []).map(record);
const num = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
export const playKey = (cards: number[]): string => [...cards].sort((a, b) => a - b).join(' ');
const scoreText = (value: number): string => Number(value.toFixed(3)).toString();

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
  let expectedSeen = false;
  const approximationNotes = new Set<string>();
  const label = (r: Scored): string => {
    if (!r.random) return weakened ? 'conditional' : 'exact';
    expectedSeen = true;
    const approximations = r.expectation?.approximations ?? [];
    approximations.forEach(reason => approximationNotes.add(reason));
    return (weakened ? 'conditional ' : '') + 'expected' + (approximations.length ? ' (interaction approximation)' : '');
  };
  if (pos.hidden) notes.push(`conditional: ${pos.hidden} face-down card${pos.hidden === 1 ? ' is' : 's are'} held unscored; any held effect of ${pos.hidden === 1 ? 'it' : 'them'} is not counted`);
  if (hook) notes.push('conditional: The Hook discards 2 random held cards before scoring; held-card effects may differ');
  if (!options.trusted) notes.push('conditional: exact labels are suspended after a prediction mismatch in this run');
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
    else if (need !== null) out.push(clears(e) ? (label(e.r) === 'exact' ? 'clears' : e.r.random ? 'mean reaches the target; not a guaranteed clear' : 'reaches the target')
      : `${e.r.random ? 'mean ' : ''}short ${scoreText(need - e.r.score)}`);
    if (clears(e)) {
      const blue = blueHeld(e), gold = goldHeld(e);
      if (blue.length) out.push(`holds Blue Seal (card ${blue.join(', ')}) -> ${PLANET_OF[e.r.hand] ?? 'Planet'} at round end${slotFree ? '' : ' if a consumable slot is free'}${e.r.random ? ' if this ends the round' : ''}`);
      else if (anyBlue) out.push('plays the Blue Seal');
      if (gold.length) out.push(`holds ${gold.length} Gold ($3 each at round end${e.r.random ? ' if this ends the round' : ''})`);
    }
    for (const c of changes(e, names)) out.push(`${jokerName(names, c)} ${FIELD[c.field] ?? c.field} ${c.from} -> ${c.to}`);
    const riders = Math.max(0, ...pool.filter(o => o.r.score === e.r.score && o.r.hand === e.r.hand && o.sel.length > e.sel.length && e.sel.every(i => o.sel.includes(i)))
      .map(o => o.sel.length - e.sel.length));
    if (riders > 0 && !e.r.notAllowed) out.push(`up to ${riders} more card${riders === 1 ? '' : 's'} can ride along at the same ${e.r.random ? 'mean ' : ''}score`);
    return out;
  };
  const row = (e: Entry, pool: Entry[] = entries, names = jokerNames): string =>
    `${e.real.join(' ')}: ${e.r.hand} ${scoreText(e.r.score)} ${label(e.r)}${facts(e, pool, names).map(f => '; ' + f).join('')}`;

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
  /**
   * The position after using consumables in order: a Planet levels its hand; a Tarot converts its
   * targets (real hand indices) with the original conversion code, or Death copies the rightmost
   * target onto the others. Used cards leave the consumables.
   */
  const afterUse = (state: ScoreState, steps: { slot: number; cards?: number[] }[]): { state: ScoreState; error?: string } => {
    const hands = { ...state.hands }, hand = [...state.hand];
    for (const { slot, cards } of steps) {
      const key = String(consumables[slot]?.key), shown = String(consumables[slot]?.label ?? `consumable ${slot}`);
      const name = PLANETS[key];
      if (name) {
        const current = hands[name];
        if (cards?.length || !current || current.level === undefined) return { state, error: `${shown} cannot be applied` };
        hands[name] = { level: current.level + 1, played: current.played, played_this_round: current.played_this_round };
        continue;
      }
      const rule = TAROTS[key];
      if (!rule) return { state, error: `using ${shown} is not analysed yet` };
      const targets = cards ?? [];
      if (targets.length < (rule.min ?? 1) || targets.length > rule.max) return { state, error: `${shown} needs ${rule.min ?? 1}-${rule.max} target cards` };
      if (targets.some(i => !pos.visible.includes(i))) return { state, error: `${shown} targets a missing or face-down card` };
      const slots = targets.map(i => pos.visible.indexOf(i));
      if (key === 'c_death') {
        const right = Math.max(...slots);
        for (const s of slots) if (s !== right) hand[s] = structuredClone(hand[right]!);
      } else for (const s of slots) { const card = hand[s]!; hand[s] = typeof card === 'string' ? { key: card, convert: key } : { ...card, convert: key }; }
    }
    const used = steps.map(s => s.slot);
    return { state: { ...state, hands, hand, consumables: (state.consumables ?? []).filter((_, i) => !used.includes(i)) } };
  };
  const constellation = (base.jokers ?? []).some(joker => typeof joker === 'object' && joker.key === 'j_constellation');
  const planetNote = 'Planet rows do not include Constellation\'s own growth';
  // Selections with the same poker hand and scoring cards score alike unless the build reads
  // played or held cards, so target searches score one selection per such group.
  const jokerKeys = (base.jokers ?? []).map(j => typeof j === 'string' ? j : j.key);
  const searchKey = jokerKeys.some(k => HELD_EFFECTS.has(k)) || base.hand.some(c => typeof c === 'object' && c.enhancement === 'm_steel') ? 'full' as const
    : jokerKeys.some(k => k === 'j_half' || k === 'j_square') ? 'size' as const : 'scoring' as const;

  // Consumables held now: the best play after using each one, a Tarot on its best targets.
  const use: string[] = [];
  const tried = new Set<string>();
  for (const [slot, card] of consumables.entries()) {
    const key = String(card.key);
    if (overBudget()) { skipped.push('use'); break; }
    if (PLANETS[key]) {
      const edited = afterUse(base, [{ slot }]);
      if (edited.error) continue;
      const after = await variant(edited.state, pos.visible);
      if (after.entry && after.entry.r.score > top.r.score) {
        use.push(`consumable ${slot} ${String(card.label ?? key)}, then ${row(after.entry, after.pool)} (best now ${scoreText(top.r.score)})`);
        if (constellation && !notes.includes(planetNote)) notes.push(planetNote);
      }
      continue;
    }
    const rule = TAROTS[key];
    if (!rule || tried.has(key)) continue;
    tried.add(key);
    // Every target set of the allowed sizes; forced cards need the full enumeration instead of the grouped search.
    const sets = selections(pos.visible.length, rule.max).filter(s => s.length >= (rule.min ?? 1))
      .sort((a, b) => a.length - b.length).map(s => s.map(i => pos.visible[i]!));
    let found: { targets: number[]; score: number } | undefined, complete = true;
    for (const targets of sets.slice(0, TAROT_SETS)) {
      if (overBudget()) { complete = false; break; }
      const edited = afterUse(base, [{ slot, cards: targets }]);
      if (edited.error) break;
      let score: number;
      if (forcedReal.length) {
        const after = await variant(edited.state, pos.visible);
        score = after.entry && !after.entry.r.notAllowed ? after.entry.r.score : -1;
      } else {
        if ((await sandbox.load(edited.state)).status !== 'ready') continue;
        // A new Steel card is a held effect.
        score = (await sandbox.best({ minSize: 1, maxSize: limit, key: key === 'c_chariot' ? 'full' : searchKey, keep: 1 })).best;
      }
      if (score > top.r.score && (!found || score > found.score)) found = { targets, score };
    }
    if (!complete || sets.length > TAROT_SETS) notes.push(`${String(card.label ?? key)} targets: searched ${complete ? Math.min(sets.length, TAROT_SETS) : 'part'} of ${sets.length} target sets`);
    if (!found) continue;
    const after = await variant(afterUse(base, [{ slot, cards: found.targets }]).state, pos.visible);
    if (after.entry && after.entry.r.score > top.r.score) {
      use.push(`consumable ${slot} ${String(card.label ?? key)} on ${found.targets.join(' ')}, then ${row(after.entry, after.pool)} (best now ${scoreText(top.r.score)})`);
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
      if (after.entry) order.push(`rearrange jokers [${found.perm.join(',')}], then ${row(after.entry, after.pool, found.perm.map(i => jokerNames[i]!))} (best now ${scoreText(top.r.score)})`);
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
      order.push(`rearrange hand [${hand.join(',')}], then play positions ${slotsOf.join(' ')}: ${reordered.r.hand} ${scoreText(reordered.r.score)} ${label(reordered.r)} (${scoreText(e.r.score)} in the current order)`);
    }
  } else if (!skipped.includes('use')) skipped.push('order');
  if (order.length) brief.order = order;

  if (skipped.length) { brief.status = 'partial'; notes.push(`time budget exhausted before: ${skipped.join(', ')}`); }
  if (expectedSeen) notes.push('expected scores substitute each random effect with its public-probability mean in one evaluation, retaining fractional scores before final rounding; they are not guaranteed scores and are excluded from exact play audits');
  if (approximationNotes.size) notes.push('interaction approximation: ' + [...approximationNotes].sort().join('; '));
  if (notes.length) brief.notes = notes;
  return { brief, predictions };
}
