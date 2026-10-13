import { performance } from 'node:perf_hooks';
import { ScoringSandbox } from './index.ts';

const count = Number(process.argv[2] ?? 1_000_000);
if (!Number.isSafeInteger(count) || count < 1) throw new Error('Expected a positive integer calculation count');
const sandbox = new ScoringSandbox();
try {
  const loaded = await sandbox.load({
    hand: ['S_K', 'H_K', 'D_A', 'C_2', 'S_5', 'H_8', 'C_T', 'D_3'],
    jokers: ['j_joker', 'j_green_joker', 'j_baron', 'j_acrobat'],
  });
  if (loaded.status !== 'ready') throw new Error(loaded.message);
  const selections: number[][] = [];
  const selected: number[] = [];
  function visit(next: number) {
    if (selected.length) selections.push([...selected]);
    if (selected.length === 5) return;
    for (let i = next; i < 8; i++) { selected.push(i); visit(i + 1); selected.pop(); }
  }
  visit(0);
  const batch = Array.from({ length: 2048 }, (_, i) => selections[i % selections.length]);
  const expected = await sandbox.scores(batch); // Warm-up and repeatability baseline.
  if (expected.some(value => typeof value !== 'number')) throw new Error('Benchmark contains a failed selection');
  const start = performance.now();
  let completed = 0, nextProgress = 100_000;
  while (completed < count) {
    const chunk = batch.slice(0, Math.min(batch.length, count - completed));
    const result = await sandbox.scores(chunk);
    if (result.some((value, i) => value !== expected[i])) throw new Error('Scoring state leaked between trials');
    completed += chunk.length;
    if (completed >= nextProgress) {
      console.log(JSON.stringify({ completed, elapsedMs: Math.round(performance.now() - start) }));
      nextProgress += 100_000;
    }
  }
  const elapsedMs = performance.now() - start;
  console.log(JSON.stringify({ timedCalculations: count, selections: selections.length, batchSize: batch.length,
    elapsedMs, calculationsPerSecond: count * 1000 / elapsedMs, processId: sandbox.processId, ...await sandbox.stats() }, null, 2));
} finally { await sandbox.close(); }
