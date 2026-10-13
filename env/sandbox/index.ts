import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { resolve } from 'node:path';
import { z } from 'zod';
import { projectRoot } from '../../src/config.ts';

const data = z.record(z.string(), z.json());
const cardState = z.strictObject({
  key: z.string().min(1),
  enhancement: z.string().optional(),
  edition: z.enum(['foil', 'holo', 'polychrome', 'negative']).optional(),
  seal: z.enum(['Red', 'Blue', 'Gold', 'Purple']).optional(),
  debuff: z.boolean().optional(),
  facing: z.enum(['front', 'back']).optional(),
  sell_cost: z.number().finite().nonnegative().optional(),
  ability: data.optional(),
  base: data.optional(),
  editionValues: data.optional(),
});
const card = z.union([z.string().min(1), cardState]);
export const ScoreStateSchema = z.strictObject({
  hand: z.array(card).min(1).max(52),
  jokers: z.array(card).max(100).optional(),
  consumables: z.array(card).max(100).optional(),
  /** Remaining draw pile. Omitted: standard 52-card deck minus the hand. */
  deck: z.array(card).max(520).optional(),
  /** Already discarded cards, included in total deck tallies but not Blue Joker. */
  discard: z.array(card).max(520).optional(),
  back: z.string().optional(),
  backConfig: data.optional(),
  /** Exact live position: passive hooks and per-frame tallies have already run. */
  passiveEffectsApplied: z.boolean().optional(),
  blind: z.union([z.string(), z.strictObject({
    key: z.string(), disabled: z.boolean().optional(),
    only_hand: z.string().optional(), hands: z.record(z.string(), z.boolean()).optional(),
  })]).optional(),
  jokerSlots: z.number().int().nonnegative().max(100).optional(),
  handSize: z.number().int().positive().max(100).optional(),
  hands: z.record(z.string(), z.strictObject({
    level: z.number().int().min(1).optional(), chips: z.number().finite().nonnegative().optional(),
    mult: z.number().finite().positive().optional(), played: z.number().int().nonnegative().optional(),
    played_this_round: z.number().int().nonnegative().optional(),
  })).optional(),
  /** Original G.GAME data fields, before passive Joker hooks are applied. */
  game: data.refine(value => !['hands', 'blind', 'selected_back', 'selected_back_key'].some(key => key in value),
    'Use the hands, blind and back fields for engine objects').optional(),
  seed: z.string().min(1).max(64).optional(),
  random: z.enum(['seeded', 'fixed', 'minimal']).optional(),
  trace: z.boolean().optional(),
});
const selection = z.array(z.number().int().nonnegative()).min(1).max(5);
export const ScoreInputSchema = ScoreStateSchema.extend({ play: selection }).superRefine((value, ctx) => {
  if (new Set(value.play).size !== value.play.length || value.play.some(index => index >= value.hand.length)) {
    ctx.addIssue({ code: 'custom', path: ['play'], message: 'play must contain unique, zero-based hand indices' });
  }
});
export type ScoreInput = z.infer<typeof ScoreInputSchema>;
export type ScoreState = z.infer<typeof ScoreStateSchema>;

