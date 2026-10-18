import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import { loadGameplayContext, registerGameplayResources } from '../src/context.ts';
import { gameplayResources } from '../src/resources.ts';
import { projectRoot } from '../src/config.ts';
import { record } from '../env/contract.ts';

async function connect(root: string) {
  const context = await loadGameplayContext(root);
  const server = new McpServer({ name: 'context-test', version: '1.0.0' }, { instructions: context.instructions });
  registerGameplayResources(server, context);
  const client = new Client({ name: 'context-test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport); await client.connect(clientTransport);
  return { context, client, close: async () => { await client.close(); await server.close(); } };
}

const text = async (client: Client, uri: string) => String(record((await client.readResource({ uri })).contents[0]).text);

test('startup lists direct resources without reading documents and loads only requested content', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'balatro resources '));
  const connection = await connect(root); // No resource directory exists yet.
  try {
    const { client, context } = connection;
    assert.equal(client.getInstructions(), context.instructions);
    assert.ok(context.instructions.length <= 800);
    for (const uri of ['balatro://protocol', 'balatro://guide', 'balatro://coach', 'balatro://analysis']) assert.ok(context.instructions.includes(uri));
    const { resources } = await client.listResources();
    assert.deepEqual(resources.map(item => item.uri), gameplayResources.map(item => item.uri));
    assert.equal(JSON.stringify(resources).includes(root), false);
    const { resourceTemplates } = await client.listResourceTemplates();
    assert.deepEqual(resourceTemplates.map(item => item.uriTemplate), ['balatro://objects/{query}']);
    assert.equal(client.getServerCapabilities()?.prompts, undefined);
    await mkdir(resolve(root, 'resources'), { recursive: true });
    const full = 'COACH_SENTINEL\n' + 'Full reference line.\n'.repeat(4000);
    await writeFile(resolve(root, 'resources/coach.md'), full);
    assert.equal(await text(client, 'balatro://coach'), full);
    await writeFile(resolve(root, 'resources/coach.md'), 'Updated coaching policy.');
    assert.equal(await text(client, 'balatro://coach'), 'Updated coaching policy.');
    await assert.rejects(client.readResource({ uri: 'balatro://rules/jokers' }));
    // Object lookup must work with only its own topic present.
    await mkdir(resolve(root, 'resources/rules'));
    await writeFile(resolve(root, 'resources/rules/jokers.md'), '| Joker | Ability |\n| --- | --- |\n| Blueprint | Copy supported ability |\n');
    await writeFile(resolve(root, 'resources/objects.json'), JSON.stringify({ objects: [{
      kind: 'joker', name: 'Blueprint', chapter: 'balatro://rules/jokers',
      lookup_url: 'https://balatrowiki.org/w/Blueprint', source_status: 'table-indexed',
    }] }));
    const object = JSON.parse(await text(client, 'balatro://objects/Blueprint'));
    assert.match(object.matches[0].rules, /Copy supported ability/);
    assert.equal(object.matches[0].chapter, 'balatro://rules/jokers');
  } finally { await connection.close(); await rm(root, { recursive: true, force: true }); }
});

test('every registered document and linked topic is readable', async () => {
  const connection = await connect(projectRoot);
  try {
    for (const resource of gameplayResources) {
      const body = await text(connection.client, resource.uri);
      assert.equal(body, await readFile(resolve(projectRoot, 'resources', resource.path), 'utf8'));
      for (const match of body.matchAll(/\]\((balatro:\/\/[^)]+)\)/g)) {
        assert.ok(gameplayResources.some(item => item.uri === match[1]), match[1]);
      }
    }
    const index = await text(connection.client, 'balatro://rules');
    assert.ok(index.length < 3000);
    assert.doesNotMatch(index, /\| Blueprint \|/);
    assert.match(await text(connection.client, 'balatro://rules/jokers'), /\| Blueprint \|/);
  } finally { await connection.close(); }
});

test('unregistered URIs and filesystem escapes are unavailable', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'balatro resources '));
  await mkdir(resolve(root, 'resources/rules'), { recursive: true });
  const outside = resolve(root, 'private.md');
  await writeFile(outside, 'PRIVATE_SENTINEL');
  await symlink(outside, resolve(root, 'resources/rules/jokers.md'));
  const connection = await connect(root);
  try {
    for (const uri of ['balatro://context', 'balatro://skills', 'skill://coach/SKILL.md', 'balatro://coach/decisions', 'balatro://coach/sources', 'balatro://coach/state-input', 'balatro://rules/missing', 'balatro://rules/objects.json', 'balatro://rules/..%2Fprivate.md', 'balatro://coach?raw', pathToFileURL(outside).href]) {
      await assert.rejects(connection.client.readResource({ uri }), uri);
    }
    await assert.rejects(connection.client.readResource({ uri: 'balatro://rules/jokers' }), /outside/);
    await assert.rejects(connection.client.getPrompt({ name: 'skill:coach' }));
  } finally { await connection.close(); await rm(root, { recursive: true, force: true }); }
});

test('all catalog objects point to registered topics', async () => {
  const catalog = JSON.parse(await readFile(resolve(projectRoot, 'resources/objects.json'), 'utf8'));
  assert.equal(catalog.objects.length, 366);
  for (const object of catalog.objects) assert.ok(gameplayResources.some(item => item.uri === object.chapter), object.name);
});

test('object lookup resource returns the topic rule and metadata of a named object', async () => {
  const connection = await connect(projectRoot);
  try {
    const read = async (uri: string) => JSON.parse(String(record((await connection.client.readResource({ uri })).contents[0]).text));
    const blueprint = await read('balatro://objects/Blueprint');
    assert.equal(blueprint.total, 1);
    assert.equal(blueprint.matches[0].kind, 'joker'); assert.equal(blueprint.matches[0].rarity, 'Rare');
    assert.match(blueprint.matches[0].rules, /Copy supported ability/);
    assert.equal(blueprint.matches[0].chapter, 'balatro://rules/jokers');
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
