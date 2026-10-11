import { appendFile, lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export class Trace {
  private sequence = 0;
  private pending: Promise<void> = Promise.resolve();
  readonly path: string;
  private secrets: string[];
  constructor(path: string, secrets: string[] = []) { this.path = path; this.secrets = secrets.filter(Boolean); }
  addSecrets(...secrets: string[]): void { this.secrets = [...new Set([...this.secrets,...secrets.filter(Boolean)])]; }
  sanitize<T>(value: T): T {
    let encoded = JSON.stringify(value, (key, item: unknown) => /^(apiKey|authorization|accessToken|refreshToken|password|secret)$/i.test(key) ? '[REDACTED]' : item);
    for (const secret of this.secrets) encoded = encoded.split(JSON.stringify(secret).slice(1,-1)).join('[REDACTED]');
    return JSON.parse(encoded) as T;
  }
  async init(): Promise<void> {
    await mkdir(dirname(this.path),{ recursive: true });
    try {
      // On Windows, reading a directory with Node can allocate indefinitely. Leave the
      // ordinary append to report an occupied path, preserving in-memory session recovery.
      if (!(await lstat(this.path)).isFile()) return;
      const text = await readFile(this.path,'utf8');
      const lines = text.split('\n');
      // Recover the append sequence and discard only an interrupted final record.
      if (lines.at(-1)) {
        try { JSON.parse(lines.at(-1)!); await appendFile(this.path,'\n'); }
        catch { lines.pop(); await writeFile(this.path,lines.join('\n') + '\n'); }
      }
      for (const line of lines) {
        if (!line.trim()) continue;
        const row = JSON.parse(line) as { sequence?: number };
        if (Number.isSafeInteger(row.sequence)) this.sequence = Math.max(this.sequence,row.sequence!);
      }
    } catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error; }
  }
  write(type: string, data: unknown): Promise<void> {
    const line = JSON.stringify(this.sanitize({ sequence: ++this.sequence, timestamp: new Date().toISOString(), type, data })) + '\n';
    // A failed append must not poison all future writes after storage recovers.
    this.pending = this.pending.catch(() => {}).then(() => appendFile(this.path,line));
    return this.pending;
  }
  async flush(): Promise<void> { await this.pending; }
}
