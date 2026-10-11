#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { installMacMod, launchMacGame, type MacArch, type MacOptions } from '../src/macos.ts';

const help = `Balatro MCP macOS installer/launcher (Apple Silicon and Intel)
Usage: npm run install:macos -- [options]
       npm run launch:macos -- [options]
  --game-directory PATH     Folder containing Balatro.app, or the app bundle itself
  --mods-directory PATH     Default ~/Library/Application Support/Balatro/Mods
  --arch arm64|x86_64       Default native hardware architecture, including under Rosetta
  --dry-run                Preview without downloads, backups, writes or game launch
  --update-loaders          Replace existing Lovely/Steamodded after backup
  --lovely-archive PATH     Offline official macOS Lovely tar.gz
  --steamodded-archive PATH Offline official Steamodded source archive
  --port N                 Game bridge port at launch (default 12347)
  --action-timeout N        Lua action deadline in seconds at launch (default 20)
  --help, -h               Show help
Close Balatro before installation. Use this launcher for Lovely injection.
`;
async function main(): Promise<void> {
  const { values } = parseArgs({ options: {
    launch: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }, 'dry-run': { type: 'boolean' },
    'game-directory': { type: 'string' }, 'mods-directory': { type: 'string' }, arch: { type: 'string' },
    'update-loaders': { type: 'boolean' }, 'lovely-archive': { type: 'string' }, 'steamodded-archive': { type: 'string' },
    port: { type: 'string' }, 'action-timeout': { type: 'string' },
  } });
  if (values.help) { console.log(help); return; }
  if (values.arch !== undefined && !['arm64', 'x86_64'].includes(values.arch)) throw new Error('--arch must be arm64 or x86_64.');
  const options: MacOptions = { gameDirectory: values['game-directory'], modsDirectory: values['mods-directory'], arch: values.arch as MacArch | undefined,
    dryRun: values['dry-run'], updateLoaders: values['update-loaders'], lovelyArchive: values['lovely-archive'], steamoddedArchive: values['steamodded-archive'],
    port: values.port === undefined ? undefined : Number(values.port), actionTimeout: values['action-timeout'] === undefined ? undefined : Number(values['action-timeout']) };
  if (values.launch) { process.exitCode = await launchMacGame(options); return; }
  const installed = await installMacMod(options);
  console.log(JSON.stringify(installed, null, 2));
  if (!installed.dryRun) console.log('Installed. Start the game with npm run launch:macos, then run npm run doctor in another terminal.');
}
main().catch(error => { console.error('Balatro macOS:', error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
