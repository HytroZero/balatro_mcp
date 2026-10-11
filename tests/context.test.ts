import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadSkills, formatSkillsForPrompt, stripFrontmatter } from '@earendil-works/pi-coding-agent';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import { loadGameplayContext, registerGameplayResources } from '../src/context.ts';
import { loadSystemPrompt } from '../model/prompt.ts';
import { projectRoot } from '../src/config.ts';
import { record } from '../env/contract.ts';

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), 'balatro context '));
  await mkdir(resolve(root, 'model/context'), { recursive: true });
  await mkdir(resolve(root, 'skills/coach/references'), { recursive: true });
  await writeFile(resolve(root, 'model/context/balatro.md'), 'GAME_RULES_SENTINEL\n' + 'Complete game rules.\n'.repeat(4000));
  await writeFile(resolve(root, 'skills/core.md'), 'CORE_PROTOCOL_SENTINEL');
  await writeFile(resolve(root, 'skills/README.md'), 'Documentation with no description.');
  await writeFile(resolve(root, 'skills/coach/SKILL.md'), '---\nname: coach\ndescription: "Decide when chips < target & survive."\n---\n\nCOACH_BODY_SENTINEL\nRead references/plan.md.\n');
  await writeFile(resolve(root, 'skills/coach/references/plan.md'), 'REFERENCE_SENTINEL\n' + 'Full reference line.\n'.repeat(4000));
  for (const [name, frontmatter] of [
    ['manual', 'name: manual\ndescription: Explicit invocation only.\ndisable-model-invocation: true'],
    ['invalid', 'name: invalid'],
    ['ignored', 'name: ignored\ndescription: Ignored entry.'],
    ['duplicate', 'name: coach\ndescription: Duplicate entry.'],
  ]) {
    await mkdir(resolve(root, 'skills', name));
    await writeFile(resolve(root, 'skills', name, 'SKILL.md'), `---\n${frontmatter}\n---\n${name.toUpperCase()}_BODY_SENTINEL`);
  }
  await writeFile(resolve(root, 'skills/.gitignore'), 'ignored/\n');
  await mkdir(resolve(root, '.pi/skills/ambient'), { recursive: true });
  await writeFile(resolve(root, '.pi/skills/ambient/SKILL.md'), '---\nname: ambient\ndescription: Ambient coding skill.\n---\nAMBIENT_SENTINEL');
  return { root, close: () => rm(root, { recursive: true, force: true }) };
}

