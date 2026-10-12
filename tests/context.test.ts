import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stripFrontmatter } from '../src/skills.ts';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import { loadGameplayContext, registerGameplayResources, skillUri } from '../src/context.ts';
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
    ['duplicate', 'name: coach\ndescription: Duplicate entry.'],
  ]) {
    await mkdir(resolve(root, 'skills', name));
    await writeFile(resolve(root, 'skills', name, 'SKILL.md'), `---\n${frontmatter}\n---\n${name.toUpperCase()}_BODY_SENTINEL`);
  }
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

test('bootstrap stays small while full reference context preserves rules and an install-independent skill catalog', async () => {
  const context = await loadGameplayContext();
  assert.equal(context.basePrompt, await loadSystemPrompt(projectRoot));
  assert.deepEqual(context.diagnostics, []);
  for (const skill of context.skills) assert.ok(context.catalog.includes(`<location>${skillUri(skill.name)}</location>`));
  assert.equal(context.fullContext.includes(projectRoot), false);
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
    assert.equal(await context.readSkillResource(skillUri(skill.name)), await readFile(skill.filePath, 'utf8'));
  }
});

test('gameplay discovery reports invalid skills and keeps explicit-only skills within its own tree', async () => {
  const f = await fixture();
  try {
    const context = await loadGameplayContext(f.root);
    assert.deepEqual(context.skills.map(skill => skill.name), ['coach', 'manual']);
    assert.equal(context.skills[0].description, 'Decide when chips < target & survive.');
    assert.equal(context.skills[0].filePath, resolve(f.root, 'skills/coach/SKILL.md'));
    assert.equal(context.skills[1].disableModelInvocation, true);
    assert.ok(context.diagnostics.some(item => item.path === resolve(f.root, 'skills/duplicate/SKILL.md') && /match its directory/.test(item.message)));
    assert.match(context.catalog, /<location>skill:\/\/coach\/SKILL\.md<\/location>/);
    assert.match(context.catalog, /chips &lt; target &amp; survive/);
    assert.equal(context.catalog.includes(f.root), false);
    assert.doesNotMatch(context.catalog, /manual|ambient|duplicate|BODY_SENTINEL/);
    assert.ok(context.diagnostics.some(item => item.message === 'description is required'));
    assert.ok(Buffer.byteLength(context.fullContext) > 50000);
    assert.ok(Buffer.byteLength(context.instructions) < 2000);
    assert.match(context.fullContext, /CORE_PROTOCOL_SENTINEL/);
    assert.doesNotMatch(context.instructions, /GAME_RULES_SENTINEL|CORE_PROTOCOL_SENTINEL/);
    assert.doesNotMatch(context.instructions, /COACH_BODY_SENTINEL|MANUAL_BODY_SENTINEL|AMBIENT_SENTINEL/);
  } finally { await f.close(); }
});

test('skill discovery supports YAML blocks and skips malformed, nested and looping entries', async () => {
  const f = await fixture();
  try {
    for (const name of ['kept', 'broken', 'group/nested']) await mkdir(resolve(f.root, 'skills', name), { recursive: true });
    await writeFile(resolve(f.root, 'skills/group/nested/SKILL.md'), '---\nname: nested\ndescription: Must not be discovered.\n---\nBody');
    await writeFile(resolve(f.root, 'skills/kept/SKILL.md'), '\uFEFF---\r\nname: kept\r\ndescription: >-\r\n  First line with a colon:\r\n  second line & more.\r\ndisable-model-invocation: "true"\r\n---\r\n\r\n# Kept body\r\n');
    await writeFile(resolve(f.root, 'skills/broken/SKILL.md'), '---\ndescription: [unterminated\n---\nBody');
    await writeFile(resolve(f.root, 'skills/loose.md'), '---\nname: loose\ndescription: Not in a skill directory.\n---\nBody');
    await symlink(resolve(f.root, 'skills'), resolve(f.root, 'skills/loop'));
    const context = await loadGameplayContext(f.root);
    assert.deepEqual(context.skills.map(skill => skill.name), ['coach', 'kept', 'manual']);
    const kept = context.skills.find(skill => skill.name === 'kept')!;
    assert.equal(kept.description, 'First line with a colon: second line & more.');
    assert.equal(kept.disableModelInvocation, false);
    assert.equal(await context.expandSkill('kept'), '<skill name="kept" location="skill://kept/SKILL.md">\nReferences are relative to skill://kept/.\n\n# Kept body\n</skill>');
    assert.ok(context.diagnostics.some(item => item.path === resolve(f.root, 'skills/broken/SKILL.md')));
    assert.equal(stripFrontmatter('Plain text\r\nwith no header.'), 'Plain text\nwith no header.');
  } finally { await f.close(); }
});

