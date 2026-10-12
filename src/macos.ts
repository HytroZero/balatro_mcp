import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { cp, lstat, mkdir, readFile, readdir, rm, writeFile, chmod } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { projectRoot } from './config.ts';

const exec = promisify(execFile);
export type MacArch = 'arm64' | 'x86_64';
export const lovelyVersion = 'v0.10.0';
export const steamoddedVersion = '26.1002.0';
const modFiles = ['balatro_mcp_mod.json', 'balatro_mcp_mod.lua', 'bridge.lua', 'decision.lua', 'game.lua', 'json.lua', 'transport.lua'];

export interface MacOptions {
  gameDirectory?: string;
  modsDirectory?: string;
  arch?: MacArch;
  dryRun?: boolean;
  updateLoaders?: boolean;
  lovelyArchive?: string;
  steamoddedArchive?: string;
  port?: number;
  actionTimeout?: number;
}
export interface MacContext {
  home: string;
  project: string;
  platform: string;
  nativeArch: MacArch;
  gameRunning: (executable: string) => Promise<boolean>;
}

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
async function textIfExists(path: string): Promise<string> { return await exists(path) ? readFile(path, 'utf8') : ''; }
function inside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path !== '' && path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path);
}
async function rejectLinks(path: string): Promise<void> {
  for (let cursor = resolve(path); ; cursor = dirname(cursor)) {
    if (await exists(cursor) && (await lstat(cursor)).isSymbolicLink()) throw new Error('Linked installation path is unsupported: ' + cursor);
    if (cursor === dirname(cursor)) return;
  }
}

export async function defaultMacContext(): Promise<MacContext> {
  let nativeArch: MacArch = process.arch === 'arm64' ? 'arm64' : 'x86_64';
  // A Node process running under Rosetta may report x64 on an Apple Silicon host.
  if (process.platform === 'darwin') {
    try { if ((await exec('/usr/sbin/sysctl', ['-n', 'hw.optional.arm64'])).stdout.trim() === '1') nativeArch = 'arm64'; }
    catch { /* Intel Macs may not expose this sysctl. */ }
  }
  return { home: homedir(), project: projectRoot, platform: process.platform, nativeArch,
    gameRunning: async executable => {
      const { stdout } = await exec('/bin/ps', ['-axo', 'comm=']);
      return stdout.split('\n').some(line => line.trim() === executable || /\/Balatro\.app\/Contents\/MacOS\/love$/i.test(line.trim()));
    },
  };
}

/** Read thin/universal Mach-O headers, rather than guessing from the Node process architecture. */
export async function machoArchitectures(path: string): Promise<MacArch[]> {
  const bytes = await readFile(path);
  if (bytes.length < 12) throw new Error('Invalid Mach-O binary: ' + path);
  const magic = bytes.readUInt32BE(0);
  const cpuTypes: number[] = [];
  if ([0xcafebabe, 0xcafebabf, 0xbebafeca, 0xbfbafeca].includes(magic)) {
    const little = magic === 0xbebafeca || magic === 0xbfbafeca;
    const uint = (offset: number) => little ? bytes.readUInt32LE(offset) : bytes.readUInt32BE(offset);
    const count = uint(4), stride = magic === 0xcafebabf || magic === 0xbfbafeca ? 32 : 20;
    if (count < 1 || count > 32 || bytes.length < 8 + count * stride) throw new Error('Invalid universal Mach-O header: ' + path);
    for (let i = 0; i < count; i++) cpuTypes.push(uint(8 + i * stride));
  } else if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe].includes(magic)) {
    cpuTypes.push(magic === 0xcefaedfe || magic === 0xcffaedfe ? bytes.readUInt32LE(4) : bytes.readUInt32BE(4));
  } else throw new Error('Expected a Mach-O macOS binary: ' + path);
  return [...new Set(cpuTypes.flatMap(cpu => cpu === 0x0100000c ? ['arm64' as const] : cpu === 0x01000007 ? ['x86_64' as const] : []))];
}

