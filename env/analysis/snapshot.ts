import { z } from 'zod';
import { CardStateSchema, LiveScoreStateSchema, type ScoreState } from '../sandbox/index.ts';

const hiddenCard = z.strictObject({ facing: z.literal('back') });
const AnalysisStateSchema = LiveScoreStateSchema.extend({
  hand: z.array(z.union([hiddenCard, LiveScoreStateSchema.shape.hand.element])).min(1).max(52),
});
const money = z.number().finite();
const EconomySchema = z.object({
  dollars: money, interestAmount: money, interestCap: money, noInterest: z.boolean(),
  moneyPerHand: money, moneyPerDiscard: money, rentalRate: money, rentals: z.number().int().nonnegative(),
  blindRewards: z.record(z.string(), money),
  handsPlayed: money.optional(), unusedDiscards: money.optional(), skips: money.optional(),
});
export type Economy = z.infer<typeof EconomySchema>;

const count = z.number().int().nonnegative();
const OfferSchema = CardStateSchema.extend({ index: count, cost: money, set: z.string() });
export type Offer = z.infer<typeof OfferSchema>;
/** Outside a hand: the whole deck as an unordered pool, this Ante's blinds and the rules for later Antes. */
const BuildInputSchema = z.object({
  state: LiveScoreStateSchema.extend({ hand: z.array(z.never()).max(0), deck: LiveScoreStateSchema.shape.deck.min(1) }),
  round: z.object({ hands: count, discards: count }),
  ante: z.number().int(), winAnte: z.number().int().positive(),
  blinds: z.record(z.string(), z.object({ key: z.string(), status: z.string().optional(), target: money })),
  /** Base blind amounts (before each blind's multiplier) from `ante` onwards. */
  amounts: z.array(money).min(1),
  /** Absent when the game draws Bosses by a rule the mod does not mirror. */
  bossPool: z.array(z.object({ key: z.string(), name: z.string(), mult: money })).optional(),
  offers: z.object({ shop: z.array(OfferSchema), vouchers: z.array(OfferSchema), pack: z.array(OfferSchema) }),
});
export type BuildInput = z.infer<typeof BuildInputSchema>;

/** The `analysis` half of `sf.analysis_snapshot`: sandbox input plus the money rules shown in the game. */
export const AnalysisSnapshotSchema = z.object({
  phase: z.string(),
  scoring: z.union([
    z.object({ status: z.literal('ready'), state: AnalysisStateSchema, selectionLimit: z.number().int().min(0).max(5) }),
    z.object({ status: z.literal('unavailable'), message: z.string() }),
  ]).optional(),
  build: z.union([
    z.object({ status: z.literal('ready'), input: BuildInputSchema }),
    z.object({ status: z.literal('unavailable'), message: z.string() }),
  ]).optional(),
  economy: EconomySchema.optional(),
});
export type AnalysisSnapshot = z.infer<typeof AnalysisSnapshotSchema>;
export type AnalysisState = z.infer<typeof AnalysisStateSchema>;

/** A sandbox position without face-down cards, and the real hand index of each sandbox hand slot. */
export interface Position { state: ScoreState; visible: number[]; hidden: number; }

/**
 * Face-down held cards have no public identity. They leave the scored hand, so their held
 * effects are not counted, and stand in the discard pile as plain cards so deck size is unchanged.
 */
export function position(state: AnalysisState): Position {
  const visible: number[] = [], hand: ScoreState['hand'] = [];
  state.hand.forEach((card, index) => { if ('key' in card) { visible.push(index); hand.push(card); } });
  const hidden = state.hand.length - hand.length;
  const placeholders: ScoreState['hand'] = Array.from({ length: hidden }, () => ({ key: 'S_2' }));
  return { state: { ...state, hand, discard: [...state.discard, ...placeholders], random: 'expectation' }, visible, hidden };
}
