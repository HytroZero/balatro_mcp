import { z } from 'zod';
import { ScoreStateSchema, type ScoringSandbox } from '../env/sandbox/index.ts';

export const ScoringSnapshotSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('ready'), state: ScoreStateSchema, selectionLimit: z.number().int().min(0).max(5) }),
  z.strictObject({ status: z.literal('unavailable'), message: z.string() }),
]);
export type ScoringSnapshot = z.infer<typeof ScoringSnapshotSchema>;
export type PlaysWorker = Pick<ScoringSandbox, 'plays' | 'close'>;
