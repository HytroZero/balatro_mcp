import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';

export const projectRoot = fileURLToPath(new URL(existsSync(new URL('../package.json', import.meta.url)) ? '../' : '../../', import.meta.url));
export interface Options {
  endpoint: string;
  timeoutMs: number;
  dataDir: string;
  readOnlyMemory: boolean;
  onlineMemory: boolean;
}

export function parseOptions(args = process.argv.slice(2), env = process.env) {
  const { values } = parseArgs({ args, options: {
    endpoint: { type: 'string' }, 'timeout-ms': { type: 'string' },
    'data-dir': { type: 'string' },
    'read-only-memory': { type: 'boolean' }, 'online-memory': { type: 'boolean' },
    doctor: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  } });
  const timeoutMs = z.coerce.number().int().min(1).max(600000).parse(values['timeout-ms'] ?? env.BALATRO_TIMEOUT_MS ?? 30000);
  const options: Options = {
    endpoint: values.endpoint ?? env.BALATRO_BRIDGE_URL ?? 'http://127.0.0.1:12347',
    timeoutMs,
    dataDir: resolve(values['data-dir'] ?? env.BALATRO_DATA_DIR ?? resolve(projectRoot, 'data')),
    readOnlyMemory: values['read-only-memory'] ?? false,
    onlineMemory: values['online-memory'] ?? false,
  };
  return { options, help: values.help ?? false, doctor: values.doctor ?? false };
}

export const helpText = `Balatro MCP server (stdio, Node.js >=24.13)
Usage: node dist/src/index.js [options]
  --endpoint URL       Game mod URL (BALATRO_BRIDGE_URL; default http://127.0.0.1:12347)
  --timeout-ms N       Overall action timeout (BALATRO_TIMEOUT_MS; default 30000)
  --data-dir PATH      Memory and traces (BALATRO_DATA_DIR; default project/data)
  --read-only-memory   Disable memory_record for fixed-policy evaluation
  --online-memory      Include newly recorded memories in this process's queries
  --doctor             Read-only bridge compatibility/readiness check, then exit
  --help, -h           Show this help
`;
