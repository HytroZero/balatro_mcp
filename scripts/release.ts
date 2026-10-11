#!/usr/bin/env node
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { projectRoot } from '../src/config.ts';
import { archiveDistribution, auditDistribution, copyDistribution, distributionFiles } from '../src/distribution.ts';

async function main() {
  const { values } = parseArgs({ options: { check: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } });
  if (values.help) {
    console.log('Usage: npm run release:check | npm run release:export\nChecks public source for private data; exports an allowlisted source folder and tar.gz without Git history.');
    return;
  }
  const files = await distributionFiles(projectRoot);
  const issues = await auditDistribution(projectRoot, files);
  if (issues.length) {
    for (const issue of issues) console.error(`${issue.path}${issue.line ? ':' + issue.line : ''}: ${issue.reason}`);
    throw new Error('Distribution audit failed. Remove private data before exporting.');
  }
  console.log(`Distribution audit passed (${files.length} source files). This checks exported source, not existing Git history.`);
  if (values.check) return;
  const { version } = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8')) as { version: string };
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/.test(version)) throw new Error('Invalid release version.');
  const destination = resolve(projectRoot, 'build/releases', `balatro-mcp-${version}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  await mkdir(destination, { recursive: true });
  await copyDistribution(projectRoot, destination, files);
  const exportedIssues = await auditDistribution(destination, await distributionFiles(destination));
  if (exportedIssues.length) throw new Error('Export changed during copy; inspect the exported source before release.');
  const archive = await archiveDistribution(destination);
  console.log('Clean source folder: ' + destination + '\nSource archive: ' + archive + '\nPublish this clean folder or archive. The original checkout still contains its existing Git history.');
}
main().catch(error => { console.error('Balatro release:', error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
