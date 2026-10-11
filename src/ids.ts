// Counters are process-local; one readable prefix keeps reconnecting clients
// from reusing an operation ID still retained by the game bridge.
const scope = `${Date.now()}-${process.pid}`;
const counters = new Map<string, number>();
export function nextId(kind: string): string {
  const serial = (counters.get(kind) ?? 0) + 1;
  counters.set(kind, serial);
  return `${scope}-${kind}-${serial}`;
}
