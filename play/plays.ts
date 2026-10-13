import { z } from 'zod';
import { ScoringSandbox, ScoreStateSchema, type ScoreResult, type SandboxOptions } from '../env/sandbox/index.ts';

export const ScoringSnapshotSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('ready'), state: ScoreStateSchema, selectionLimit: z.number().int().min(0).max(5) }),
  z.strictObject({ status: z.literal('unavailable'), message: z.string() }),
]);
export type ScoringSnapshot = z.infer<typeof ScoringSnapshotSchema>;
export type PlaysWorker = Pick<ScoringSandbox, 'load' | 'scoreBatch' | 'close'>;

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let value = 1;
  for (let i = 1; i <= k; i++) value = value * (n - i + 1) / i;
  return Math.round(value);
}

/** Generate bounded selections lazily; never materialize the entire search space. */
export function* playSelections(n: number, limit: number, forced: number[] = []): Generator<number[]> {
  const required = new Set(forced);
  function* walk(start: number, size: number, picked: number[]): Generator<number[]> {
    if (picked.length === size) {
      if (forced.every(i => picked.includes(i))) yield [...picked];
      return;
    }
    for (let i = start; i <= n - (size - picked.length); i++) {
      // Do not visit branches that have already skipped a required card.
      if (forced.some(index => index < i && !picked.includes(index))) break;
      picked.push(i);
      yield* walk(i + 1, size, picked);
      picked.pop();
      if (required.has(i)) break;
    }
  }
  for (let size = Math.min(n, limit); size >= Math.max(1, forced.length); size--) yield* walk(0, size, []);
}

/** One worker per new position, reused for every batch and always closed. */
export async function sandboxPlays(snapshot: ScoringSnapshot, options: SandboxOptions = {},
  createWorker: (options: SandboxOptions) => PlaysWorker = options => new ScoringSandbox(options),
  budgetMs = 1000, clock = () => performance.now()): Promise<string[]> {
  if (snapshot.status !== 'ready') return ['unavailable: ' + snapshot.message];
  const { state, selectionLimit } = snapshot;
  const forced = state.hand.flatMap((card, i) => typeof card !== 'string' && card.ability?.forced_selection === true ? [i] : []);
  const max = Math.min(selectionLimit, state.hand.length);
  let total = 0;
  for (let k = Math.max(1, forced.length); k <= max; k++) total += choose(state.hand.length - forced.length, k - forced.length);
  if (!total) return ['unavailable: no legal selection'];
  const worker = createWorker(options);
  try {
    // Fixed randomness never reads or predicts the live game's hidden RNG stream.
    const loaded = await worker.load({ ...state, random: 'fixed' });
    if (loaded.status !== 'ready') return ['unavailable: ' + loaded.message];
    const selections = playSelections(state.hand.length, max, forced);
    const started = clock();
    let scored = 0;
    const best = new Map<string, { result: Extract<ScoreResult, { status: 'ok' }>; play: number[] }>();
    while (scored < total && clock() - started < budgetMs) {
      options.signal?.throwIfAborted();
      const batch: number[][] = [];
      for (let i = 0; i < 32; i++) {
        const next = selections.next();
        if (next.done) break;
        batch.push(next.value);
      }
      if (!batch.length) break;
      const results = await worker.scoreBatch(batch);
      for (const [i, result] of results.entries()) {
        // Unsupported effects invalidate advice instead of silently ignoring them.
        if (result.status !== 'ok') return ['unavailable: ' + result.message];
        scored++;
        const play = batch[i]!;
        const previous = best.get(result.hand);
        if (!previous || result.score > previous.result.score || result.score === previous.result.score && play.length < previous.play.length) {
          best.set(result.hand, { result, play });
        }
      }
    }
    if (!scored) return ['unavailable: scoring budget expired'];
    const rows = [...best.values()].sort((a, b) => b.result.score - a.result.score || a.result.hand.localeCompare(b.result.hand));
    const lines = rows.slice(0, 5).map(({ result, play }) => `${play.join(' ')}: ${result.hand} ${result.score}` +
      (result.random ? ' random' : '') + (result.notAllowed ? ' not allowed' : ''));
    if (scored < total) lines.push(`truncated: scored ${scored} of ${total} selections`);
    return lines;
  } finally { await worker.close(); }
}
