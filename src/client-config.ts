import { resolve } from 'node:path';
import { ForgeBridgeBackend } from '../play/client.ts';
import { projectRoot } from './config.ts';

/** Generate on the user's machine; generated paths must stay out of source control. */
export function createClientConfig(options: { root?: string; command?: string; endpoint?: string; dataDir?: string } = {}) {
  const endpoint = options.endpoint ?? 'http://127.0.0.1:12347';
  // Reuse the server's loopback URL validation without contacting the game.
  new ForgeBridgeBackend(endpoint);
  return { mcpServers: { balatro: {
    command: options.command ?? process.execPath,
    args: [resolve(options.root ?? projectRoot, 'dist/src/index.js')],
    env: { BALATRO_BRIDGE_URL: endpoint, ...(options.dataDir ? { BALATRO_DATA_DIR: resolve(options.dataDir) } : {}) },
  } } };
}
