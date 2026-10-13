import { record, type AnalysisRead } from '../contract.ts';
import { ScoringSandbox, type SandboxOptions } from '../sandbox/index.ts';
import { economyLine, rewardsLine, skipLine } from './economy.ts';
import { handBrief, type HandBrief, type Line } from './hand.ts';
import { AnalysisSnapshotSchema } from './snapshot.ts';

export { LinesSchema, playKey, type Line } from './hand.ts';
export interface BuildBrief {
  focus: 'build'; status: 'partial' | 'unavailable';
  economy?: string; rewards?: string; skip?: string; notes: string[];
}
export interface Analysis { brief: HandBrief | BuildBrief; predictions: Map<string, number>; }
export interface AnalyzeOptions { lines?: Line[]; deadline: number; trusted: boolean; }

const BUILD_PHASES = ['SHOP', 'PACK', 'BLIND_SELECT'];

/** Owns the scoring worker for one tool context; the worker starts on first use. */
export class Analyzer {
  private sandbox?: ScoringSandbox;
  private options: SandboxOptions;
  constructor(options: SandboxOptions = {}) { this.options = options; }

  async analyze(read: AnalysisRead, options: AnalyzeOptions): Promise<Analysis> {
    const none = new Map<string, number>(), state = read.observation.state, phase = String(state.state);
    const parsed = AnalysisSnapshotSchema.safeParse(read.analysis);
    if (!parsed.success) return { brief: { focus: 'build', status: 'unavailable', notes: ['the installed mod returned an analysis snapshot this server cannot read'] }, predictions: none };
    const { scoring, economy } = parsed.data;
    if (phase === 'SELECTING_HAND') {
      if (!scoring || scoring.status !== 'ready') return { brief: { focus: 'hand', status: 'unavailable', notes: [scoring?.message ?? 'no scoring input for this hand'] }, predictions: none };
      this.sandbox ??= new ScoringSandbox({ timeoutMs: 10_000, ...this.options });
      try {
        const result = await handBrief(this.sandbox, state, scoring, options);
        return { brief: result.brief, predictions: result.predictions };
      } catch (error) {
        // A failed or timed-out worker is never reused or replayed.
        const broken = this.sandbox; this.sandbox = undefined;
        await broken.close().catch(() => {});
        return { brief: { focus: 'hand', status: 'unavailable', notes: ['scoring engine unavailable: ' + (error instanceof Error ? error.message : 'unknown failure')] }, predictions: none };
      }
    }
    if (!BUILD_PHASES.includes(phase)) return { brief: { focus: 'build', status: 'unavailable', notes: [`nothing to analyse in ${phase}`] }, predictions: none };
    if (options.lines) return { brief: { focus: 'build', status: 'unavailable', notes: ['lines are analysed only while selecting a hand in this version'] }, predictions: none };
    const brief: BuildBrief = { focus: 'build', status: 'partial', notes: ['economy only: build pace and offer changes are not implemented in this version'] };
    if (!economy) return { brief: { ...brief, status: 'unavailable', notes: ['no economy data for this state'] }, predictions: none };
    brief.economy = economyLine(economy);
    const rewards = rewardsLine(economy, record(state)), skip = skipLine(economy, record(state));
    if (rewards) brief.rewards = rewards;
    if (skip) brief.skip = skip;
    return { brief, predictions: none };
  }

  async close(): Promise<void> { await this.sandbox?.close(); this.sandbox = undefined; }
}