export async function discoverMacGames(home = homedir()): Promise<string[]> {
  const steam = resolve(home, 'Library/Application Support/Steam');
  const libraries = new Set([steam]);
  for (const config of ['steamapps/libraryfolders.vdf', 'config/libraryfolders.vdf']) {
    const vdf = await textIfExists(resolve(steam, config));
    for (const match of vdf.matchAll(/"path"\s+"((?:\\.|[^"\\])+)"/g)) libraries.add(match[1].replace(/\\([\\"])/g, '$1'));
  }
  const candidates = [resolve('/Applications/Balatro.app'), resolve(home, 'Applications/Balatro.app')];
  for (const library of libraries) {
    const manifest = await textIfExists(resolve(library, 'steamapps/appmanifest_2379780.acf'));
    const installName = manifest.match(/"installdir"\s+"([^"]+)"/)?.[1] ?? 'Balatro';
    if (installName.includes('/') || installName.includes('\\') || installName === '..') throw new Error('Invalid Steam installdir.');
    candidates.push(resolve(library, 'steamapps/common', installName, 'Balatro.app'));
  }
  const found: string[] = [];
  for (const app of candidates) if (await exists(resolve(app, 'Contents/MacOS/love'))) found.push(dirname(app));
  return [...new Set(found)];
}

export async function planMacInstall(options: MacOptions, suppliedContext?: MacContext) {
  const context = suppliedContext ?? await defaultMacContext();
  if (context.platform !== 'darwin') throw new Error('This installer/launcher supports macOS only.');
  let gameDirectory = options.gameDirectory;
  if (!gameDirectory) {
    const games = await discoverMacGames(context.home);
    if (games.length !== 1) throw new Error(games.length ? 'Multiple games found; pass --game-directory: ' + games.join(', ') : 'Balatro.app not found. Install the Steam macOS game or pass --game-directory.');
    gameDirectory = games[0];
  }
  gameDirectory = resolve(gameDirectory);
  if (basename(gameDirectory) === 'Balatro.app') gameDirectory = dirname(gameDirectory);
  const executable = resolve(gameDirectory, 'Balatro.app/Contents/MacOS/love');
  if (!await exists(executable)) throw new Error('--game-directory must contain Balatro.app/Contents/MacOS/love.');
  const arch = options.arch ?? context.nativeArch;
  if (!['arm64', 'x86_64'].includes(arch) || context.nativeArch === 'x86_64' && arch === 'arm64') throw new Error('Unsupported architecture for this Mac: ' + arch);
  if (!(await machoArchitectures(executable)).includes(arch)) throw new Error('Balatro executable does not support ' + arch + '.');
  const modsDirectory = resolve(options.modsDirectory ?? resolve(context.home, 'Library/Application Support/Balatro/Mods'));
  if (basename(modsDirectory) !== 'Mods') throw new Error('--mods-directory must end in Mods.');
  const profileDirectory = dirname(modsDirectory);
  const library = resolve(gameDirectory, 'liblovely.dylib');
  const steamodded: string[] = [];
  if (await exists(modsDirectory)) {
    for (const entry of await readdir(modsDirectory, { withFileTypes: true })) {
      const path = resolve(modsDirectory, entry.name);
      if ((entry.isDirectory() || entry.isSymbolicLink()) && await exists(resolve(path, 'version.lua')) && await exists(resolve(path, 'src/preflight/core.lua'))) steamodded.push(path);
      if (entry.isDirectory() && entry.name !== 'balatro_mcp_mod' && await exists(resolve(path, 'balatro_mcp_mod.json'))) throw new Error('Duplicate balatro_mcp_mod found: ' + path);
    }
  }
  if (steamodded.length > 1) throw new Error('Multiple Steamodded installations found; keep only one.');
  const steamoddedTarget = steamodded[0] ?? resolve(modsDirectory, 'smods');
  if (!steamodded.length && await exists(steamoddedTarget)) throw new Error('Mods/smods is not a recognized Steamodded installation.');
  const needLovely = options.updateLoaders === true || !await exists(library);
  if (!needLovely && !(await machoArchitectures(library)).includes(arch)) throw new Error('Existing liblovely.dylib does not support ' + arch + '; use --update-loaders or select --arch x86_64 on Apple Silicon with Rosetta.');
  const source = resolve(context.project, 'play/mod');
  const modTarget = resolve(modsDirectory, 'balatro_mcp_mod');
  if (source === modTarget || inside(source, modTarget) || inside(modTarget, source)) throw new Error('Mod destination must not overlap the source directory.');
  for (const file of modFiles) if (!await exists(resolve(source, file))) throw new Error('Missing mod source: ' + file);
  for (const target of [library, resolve(gameDirectory, 'run_lovely_macos.sh'), steamoddedTarget, modTarget]) await rejectLinks(target);
  const backupRoot = resolve(context.project, 'build/mod-install-backups');
  if (backupRoot === profileDirectory || inside(profileDirectory, backupRoot)) throw new Error('Project backup folder must be outside the Balatro profile.');
  await rejectLinks(backupRoot);
  const lovelyAsset = `lovely-${arch === 'arm64' ? 'aarch64' : 'x86_64'}-apple-darwin.tar.gz`;
  return { gameDirectory, executable, arch, modsDirectory, profileDirectory, library, steamoddedTarget, source, backupRoot,
    needLovely, needSteamodded: options.updateLoaders === true || steamodded.length === 0,
    lovelyUrl: `https://github.com/ethangreen-dev/lovely-injector/releases/download/${lovelyVersion}/${lovelyAsset}`,
    steamoddedUrl: `https://api.github.com/repos/Steamodded/smods/zipball/${steamoddedVersion}` };
}

