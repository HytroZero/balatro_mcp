#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { ForgeBridgeBackend } from '../play/client.ts';
import { parseOptions, helpText } from './config.ts';
import { createBalatroServer } from './server.ts';

async function main(): Promise<void> {
  const { options, help, doctor } = parseOptions();
  if (help) { console.log(helpText); return; }
  if (doctor) {
    const backend = new ForgeBridgeBackend(options.endpoint, options.timeoutMs);
    try {
      const health = await backend.diagnose();
      const observation = await backend.observe(); // Verify protocol, game version and instance identity.
      console.log(JSON.stringify({ ok: true, health, ready: observation.ready, notReadyReason: observation.notReadyReason }, null, 2));
    } finally { await backend.close(); }
    return;
  }
  const app = await createBalatroServer(options);
  let closing = false;
  async function shutdown() {
    if (closing) return;
    closing = true;
    try { await app.close(); } catch { process.exitCode = 1; }
  }
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
  process.stdin.once('end', () => void shutdown());
  await app.server.connect(new StdioServerTransport());
}

main().catch(error => { console.error('Balatro MCP:', error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
