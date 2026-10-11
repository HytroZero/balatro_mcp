#!/usr/bin/env node
import { readFile, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createClientConfig } from '../src/client-config.ts';
import { projectRoot } from '../src/config.ts';

async function main() {
  const { values } = parseArgs({ options: {
    output: { type: 'string' }, stdout: { type: 'boolean' }, force: { type: 'boolean' },
    endpoint: { type: 'string' }, 'data-dir': { type: 'string' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) {
    console.log(`Generate local MCP client JSON with this machine's Node and project paths.
Usage: npm run mcp:config -- [options]
  --output PATH    Destination (default project/mcp.local.json; ignored by Git)
  --stdout         Print JSON only (invoke node scripts/mcp-config.ts directly)
  --endpoint URL   Loopback game bridge URL (default http://127.0.0.1:12347)
  --data-dir PATH  Optional custom memory/trace directory
  --force          Replace an existing different output file
  --help, -h       Show help
Copy the balatro entry into your client's existing MCP configuration.
Generated JSON contains local paths. Keep it private.`);
    return;
  }
  if (values.stdout && values.output) throw new Error('Choose --stdout or --output.');
  try { await access(resolve(projectRoot, 'dist/src/index.js')); }
  catch { throw new Error('Build the server first: npm run build'); }
  const json = JSON.stringify(createClientConfig({ endpoint: values.endpoint, dataDir: values['data-dir'] }), null, 2) + '\n';
  if (values.stdout) { process.stdout.write(json); return; }
  const destination = resolve(values.output ?? resolve(projectRoot, 'mcp.local.json'));
  try {
    // Repeated setup is safe; preserve any user edits unless --force is explicit.
    const current = await readFile(destination, 'utf8');
    if (current === json) { console.log('MCP configuration is up to date: ' + destination); return; }
    if (!values.force) throw new Error('Output already exists with different content. Choose --output or use --force to replace it.');
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  await writeFile(destination, json, { flag: values.force ? 'w' : 'wx', mode: 0o600 });
  console.log('MCP configuration written: ' + destination + '\nCopy the balatro entry into your MCP client, then restart the client. Keep this file private.');
}
main().catch(error => { console.error('Balatro MCP config:', error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
