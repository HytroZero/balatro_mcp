import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, lstat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { record, type Data } from '../env/contract.ts';
import { toolGuide } from '../tools/guide.ts';
import { analysisGuide } from '../tools/analysis-guide.ts';

const health = { status: 'ok', bridge: 'balatro_mcp_mod', protocol: 1, instanceId: 'mcp-test', gameVersion: '1.0.1o-FULL',
  luaRuntime: 'LuaJIT 2.0.5', preservesTiming: true, ready: true, capabilities: ['observe', 'deck_observe', 'act', 'operation'] };
const snapshot = (revision = 1, state = 'MENU') => ({ contract: 1, backend: 'balatro_mcp_mod', revision: 'mcp-test:' + revision,
  runId: 'test-run', gameVersion: '1.0.1o', terminal: false, outcome: 'ongoing', ready: true,
  state: { state, deck: 'RED', stake: 'WHITE', seed: 'TEST', money: 4, hand: { count: 2, limit: 8, cards: [
    { index: 0, value: { rank: 'Ace', suit: 'Spades' } }, { index: 1, state: { hidden: true }, value: { rank: 'King', suit: 'Hearts' } },
  ] } }, availableMethods: state === 'MENU' ? ['start'] : ['select', 'play'], legality: 'backend-authoritative' });

async function harness(extra: string[] = [], timeoutMs = 1000) {
  const root = await mkdtemp(resolve(tmpdir(), 'balatro-mcp-'));
  let current = snapshot(), mutations = 0, requests = 0, loseResponse = false;
  let observeGate: Promise<void> | undefined, enteredObserve: (() => void) | undefined;
  const operations = new Map<string, Data>();
  const rpc = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const request = JSON.parse(body) as Data, params = record(request.params);
    requests++;
    let value: unknown;
    switch (request.method) {
      case 'sf.health': value = health; break;
      case 'sf.observe': {
        if (observeGate) { const gate = observeGate; observeGate = undefined; enteredObserve?.(); await gate; }
        value = current; break;
      }
      case 'sf.deck_observe': value = { revision: current.revision, runId: current.runId, remainingCards: 2, previewCards: 2, uncertainCards: 0,
        cards: [{ rank: 'Ace', suit: 'Spades', enhancement: 'c_base', count: 2 }] }; break;
      case 'sf.act': {
        mutations++;
        current = snapshot(Number(current.revision.split(':')[1]) + 1, 'BLIND_SELECT');
        value = { actionId: params.actionId, status: 'completed', applied: true, observation: current };
        operations.set(String(params.actionId), value as Data);
        if (loseResponse) { res.destroy(); return; }
        break;
      }
      case 'sf.operation': value = operations.get(String(params.actionId)); break;
      default: throw new Error('Unexpected RPC: ' + request.method);
    }
    res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: value }));
  });
  await new Promise<void>(resolve => rpc.listen(0, '127.0.0.1', resolve));
  const address = rpc.address(); assert.ok(address && typeof address === 'object');
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [resolve('dist/src/index.js'), '--endpoint', `http://127.0.0.1:${address.port}`, '--data-dir', root, '--timeout-ms', String(timeoutMs), ...extra],
    // Verify that the server works with a client cwd unrelated to the project.
    cwd: tmpdir(), stderr: 'pipe',
  });
  let stderr = ''; transport.stderr?.on('data', chunk => { stderr += String(chunk); });
  const client = new Client({ name: 'balatro-mcp-test', version: '1.0.0' });
  try { await client.connect(transport); }
  catch (error) { rpc.closeAllConnections(); rpc.close(); await rm(root, { recursive: true, force: true }); throw new Error(`${error}\n${stderr}`); }
  async function call(name: string, args: Data = {}) {
    return client.callTool({ name, arguments: args });
  }
  return { root, client, call, get mutations() { return mutations; }, get requests() { return requests; },
    holdNextObserve() {
      let release!: () => void;
      observeGate = new Promise<void>(resolve => { release = resolve; });
      const entered = new Promise<void>(resolve => { enteredObserve = resolve; });
      return {entered,release};
    },
    loseResponse() { loseResponse = true; },
    externalChange() { current = snapshot(77, 'BLIND_SELECT'); },
    finishRun(outcome: 'won' | 'lost') {
      current = { ...current, terminal: true, outcome, state: { ...current.state, state: outcome === 'won' ? 'ROUND_EVAL' : 'GAME_OVER' } };
      for (const operation of operations.values()) operation.observation = current;
    },
    async close() {
      await client.close(); rpc.closeAllConnections();
      await new Promise<void>(resolve => rpc.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
      assert.equal(stderr, '');
    },
  };
}

