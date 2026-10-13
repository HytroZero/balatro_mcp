import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { createClientConfig } from '../src/client-config.ts';
import { archiveDistribution, auditDistribution, copyDistribution, distributionFiles } from '../src/distribution.ts';
import { projectRoot } from '../src/config.ts';

test('generated MCP configuration launches built stdio from any cwd and preserves existing client files', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'balatro config '));
  try {
    const output = resolve(root, 'mcp.local.json');
    const run = (...args: string[]) => promisify(execFile)(process.execPath, [resolve(projectRoot, 'scripts/mcp-config.ts'), ...args], { cwd: tmpdir() });
    await run('--output', output);
    const config = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(config.mcpServers.balatro.command, process.execPath);
    assert.deepEqual(config.mcpServers.balatro.args, [resolve(projectRoot, 'dist/src/index.js')]);
    const help = await promisify(execFile)(config.mcpServers.balatro.command, [...config.mcpServers.balatro.args, '--help'], { cwd: root });
    assert.match(help.stdout, /stdio/);
    await run('--output', output); // Repeat setup without overwriting customized files.
    await writeFile(output, '{"existingClientConfig":true}');
    await assert.rejects(run('--output', output), /already exists/);
    assert.equal(await readFile(output, 'utf8'), '{"existingClientConfig":true}');
    await run('--output', output, '--force');
    assert.deepEqual(JSON.parse((await run('--stdout')).stdout), config);
    assert.equal(createClientConfig({ root, dataDir: root }).mcpServers.balatro.env.BALATRO_DATA_DIR, root);
    assert.throws(() => createClientConfig({ endpoint: 'http://example.com' }), /loopback/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('distribution rejects private data without printing it and excludes runtime files and Git history', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'balatro distribution '));
  try {
    const cases: [string, string][] = [
      ['private-path.txt', ['/', 'Users', 'private-user', 'project'].join('/')],
      ['windows-path.json', JSON.stringify(['C:', 'Users', 'private-user', 'project'].join('\\'))],
      ['email.txt', ['private-user', 'example.com'].join('@')],
      ['key.txt', ['-----BEGIN ', 'PRIVATE KEY-----'].join('')],
      ['token.txt', 'ghp_' + 'a'.repeat(36)],
      ['capture.json', 'table: ' + '0x1234567890'],
      ['mcp.local.json', '{}'],
      ['.env.production', 'VALUE=test'],
    ];
    for (const [path, contents] of cases) await writeFile(resolve(root, path), contents);
    const issues = await auditDistribution(root, cases.map(([path]) => path));
    assert.equal(issues.length, cases.length);
    assert.doesNotMatch(JSON.stringify(issues), /private-user|0x1234567890/);
    const files = await distributionFiles(projectRoot);
    assert.ok(files.includes('package-lock.json')); assert.ok(files.includes('LICENSE'));
    assert.ok(!files.some(path => /^(?:\.git\/|build\/|data\/|dist\/|node_modules\/)|\.local\.json$/.test(path)));
    assert.ok(!files.some(path => /^(?:env\/balatro\/|env\/sandbox\/vendor\/)|(?:^|\/)\.DS_Store$/.test(path)));
    assert.deepEqual(await auditDistribution(projectRoot, files), []);
    const destination = resolve(root, 'export');
    await copyDistribution(projectRoot, destination, files);
    for (const path of ['env/balatro/card.lua', 'env/sandbox/vendor/card.lua', 'env/.DS_Store']) {
      await mkdir(resolve(destination, path, '..'), { recursive: true });
      await writeFile(resolve(destination, path), 'local-only source or OS metadata');
    }
    assert.deepEqual(await distributionFiles(destination), files);
    assert.deepEqual(await auditDistribution(destination, files), []);
    const tar = gunzipSync(await readFile(await archiveDistribution(destination)));
    for (let offset = 0; offset + 512 <= tar.length && tar[offset];) {
      const header = tar.subarray(offset, offset + 512);
      assert.equal(parseInt(header.subarray(108, 116).toString(), 8), 0);
      assert.equal(parseInt(header.subarray(116, 124).toString(), 8), 0);
      for (const start of [265, 297]) assert.ok(['', 'root'].includes(header.subarray(start, start + 32).toString().replace(/\0.*$/, '')));
      assert.ok(['0', '5'].includes(header.subarray(156, 157).toString())); // No extended metadata entries.
      const size = parseInt(header.subarray(124, 136).toString(), 8);
      offset += 512 + Math.ceil(size / 512) * 512;
    }
    await mkdir(resolve(destination, 'src/private'), { recursive: true });
    await symlink(resolve(root, 'email.txt'), resolve(destination, 'src/private/link.txt'));
    await assert.rejects(distributionFiles(destination), /symlinks/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
