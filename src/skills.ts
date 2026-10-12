import { readdir, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { parse } from 'yaml';

export interface Skill {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  disableModelInvocation: boolean;
}
export interface SkillDiagnostic { path: string; message: string }

/** Split a Markdown file into its YAML frontmatter and trimmed body. */
function splitFrontmatter(content: string): { header: string; body: string } {
  const text = content.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text);
  return match ? { header: match[1], body: text.slice(match[0].length).trim() } : { header: '', body: text.trim() };
}

export function stripFrontmatter(content: string): string {
  return splitFrontmatter(content).body;
}

/**
 * Each skill is `<directory>/<name>/SKILL.md`, where frontmatter `name` (if given) equals the
 * directory name. Broken entries are skipped with a diagnostic instead of failing startup.
 */
export async function discoverSkills(directory: string): Promise<{ skills: Skill[]; diagnostics: SkillDiagnostic[] }> {
  const root = await realpath(directory);
  const skills: Skill[] = [], diagnostics: SkillDiagnostic[] = [];
  const names = (await readdir(root)).filter(name => !name.startsWith('.')).sort();
  for (const dir of names) {
    const filePath = resolve(directory, dir, 'SKILL.md');
    const warn = (message: string) => diagnostics.push({ path: filePath, message });
    let target: string;
    try { target = await realpath(filePath); } catch { continue; } // not a skill directory
    const rel = relative(root, target);
    if (rel.startsWith('..' + sep) || isAbsolute(rel)) { warn('Skill resolves outside the gameplay skill directory.'); continue; }
    let meta: Record<string, unknown>;
    try {
      const parsed: unknown = parse(splitFrontmatter(await readFile(target, 'utf8')).header);
      meta = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch (error) { warn(error instanceof Error ? error.message : String(error)); continue; }
    const name = meta.name ?? dir;
    if (name !== dir) { warn(`name must match its directory "${dir}"`); continue; }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(dir) || dir.length > 64) { warn('name must be at most 64 lowercase letters, digits and single hyphens'); continue; }
    if (typeof meta.description !== 'string' || !meta.description.trim()) { warn('description is required'); continue; }
    skills.push({ name: dir, description: meta.description.trim(), filePath, baseDir: resolve(directory, dir), disableModelInvocation: meta['disable-model-invocation'] === true });
  }
  return { skills, diagnostics };
}