async function download(url: string, destination: string): Promise<void> {
  const response = await fetch(url, { headers: { 'User-Agent': 'balatro-mcp-macos-installer' }, signal: AbortSignal.timeout(180000) });
  if (!response.ok || !response.body) throw new Error('Download failed: ' + response.status + ' ' + url);
  const chunks: Uint8Array[] = []; let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > 64 * 1024 * 1024) throw new Error('Loader download exceeds 64 MiB.');
    chunks.push(chunk);
  }
  await writeFile(destination, Buffer.concat(chunks));
}
async function unpack(archive: string | undefined, url: string, stage: string, name: string): Promise<string> {
  const path = archive ? resolve(archive) : resolve(stage, name + '.archive');
  if (!archive) await download(url, path);
  const { stdout } = await exec('/usr/bin/tar', ['-tf', path], { maxBuffer: 4 * 1024 * 1024 });
  for (const entry of stdout.split('\n').filter(Boolean)) {
    if (isAbsolute(entry) || entry.includes('\\') || entry.split('/').includes('..')) throw new Error('Archive has an unsafe path: ' + entry);
  }
  const directory = resolve(stage, name); await mkdir(directory);
  await exec('/usr/bin/tar', ['-xf', path, '-C', directory]); // macOS bsdtar supports tar.gz and zip.
  async function check(path: string): Promise<void> {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || !entry.isDirectory() && !entry.isFile()) throw new Error('Loader archive contains links or special files.');
      if (entry.isDirectory()) await check(resolve(path, entry.name));
    }
  }
  await check(directory);
  return directory;
}
async function findDirectories(root: string, matches: (path: string) => Promise<boolean>): Promise<string[]> {
  if (await matches(root)) return [root];
  const found: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) if (entry.isDirectory()) found.push(...await findDirectories(resolve(root, entry.name), matches));
  return found;
}

