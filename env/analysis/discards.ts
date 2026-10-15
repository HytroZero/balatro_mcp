import { createHash } from 'node:crypto';
import { Type, type Static } from 'typebox';
import { Value } from 'typebox/value';
import { BackendError, record } from '../contract.ts';
import type { ScoringSandbox } from '../sandbox/index.ts';
import type { Position } from './snapshot.ts';

export const DiscardsSchema = Type.Array(Type.Array(Type.Integer({ minimum: 0 }), {
  minItems: 1, maxItems: 5, uniqueItems: true,
}), { minItems: 1, maxItems: 4 });
export const HANDS = {
  high_card: 'High Card', pair: 'Pair', two_pair: 'Two Pair', three_of_a_kind: 'Three of a Kind',
  straight: 'Straight', flush: 'Flush', full_house: 'Full House', four_of_a_kind: 'Four of a Kind',
  straight_flush: 'Straight Flush', five_of_a_kind: 'Five of a Kind', flush_house: 'Flush House', flush_five: 'Flush Five',
} as const;
export const NextSchema = Type.Union(Object.keys(HANDS).map(name => Type.Literal(name as keyof typeof HANDS)));
export type Discards = Static<typeof DiscardsSchema>;
export type Next = keyof typeof HANDS;
export interface DiscardBrief { rates: number[]; focus?: never; status?: never; }
export type DiscardCache = Map<string, boolean[]>;
const SAMPLES = 64;

export function validateDiscards(discards?: Discards, next?: Next): void {
  const invalid = (message: string): never => { throw new BackendError('invalid_arguments', message); };
  if (discards !== undefined && !Value.Check(DiscardsSchema, discards)) invalid('discards must contain 1-4 selections of 1-5 unique hand indices');
  if (next !== undefined && !Value.Check(NextSchema, next)) invalid('next must name a target poker hand');
  if ((discards !== undefined) !== (next !== undefined)) invalid('discards and next must be supplied together');
}

/** Object order is immaterial; array order and duplicate card copies are preserved. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().filter(key => (value as Record<string, unknown>)[key] !== undefined)
    .map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
const hash = (value: unknown): string => createHash('sha256').update(canonical(value)).digest('hex');

/** All strategies share the same public-pool permutation for a given sample. */
export function refillOrder(poolKey: string, size: number, sample: number): number[] {
  let seed = Number.parseInt(hash([poolKey, sample, 'refill-v1']).slice(0, 8), 16) >>> 0;
  const order = Array.from({ length: size }, (_, i) => i);
  for (let i = size - 1; i > 0; i--) {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const j = Math.floor(((t ^ (t >>> 14)) >>> 0) / 4294967296 * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

export async function discardRates(sandbox: ScoringSandbox, pos: Position, discards: Discards, next: Next, options: {
  deadline: number; signal?: AbortSignal; limit: number; cache?: DiscardCache;
}): Promise<DiscardBrief> {
  const check = () => {
    options.signal?.throwIfAborted();
    if (performance.now() >= options.deadline) throw new BackendError('timeout', `Discard sampling did not complete ${SAMPLES} samples per strategy.`);
  };
  check();
  if (pos.hidden) throw new BackendError('backend_failure', 'Face-down hand cards prevent discard sampling.');
  const round = record(pos.state.game?.current_round);
  if (Number(round.discards_left) <= 0) throw new BackendError('illegal_action', 'No discards left.');
  if (Number(round.hands_left) <= 0) throw new BackendError('illegal_action', 'No hands left.');
  if (options.limit < 1) throw new BackendError('illegal_action', 'No cards can be selected.');
  const state = structuredClone(pos.state);
  // Sorting removes the live draw order; only the public composition remains.
  state.deck = (state.deck ?? []).map(card => ({ card, key: canonical(card) })).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0).map(entry => entry.card);
  if (state.handSize === undefined) throw new BackendError('backend_failure', 'The hand snapshot has no hand size.');
  const handSize = state.handSize;
  const blind = typeof state.blind === 'object' ? state.blind : { key: state.blind, disabled: false };
  const poolKey = hash(state.deck), cache = options.cache ?? new Map();
  const work = discards.map(selection => {
    if (selection.length > options.limit || selection.some(i => !pos.visible.includes(i))) {
      throw new BackendError('invalid_arguments', 'Discard selects a missing card or exceeds the selection limit.');
    }
    const cards = selection.map(i => pos.visible.indexOf(i)).sort((a, b) => a - b);
    const draw = Math.min(state.deck!.length, !blind.disabled && blind.key === 'bl_serpent' ? 3
      : Math.max(0, handSize - (state.hand.length - cards.length)));
    if (state.hand.length - cards.length + draw < 1 || state.hand.length - cards.length + draw > 52) {
      throw new BackendError('backend_failure', 'Refilled hand has an unsupported size.');
    }
    const key = hash([state, cards, next, options.limit, 'discards-v1']);
    return { cards, draw, key, values: cache.get(key) };
  });
  // One worker request per strategy: the position is sent and loaded once for all samples.
  let orders: number[][] | undefined;
  for (const item of work) {
    check();
    if (item.values) continue;
    orders ??= Array.from({ length: SAMPLES }, (_, i) => refillOrder(poolKey, state.deck!.length, i));
    const draws = orders.map(order => order.slice(0, item.draw));
    const values = await sandbox.discardHits(state, item.cards, draws, HANDS[next], options.limit, {
      signal: options.signal, timeoutMs: Math.max(1, options.deadline - performance.now()),
    });
    item.values = values;
    cache.set(item.key, [...values]);
    while (cache.size > 64) cache.delete(cache.keys().next().value!);
  }
  check();
  return { rates: work.map(item => item.values!.filter(Boolean).length / SAMPLES) };
}