/** Live imports must not receive the offline API's guessed/default position data. */
export const LiveScoreStateSchema = ScoreStateSchema.extend({
  passiveEffectsApplied: z.literal(true),
  hand: z.array(cardState.required({ ability: true, base: true })).min(1).max(52),
  deck: z.array(cardState.required({ ability: true, base: true })).max(520),
  discard: z.array(cardState.required({ ability: true, base: true })).max(520),
  jokers: z.array(cardState.required({ ability: true })).max(100),
  consumables: z.array(cardState.required({ ability: true })).max(100),
  back: z.string().min(1), backConfig: data,
  blind: z.strictObject({ key: z.string(), disabled: z.boolean(), only_hand: z.string().optional(),
    hands: z.record(z.string(), z.boolean()).optional() }),
  jokerSlots: ScoreStateSchema.shape.jokerSlots.unwrap(), handSize: ScoreStateSchema.shape.handSize.unwrap(),
  hands: ScoreStateSchema.shape.hands.unwrap().refine(value => Object.keys(value).length > 0 && Object.values(value).every(hand =>
    hand.level !== undefined && hand.chips !== undefined && hand.mult !== undefined && hand.played !== undefined && hand.played_this_round !== undefined),
  'Live poker hand values must be complete'),
  game: ScoreStateSchema.shape.game.unwrap().superRefine((value, ctx) => {
    for (const key of ['dollars','bankrupt_at','chips','round','hands_played','skips']) {
      if (typeof value[key] !== 'number') ctx.addIssue({ code:'custom', message:'Missing live numeric field: ' + key });
    }
    for (const key of ['current_round','round_resets','probabilities','used_vouchers','modifiers','starting_params','cards_played']) {
      if (!data.safeParse(value[key]).success) ctx.addIssue({ code:'custom', message:'Missing live data field: ' + key });
    }
    const round = data.safeParse(value.current_round);
    if (round.success) {
      for (const key of ['hands_left','discards_left','hands_played','discards_used']) {
        if (typeof round.data[key] !== 'number') ctx.addIssue({ code:'custom', message:'Missing live round field: ' + key });
      }
      if (typeof round.data.most_played_poker_hand !== 'string' || !data.safeParse(round.data.current_hand).success) {
        ctx.addIssue({ code:'custom', message:'Missing live round hand history' });
      }
    }
    const probabilities = data.safeParse(value.probabilities);
    if (probabilities.success && typeof probabilities.data.normal !== 'number') ctx.addIssue({ code:'custom', message:'Missing live normal probability' });
  }),
});

const ScoreResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'), version: z.literal('1.0.1o-FULL'), hand: z.string(), displayHand: z.string(),
    chips: z.number().finite(), mult: z.number().finite(), score: z.number().finite(),
    scoringCards: z.array(z.number().int().nonnegative()), notAllowed: z.boolean(), random: z.boolean(),
    randomPolicy: z.enum(['seeded', 'fixed', 'minimal']), seed: z.string(),
    trace: z.array(z.object({ chips: z.number().finite(), mult: z.number().finite() })).optional(),
  }),
  z.object({ status: z.literal('unsupported'), message: z.string() }),
  z.object({ status: z.literal('unavailable'), message: z.string() }),
  z.object({ status: z.literal('error'), message: z.string() }),
]);
export type ScoreResult = z.infer<typeof ScoreResultSchema>;
const failure = z.object({ status: z.enum(['unsupported', 'unavailable', 'error']), message: z.string() });
export type ScoreFailure = z.infer<typeof failure>;
export type LoadResult = { status: 'ready' } | ScoreFailure;
const PlaysResultSchema = z.union([
  z.tuple([z.string().regex(/^unavailable: .+/s)]),
  z.array(z.string().regex(/^\d+(?: \d+)*: .+ -?\d+(?:\.\d+)?(?:e[+-]?\d+)?(?: not allowed)?(?: minimal)?$/i)).min(1).max(15),
]);
export interface SandboxRequestOptions {
  /** Includes queued wait for plays, not just execution time. */
  timeoutMs?: number;
  signal?: AbortSignal;
}
export interface SandboxOptions extends SandboxRequestOptions {
  /** LuaJIT executable; defaults to LUAJIT or luajit on PATH. */
  lua?: string;
  /** Original 1.0.1o source directory; defaults to the locally prepared vendor. */
  sourceDir?: string;
  /** Lifetime signal for the worker; use plays options for scoped cancellation. */
  signal?: AbortSignal;
}

function validateTimeout(timeoutMs: number): void {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
    throw new Error('timeoutMs must be a positive finite number within the Node timer range');
  }
}

