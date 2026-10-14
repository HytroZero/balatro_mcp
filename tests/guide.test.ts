import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { McpServer } from '@modelcontextprotocol/server';
import { FullObservationSchema, phaseViews } from '../env/compact.ts';
import type { Backend } from '../env/contract.ts';
import type { Trace } from '../model/trace.ts';
import { phaseViewRows, toolGuide } from '../tools/guide.ts';
import { registerGameTools } from '../tools/index.ts';

// The guide owns field definitions; tool descriptions route to the appropriate resource.
const stateKeys = Object.keys(FullObservationSchema.properties.state.properties);

async function descriptions(): Promise<Record<string, string>> {
  const found: Record<string, string> = {};
  const server = { registerTool(name: string, config: { description: string }) { found[name] = config.description; } };
  registerGameTools(server as unknown as McpServer, {} as Backend, {} as Trace, operation => operation());
  return found;
}

test('phase view rows cover every phase view exactly once', () => {
  assert.deepEqual(phaseViewRows.flatMap(row => row.keys).sort(), Object.keys(phaseViews).sort());
});

test('tool descriptions stay within the concise budget and route to field/analysis contracts', async () => {
  const text = await descriptions();
  for (const [name, description] of Object.entries(text)) assert.ok(description.length <= 350, `${name} duplicates reference material`);
  assert.ok(text.game_observe!.includes('balatro://guide'));
  assert.ok(text.game_analyze!.includes('balatro://analysis'));
});

test('balatro://guide documents every state key with phases taken from phaseViews', () => {
  for (const key of stateKeys) assert.ok(toolGuide.includes('`' + key + '`'), `state key ${key} is missing from the guide`);
  for (const [key, phases] of Object.entries(phaseViews)) {
    const row = toolGuide.split('\n').find(line => line.startsWith('|') && line.split('|')[1]!.includes('`' + key + '`'));
    assert.equal(row?.split('|')[2]!.trim(), phases.join(', '), `guide row for ${key}`);
  }
});
