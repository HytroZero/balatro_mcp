import { record, type AnalysisRead } from '../contract.ts';
import { ScoringSandbox, type SandboxOptions } from '../sandbox/index.ts';
import { buildBrief, type SampleCache } from './build.ts';
import { economyLine, rewardsLine, skipLine } from './economy.ts';
import { handBrief, type HandBrief, type Line } from './hand.ts';
import { AnalysisSnapshotSchema } from './snapshot.ts';

export { LinesSchema, playKey, type Line } from './hand.ts';
export type Focus = 'auto' | 'boss';
export interface BuildBrief {
  focus: 'build' | 'boss'; status: 'complete' | 'partial' | 'unavailable';
  pace?: string[]; jokers?: string[]; offers?: string[]; bosses?: string[]; horizon?: string;
  economy?: string; rewards?: string; skip?: string; notes: string[];
}
export interface Analysis { brief: HandBrief | BuildBrief; predictions: Map<string, number>; }
export interface AnalyzeOptions { lines?: Line[]; focus?: Focus; deadline: number; trusted: boolean; }

const BUILD_PHASES = ['SHOP', 'PACK', 'BLIND_SELECT'];
const message = (error: unknown): string => error instanceof Error ? error.message : 'unknown failure';

/** Owns the scoring worker for one tool context; the worker starts on first use. */
export class Analyzer {
  private sandbox?: ScoringSandbox;
  private options: SandboxOptions;
  // Build samples are pure functions of public state; reused across calls, never written to disk.
  private samples: SampleCache = new Map();
  constructor(options: SandboxOptions = {}) { this.options = options; }

  /** Runs `work` on the worker; a failed or timed-out worker is never reused or replayed. */
  private async withSandbox<T>(work: (sandbox: ScoringSandbox) => Promise<T>): Promise<T> {
    this.sandbox ??= new ScoringSandbox({ timeoutMs: 10_000, ...this.options });
    try { return await work(this.sandbox); } catch (error) {
      const broken = this.sandbox; this.sandbox = undefined;
      await broken?.close().catch(() => {});
      throw error;
    }
  }

  async analyze(read: AnalysisRead, options: AnalyzeOptions): Promise<Analysis> {
    const none = new Map<string, number>(), state = read.observation.state, phase = String(state.state);
    const focus = options.focus ?? 'auto';
    const parsed = AnalysisSnapshotSchema.safeParse(read.analysis);
    if (!parsed.success) return { brief: { focus: 'build', status: 'unavailable', notes: ['the installed mod returned an analysis snapshot this server cannot read'] }, predictions: none };
    const { scoring, build, economy } = parsed.data;
    if (phase === 'SELECTING_HAND') {
      if (focus === 'boss') return { brief: { focus: 'boss', status: 'unavailable', notes: ['focus boss is analysed in SHOP, PACK and BLIND_SELECT'] }, predictions: none };
      if (!scoring || scoring.status !== 'ready') return { brief: { focus: 'hand', status: 'unavailable', notes: [scoring?.message ?? 'no scoring input for this hand'] }, predictions: none };
      try {
        const result = await this.withSandbox(sandbox => handBrief(sandbox, state, scoring, options));
        return { brief: result.brief, predictions: result.predictions };
      } catch (error) {
        return { brief: { focus: 'hand', status: 'unavailable', notes: ['scoring engine unavailable: ' + message(error)] }, predictions: none };
      }
    }
    const kind = focus === 'boss' ? 'boss' : 'build';
    if (!BUILD_PHASES.includes(phase)) return { brief: { focus: kind, status: 'unavailable', notes: [`nothing to analyse in ${phase}`] }, predictions: none };
    if (options.lines) return { brief: { focus: kind, status: 'unavailable', notes: ['lines are analysed only while selecting a hand in this version'] }, predictions: none };
    const brief: BuildBrief = { focus: kind, status: 'complete', notes: [] };
    if (economy) {
      brief.economy = economyLine(economy);
      const rewards = rewardsLine(economy, record(state)), skip = skipLine(economy, record(state));
      if (rewards) brief.rewards = rewards;
      if (skip) brief.skip = skip;
    }
    if (!build || build.status !== 'ready') {
      brief.status = economy ? 'partial' : 'unavailable';
      brief.notes.push(build?.message ? `no build numbers: ${build.message}` : 'the installed mod does not export the deck for build numbers');
      return { brief, predictions: none };
    }
    try {
      const result = await this.withSandbox(sandbox => buildBrief(sandbox, build.input, state, { deadline: options.deadline, economy, boss: focus === 'boss', cache: this.samples }));
      const { notes, partial, ...rows } = result;
      Object.assign(brief, rows);
      brief.notes.push(...notes);
      if (partial) brief.status = 'partial';
    } catch (error) {
      brief.status = economy ? 'partial' : 'unavailable';
      brief.notes.push(/Missing Balatro source/.test(message(error)) ? 'the original scoring source is not prepared on the server; run npm run sandbox:prepare'
        : 'build numbers unavailable: ' + message(error));
    }
    // Keep the economy rows after the build rows in the serialized brief.
    const { economy: e, rewards: r, skip: s, notes, ...head } = brief;
    return { brief: { ...head, ...(e ? { economy: e } : {}), ...(r ? { rewards: r } : {}), ...(s ? { skip: s } : {}), notes }, predictions: none };
  }

  async close(): Promise<void> { await this.sandbox?.close(); this.sandbox = undefined; }
}