/** One persistent LuaJIT VM; load a position once, then score many selections. */
export class ScoringSandbox {
  private options: SandboxOptions;
  private timeout: number;
  private child?: ChildProcessWithoutNullStreams;
  private exited?: Promise<void>;
  private closed = false;
  private broken?: Error;
  private queue: Promise<unknown> = Promise.resolve();
  private serial = 0;
  private handLength?: number;
  private pending?: { id: number; accept: (value: unknown) => void; reject: (error: Error) => void };

  constructor(options: SandboxOptions = {}) {
    this.options = { ...options };
    this.timeout = options.timeoutMs ?? 5_000;
    validateTimeout(this.timeout);
  }

  get processId(): number | undefined { return this.child?.pid; }

  private stop(error: Error) {
    this.broken ??= error;
    this.handLength = undefined;
    this.pending?.reject(error);
    this.pending = undefined;
    this.child?.kill();
  }

  private start() {
    if (this.closed) throw new Error('Sandbox is closed');
    if (this.broken) throw this.broken;
    this.options.signal?.throwIfAborted();
    if (this.child) return this.child;
    const source = resolve(this.options.sourceDir ?? process.env.BALATRO_SANDBOX_SOURCE ??
      resolve(projectRoot, 'env/sandbox/vendor'));
    const child = spawn(this.options.lua ?? process.env.LUAJIT ?? 'luajit',
      [resolve(projectRoot, 'env/sandbox/worker.lua'), projectRoot, source],
      { cwd: projectRoot, stdio: ['pipe', 'pipe', 'pipe'], signal: this.options.signal });
    this.child = child;
    let output = '', stderr = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      output += chunk;
      if (Buffer.byteLength(output) > 4_194_304) { this.stop(new Error('Sandbox response exceeds 4 MiB')); return; }
      let newline: number;
      while ((newline = output.indexOf('\n')) >= 0) {
        const line = output.slice(0, newline); output = output.slice(newline + 1);
        try {
          const message = JSON.parse(line);
          if (!this.pending || message.id !== this.pending.id) throw new Error('Sandbox response ID mismatch');
          const pending = this.pending; this.pending = undefined; pending.accept(message.result);
        } catch (error) { this.stop(new Error('Invalid sandbox worker response', { cause: error })); }
      }
    });
    child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-8192); });
    child.on('error', error => this.stop(error));
    child.stdin.on('error', error => this.stop(error));
    this.exited = new Promise(accept => child.on('close', (code, signal) => {
      if (!this.closed) this.stop(new Error(`Sandbox worker exited (${signal ?? code}): ${stderr.trim()}`));
      accept();
    }));
    return child;
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const pending = this.queue.then(work);
    this.queue = pending.catch(() => {});
    return pending;
  }

  private async request(method: string, params: object, externallyTimed = false): Promise<unknown> {
    const id = ++this.serial;
    const request = JSON.stringify({ id, method, ...params });
    if (Buffer.byteLength(request) > 4_194_304) throw new Error('Sandbox request exceeds 4 MiB');
    const child = this.start();
    let timer: NodeJS.Timeout | undefined;
    try {
      return await new Promise((accept, reject) => {
        this.pending = { id, accept, reject };
        if (!externallyTimed) {
          timer = setTimeout(() => this.stop(new Error(`Sandbox worker timed out after ${this.timeout} ms`)), this.timeout);
          timer.unref();
        }
        child.stdin.write(request + '\n');
      });
    } finally { clearTimeout(timer); }
  }

  load(state: ScoreState): Promise<LoadResult> {
    const parsed = ScoreStateSchema.parse(state);
    return this.enqueue(async () => {
      this.handLength = undefined;
      const result = z.union([z.object({ status: z.literal('ready') }), failure]).parse(await this.request('load', { state: parsed }));
      if (result.status === 'ready') this.handLength = parsed.hand.length;
      return result;
    });
  }

  /** Reload and fully rank a position in one queued worker operation. */
  plays(state: ScoreState, selectionLimit: number, options: SandboxRequestOptions = {}): Promise<string[]> {
    const parsed = ScoreStateSchema.parse(state);
    const limit = z.number().int().min(0).max(5).parse(selectionLimit);
    const timeoutMs = options.timeoutMs ?? this.timeout;
    validateTimeout(timeoutMs);
    const deadline = performance.now() + timeoutMs;
    const signal = options.signal;
    return new Promise<string[]>((accept, reject) => {
      let settled = false, active = false;
      let timer: NodeJS.Timeout | undefined;
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      };
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      const cancel = (error: Error) => {
        if (settled) return;
        if (active) this.stop(error);
        fail(error);
      };
      const abort = () => {
        const reason = signal!.reason;
        cancel(reason instanceof Error ? reason : new Error('Sandbox request aborted', { cause: reason }));
      };
      const expire = () => cancel(new Error(`Sandbox worker timed out after ${timeoutMs} ms`));
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      timer = setTimeout(expire, Math.max(0, deadline - performance.now()));
      timer.unref();
      void this.enqueue(async () => {
        if (settled) return;
        if (performance.now() >= deadline) { expire(); return; }
        active = true;
        this.handLength = undefined;
        try {
          const result = PlaysResultSchema.parse(await this.request('plays', { state: parsed, selectionLimit: limit }, true));
          if (settled) return;
          if (performance.now() >= deadline) { expire(); return; }
          settled = true;
          cleanup();
          accept(result);
        } catch (error) { fail(error); }
        finally { active = false; }
      });
    });
  }

  private selections(plays: number[][]): number[][] {
    if (this.handLength === undefined) throw new Error('Load a position before scoring');
    if (plays.length < 1 || plays.length > 2048) throw new Error('Batch must contain 1-2048 selections');
    for (const play of plays) {
      selection.parse(play);
      if (new Set(play).size !== play.length || play.some(i => i >= this.handLength!)) {
        throw new Error('play must contain unique, zero-based hand indices');
      }
    }
    return plays;
  }

  score(play: number[]): Promise<ScoreResult> {
    const copy = [...play];
    return this.enqueue(async () => {
      this.selections([copy]);
      return ScoreResultSchema.parse(await this.request('score', { play: copy }));
    });
  }

  scoreBatch(plays: number[][]): Promise<ScoreResult[]> {
    const copy = plays.map(play => [...play]);
    return this.enqueue(async () => {
      const results = z.array(ScoreResultSchema).parse(await this.request('batch', { plays: this.selections(copy) }));
      if (results.length !== copy.length) throw new Error('Sandbox batch length mismatch');
      return results;
    });
  }

  /** Hot path: scalar scores, no per-trial observation/trace serialization. */
  scores(plays: number[][]): Promise<(number | ScoreFailure)[]> {
    const copy = plays.map(play => [...play]);
    return this.enqueue(async () => {
      const results = z.array(z.union([z.number().finite(), failure])).parse(await this.request('scores', { plays: this.selections(copy) }));
      if (results.length !== copy.length) throw new Error('Sandbox batch length mismatch');
      return results;
    });
  }

  stats(): Promise<{ sourceLoads: number; positionLoads: number; calculations: number; luaMemoryKiB: number }> {
    return this.enqueue(async () => z.object({
      sourceLoads: z.number().int(), positionLoads: z.number().int(), calculations: z.number().int(), luaMemoryKiB: z.number().finite(),
    }).parse(await this.request('stats', {})));
  }

  async close(): Promise<void> {
    if (!this.closed) {
      this.closed = true;
      this.stop(new Error('Sandbox is closed'));
    }
    await this.exited;
  }
}

/** One-shot compatibility helper for CLI/small scripts; use ScoringSandbox for searches. */
export async function scoreHandOnce(input: ScoreInput, options: SandboxOptions = {}): Promise<ScoreResult> {
  const parsed = ScoreInputSchema.parse(input);
  const { play, ...state } = parsed;
  const sandbox = new ScoringSandbox(options);
  try {
    const loaded = await sandbox.load(state);
    return loaded.status === 'ready' ? await sandbox.score(play) : loaded;
  } finally { await sandbox.close(); }
}