export async function installMacMod(options: MacOptions, suppliedContext?: MacContext) {
  const context = suppliedContext ?? await defaultMacContext();
  const plan = await planMacInstall(options, context);
  if (options.dryRun) return { ...plan, dryRun: true };
  if (await context.gameRunning(plan.executable)) throw new Error('Close Balatro before installing or updating the mod.');
  const installId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
  const stage = resolve(context.project, 'build/mod-install', installId);
  const backup = resolve(plan.backupRoot, installId);
  await rejectLinks(stage); await mkdir(stage, { recursive: true });
  const replacements: { source?: string; target: string }[] = [];
  if (plan.needLovely) {
    const expanded = await unpack(options.lovelyArchive, plan.lovelyUrl, stage, 'lovely');
    const roots = await findDirectories(expanded, path => exists(resolve(path, 'liblovely.dylib')));
    if (roots.length !== 1 || !await exists(resolve(roots[0], 'run_lovely_macos.sh'))) throw new Error('Lovely archive must contain liblovely.dylib and run_lovely_macos.sh.');
    if (!(await machoArchitectures(resolve(roots[0], 'liblovely.dylib'))).includes(plan.arch)) throw new Error('Lovely archive architecture does not match ' + plan.arch + '.');
    for (const file of ['liblovely.dylib', 'run_lovely_macos.sh']) replacements.push({ source: resolve(roots[0], file), target: resolve(plan.gameDirectory, file) });
  }
  if (plan.needSteamodded) {
    const expanded = await unpack(options.steamoddedArchive, plan.steamoddedUrl, stage, 'steamodded');
    const roots = await findDirectories(expanded, async path => await exists(resolve(path, 'version.lua')) && await exists(resolve(path, 'src/preflight/core.lua')) && (await exists(resolve(path, 'lovely')) || await exists(resolve(path, 'lovely.toml'))));
    if (roots.length !== 1) throw new Error('Steamodded archive must contain one complete source folder.');
    replacements.push({ source: roots[0], target: plan.steamoddedTarget });
  }
  replacements.push({ source: plan.source, target: resolve(plan.modsDirectory, 'balatro_mcp_mod') });
  await mkdir(backup, { recursive: true });
  if (await exists(plan.profileDirectory)) await cp(plan.profileDirectory, resolve(backup, 'profile'), { recursive: true, dereference: false });
  await mkdir(plan.modsDirectory, { recursive: true });
  const applied: { target: string; old: string; existed: boolean }[] = [];
  try {
    for (const [index, item] of replacements.entries()) {
      await rejectLinks(item.target);
      const old = resolve(backup, 'previous-' + index), existed = await exists(item.target);
      // Copy before removal so external Steam libraries on another volume work too.
      if (existed) await cp(item.target, old, { recursive: true, dereference: false });
      applied.push({ target: item.target, old, existed });
      await rm(item.target, { recursive: true, force: true });
      if (item.source) await cp(item.source, item.target, { recursive: true });
      if (basename(item.target) === 'run_lovely_macos.sh') await chmod(item.target, 0o755);
    }
    await writeFile(resolve(backup, 'installation.json'), JSON.stringify({ installedAt: new Date().toISOString(), ...plan, lovelyVersion, steamoddedVersion, replacements: applied }, null, 2));
  } catch (error) {
    const failures: string[] = [];
    for (const item of applied.reverse()) {
      try { await rm(item.target, { recursive: true, force: true }); if (item.existed) await cp(item.old, item.target, { recursive: true }); }
      catch { failures.push(item.target); }
    }
    throw new Error(`Installation failed; ${failures.length ? 'manual restore needed for ' + failures.join(', ') : 'replaced files restored'}. Backup: ${backup}. ${error}`);
  }
  return { ...plan, backup, dryRun: false };
}

export async function macLaunchCommand(options: MacOptions, suppliedContext?: MacContext) {
  const context = suppliedContext ?? await defaultMacContext();
  const plan = await planMacInstall(options, context);
  if (plan.needLovely || plan.needSteamodded || !await exists(resolve(plan.modsDirectory, 'balatro_mcp_mod/balatro_mcp_mod.lua'))) throw new Error('Install the mod and required loaders first: npm run install:macos');
  if (options.port !== undefined && (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535)) throw new Error('--port must be an integer from 1024 to 65535.');
  if (options.actionTimeout !== undefined && (!Number.isFinite(options.actionTimeout) || options.actionTimeout < 1 || options.actionTimeout > 600)) throw new Error('--action-timeout must be 1–600 seconds.');
  // SIP-protected /usr/bin/arch can strip DYLD_* from its environment. Set the
  // injection variable inside /usr/bin/env after arch starts the chosen slice.
  const args = ['-' + plan.arch, '/usr/bin/env', 'DYLD_INSERT_LIBRARIES=' + plan.library, plan.executable];
  const env: NodeJS.ProcessEnv = { ...process.env, LOVELY_MOD_DIR: plan.modsDirectory };
  delete env.DYLD_INSERT_LIBRARIES;
  if (options.port !== undefined) env.BALATRO_MCP_MOD_PORT = String(options.port);
  if (options.actionTimeout !== undefined) env.BALATRO_MCP_MOD_ACTION_TIMEOUT = String(options.actionTimeout);
  return { command: '/usr/bin/arch', args, cwd: plan.gameDirectory, env, executable: plan.executable };
}

export async function launchMacGame(options: MacOptions, suppliedContext?: MacContext): Promise<number> {
  const context = suppliedContext ?? await defaultMacContext();
  const command = await macLaunchCommand(options, context);
  if (options.dryRun) { console.log(JSON.stringify({ ...command, env: { LOVELY_MOD_DIR: command.env.LOVELY_MOD_DIR, BALATRO_MCP_MOD_PORT: command.env.BALATRO_MCP_MOD_PORT, BALATRO_MCP_MOD_ACTION_TIMEOUT: command.env.BALATRO_MCP_MOD_ACTION_TIMEOUT } }, null, 2)); return 0; }
  if (await context.gameRunning(command.executable)) throw new Error('Balatro is already running. Use npm run doctor to inspect its bridge.');
  return new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, { cwd: command.cwd, env: command.env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => { if (signal) reject(new Error('Game exited with signal ' + signal)); else resolve(code ?? 1); });
  });
}
