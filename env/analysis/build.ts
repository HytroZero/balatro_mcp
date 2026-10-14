import { createHash } from 'node:crypto';
import { record, type Data } from '../contract.ts';
import type { LoadedRound, ScoreState, ScoringSandbox } from '../sandbox/index.ts';
import { interest } from './economy.ts';
import { PLANETS } from './hand.ts';
import type { BuildInput, Economy, Offer } from './snapshot.ts';

type Card = NonNullable<ScoreState['deck']>[number];
type Spec = Exclude<Card, string>;
/** Which selections can differ in score: 'plain' builds only by poker hand and scoring cards. */
type Mode = 'plain' | 'sized' | 'held';

// Experiment constants. They never depend on the run's seed, RNG state or draw order.
const SAMPLES = 32, KEEP = 4, REPS = 1000, SEED = 0x5eed_b417, BOSS_ROWS = 6, CACHE_ENTRIES = 256;
const HELD = new Set(['j_baron', 'j_mime', 'j_raised_fist', 'j_shoot_the_moon', 'j_blackboard', 'j_reserved_parking']);
const SIZED = new Set(['j_half', 'j_square']);
/** Jokers that change which selections form a poker hand or score. */
const SHAPE = new Set(['j_four_fingers', 'j_shortcut', 'j_smeared', 'j_splash', 'j_pareidolia']);
/** Bosses whose rules change a hand's score; the rest share the plain samples. */
const SCORING_BOSSES = new Set(['bl_club', 'bl_goad', 'bl_head', 'bl_window', 'bl_plant', 'bl_pillar', 'bl_psychic', 'bl_flint', 'bl_arm', 'bl_final_leaf']);
const BOSS_ROUND: Record<string, { hands?: number; discards?: number; handSize?: number }> = {
  bl_needle: { hands: 1 }, bl_water: { discards: 0 }, bl_manacle: { handSize: -1 },
};
const BOSS_NOTES: Record<string, string> = {
  bl_hook: 'its 2 random discards per hand are not modelled', bl_eye: 'no repeated poker hand (not modelled)', bl_mouth: 'one poker hand only (not modelled)',
  bl_arm: 'only the first level loss is modelled', bl_ox: 'money loss not modelled', bl_tooth: 'money loss not modelled',
  bl_serpent: 'draw rule not modelled', bl_house: 'face-down first hand not modelled', bl_wheel: 'face-down draws not modelled', bl_mark: 'face-down face cards not modelled',
  bl_fish: 'face-down draws not modelled', bl_final_bell: 'forced card not modelled', bl_final_heart: 'random Joker debuff not modelled',
  bl_final_acorn: 'flipped, shuffled Jokers not modelled', bl_final_leaf: 'every card debuffed until a Joker is sold',
  bl_psychic: 'must play 5 cards', bl_flint: 'base chips and Mult halved', bl_needle: '1 hand', bl_water: 'no discards', bl_manacle: '-1 hand size',
};
const SUIT_BOSSES: Record<string, string> = { bl_club: 'Clubs', bl_goad: 'Spades', bl_head: 'Hearts', bl_window: 'Diamonds' };
const ROLES = ['Small', 'Big', 'Boss'];
const VOUCHERS: Record<string, Partial<Edit>> = {
  v_grabber: { extraHands: 1 }, v_nacho_tong: { extraHands: 1 }, v_wasteful: { extraDiscards: 1 }, v_recyclomancy: { extraDiscards: 1 },
  v_paint_brush: { extraHandSize: 1 }, v_palette: { extraHandSize: 1 },
};

