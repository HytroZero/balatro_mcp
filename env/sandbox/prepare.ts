import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { projectRoot } from '../../src/config.ts';

export const sourceFiles = [
  'engine/object.lua', 'game.lua', 'globals.lua', 'card.lua', 'blind.lua', 'back.lua',
  'functions/misc_functions.lua', 'functions/common_events.lua', 'functions/state_events.lua',
];
const root = projectRoot;
const source = resolve(process.argv[2] ?? resolve(root, 'env/balatro'));
const target = resolve(root, 'env/sandbox/vendor');
const globals = await readFile(resolve(source, 'globals.lua'), 'utf8');
if (!/^VERSION = '1\.0\.1o'/m.test(globals)) throw new Error('Expected Balatro 1.0.1o source');
// Check every dependency before copying; original source stays byte-for-byte intact.
await Promise.all(sourceFiles.map(path => readFile(resolve(source, path))));
for (const path of sourceFiles) {
  await mkdir(dirname(resolve(target, path)), { recursive: true });
  await copyFile(resolve(source, path), resolve(target, path));
}
console.log(`Prepared ${sourceFiles.length} original Lua modules in env/sandbox/vendor (local only).`);
