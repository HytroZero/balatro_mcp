import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Observation } from '../env/contract.ts';

export interface Experience {
  id: string; timestamp: string; kind: 'observed' | 'hypothesis' | 'advice'; text: string;
  evidence: string; runId: string; gameVersion: string; deck?: unknown; stake?: unknown; seed?: unknown;
  revision: string;
}
export class MemoryStore {
  readonly root: string;
  private snapshot: Experience[] = [];
  private readOnly: boolean;
  private online: boolean;
  constructor(root: string, readOnly = false, online = false) {
    this.root = resolve(root); this.readOnly = readOnly; this.online = online;
  }
  async init(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    try {
      this.snapshot = (await readFile(resolve(this.root,'experience.jsonl'),'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line) as Experience);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  initialSnapshot(): Experience[] { return structuredClone(this.snapshot); }
  restoreSnapshot(snapshot: Experience[]): void { this.snapshot = structuredClone(snapshot); }
  policy(): { readOnly: boolean; onlineUpdates: boolean } { return { readOnly: this.readOnly,onlineUpdates: this.online }; }
  query(query: string, gameVersion: string): Experience[] {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return this.snapshot.filter(v => v.gameVersion === gameVersion && terms.every(term => (v.text + ' ' + v.evidence).toLowerCase().includes(term))).slice(-10);
  }
  async remember(input: Pick<Experience,'kind'|'text'|'evidence'>, observation: Observation): Promise<Experience> {
    if (this.readOnly) throw new Error('Memory is read-only in fixed-policy evaluation.');
    const entry: Experience = { ...input, id: randomUUID(), timestamp: new Date().toISOString(), runId: observation.runId,
      gameVersion: observation.gameVersion, revision: observation.revision, deck: observation.state.deck, stake: observation.state.stake, seed: observation.state.seed };
    await appendFile(resolve(this.root,'experience.jsonl'), JSON.stringify(entry) + '\n', 'utf8');
    if (this.online) this.snapshot.push(entry);
    return entry;
  }
}