/** A hypothetical change to the live build. Joker indices refer to `jokers`. */
interface Edit { jokers: Spec[]; added: number[]; removed: number[]; hands?: ScoreState['hands']; extraHands: number; extraDiscards: number; extraHandSize: number }
/** The blind a round is sampled against. */
interface Context { key: string; target: number; hands?: number; discards?: number; handSize: number }
interface Samples { mode: Mode; pool: number; hands: number; bests: number[]; plays: number[][][]; tops: Card[][]; approximations: string[] }
/** Samples by build, edit and blind, kept per connection. */
export type SampleCache = Map<string, Samples>;
export interface BuildOptions { deadline: number; economy?: Economy; boss: boolean; cache?: SampleCache }
export interface BuildResult {
  pace?: string[]; jokers?: string[]; offers?: string[]; horizon?: string; bosses?: string[]; notes: string[]; partial: boolean;
}

function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffles(size: number): number[][] {
  const random = prng(SEED);
  return Array.from({ length: SAMPLES }, () => {
    const order = [...Array(size).keys()];
    for (let i = size - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j]!, order[i]!]; }
    return order;
  });
}
const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.round(q * (sorted.length - 1)))] ?? 0;
}
/** Share of rounds whose `hands` best hands, drawn with replacement, reach `target`. The fixed seed pairs every comparison. */
function clearRate(bests: number[], hands: number, target: number): number {
  if (!bests.length || hands < 1) return 0;
  const random = prng(SEED ^ 0x9e3779b9);
  let hit = 0;
  for (let rep = 0; rep < REPS; rep++) {
    let sum = 0;
    for (let h = 0; h < hands; h++) sum += bests[Math.floor(random() * bests.length)]!;
    if (sum >= target) hit++;
  }
  return hit / REPS;
}
const keyOf = (card: Card): string => typeof card === 'string' ? card : card.key;
const int = (value: number): string => String(Math.round(value));
const rate = (value: number): string => value.toFixed(2);
const pct = (after: number, before: number): string => {
  if (before <= 0) return after > 0 ? 'from 0' : '+0%';
  const change = Math.round((after / before - 1) * 100);
  return (change >= 0 ? '+' : '') + change + '%';
};
const usd = (value: number): string => (value < 0 ? '-$' : '$') + Math.abs(value);
const labelOf = (area: unknown, index: number, fallback: string): string => {
  const card = (Array.isArray(record(area).cards) ? record(area).cards as unknown[] : []).map(record).find(c => c.index === index);
  return String(card?.label ?? fallback);
};
const noEdit = (input: BuildInput): Edit => ({ jokers: [...input.state.jokers], added: [], removed: [], extraHands: 0, extraDiscards: 0, extraHandSize: 0 });

class Sampler {
  readonly approximations = new Set<string>();
  private sandbox: ScoringSandbox;
  private input: BuildInput;
  private orders: number[][];
  private cache: SampleCache;
  constructor(sandbox: ScoringSandbox, input: BuildInput, cache: SampleCache) {
    this.cache = cache;
    // A canonical deck order, so the samples depend on deck membership only.
    const deck = input.state.deck.map(card => ({ card, text: JSON.stringify(card) }))
      .sort((a, b) => a.text < b.text ? -1 : a.text > b.text ? 1 : 0).map(entry => entry.card);
    this.sandbox = sandbox; this.input = { ...input, state: { ...input.state, deck } };
    this.orders = shuffles(input.state.deck.length);
  }

  private state(edit: Edit, ctx: Context, order: number[], pool: number): ScoreState {
    const base = this.input.state, deck = base.deck, game = base.game;
    const resets = record(game.round_resets), round = record(game.current_round);
    return {
      ...base, hand: order.slice(0, pool).map(i => deck[i]!), deck: order.slice(pool).map(i => deck[i]!), discard: [],
      jokers: edit.jokers, jokerEdits: { added: edit.added, removed: edit.removed }, hands: edit.hands ?? base.hands,
      handSize: base.handSize + ctx.handSize + edit.extraHandSize,
      blind: { key: ctx.key, disabled: ctx.key === 'bl_hook' }, applyBlind: true, random: 'expectation',
      game: { ...game, chips: 0, round_resets: { ...resets, discards: Number(resets.discards ?? 0) + edit.extraDiscards },
        current_round: { ...round, hands_played: 0, discards_used: 0, hands_left: Math.max(1, ctx.hands ?? Number(resets.hands ?? 1)),
          discards_left: ctx.discards ?? Number(resets.discards ?? 0) + edit.extraDiscards } },
    };
  }
  private async load(state: ScoreState): Promise<LoadedRound | undefined> {
    const loaded = await this.sandbox.load(state);
    if (loaded.status !== 'ready') throw new Error(loaded.message);
    return loaded.round;
  }

