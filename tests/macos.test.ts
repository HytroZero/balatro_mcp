import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { createServer } from 'node:net';
import { discoverMacGames, installMacMod, machoArchitectures, macLaunchCommand, planMacInstall, type MacArch, type MacContext } from '../src/macos.ts';

const exec = promisify(execFile);
function thin(arch: MacArch): Buffer {
  const bytes = Buffer.alloc(32); bytes.writeUInt32LE(0xfeedfacf, 0);
  bytes.writeUInt32LE(arch === 'arm64' ? 0x0100000c : 0x01000007, 4); return bytes;
}
function universal(): Buffer {
  const bytes = Buffer.alloc(48); bytes.writeUInt32BE(0xcafebabe, 0); bytes.writeUInt32BE(2, 4);
  bytes.writeUInt32BE(0x0100000c, 8); bytes.writeUInt32BE(0x01000007, 28); return bytes;
}
async function fixture(loaders = true) {
  const root = await realpath(await mkdtemp(resolve(tmpdir(), 'balatro-mac-')));
  const home = resolve(root, 'home'), project = resolve(root, 'project');
  const steam = resolve(home, 'Library/Application Support/Steam');
  const game = resolve(steam, 'steamapps/common/Balatro');
  const executable = resolve(game, 'Balatro.app/Contents/MacOS/love');
  const mods = resolve(home, 'Library/Application Support/Balatro/Mods');
  await mkdir(resolve(game, 'Balatro.app/Contents/MacOS'), { recursive: true });
  await writeFile(executable, universal());
  await mkdir(resolve(project, 'play'), { recursive: true });
  await cp(resolve('play/mod'), resolve(project, 'play/mod'), { recursive: true });
  await mkdir(mods, { recursive: true });
  await writeFile(resolve(mods, '../save.jkr'), 'original save');
  await mkdir(resolve(mods, 'unrelated-mod')); await writeFile(resolve(mods, 'unrelated-mod/keep.lua'), 'keep');
  if (loaders) {
    await writeFile(resolve(game, 'liblovely.dylib'), thin('arm64'));
    await writeFile(resolve(game, 'run_lovely_macos.sh'), 'existing launcher');
    await mkdir(resolve(mods, 'smods/src/preflight'), { recursive: true });
    await writeFile(resolve(mods, 'smods/src/preflight/core.lua'), '-- existing');
    await writeFile(resolve(mods, 'smods/version.lua'), 'return "existing"');
  }
  const context: MacContext = { home, project, platform: 'darwin', nativeArch: 'arm64', gameRunning: async () => false };
  return { root, home, project, game, executable, mods, context, close: () => rm(root, { recursive: true, force: true }) };
}

test('macOS discovery includes Steam external libraries, spaces and manifest install names', async () => {
  const f = await fixture();
  try {
    assert.ok((await discoverMacGames(f.home)).includes(f.game));
    const library = resolve(f.root, 'external Steam library');
    const game = resolve(library, 'steamapps/common/Custom Balatro');
    await mkdir(resolve(game, 'Balatro.app/Contents/MacOS'), { recursive: true });
    await writeFile(resolve(game, 'Balatro.app/Contents/MacOS/love'), universal());
    await writeFile(resolve(library, 'steamapps/appmanifest_2379780.acf'), '"installdir" "Custom Balatro"');
    await writeFile(resolve(f.home, 'Library/Application Support/Steam/steamapps/libraryfolders.vdf'), `"libraryfolders" { "1" { "path" "${library}" } }`);
    assert.ok((await discoverMacGames(f.home)).includes(game));
    await assert.rejects(planMacInstall({}, f.context), /Multiple games/);
    assert.equal((await planMacInstall({ gameDirectory: resolve(game, 'Balatro.app') }, f.context)).gameDirectory, game);
  } finally { await f.close(); }
});