test('MCP initializes with short instructions and serves complete context and references lazily', async () => {
  const f = await fixture(), connection = await connect(f.root);
  try {
    const { client, context } = connection;
    assert.equal(client.getInstructions(), context.instructions);
    const indexResult = await client.readResource({ uri: 'balatro://skills' });
    const indexText = String(record(indexResult.contents[0]).text), index = JSON.parse(indexText);
    assert.equal(indexText.includes(JSON.stringify(f.root).slice(1, -1)), false);
    const coach = index.skills.find((skill: { name: string }) => skill.name === 'coach');
    assert.equal(index.skills.length, 2); assert.equal(coach.uri, 'skill://coach/SKILL.md'); assert.equal(coach.invocable, true);
    assert.deepEqual(coach.files.map((file: { path: string }) => file.path), ['SKILL.md', 'references/plan.md']);
    assert.deepEqual(coach.files[1], { uri: 'skill://coach/references/plan.md', path: 'references/plan.md', bytes: Buffer.byteLength(await readFile(resolve(f.root, 'skills/coach/references/plan.md'))) });
    assert.equal(index.skills.find((skill: { name: string }) => skill.name === 'manual').invocable, false);
    assert.ok(index.diagnostics.some((item: { path?: string }) => item.path === 'skills/invalid/SKILL.md'));
    const { resources } = await client.listResources();
    assert.ok(resources.some(item => item.name === 'coach' && item.uri === 'skill://coach/SKILL.md')); assert.ok(!resources.some(item => item.name === 'manual'));
    const skillFile = await client.readResource({ uri: 'skill://coach/SKILL.md' });
    assert.equal(record(skillFile.contents[0]).mimeType, 'text/markdown');
    assert.equal(record(skillFile.contents[0]).text, await readFile(resolve(f.root, 'skills/coach/SKILL.md'), 'utf8'));
    // A relative link in SKILL.md resolves against its URI like a web link.
    for (const uri of [new URL('references/plan.md', 'skill://coach/SKILL.md').href, 'skill://coach/references/../references/./plan.md', 'skill://manual/SKILL.md']) {
      const result = await client.readResource({ uri });
      assert.equal(record(result.contents[0]).text, await readFile(resolve(f.root, uri.startsWith('skill://manual') ? 'skills/manual/SKILL.md' : 'skills/coach/references/plan.md'), 'utf8'));
    }
    const { completion } = await client.complete({ ref: { type: 'ref/resource', uri: 'skill://{skill}/{+path}' }, argument: { name: 'path', value: 'ref' }, context: { arguments: { skill: 'coach' } } });
    assert.deepEqual(completion.values, ['references/plan.md']);
    const rules = await client.readResource({ uri: 'balatro://rules' });
    assert.equal(record(rules.contents[0]).text, await readFile(resolve(f.root, 'model/context/balatro.md'), 'utf8'));
    const protocol = await client.readResource({ uri: 'balatro://protocol' }); assert.equal(record(protocol.contents[0]).text, 'CORE_PROTOCOL_SENTINEL');
    const full = await client.readResource({ uri: 'balatro://context' }); assert.equal(record(full.contents[0]).text, context.fullContext);
  } finally { await connection.close(); await f.close(); }
});