  /** Per-hand best scores of one build against one blind; rescored on `paired` samples when the candidates are the same. */
  async run(edit: Edit, ctx: Context, paired?: Samples): Promise<Samples> {
    // Samples are a pure function of the public build, the edit and the blind, so they can be reused.
    const id = createHash('sha256').update(JSON.stringify([this.input.state, edit, ctx, paired ? 'paired' : 'full'])).digest('base64');
    const cached = this.cache.get(id);
    if (cached) { cached.approximations.forEach(reason => this.approximations.add(reason)); return cached; }
    const result = await this.compute(edit, ctx, paired);
    result.approximations.forEach(reason => this.approximations.add(reason));
    if (this.cache.size >= CACHE_ENTRIES) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(id, result);
    return result;
  }

  private async compute(edit: Edit, ctx: Context, paired?: Samples): Promise<Samples> {
    const deck = this.input.state.deck, first = this.orders[0]!;
    const round = await this.load(this.state(edit, ctx, first, Math.min(deck.length, this.input.state.handSize)));
    if (!round) throw new Error('the scoring engine did not report round parameters');
    const removed = new Set(edit.removed), active = edit.jokers.filter((_, i) => !removed.has(i)).map(keyOf);
    const mode: Mode = active.some(k => HELD.has(k)) || deck.some(c => typeof c === 'object' && c.enhancement === 'm_steel') ? 'held'
      : active.some(k => SIZED.has(k)) ? 'sized' : 'plain';
    const discards = ctx.discards ?? round.discards;
    const pool = Math.min(deck.length, Math.max(1, round.handSize) + (mode === 'held' ? 0 : Math.min(5, 2 * discards)));
    const hands = (ctx.hands ?? round.hands) + edit.extraHands;
    const touched = [...edit.added, ...edit.removed].some(i => SHAPE.has(keyOf(edit.jokers[i]!)));
    const result: Samples = { mode, pool, hands, bests: [], plays: [], tops: [], approximations: [] };
    const addReasons = (reasons: string[] = []): void => {
      for (const reason of reasons) if (!result.approximations.includes(reason)) result.approximations.push(reason);
    };
    if (paired && paired.mode === mode && paired.pool === pool && !touched) {
      for (const [i, order] of this.orders.entries()) {
        await this.load(this.state(edit, ctx, order, pool));
        const plays = paired.plays[i]!;
        const scored = plays.length ? await this.sandbox.scoreBatch(plays) : [];
        const scores: number[] = [];
        for (const row of scored) if (row.status === 'ok') { scores.push(row.score); addReasons(row.expectation?.approximations); }
        result.bests.push(Math.max(0, ...scores)); result.plays.push(plays); result.tops.push(paired.tops[i]!);
      }
      return result;
    }
    const options = mode === 'plain' ? { minSize: Math.min(5, pool), maxSize: 5, key: 'scoring' as const }
      : { minSize: 1, maxSize: 5, key: mode === 'sized' ? 'size' as const : 'full' as const };
    for (const order of this.orders) {
      await this.load(this.state(edit, ctx, order, pool));
      const best = await this.sandbox.best({ ...options, keep: KEEP });
      addReasons(best.approximations);
      const rows = Object.values(best.families).flat();
      const top = rows.reduce<typeof rows[number] | undefined>((a, b) => !a || b.score > a.score ? b : a, undefined);
      result.bests.push(best.best); result.plays.push(rows.map(r => r.play));
      result.tops.push((top?.play ?? []).map(i => deck[order[i]!]!));
    }
    return result;
  }
}