test('Mach-O detection and install plans select Apple Silicon and Intel archives and reject mismatches', async () => {
  const f = await fixture(false);
  try {
    assert.deepEqual(await machoArchitectures(f.executable), ['arm64', 'x86_64']);
    const arm = await planMacInstall({}, f.context); assert.match(arm.lovelyUrl, /aarch64-apple-darwin/);
    const intel = await planMacInstall({}, { ...f.context, nativeArch: 'x86_64' }); assert.match(intel.lovelyUrl, /x86_64-apple-darwin/);
    await writeFile(resolve(f.game, 'liblovely.dylib'), thin('x86_64'));
    await assert.rejects(planMacInstall({}, f.context), /does not support arm64/);
    assert.equal((await planMacInstall({ updateLoaders: true }, f.context)).needLovely, true);
    assert.equal((await planMacInstall({ arch: 'x86_64' }, f.context)).needLovely, false);
    await assert.rejects(planMacInstall({ arch: 'arm64' }, { ...f.context, nativeArch: 'x86_64' }), /Unsupported architecture/);
    await assert.rejects(planMacInstall({}, { ...f.context, platform: 'win32' }), /macOS only/);
    await writeFile(resolve(f.root, 'not-macho'), 'arbitrary non executable text');
    await assert.rejects(machoArchitectures(resolve(f.root, 'not-macho')), /Mach-O/);
  } finally { await f.close(); }
});

test('macOS dry-run makes no project/profile writes, and a running game prevents installation', async () => {
  const f = await fixture();
  try {
    const before = await readdir(f.mods);
    const result = await installMacMod({ dryRun: true }, f.context);
    assert.equal(result.dryRun, true); assert.deepEqual(await readdir(f.mods), before);
    await assert.rejects(lstat(resolve(f.project, 'build')), /ENOENT/);
    await assert.rejects(installMacMod({}, { ...f.context, gameRunning: async () => true }), /Close Balatro/);
    await assert.rejects(lstat(resolve(f.project, 'build')), /ENOENT/);
  } finally { await f.close(); }
});

test('macOS installation backs up profile, preserves loaders and unrelated mods, and replaces obsolete mod files', async () => {
  const f = await fixture();
  try {
    const first = await installMacMod({}, f.context);
    assert.ok('backup' in first);
    assert.equal(await readFile(resolve(first.backup, 'profile/save.jkr'), 'utf8'), 'original save');
    assert.equal(await readFile(resolve(f.mods, 'unrelated-mod/keep.lua'), 'utf8'), 'keep');
    assert.equal(await readFile(resolve(f.game, 'run_lovely_macos.sh'), 'utf8'), 'existing launcher');
    assert.equal(await readFile(resolve(f.mods, 'smods/version.lua'), 'utf8'), 'return "existing"');
    assert.deepEqual(await readFile(resolve(f.mods, 'balatro_mcp_mod/game.lua')), await readFile(resolve('play/mod/game.lua')));
    await writeFile(resolve(f.mods, 'balatro_mcp_mod/obsolete.lua'), 'old');
    const second = await installMacMod({}, f.context); assert.ok('backup' in second);
    await assert.rejects(lstat(resolve(f.mods, 'balatro_mcp_mod/obsolete.lua')), /ENOENT/);
    assert.equal(await readFile(resolve(second.backup, 'profile/Mods/balatro_mcp_mod/obsolete.lua'), 'utf8'), 'old');
    assert.equal((await readdir(resolve(f.project, 'build/mod-install-backups'))).length, 2);
  } finally { await f.close(); }
});

test('macOS installer rejects linked destinations, ambiguous loaders and source overlap before mutation', async () => {
  const f = await fixture();
  try {
    await symlink(resolve(f.mods, 'unrelated-mod'), resolve(f.mods, 'balatro_mcp_mod'));
    await assert.rejects(installMacMod({}, f.context), /Linked installation path/);
    await rm(resolve(f.mods, 'balatro_mcp_mod'));
    await cp(resolve(f.mods, 'smods'), resolve(f.mods, 'duplicate-smods'), { recursive: true });
    await assert.rejects(installMacMod({}, f.context), /Multiple Steamodded/);
    await rm(resolve(f.mods, 'duplicate-smods'), { recursive: true });
    await assert.rejects(installMacMod({ modsDirectory: resolve(f.project, 'play/mod/Mods') }, f.context), /overlap/);
    await assert.rejects(lstat(resolve(f.project, 'build')), /ENOENT/);
  } finally { await f.close(); }
});

