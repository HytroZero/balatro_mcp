import { BackendError, record, type AnalysisRead } from '../contract.ts';
import { SandboxRefusal, ScoringSandbox, type SandboxOptions } from '../sandbox/index.ts';
import { buildBrief, type SampleCache } from './build.ts';
import { economyLine, rewardsLine, skipLine } from './economy.ts';
import { handBrief, type HandBrief } from './hand.ts';
import { AnalysisSnapshotSchema, position } from './snapshot.ts';
import { discardRates, validateDiscards, type Discards, type Next, type DiscardBrief, type DiscardCache } from './discards.ts';

export { playKey } from './hand.ts';
export { DiscardsSchema, NextSchema, validateDiscards } from './discards.ts';
export type Focus = 'auto' | 'boss';
export interface BuildBrief {
  focus: 'build' | 'boss'; status: 'complete' | 'partial' | 'unavailable';
  pace?: string[]; jokers?: string[]; offers?: string[]; bosses?: string[]; horizon?: string;
  economy?: string; rewards?: string; skip?: string; notes: string[];
}
export interface Analysis { brief: HandBrief | BuildBrief | DiscardBrief; predictions: Map<string, number>; }
export interface AnalyzeOptions { discards?: Discards; next?: Next; focus?: Focus; signal?: AbortSignal; deadline: number; trusted: boolean; }

const BUILD_PHASES = ['SHOP', 'PACK', 'BLIND_SELECT'];
const message = (error: unknown): string => error instanceof Error ? error.message : 'unknown failure';

/** Owns the scoring worker for one tool context; the worker starts on first use. */
export class Analyzer {
  private sandbox?: ScoringSandbox;
  private options: SandboxOptions;
  // Build samples are pure functions of public state; reused across calls, never written to disk.
  private samples: SampleCache = new Map();
  private discardSamples: DiscardCache = new Map();
  constructor(options: SandboxOptions = {}) { this.options = options; }

  /**
   * Runs `work` on the worker; cancellation interrupts it. A cancelled, failed or timed-out worker is never
   * reused or replayed; argument errors and clean engine refusals leave a healthy worker in place.
   */
  private async withSandbox<T>(work: (sandbox: ScoringSandbox) => Promise<T>, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    const sandbox = this.sandbox ??= new ScoringSandbox({ timeoutMs: 10_000, ...this.options });
    const abort = () => sandbox.cancel(new Error('Analysis cancelled'));
    signal?.addEventListener('abort', abort, { once: true });
    let reusable = true;
    try {
      const result = await work(sandbox);
      signal?.throwIfAborted();
      return result;
    } catch (error) {
      reusable = error instanceof BackendError || error instanceof SandboxRefusal;
      signal?.throwIfAborted();
      throw error;
    } finally {
      signal?.removeEventListener('abort', abort);
      if (!reusable || sandbox.isBroken) {
        if (this.sandbox === sandbox) this.sandbox = undefined;
        await sandbox.close().catch(() => {});
      }
    }
  }

  async analyze(read: AnalysisRead, options: AnalyzeOptions): Promise<Analysis> {
    validateDiscards(options.discards, options.next);
    const none = new Map<string, number>(), state = read.observation.state, phase = String(state.state);
    const focus = options.focus ?? 'auto';
    if (options.discards && focus !== 'auto') throw new BackendError('invalid_arguments', 'discards cannot be combined with focus boss.');
    if (options.discards && phase !== 'SELECTING_HAND') throw new BackendError('illegal_action', `Discards are compared while selecting a hand, not in ${phase}.`);
    const parsed = AnalysisSnapshotSchema.safeParse(read.analysis);
    if (!parsed.success || parsed.data.phase !== phase) throw new BackendError('incompatible_backend', 'Invalid phase analysis snapshot; update the mod and restart Balatro.');
    if (options.discards) {
      const scoring = parsed.data.scoring!;
      if (scoring.status !== 'ready') throw new BackendError('backend_failure', scoring.message);
      const brief = await this.withSandbox(sandbox => discardRates(sandbox, position(scoring.state), options.discards!, options.next!, {
        deadline: options.deadline, signal: options.signal, limit: scoring.selectionLimit, cache: this.discardSamples,
      }), options.signal);
      return { brief, predictions: none };
    }
    const { economy } = parsed.data;
    if (phase === 'SELECTING_HAND') {
      const scoring = parsed.data.scoring!;
      if (focus === 'boss') return { brief: { focus: 'boss', status: 'unavailable', notes: ['focus boss is analysed in SHOP, PACK and BLIND_SELECT'] }, predictions: none };
      if (scoring.status !== 'ready') return { brief: { focus: 'hand', status: 'unavailable', notes: [scoring.message] }, predictions: none };
      try {
        const result = await this.withSandbox(sandbox => handBrief(sandbox, state, scoring, options), options.signal);
        return { brief: result.brief, predictions: result.predictions };
      } catch (error) {
        options.signal?.throwIfAborted();
        return { brief: { focus: 'hand', status: 'unavailable', notes: ['scoring engine unavailable: ' + message(error)] }, predictions: none };
      }
    }
    const kind = focus === 'boss' ? 'boss' : 'build';
    if (!BUILD_PHASES.includes(phase)) return { brief: { focus: kind, status: 'unavailable', notes: [`nothing to analyse in ${phase}`] }, predictions: none };
    const build = parsed.data.build!;
    const brief: BuildBrief = { focus: kind, status: 'complete', notes: [] };
    if (economy) {
      brief.economy = economyLine(economy);
      const rewards = rewardsLine(economy, record(state)), skip = skipLine(economy, record(state));
      if (rewards) brief.rewards = rewards;
      if (skip) brief.skip = skip;
    }
    if (build.status !== 'ready') {
      brief.status = economy ? 'partial' : 'unavailable';
      brief.notes.push(`no build numbers: ${build.message}`);
      return { brief, predictions: none };
    }
    try {
      const result = await this.withSandbox(sandbox => buildBrief(sandbox, build.input, state, { deadline: options.deadline, economy, boss: focus === 'boss', cache: this.samples }), options.signal);
      const { notes, partial, ...rows } = result;
      Object.assign(brief, rows);
      brief.notes.push(...notes);
      if (partial) brief.status = 'partial';
    } catch (error) {
      options.signal?.throwIfAborted();
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
