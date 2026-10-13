import { z } from 'zod';
import { LiveScoreStateSchema, type ScoreState } from '../sandbox/index.ts';

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

/** The `analysis` half of `sf.analysis_snapshot`: sandbox input plus the money rules shown in the game. */
export const AnalysisSnapshotSchema = z.object({
  phase: z.string(),
  scoring: z.union([
    z.object({ status: z.literal('ready'), state: AnalysisStateSchema, selectionLimit: z.number().int().min(0).max(5) }),
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
  return { state: { ...state, hand, discard: [...state.discard, ...placeholders], random: 'minimal' }, visible, hidden };
}