test('macOS upgrade backs up and removes the legacy mod so only the renamed bridge loads', async () => {
  const f = await fixture();
  try {
    // Cover an upgrade even if a manual installation already left both copies.
    await installMacMod({}, f.context);
    const legacy = resolve(f.mods, 'strategy_forge');
    await mkdir(legacy);
    await writeFile(resolve(legacy, 'strategy_forge.json'), JSON.stringify({ id: 'strategy_forge' }));
    await writeFile(resolve(legacy, 'strategy_forge.lua'), '-- old entry');
    await assert.rejects(macLaunchCommand({}, f.context), /Install or migrate/);
    const result = await installMacMod({}, f.context); assert.ok('backup' in result);
    await assert.rejects(lstat(legacy), /ENOENT/);
    assert.equal(await readFile(resolve(result.backup, 'profile/Mods/strategy_forge/strategy_forge.lua'), 'utf8'), '-- old entry');
    const manifest = JSON.parse(await readFile(resolve(f.mods, 'balatro_mcp_mod/balatro_mcp_mod.json'), 'utf8'));
    assert.equal(manifest.id, 'balatro_mcp_mod'); assert.equal(manifest.name, 'Balatro MCP mod');
    assert.deepEqual(manifest.author, ['HytroZero']);
    assert.equal(manifest.main_file, 'balatro_mcp_mod.lua');
    assert.ok((await lstat(resolve(f.mods, 'balatro_mcp_mod', manifest.main_file))).isFile());
    await macLaunchCommand({}, f.context);
  } finally { await f.close(); }
});

test('macOS upgrade refuses unknown legacy directories, links and extra bridge copies', async () => {
  const f = await fixture();
  try {
    const legacy = resolve(f.mods, 'strategy_forge');
    await mkdir(legacy); await writeFile(resolve(legacy, 'keep.txt'), 'unrelated');
    await assert.rejects(installMacMod({}, f.context), /Unrecognized legacy/);
    assert.equal(await readFile(resolve(legacy, 'keep.txt'), 'utf8'), 'unrelated');
    await rm(legacy, { recursive: true });
    await symlink(resolve(f.mods, 'unrelated-mod'), legacy);
    await assert.rejects(installMacMod({}, f.context), /Linked installation path/);
    await rm(legacy);
    const duplicate = resolve(f.mods, 'extra-bridge'); await mkdir(duplicate);
    for (const filename of ['strategy_forge.json', 'balatro_mcp_mod.json']) {
      await writeFile(resolve(duplicate, filename), '{}');
      await assert.rejects(installMacMod({}, f.context), /Duplicate/);
      await rm(resolve(duplicate, filename));
    }
    await assert.rejects(lstat(resolve(f.project, 'build')), /ENOENT/);
  } finally { await f.close(); }
});

test('macOS launch plan sets injection after arch, passes custom mod directory and validates game timing options', async () => {
  const f = await fixture();
  try {
    await installMacMod({}, f.context);
    const command = await macLaunchCommand({ port: 23456, actionTimeout: 120 }, f.context);
    assert.equal(command.command, '/usr/bin/arch');
    assert.deepEqual(command.args, ['-arm64', '/usr/bin/env', 'DYLD_INSERT_LIBRARIES=' + resolve(f.game, 'liblovely.dylib'), f.executable]);
    assert.equal(command.env.DYLD_INSERT_LIBRARIES, undefined); assert.equal(command.env.LOVELY_MOD_DIR, f.mods);
    assert.equal(command.env.BALATRO_MCP_MOD_PORT, '23456'); assert.equal(command.env.BALATRO_MCP_MOD_ACTION_TIMEOUT, '120');
    const custom = resolve(f.root, 'custom profile/Mods'); await cp(f.mods, custom, { recursive: true });
    assert.equal((await macLaunchCommand({ modsDirectory: custom }, f.context)).env.LOVELY_MOD_DIR, custom);
    await assert.rejects(macLaunchCommand({ port: 0 }, f.context), /--port/);
    await assert.rejects(macLaunchCommand({ actionTimeout: NaN }, f.context), /--action-timeout/);
  } finally { await f.close(); }
});