async function connect(root: string) {
  const context = await loadGameplayContext(root);
  const server = new McpServer({ name: 'context-test', version: '1.0.0' }, { instructions: context.instructions });
  registerGameplayResources(server, context);
  const client = new Client({ name: 'context-test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  return { context, client, close: async () => { await client.close(); await server.close(); } };
}

test('bootstrap stays small while full reference context preserves rules and Pi metadata', async () => {
  const context = await loadGameplayContext();
  const expected = loadSkills({ cwd: projectRoot, agentDir: resolve(projectRoot, '.pi'), skillPaths: [resolve(projectRoot, 'skills')], includeDefaults: false });
  assert.equal(context.basePrompt, await loadSystemPrompt(projectRoot));
  assert.equal(context.catalog, formatSkillsForPrompt(expected.skills, 'indirect'));
  assert.deepEqual(context.skills.map(skill => skill.name).sort(), ['balatro-gold-stake-coach', 'balatro-wiki-rules']);
  assert.ok(context.fullContext.includes((await readFile(resolve(projectRoot, 'model/context/balatro.md'), 'utf8')).trim()));
  assert.ok(context.fullContext.includes((await readFile(resolve(projectRoot, 'skills/core.md'), 'utf8')).trim()));
  assert.ok(context.fullContext.includes(context.catalog));
  assert.ok(context.instructions.length < 2000);
  assert.ok(context.instructions.length < context.fullContext.length * 0.05);
  for (const uri of ['balatro://guide','balatro://rules','balatro://protocol','balatro://skills','balatro://context']) assert.ok(context.instructions.includes(uri));
  for (const skill of context.skills) {
    const body = stripFrontmatter(await readFile(skill.filePath, 'utf8')).trim();
    assert.equal(context.instructions.includes(body), false);
    assert.equal(await context.readSkillResource(pathToFileURL(skill.filePath)), await readFile(skill.filePath, 'utf8'));
  }
});

test('Pi discovery preserves ignore files, collisions, diagnostics and explicit-only skills while excluding ambient coding context', async () => {
  const f = await fixture();
  try {
    const context = await loadGameplayContext(f.root);
    const expected = loadSkills({ cwd: f.root, agentDir: resolve(f.root, '.pi'), skillPaths: [resolve(f.root, 'skills')], includeDefaults: false });
    assert.deepEqual(context.skills, expected.skills); assert.deepEqual(context.diagnostics, expected.diagnostics);
    assert.equal(context.catalog, formatSkillsForPrompt(expected.skills, 'indirect'));
    assert.match(context.catalog, /chips &lt; target &amp; survive/);
    assert.doesNotMatch(context.catalog, /manual|ambient|ignored|BODY_SENTINEL/);
    assert.ok(context.diagnostics.some(item => item.message === 'description is required'));
    assert.ok(context.diagnostics.some(item => item.type === 'collision'));
    assert.ok(Buffer.byteLength(context.fullContext) > 50000);
    assert.ok(Buffer.byteLength(context.instructions) < 2000);
    assert.match(context.fullContext, /CORE_PROTOCOL_SENTINEL/);
    assert.doesNotMatch(context.instructions, /GAME_RULES_SENTINEL|CORE_PROTOCOL_SENTINEL/);
    assert.doesNotMatch(context.instructions, /COACH_BODY_SENTINEL|MANUAL_BODY_SENTINEL|AMBIENT_SENTINEL/);
  } finally { await f.close(); }
});

test('MCP initializes with short instructions and serves complete context and references lazily', async () => {
  const f = await fixture(), connection = await connect(f.root);
  try {
    const { client, context } = connection;
    assert.equal(client.getInstructions(), context.instructions);
    const indexResult = await client.readResource({ uri: 'balatro://skills' });
    const index = JSON.parse(String(record(indexResult.contents[0]).text));
    assert.equal(index.catalog, context.catalog); assert.equal(index.skills.length, 2);
    const { resources } = await client.listResources();
    assert.ok(resources.some(item => item.name === 'coach')); assert.ok(!resources.some(item => item.name === 'manual'));
    for (const path of ['skills/coach/SKILL.md', 'skills/coach/references/plan.md']) {
      const result = await client.readResource({ uri: pathToFileURL(resolve(f.root, path)).href });
      assert.equal(record(result.contents[0]).text, await readFile(resolve(f.root, path), 'utf8'));
    }
    const rules = await client.readResource({ uri: 'balatro://rules' });
    assert.equal(record(rules.contents[0]).text, await readFile(resolve(f.root, 'model/context/balatro.md'), 'utf8'));
    const protocol = await client.readResource({ uri: 'balatro://protocol' }); assert.equal(record(protocol.contents[0]).text, 'CORE_PROTOCOL_SENTINEL');
    const full = await client.readResource({ uri: 'balatro://context' }); assert.equal(record(full.contents[0]).text, context.fullContext);
  } finally { await connection.close(); await f.close(); }
});

test('explicit MCP skill prompts match Pi expansion, remove frontmatter and allow manual-only invocation', async () => {
  const f = await fixture(), connection = await connect(f.root);
  try {
    const { client, context } = connection;
    const { prompts } = await client.listPrompts(); assert.ok(prompts.some(prompt => prompt.name === 'skill:manual'));
    for (const name of ['coach', 'manual']) {
      const skill = context.skills.find(skill => skill.name === name)!;
      const body = stripFrontmatter(await readFile(skill.filePath, 'utf8')).trim();
      const expected = `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>\n\nFollow this plan.`;
      const result = await client.getPrompt({ name: 'skill:' + name, arguments: { instructions: '  Follow this plan.  ' } });
      assert.equal(record(result.messages[0].content).text, expected);
      assert.doesNotMatch(String(record(result.messages[0].content).text), /disable-model-invocation/);
    }
  } finally { await connection.close(); await f.close(); }
});

test('skill resources reject outside files, symlink escapes, hidden files and directories', async () => {
  const f = await fixture();
  try {
    await writeFile(resolve(f.root, 'outside.txt'), 'PRIVATE_SENTINEL');
    await writeFile(resolve(f.root, 'skills/coach/.hidden'), 'PRIVATE_SENTINEL');
    await symlink(resolve(f.root, 'outside.txt'), resolve(f.root, 'skills/coach/escape.txt'));
    const outsideSkill = resolve(f.root, 'outside-skill'); await mkdir(outsideSkill);
    await writeFile(resolve(outsideSkill, 'SKILL.md'), '---\nname: escaped\ndescription: Outside skill.\n---\nPRIVATE_SENTINEL');
    await symlink(outsideSkill, resolve(f.root, 'skills/escaped'));
    const connection = await connect(f.root);
    try {
      assert.ok(connection.context.diagnostics.some(item => item.message === 'Skill resolves outside the gameplay skill directory.'));
      assert.doesNotMatch(connection.context.catalog, /escaped/);
      for (const path of ['outside.txt', 'skills/coach/escape.txt', 'skills/coach/.hidden', 'skills/coach', 'outside-skill/SKILL.md']) {
        await assert.rejects(connection.client.readResource({ uri: pathToFileURL(resolve(f.root, path)).href }), /outside|Hidden|regular file/i);
      }
    } finally { await connection.close(); }
  } finally { await f.close(); }
});