test('explicit MCP skill prompts remove frontmatter and allow manual-only invocation', async () => {
  const f = await fixture(), connection = await connect(f.root);
  try {
    const { client, context } = connection;
    const { prompts } = await client.listPrompts(); assert.ok(prompts.some(prompt => prompt.name === 'skill:manual'));
    for (const name of ['coach', 'manual']) {
      const skill = context.skills.find(skill => skill.name === name)!;
      const body = stripFrontmatter(await readFile(skill.filePath, 'utf8')).trim();
      const expected = `<skill name="${name}" location="skill://${name}/SKILL.md">\nReferences are relative to skill://${name}/.\n\n${body}\n</skill>\n\nFollow this plan.`;
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
      for (const uri of ['skill://coach/escape.txt', 'skill://coach/.hidden', 'skill://coach/references', 'skill://coach/..%2F..%2Foutside.txt', 'skill://coach/%2e%2e/%2e%2e/outside.txt', 'skill://coach/C%3A%5Coutside.txt', 'skill://escaped/SKILL.md', 'skill://coach/SKILL.md?raw', 'skill://coach/missing.md']) {
        await assert.rejects(connection.client.readResource({ uri }), /outside|Hidden|regular file|Unknown gameplay skill|not found|query/i, uri);
      }
      // Absolute file:// URIs are no longer served.
      for (const path of ['outside.txt', 'skills/coach/SKILL.md']) await assert.rejects(connection.client.readResource({ uri: pathToFileURL(resolve(f.root, path)).href }));
      const index = JSON.parse(String(record((await connection.client.readResource({ uri: 'balatro://skills' })).contents[0]).text));
      const files = index.skills.find((skill: { name: string }) => skill.name === 'coach').files.map((file: { path: string }) => file.path);
      assert.equal(files.includes('escape.txt'), false); assert.equal(files.includes('.hidden'), false);
    } finally { await connection.close(); }
  } finally { await f.close(); }
});

test('object lookup resource returns the balatro://rules row and metadata of a named object', async () => {
  const connection = await connect(projectRoot);
  try {
    const read = async (uri: string) => JSON.parse(String(record((await connection.client.readResource({ uri })).contents[0]).text));
    const blueprint = await read('balatro://objects/Blueprint');
    assert.equal(blueprint.total, 1);
    assert.equal(blueprint.matches[0].kind, 'joker'); assert.equal(blueprint.matches[0].rarity, 'Rare');
    assert.match(blueprint.matches[0].rules, /Copy supported ability/);
    assert.equal(blueprint.matches[0].chapter, 'skill://balatro-wiki-rules/chapters/ch05-jokers.md');
    await connection.client.readResource({ uri: blueprint.matches[0].chapter });
    for (const [uri, name, rule] of [
      ['balatro://objects/gold?kind=seal', 'Gold Seal', /\$3 per scoring activation/],
      ['balatro://objects/Pluto', 'Pluto', /High Card/],
      ['balatro://objects/Overstock%20Plus', 'Overstock Plus', /stock capacity/],
      ['balatro://objects/8%20Ball', '8 Ball', /Tarot/],
      ['balatro://objects/Arcana%20Mega%20Pack', 'Arcana Mega Pack', /Use Tarot immediately/],
    ] as const) {
      const result = await read(uri);
      assert.equal(result.matches[0].name, name, uri); assert.match(result.matches[0].rules, rule, uri);
    }
    const broad = await read('balatro://objects/joker');
    assert.equal(broad.matches[0].name, 'Joker'); assert.equal(broad.total, 1);
    const substring = await read('balatro://objects/the?kind=blind');
    assert.ok(substring.total > 20); assert.equal(substring.matches.length, 20); assert.match(substring.note, /Showing 20/);
    const missing = await read('balatro://objects/zzz');
    assert.deepEqual(missing.matches, []); assert.match(missing.note, /No catalog match/);
    const { completion } = await connection.client.complete({ ref: { type: 'ref/resource', uri: 'balatro://objects/{query}' }, argument: { name: 'query', value: 'Bluep' } });
    assert.deepEqual(completion.values, ['Blueprint']);
  } finally { await connection.close(); }
});