test('offline loader archives install both pinned components and reject wrong architectures without changing installed files', { skip: process.platform === 'win32' }, async () => {
  const f = await fixture(false);
  try {
    const lovely = resolve(f.root, 'lovely'); await mkdir(lovely);
    await writeFile(resolve(lovely, 'liblovely.dylib'), thin('arm64'));
    await writeFile(resolve(lovely, 'run_lovely_macos.sh'), '#!/bin/sh\n');
    const smods = resolve(f.root, 'steamodded/source'); await mkdir(resolve(smods, 'src/preflight'), { recursive: true });
    await mkdir(resolve(smods, 'lovely')); await writeFile(resolve(smods, 'lovely/init.toml'), '# fixture');
    await writeFile(resolve(smods, 'src/preflight/core.lua'), '-- fixture'); await writeFile(resolve(smods, 'version.lua'), 'return "26.1002.0"');
    const lovelyArchive = resolve(f.root, 'lovely.tar.gz'), steamoddedArchive = resolve(f.root, 'smods.tar.gz');
    await exec('/usr/bin/tar', ['-czf', lovelyArchive, '-C', lovely, '.']);
    await exec('/usr/bin/tar', ['-czf', steamoddedArchive, '-C', resolve(f.root, 'steamodded'), '.']);
    await installMacMod({ lovelyArchive, steamoddedArchive }, f.context);
    assert.deepEqual(await machoArchitectures(resolve(f.game, 'liblovely.dylib')), ['arm64']);
    assert.equal(await readFile(resolve(f.mods, 'smods/version.lua'), 'utf8'), 'return "26.1002.0"');
    assert.ok((await lstat(resolve(f.game, 'run_lovely_macos.sh'))).mode & 0o111);
    await writeFile(resolve(lovely, 'liblovely.dylib'), thin('x86_64'));
    await exec('/usr/bin/tar', ['-czf', lovelyArchive, '-C', lovely, '.']);
    await assert.rejects(installMacMod({ lovelyArchive, steamoddedArchive, updateLoaders: true }, f.context), /archive architecture/);
    assert.deepEqual(await machoArchitectures(resolve(f.game, 'liblovely.dylib')), ['arm64']);
    assert.equal(await readFile(resolve(f.mods, '../save.jkr'), 'utf8'), 'original save');
  } finally { await f.close(); }
});

test('failed macOS mod copy restores the previous complete mod after filesystem error', { skip: process.platform === 'win32' }, async () => {
  const f = await fixture();
  const socket = createServer();
  try {
    await installMacMod({}, f.context);
    await writeFile(resolve(f.mods, 'balatro_mcp_mod/old-note.txt'), 'restore me');
    await new Promise<void>((resolvePromise, reject) => { socket.once('error', reject); socket.listen(resolve(f.project, 'play/mod/error.sock'), resolvePromise); });
    await assert.rejects(installMacMod({}, f.context), /replaced files restored/);
    assert.equal(await readFile(resolve(f.mods, 'balatro_mcp_mod/old-note.txt'), 'utf8'), 'restore me');
    assert.equal(await readFile(resolve(f.mods, '../save.jkr'), 'utf8'), 'original save');
    assert.equal(await readFile(resolve(f.mods, 'unrelated-mod/keep.lua'), 'utf8'), 'keep');
  } finally { await new Promise<void>(resolve => socket.close(() => resolve())); await f.close(); }
});
