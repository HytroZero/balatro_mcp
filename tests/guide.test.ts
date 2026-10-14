import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { McpServer } from '@modelcontextprotocol/server';
import { FullObservationSchema, phaseViews } from '../env/compact.ts';
import type { Backend } from '../env/contract.ts';
import type { Trace } from '../model/trace.ts';
import { phaseViewRows, phaseViewSentence, toolGuide } from '../tools/guide.ts';
import { registerGameTools } from '../tools/index.ts';

// The projection is the source of truth; the guide and tool descriptions restate it in prose.
const stateKeys = Object.keys(FullObservationSchema.properties.state.properties);
const runKeys = stateKeys.filter(key => !(key in phaseViews));

async function descriptions(): Promise<Record<string, string>> {
  const found: Record<string, string> = {};
  const server = { registerTool(name: string, config: { description: string }) { found[name] = config.description; } };
  registerGameTools(server as unknown as McpServer, {} as Backend, {} as Trace, operation => operation());
  return found;
}

test('phase view rows cover every phase view exactly once', () => {
  assert.deepEqual(phaseViewRows.flatMap(row => row.keys).sort(), Object.keys(phaseViews).sort());
});

test('game_observe description names every run key and the generated phase views', async () => {
  const text = (await descriptions()).game_observe!;
  for (const key of runKeys) assert.match(text, new RegExp(`\\b${key}\\b`), `run key ${key} is missing from the game_observe description`);
  assert.ok(text.includes(`Phase views exist only in their phases: ${phaseViewSentence()}.`));
});

test('balatro://guide documents every state key with phases taken from phaseViews', () => {
  for (const key of stateKeys) assert.ok(toolGuide.includes('`' + key + '`'), `state key ${key} is missing from the guide`);
  for (const [key, phases] of Object.entries(phaseViews)) {
    const row = toolGuide.split('\n').find(line => line.startsWith('|') && line.split('|')[1]!.includes('`' + key + '`'));
    assert.equal(row?.split('|')[2]!.trim(), phases.join(', '), `guide row for ${key}`);
  }
});
