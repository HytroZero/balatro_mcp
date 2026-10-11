import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { nextId } from '../src/ids.ts';
import { MemoryStore, type Experience } from '../memory/store.ts';
import type { Observation } from '../env/contract.ts';

test('operation counters stay distinct across backend owners and do not depend on RPC call counts', () => {
  const first = nextId('action');
  nextId('call'); nextId('call');
  const second = nextId('action');
  const [prefix, serial] = first.split('-action-');
  assert.match(prefix!, /^\d+-\d+$/);
  assert.equal(second, `${prefix}-action-${Number(serial) + 1}`);
});
test('memory IDs continue from disk with offline snapshots and legacy IDs', async () => {
  const root = await mkdtemp(resolve(tmpdir(),'balatro-ids-'));
  const observation = {runId:'run1',revision:'1',gameVersion:'1.0.1o',state:{}} as Observation;
  const input = {kind:'observed' as const,text:'Visible result',evidence:'test'};
  try {
    await writeFile(resolve(root,'experience.jsonl'),JSON.stringify({...input,id:'legacy-id',gameVersion:'1.0.1o'} as Experience) + '\n');
    const memory = new MemoryStore(root);
    await memory.init();
    assert.equal((await memory.remember(input,observation)).id,'memory-2');
    assert.equal((await memory.remember(input,observation)).id,'memory-3');
    assert.equal(memory.initialSnapshot().length,1);
    const reopened = new MemoryStore(root);
    await reopened.init();
    assert.equal((await reopened.remember(input,observation)).id,'memory-4');
  } finally { await rm(root,{recursive:true,force:true}); }
});
