import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const exec = promisify(execFile);
for (const loader of ['winmm.dll', 'version.dll']) {
  test(`Windows reinstall only replaces MCP with existing ${loader} and custom Steamodded folder`, { skip: process.platform !== 'win32' }, async () => {
    const root = await mkdtemp(resolve(tmpdir(), 'balatro-win-install-'));
    try {
      const project = resolve(root, 'project'), game = resolve(root, 'game'), mods = resolve(root, 'profile/Mods');
      await mkdir(resolve(project, 'scripts'), { recursive: true });
      await cp(resolve('scripts/install-mod.ps1'), resolve(project, 'scripts/install-mod.ps1'));
      await cp(resolve('play/mod'), resolve(project, 'play/mod'), { recursive: true });
      await mkdir(game);
      await writeFile(resolve(game, 'Balatro.exe'), 'fixture');
      await writeFile(resolve(game, loader), 'existing loader');
      await mkdir(resolve(mods, 'custom-steamodded/src/preflight'), { recursive: true });
      await writeFile(resolve(mods, 'custom-steamodded/version.lua'), 'existing version');
      await writeFile(resolve(mods, 'custom-steamodded/src/preflight/core.lua'), 'existing core');
      await mkdir(resolve(mods, 'strategy_forge'));
      await writeFile(resolve(mods, 'strategy_forge/strategy_forge.json'), '{"id":"strategy_forge"}');
      await mkdir(resolve(mods, 'other-mod'));
      await writeFile(resolve(mods, 'other-mod/strategy_forge.json'), 'unrelated manifest');
      await writeFile(resolve(mods, '../save.jkr'), 'existing save');
      await mkdir(resolve(mods, 'balatro_mcp_mod'));
      await writeFile(resolve(mods, 'balatro_mcp_mod/obsolete.lua'), 'old MCP');
      for (let attempt = 0; attempt < 2; attempt++) {
        await exec('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolve(project, 'scripts/install-mod.ps1'), '-GameDirectory', game, '-ModsDirectory', mods], { timeout: 60000 });
        assert.deepEqual((await readdir(mods)).sort(), ['balatro_mcp_mod', 'custom-steamodded', 'other-mod', 'strategy_forge']);
        assert.equal(await readFile(resolve(game, loader), 'utf8'), 'existing loader');
        assert.equal(await readFile(resolve(mods, 'custom-steamodded/version.lua'), 'utf8'), 'existing version');
        assert.equal(await readFile(resolve(mods, 'custom-steamodded/src/preflight/core.lua'), 'utf8'), 'existing core');
        assert.equal(await readFile(resolve(mods, 'strategy_forge/strategy_forge.json'), 'utf8'), '{"id":"strategy_forge"}');
        assert.equal(await readFile(resolve(mods, 'other-mod/strategy_forge.json'), 'utf8'), 'unrelated manifest');
        assert.equal(await readFile(resolve(mods, '../save.jkr'), 'utf8'), 'existing save');
        assert.deepEqual(await readFile(resolve(mods, 'balatro_mcp_mod/game.lua')), await readFile(resolve('play/mod/game.lua')));
        assert.ok(!(await readdir(resolve(mods, 'balatro_mcp_mod'))).includes('obsolete.lua'));
      }
      for (const backup of await readdir(resolve(project, 'build/mod-install-backups'))) {
        const record = JSON.parse((await readFile(resolve(project, 'build/mod-install-backups', backup, 'installation.json'), 'utf8')).replace(/^\uFEFF/, ''));
        assert.equal(record.lovelyInstalled, false);
        assert.equal(record.steamoddedInstalled, false);
        assert.deepEqual(record.replacements.map((entry: { target: string }) => entry.target), [resolve(mods, 'balatro_mcp_mod')]);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