test('built stdio server exposes all tools, exact schemas, annotations and the guide from a different cwd', async () => {
  const h = await harness();
  try {
    const { tools } = await h.client.listTools();
    const instructions = h.client.getInstructions()!;
    assert.ok(instructions.length <= 800);
    assert.match(instructions, /balatro:\/\/skills/);
    assert.match(instructions, /balatro:\/\/protocol/);
    assert.match(instructions, /balatro:\/\/analysis/);
    assert.doesNotMatch(instructions, /## Phase policy/);
    assert.deepEqual(tools.map(tool => tool.name).sort(), ['game_observe', 'deck_observe', 'game_start', 'game_action', 'game_analyze', 'game_health', 'game_operation'].sort());
    for (const tool of tools) { assert.ok(tool.outputSchema); assert.ok(tool.annotations); assert.equal(tool.inputSchema.type, 'object'); }
    const action = tools.find(tool => tool.name === 'game_action')!;
    assert.match(JSON.stringify(action.inputSchema), /uniqueItems/);
    assert.equal(action.annotations?.readOnlyHint, false);
    assert.equal(tools.find(tool => tool.name === 'game_observe')?.annotations?.readOnlyHint, true);
    const analyze = tools.find(tool => tool.name === 'game_analyze')!;
    assert.equal(analyze.annotations?.readOnlyHint, true); assert.equal(analyze.annotations?.destructiveHint, false);
    assert.deepEqual(record(analyze.inputSchema).required, ['revision']);
    assert.match(JSON.stringify(analyze.inputSchema), /"maxItems":4/);
    const resources = await h.client.listResources(); assert.equal(resources.resources[0]?.uri, 'balatro://guide');
    assert.ok(resources.resources.some(resource => resource.uri === 'balatro://analysis'));
    const guide = await h.client.readResource({ uri: 'balatro://guide' }); assert.equal(record(guide.contents[0]).text, toolGuide);
    const analysis = await h.client.readResource({ uri: 'balatro://analysis' }); assert.equal(record(analysis.contents[0]).text, analysisGuide);
    const fullContext = await h.client.readResource({ uri:'balatro://context' });
    assert.ok(String(record(fullContext.contents[0]).text).includes((await readFile(resolve('model/context/balatro.md'),'utf8')).trim()));
    assert.doesNotMatch(instructions + String(record(fullContext.contents[0]).text) + String(record(guide.contents[0]).text), /memory_query|memory_record/);
    assert.deepEqual(await readdir(h.root), ['traces']);
    assert.equal(record((await h.call('game_health')).structuredContent).ok, true);
    const observed = record(record((await h.call('game_observe')).structuredContent).value);
    assert.equal(observed.rev, '1');
    assert.equal(observed.v,3);assert.equal(observed.full,true);assert.equal(observed.phase,'MENU');
    assert.deepEqual(observed.state,{});
    assert.doesNotMatch(JSON.stringify(observed), /King|Hearts/);
    assert.equal(record(record((await h.call('deck_observe')).structuredContent).value).remainingCards, 2);
    // This mod build predates analysis: the tool says so and leaves the game and the baseline alone.
    const analysed = await h.call('game_analyze', { revision: '1' });
    assert.equal(analysed.isError, true); assert.equal(record(analysed.structuredContent).code, 'incompatible_backend');
    assert.equal(record((await h.call('game_analyze', { revision: '9' })).structuredContent).code, 'stale_state');
    // Unimplemented focus values and malformed next queries are outside the schema.
    for (const args of [{ revision: '1', focus: 'engine' }, { revision: '1', next: { kind: 'hand' } }, { revision: '1', next: 'unknown' }, { revision: '1', lines: [[0]] }, { revision: '1', discards: [[0, 0]], next: 'pair' }]) {
      const invalid = await h.call('game_analyze', args);
      assert.equal(invalid.isError, true); assert.match(JSON.stringify(invalid.content), /Input validation error/);
    }
    const discardWithoutNext = await h.call('game_analyze', { revision: '1', discards: [[0]] });
    assert.equal(record(discardWithoutNext.structuredContent).code, 'invalid_arguments');
    const nextOnOldMod = await h.call('game_analyze', { revision: '1', discards: [[0]], next: 'pair' });
    assert.equal(record(nextOnOldMod.structuredContent).code, 'incompatible_backend');
    assert.equal(h.mutations, 0);
  } finally { await h.close(); }
});

test('stdio game tools start once, return a next revision, reject stale/invalid actions and serialize competing calls', async () => {
  const h = await harness();
  try {
    // A bare counter is only meaningful once this connection has issued it.
    const unissued = await h.call('game_action', { revision: '1', action: { method: 'select' } });
    assert.equal(record(unissued.structuredContent).code, 'stale_state'); assert.equal(h.mutations, 0);
    const start = await h.call('game_start', { deck: 'RED', stake: 'WHITE', seed: 'TEST' });
    assert.equal(start.isError, false);
    const revision = record(record(start.structuredContent).value).rev;
    assert.equal(record(record(start.structuredContent).value).full,true);
    assert.equal(revision, '2'); assert.equal(h.mutations, 1);
    const action = { method: 'select' };
    const results = await Promise.all([h.call('game_action', { revision, action }), h.call('game_action', { revision, action })]);
    assert.equal(results.filter(result => !result.isError).length, 1);
    const success=record(record(results.find(result=>!result.isError)?.structuredContent).value);
    assert.equal('details' in results.find(result => !result.isError)!, false);
    assert.equal('full' in success,false);assert.equal(success.rev,'3');assert.equal(success.phase,'BLIND_SELECT');
    assert.equal(typeof success.result,'string');
    for (const absent of ['actionId','baseRevision','runId','source']) assert.equal(absent in success,false,absent);
    const [traceFile] = await readdir(resolve(h.root,'traces'));
    const rows = (await readFile(resolve(h.root,'traces',traceFile!),'utf8')).trim().split('\n').map(line=>JSON.parse(line));
    const logged = rows.find(row=>row.data.name==='game_action' && row.data.result.isError===false);
    assert.equal(logged.data.details.value.contract,1);
    assert.equal(logged.data.details.value.state.state,'BLIND_SELECT');
    assert.equal(record(results.find(result => result.isError)?.structuredContent).code, 'stale_state');
    assert.equal(h.mutations, 2);
    for (const args of [
      { revision, action: { method: 'play', cards: [0, 0] } },
      { revision, action: { method: 'play', cards: [-1] } },
      { revision, action: { method: 'select', bogus: true } },
      { revision, action: { method: 'pack', skip: true } },
      { revision, action: { method: 'erase' } },
    ]) {
      // SDK versions may represent argument validation as a protocol error or tool error.
      try { assert.equal((await h.call('game_action', args)).isError, true); }
      catch (error) { assert.match(String(error), /valid|schema|argument|parameter/i); }
    }
    assert.equal(h.mutations, 2);
    h.externalChange();
    const stale = await h.call('game_action', { revision, action });
    assert.equal(record(stale.structuredContent).code, 'stale_state'); assert.equal(h.mutations, 2);
    assert.equal((await h.call('game_start', { deck: 'RED', stake: 'WHITE' })).isError, true);
  } finally { await h.close(); }
});

test('only issued short revisions allow actions; failures clear deltas and diagnostics never issue revisions', async () => {
  const h = await harness();
  try {
    h.externalChange();
    await h.call('game_health'); // Diagnostics never establish an observation baseline.
    await h.call('deck_observe');
    const requests = h.requests;
    for (const revision of ['77', 'mcp-test:77']) {
      const unissued = await h.call('game_action', { revision, action: { method: 'select' } });
      assert.equal(record(unissued.structuredContent).code, 'stale_state');
    }
    assert.equal(h.requests, requests); assert.equal(h.mutations, 0);
    const baseline = record(record((await h.call('game_observe')).structuredContent).value);
    const afterObserve = h.requests;
    const legacy = await h.call('game_action', { revision: 'mcp-test:77', action: { method: 'select' } });
    assert.equal(record(legacy.structuredContent).code, 'stale_state');
    assert.equal(h.requests, afterObserve); assert.equal(h.mutations, 0);
    // A rejected action clears the delta baseline, but the issued short revision remains usable.
    const first = await h.call('game_action',{revision:baseline.rev,action:{method:'select'}});
    const full = record(record(first.structuredContent).value);
    assert.equal(full.full,true);
    assert.equal(full.rev,'78');
    const second = await h.call('game_action',{revision:full.rev,action:{method:'select'}});
    const delta = record(record(second.structuredContent).value);
    assert.equal('full' in delta,false);
    assert.equal(delta.rev,'79');
    assert.deepEqual(JSON.parse(String(record(second.content[0]).text)),second.structuredContent);
    h.externalChange();
    const failed = await h.call('game_action',{revision:delta.rev,action:{method:'select'}});
    assert.equal(record(failed.structuredContent).code,'stale_state');
    await h.call('deck_observe'); // A different deck revision cannot move the observation baseline.
    const afterDeck = await h.call('game_action', { revision: '77', action: { method: 'select' } });
    assert.equal(record(afterDeck.structuredContent).code, 'stale_state');
    assert.equal(h.mutations, 2);
    const observed = record(record((await h.call('game_observe')).structuredContent).value);
    assert.equal(observed.full,true);
    assert.equal(record(observed.state).setup,'RED deck, WHITE stake');
    assert.doesNotMatch(JSON.stringify(observed), /King|Hearts/);
    const recovered = await h.call('game_action', { revision: observed.rev, action: { method: 'select' } });
    assert.equal(recovered.isError, false); assert.equal(h.mutations, 3);
  } finally { await h.close(); }
});

test('lost action reply remains uncertain and operation inspection never replays the mutation', async () => {
  const h = await harness();
  try {
    await h.call('game_observe'); h.loseResponse();
    const action = await h.call('game_start', { deck: 'RED', stake: 'WHITE' });
    assert.equal(action.isError, true); assert.equal(record(action.structuredContent).code, 'uncertain_outcome');
    assert.equal(record(action.structuredContent).applied, 'unknown'); assert.equal(h.mutations, 1);
    const operation = await h.call('game_operation');
    assert.equal(record(record(operation.structuredContent).value).status, 'completed'); assert.equal(h.mutations, 1);
    assert.equal('seed' in record(record(record(record(operation.structuredContent).value).observation).state), false);
    assert.doesNotMatch(String(record(operation.content[0]).text), /"seed"/);
    const observed = await h.call('game_observe');
    assert.equal(record(record(observed.structuredContent).value).rev, '2'); assert.equal(h.mutations, 1);
  } finally { await h.close(); }
});

test('terminal seeds are visible through observe and operation inspection after either outcome', async () => {
  const h = await harness();
  try {
    const started = await h.call('game_start', { deck: 'RED', stake: 'WHITE', seed: 'TEST' });
    assert.doesNotMatch(JSON.stringify(started.structuredContent), /seed TEST|"seed"/);
    for (const outcome of ['won', 'lost'] as const) {
      h.finishRun(outcome);
      const observed = record(record((await h.call('game_observe')).structuredContent).value);
      assert.equal(observed.outcome, outcome);
      assert.equal(record(observed.state).setup, 'RED deck, WHITE stake, seed TEST');
      const operation = record(record((await h.call('game_operation')).structuredContent).value);
      assert.equal(record(record(operation.observation).state).seed, 'TEST');
      assert.equal(h.mutations, 1);
    }
  } finally { await h.close(); }
});

test('stdio cancellation during preflight reaches the backend and prevents dispatch', async () => {
  const h = await harness();
  const observed = record(record((await h.call('game_observe')).structuredContent).value);
  const gate = h.holdNextObserve();
  try {
    const controller = new AbortController();
    const pending = h.client.callTool({name:'game_action',arguments:{revision:observed.rev,action:{method:'start',deck:'RED',stake:'WHITE'}}},{signal:controller.signal});
    const rejected = assert.rejects(pending);
    await gate.entered; controller.abort(); await rejected;
    // The queued read waits for the cancelled action handler to finish.
    const settled = h.call('game_health');
    gate.release(); await settled;
    assert.equal(h.mutations,0);
    assert.equal(record(record((await h.call('game_observe')).structuredContent).value).rev,'1');
  } finally { gate.release(); await h.close(); }
});

test('MCP startup and guide access work with the game offline; game errors retain structured failure flags', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'balatro-offline-'));
  const client = new Client({ name: 'offline-test', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [resolve('dist/src/index.js'), '--data-dir', root, '--endpoint', 'http://127.0.0.1:1', '--timeout-ms', '50'], stderr: 'pipe' });
  try {
    await client.connect(transport);
    assert.equal((await client.listTools()).tools.length, 7);
    const result = await client.callTool({ name: 'game_observe', arguments: {} });
    assert.equal(result.isError, true); assert.equal(record(result.structuredContent).code, 'backend_failure');
    assert.equal(record(result.structuredContent).applied, false);
    const noAction = await client.callTool({ name: 'game_operation', arguments: {} });
    assert.equal(record(noAction.structuredContent).code, 'invalid_arguments');
    const guide = await client.readResource({ uri: 'balatro://guide' });
    assert.ok(guide.contents.length);
    await assert.rejects(lstat(resolve(root, 'workspace')), /ENOENT/);
  } finally { await client.close(); await rm(root, { recursive: true, force: true }); }
});