export async function buildBrief(sandbox: ScoringSandbox, input: BuildInput, observed: Data, options: BuildOptions): Promise<BuildResult> {
  const notes: string[] = [], skipped: string[] = [];
  const out: BuildResult = { notes, partial: false };
  const sampler = new Sampler(sandbox, input, options.cache ?? new Map()), base = noEdit(input);
  const over = (): boolean => performance.now() > options.deadline;
  const blindsShown = record(observed.blinds);
  const context = (key: string, target: number): Context => {
    const round = BOSS_ROUND[key] ?? {};
    return { key: SCORING_BOSSES.has(key) ? key : 'bl_small', target, hands: round.hands, discards: round.discards, handSize: round.handSize ?? 0 };
  };
  const cache = new Map<string, Samples>();
  const baseline = async (ctx: Context): Promise<Samples> => {
    const id = `${ctx.key}|${ctx.discards ?? ''}|${ctx.handSize}|${ctx.hands ?? ''}`;
    let samples = cache.get(id);
    if (!samples) { samples = await sampler.run(base, ctx); cache.set(id, samples); }
    return samples;
  };

  // Pace: every blind still to play this Ante.
  const open = ROLES.filter(role => input.blinds[role] && !['Defeated', 'Skipped'].includes(String(input.blinds[role]!.status)));
  const plainCtx = context('bl_small', 0), plain = await baseline(plainCtx);
  const pace: string[] = [];
  let focus: { role: string; ctx: Context; samples: Samples } | undefined;
  for (const role of open) {
    const blind = input.blinds[role]!, ctx = context(blind.key, blind.target), samples = await baseline(ctx);
    const name = role === 'Boss' ? ` ${String(record(blindsShown[role]).displayName ?? record(blindsShown[role]).name ?? blind.key)}` : '';
    const rule = role === 'Boss' && BOSS_NOTES[blind.key] ? `; ${BOSS_NOTES[blind.key]}` : '';
    pace.push(`${role}${name} ${int(blind.target)}: ${samples.hands} hand${samples.hands === 1 ? '' : 's'}, need ${int(Math.ceil(blind.target / samples.hands))}/hand; ` +
      `median ${int(quantile(samples.bests, 0.5))}, p75 ${int(quantile(samples.bests, 0.75))}; clear ${rate(clearRate(samples.bests, samples.hands, blind.target))}${rule}${samples.approximations.length ? '; interaction approximation' : ''}`);
    focus = { role, ctx, samples };
  }
  if (pace.length) out.pace = pace;
  const plainMean = mean(plain.bests);

  // Joker shares: the drop in the mean best hand when each one leaves.
  const shares = new Map<number, number>();
  if (input.state.jokers.length) {
    const rows: string[] = [];
    for (const [i, joker] of input.state.jokers.entries()) {
      if (over()) { skipped.push('jokers'); break; }
      const without = await sampler.run({ ...base, removed: [i] }, plainCtx, plain);
      const share = plainMean > 0 ? 1 - mean(without.bests) / plainMean : 0;
      shares.set(i, share);
      const ability = record(joker.ability), stickers: string[] = [];
      if (ability.eternal === true) stickers.push('Eternal');
      if (ability.perishable === true) stickers.push(`Perishable ${String(ability.perish_tally ?? '?')}`);
      if (ability.rental === true) stickers.push('Rental');
      const shown = labelOf(observed.jokers, i, joker.key) + (stickers.length ? ` [${stickers.join(', ')}]` : '');
      rows.push(`${i} ${shown}: ${share === 0 && without.pool === plain.pool ? 'no direct score' : `${Math.round(share * 100)}% of score`}`);
    }
    out.jokers = rows;
  }

  // Offers: every visible change with a computable effect on the focus blind.
  if (focus) {
    const offers: string[] = [], unpriced: string[] = [];
    const before = clearRate(focus.samples.bests, focus.samples.hands, focus.ctx.target), beforeMean = mean(focus.samples.bests);
    const dollars = options.economy?.dollars;
    const slotsFree = input.state.jokerSlots - input.state.jokers.length;
    const weakest = (): number | undefined => [...shares.entries()]
      .filter(([i]) => record(input.state.jokers[i]!.ability).eternal !== true).sort((a, b) => a[1] - b[1])[0]?.[0];
    const candidates: { where: string; offer: Offer; cost: number }[] = [
      ...input.offers.shop.map(offer => ({ where: 'shop', offer, cost: offer.cost })),
      ...input.offers.pack.map(offer => ({ where: 'pack', offer, cost: 0 })),
      ...input.offers.vouchers.map(offer => ({ where: 'voucher', offer, cost: offer.cost })),
      ...input.state.consumables.map((card, index) => ({ where: 'consumable', offer: { ...card, index, cost: 0, set: PLANETS[card.key] ? 'Planet' : 'Other' }, cost: 0 })),
    ];
    for (const { where, offer, cost } of candidates) {
      const area = where === 'shop' ? observed.shop : where === 'pack' ? observed.pack : where === 'voucher' ? observed.vouchers : observed.consumables;
      const name = `${where} ${offer.index} ${labelOf(area, offer.index, offer.key)}`;
      const edit = noEdit(input), facts: string[] = [];
      let sell = 0;
      if (offer.set === 'Joker') {
        const { index: _index, cost: _cost, set: _set, ...spec } = offer;
        edit.jokers.push(spec); edit.added = [edit.jokers.length - 1];
        if (slotsFree <= 0 && spec.edition !== 'negative') {
          const seat = weakest();
          if (seat === undefined) { unpriced.push(`${name} (no free Joker slot and no sellable Joker)`); continue; }
          edit.removed = [seat]; sell = Number(input.state.jokers[seat]!.sell_cost ?? 0);
          facts.push(`replaces ${seat} ${labelOf(observed.jokers, seat, input.state.jokers[seat]!.key)} (sell +${usd(sell)})`);
        }
      } else if (offer.set === 'Planet' && PLANETS[offer.key]) {
        const hand = PLANETS[offer.key]!, current = input.state.hands[hand];
        if (!current?.level) { unpriced.push(name); continue; }
        edit.hands = { ...input.state.hands, [hand]: { level: current.level + 1, played: current.played, played_this_round: current.played_this_round } };
      } else if (offer.set === 'Voucher' && VOUCHERS[offer.key]) Object.assign(edit, VOUCHERS[offer.key]);
      else { if (where !== 'consumable') unpriced.push(name); continue; }
      if (over()) { skipped.push('offers'); break; }
      const after = await sampler.run(edit, focus.ctx, focus.samples);
      if (after.approximations.length) facts.push('interaction approximation');
      const cleared = clearRate(after.bests, after.hands, focus.ctx.target);
      if (cost > 0 && dollars !== undefined && cost > dollars) facts.push(`costs ${usd(cost)}, have ${usd(dollars)}`);
      if (cost > 0 && options.economy && dollars !== undefined && cost <= dollars) {
        const change = interest(options.economy, dollars - cost + sell) - interest(options.economy);
        if (change !== 0) facts.push(`interest ${usd(change)}/round`);
      }
      offers.push(`${name}${cost > 0 ? ` ${usd(cost)}` : ''}: ${pct(mean(after.bests), beforeMean)}/hand; ${focus.role} clear ${rate(before)} -> ${rate(cleared)}` +
        (after.hands !== focus.samples.hands ? ` (${after.hands} hands)` : '') + facts.map(f => '; ' + f).join(''));
    }
    if (offers.length) out.offers = offers;
    if (unpriced.length) notes.push(`not priced: ${unpriced.join(', ')} (Tarot targets, Spectrals, added playing cards and other effects are not modelled)`);
  }

  // Horizon: the next Ante's targets against the current build.
  const next = input.amounts[1];
  if (next !== undefined && plainMean > 0) {
    const hands = plain.hands, boss = 2 * next;
    let holds = input.ante - 1;
    for (const [k, amount] of input.amounts.entries()) {
      if (clearRate(plain.bests, hands, 2 * amount) < 0.5) break;
      holds = input.ante + k;
    }
    out.horizon = `Ante ${input.ante + 1}: Small ${int(next)}, Big ${int(1.5 * next)}, most Bosses ${int(boss)}; Boss needs ${int(boss / hands)}/hand vs mean ${int(plainMean)} now ` +
      `(growth x${(boss / hands / plainMean).toFixed(2)}); clear Small ${rate(clearRate(plain.bests, hands, next))}, Big ${rate(clearRate(plain.bests, hands, 1.5 * next))}, Boss ${rate(clearRate(plain.bests, hands, boss))}; ` +
      (holds >= input.ante ? `typical Boss clear stays >= 0.50 through Ante ${holds}` : `typical Boss clear is under 0.50 already this Ante`);
  }

  // Bosses the next Ante can bring, weakest first.
  if (options.boss) {
    if (next === undefined) notes.push('no next Ante to analyse');
    else if (!input.bossPool) notes.push('the next Boss pool is unknown: this game draws Bosses by weight');
    else {
      const rows: { clear: number; name: string; line: string }[] = [];
      for (const boss of input.bossPool) {
        if (over()) { skipped.push('bosses'); break; }
        const target = next * boss.mult, ctx = context(boss.key, target), samples = await baseline(ctx);
        const cleared = clearRate(samples.bests, samples.hands, target), plainClear = clearRate(plain.bests, plain.hands, target);
        const facts: string[] = [];
        const suit = SUIT_BOSSES[boss.key];
        if (suit) {
          const cards = plain.tops.flat(), hit = cards.filter(c => typeof c === 'object' && (c.enhancement === 'm_wild' || c.key.startsWith(suit[0] + '_'))).length;
          if (cards.length) facts.push(`${Math.round(hit / cards.length * 100)}% of cards in the best plays are ${suit}`);
        }
        if (BOSS_NOTES[boss.key]) facts.push(BOSS_NOTES[boss.key]!);
        rows.push({ clear: cleared, name: boss.name, line: `${boss.name} ${int(target)}: clear ${rate(cleared)} (plain blind ${rate(plainClear)})${facts.map(f => '; ' + f).join('')}` });
      }
      rows.sort((a, b) => a.clear - b.clear);
      out.bosses = rows.slice(0, BOSS_ROWS).map(r => r.line);
      const rest = rows.slice(BOSS_ROWS);
      if (rest.length) out.bosses.push(`${rest.length} more clear ${rate(rest[0]!.clear)}${rest.at(-1)!.clear !== rest[0]!.clear ? `-${rate(rest.at(-1)!.clear)}` : ''}: ` +
        rest.map(r => r.name).join(', '));
    }
  }

  if (sampler.approximations.size) notes.push('interaction approximation: ' + [...sampler.approximations].sort().join('; '));
  notes.push(`sampled: ${SAMPLES} fixed shuffles of the public deck; each hand picks from hand size + up to 5 drawn cards (2 per discard, none with held-card effects); ` +
    'hands independent, Joker growth frozen; each selection is scored once with random effects replaced by public-probability means; ' +
    'clear is a proxy from expected hand scores, not a chance-aware win probability; compare changes, not levels');
  if (skipped.length) { out.partial = true; notes.push(`time budget exhausted before: ${[...new Set(skipped)].join(', ')}`); }
  return out;
}
