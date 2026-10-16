import { execFile } from 'node:child_process';
import { cp, lstat, mkdir, readFile, readdir } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

/** Explicit source allowlist: never export a checkout, generated config or game profile. */
export const distributionEntries = [
  '.github', '.editorconfig', '.gitattributes', '.gitignore', '.nvmrc', 'LICENSE', 'README.md', 'README.en.md', 'README.zh-CN.md',
  'package.json', 'package-lock.json', 'mcp.example.json', 'tsconfig.json', 'tsconfig.build.json',
  'src', 'env', 'play', 'tools', 'model', 'scripts', 'tests', 'docs', 'resources',
];
const optionalEntries = new Set(['.github', 'README.en.md', 'README.zh-CN.md']);
// Authored maintenance files only; the generated engine is derived game code.
const prunedTools = new Set([
  'env/pruned/README.md', 'env/pruned/generate.ts', 'env/pruned/check.ts', 'env/pruned/bench.ts',
  'env/pruned/test-analysis.ts', 'env/pruned/list-jokers.lua',
]);
const privateFile = /(?:^|\/)(?:\.env(?:\..*)?|\.npmrc|auth\.json|credentials(?:\..*)?|config\.local\.json|mcp\.local\.json|[^/]+\.local\.json|[^/]+\.(?:pem|key|p12|pfx|log|jsonl|bak|zip|gz)|\.DS_Store)$/i;
const sensitivePatterns = [
  ['personal home path', /\/(?:Users|home)\/[a-zA-Z0-9][^/\s"'<>]*\//],
  ['personal Windows home path', /[A-Za-z]:[\\/]+(?:Users|Documents and Settings)[\\/]+[a-zA-Z0-9][^\\/\s"'<>]*[\\/]/],
  ['email address', /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['access token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{24,}|AKIA[A-Z0-9]{16})\b/],
  ['credential assignment', /(?:api[_-]?key|access[_-]?token|password|secret)["']?\s*[:=]\s*["'][A-Za-z0-9_+/=-]{20,}["']/i],
  ['raw game instance identifier', /table:\s*0x[0-9a-f]{8,}/i],
] as const;
export interface DistributionIssue { path: string; line?: number; reason: string }

export async function distributionFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(path: string) {
    // Locally supplied proprietary game code is never part of a public export.
    if (path === 'env/balatro' || path === 'env/sandbox/vendor' || basename(path) === '.DS_Store') return;
    if (path.startsWith('env/pruned/') && !prunedTools.has(path)) return;
    const entry = await lstat(resolve(root, path));
    if (entry.isSymbolicLink()) throw new Error('Distribution cannot contain symlinks: ' + path);
    if (entry.isDirectory()) {
      if (/(?:^|\/)(?:\.git|node_modules|data|build|dist|__pycache__)$/.test(path)) throw new Error('Private/generated directory in distribution: ' + path);
      for (const name of (await readdir(resolve(root, path))).sort()) await visit(path + '/' + name);
    } else if (entry.isFile()) files.push(path);
    else throw new Error('Distribution requires regular files: ' + path);
  }
  for (const path of distributionEntries) {
    try { await lstat(resolve(root, path)); }
    catch (error) { if (optionalEntries.has(path) && (error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    await visit(path);
  }
  return files.sort();
}

/** Reports locations/categories only; never echo matched secrets into CI logs. */
export async function auditDistribution(root: string, files: string[]): Promise<DistributionIssue[]> {
  const issues: DistributionIssue[] = [];
  for (const path of files) {
    if (privateFile.test(path)) { issues.push({ path, reason: 'private/generated filename' }); continue; }
    const bytes = await readFile(resolve(root, path));
    if (bytes.includes(0)) { issues.push({ path, reason: 'binary file requires explicit distribution review' }); continue; }
    for (const [index, line] of bytes.toString('utf8').split('\n').entries()) {
      for (const [reason, pattern] of sensitivePatterns) if (pattern.test(line)) issues.push({ path, line: index + 1, reason });
    }
  }
  return issues;
}

export async function copyDistribution(root: string, destination: string, files: string[]): Promise<void> {
  for (const path of files) {
    const target = resolve(destination, path);
    await mkdir(dirname(target), { recursive: true });
    await cp(resolve(root, path), target, { dereference: false, force: false, errorOnExist: true });
  }
}

/** Strip filesystem owner names and macOS extended attributes from public archives. */
export async function archiveDistribution(destination: string): Promise<string> {
  const exec = promisify(execFile);
  const { stdout } = await exec('tar', ['--version']);
  const ownership = stdout.includes('bsdtar')
    ? ['--uid', '0', '--gid', '0', '--uname', 'root', '--gname', 'root', '--no-fflags']
    // GNU tar reads "C:\..." as a remote host unless told the archive is local.
    : ['--owner=0', '--group=0', '--numeric-owner', '--force-local'];
  const archive = destination + '.tar.gz';
  await exec('tar', ['--format=ustar', '--no-xattrs', '--no-acls', ...ownership,
    '-czf', archive, '-C', dirname(destination), basename(destination)],
  { env: { ...process.env, COPYFILE_DISABLE: '1' } });
  return archive;
}
