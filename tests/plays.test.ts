import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { projectRoot } from '../src/config.ts';
import { ScoringSandbox, LiveScoreStateSchema, type ScoreResult } from '../env/sandbox/index.ts';
import { playSelections, sandboxPlays, ScoringSnapshotSchema, type PlaysWorker, type ScoringSnapshot } from '../play/plays.ts';
import { ForgeBridgeBackend } from '../play/client.ts';

const lua = process.env.LUAJIT ?? 'luajit';
const source = process.env.BALATRO_SANDBOX_SOURCE ?? resolve(projectRoot, 'env/sandbox/vendor');
const skip = !existsSync(resolve(source, 'globals.lua')) ? 'Local original source required' :
  spawnSync(lua, ['-v']).status !== 0 ? 'LuaJIT required' : false;
const input: ScoringSnapshot = { status: 'ready', selectionLimit: 5, state: { hand: ['S_K','H_K','D_A'] } };
function result(score = 60): Extract<ScoreResult, { status: 'ok' }> {
  return { status: 'ok', version: '1.0.1o-FULL', hand: 'Pair', displayHand: 'Pair', chips: 30, mult: 2,
    score, scoringCards: [0,1], notAllowed: false, random: false, randomPolicy: 'fixed', seed: 'SANDBOX' };
}

test('lazy combinations cover every selection once, including forced cards and large hands', () => {
  for (const [n, count] of [[5,31],[8,218],[10,637],[12,1585]]) {
    const selections = [...playSelections(n!,5)];
    assert.equal(selections.length, count);
    assert.equal(new Set(selections.map(s => s.join(','))).size, count);
    assert.ok(selections.every(s => s.every((i,k) => k === 0 || i > s[k-1]!)));
  }
  for (const forced of [[0],[3],[0,2],[2,4],[0,1,2,3,4]]) {
    const expected = [...playSelections(8,5)].filter(s => forced.every(i => s.includes(i)));
    assert.deepEqual([...playSelections(8,5,forced)], expected);
  }
  assert.equal([...playSelections(8,2,[0,1,2])].length,0);
  assert.deepEqual(playSelections(52,5).next().value,[0,1,2,3,4]);
});

test('advice retains the best selection per hand, prefers fewer cards, and always closes', async () => {
  const seen: number[][] = []; let closed = false;
  const worker: PlaysWorker = {
    load: async state => { assert.equal(state.random,'fixed'); return {status:'ready'}; },
    scoreBatch: async plays => { seen.push(...plays); return plays.map(s => result(s.length === 1 ? 60 : 40)); },
    close: async () => { closed = true; },
  };
  assert.deepEqual(await sandboxPlays(input,{},() => worker), ['0: Pair 60']);
  assert.equal(seen.length,7); assert.equal(closed,true);
  const bad: PlaysWorker = { ...worker, scoreBatch: async () => { throw new Error('worker failed'); } };
  closed = false;
  await assert.rejects(sandboxPlays(input,{},() => bad),/worker failed/);
  assert.equal(closed,true);
  assert.deepEqual(await sandboxPlays(input,{},() => ({ ...worker, scoreBatch: async () => [{status:'unsupported',message:'DNA'}] })),['unavailable: DNA']);
});

test('bounded advice explicitly reports truncation without allocating all combinations', async () => {
  let now = 0;
  const worker: PlaysWorker = { load: async () => ({status:'ready'}), close: async () => {},
    scoreBatch: async plays => { now=100; return plays.map(() => result()); } };
  const lines = await sandboxPlays({status:'ready',selectionLimit:5,state:{hand:Array(52).fill('S_K')}},{},() => worker,50,() => now);
  assert.equal(lines.at(-1),'truncated: scored 32 of 2893163 selections');
});

test('live snapshot export round-trips original scores without applying passive effects twice', { skip }, async () => {
  const fixtures = JSON.parse(execFileSync(lua,['tests/score-snapshot-original.lua',source],{cwd:projectRoot,encoding:'utf8'})) as
    { snapshot: unknown; plays: number[][]; expected: ScoreResult[] }[];
  const sandbox = new ScoringSandbox({lua,sourceDir:source});
  try {
    for (const fixture of fixtures) {
      const snapshot = ScoringSnapshotSchema.parse(fixture.snapshot);
      assert.equal(snapshot.status,'ready');
      if (snapshot.status !== 'ready') continue;
      assert.equal(snapshot.state.passiveEffectsApplied,true);
      assert.equal(LiveScoreStateSchema.safeParse(snapshot.state).success,true);
      assert.equal(snapshot.state.game?.pseudorandom,undefined);
      assert.deepEqual(await sandbox.load(snapshot.state),{status:'ready'});
      assert.deepEqual(await sandbox.scoreBatch(fixture.plays),fixture.expected);
    }
  } finally { await sandbox.close(); }
});

test('automatic plays run through original sandbox scoring and preserve unsupported boundaries', { skip }, async () => {
  assert.deepEqual(await sandboxPlays(input,{lua,sourceDir:source}),['0 1: Pair 60','2: High Card 16']);
  const forced: ScoringSnapshot = {status:'ready',selectionLimit:1,state:{hand:[{key:'S_K',ability:{forced_selection:true}},'D_A']}};
  assert.deepEqual(await sandboxPlays(forced,{lua,sourceDir:source}),['0: High Card 15']);
  const dna: ScoringSnapshot = {status:'ready',selectionLimit:5,state:{hand:['S_A'],jokers:['j_dna']}};
  assert.match((await sandboxPlays(dna,{lua,sourceDir:source}))[0]!,/^unavailable: Card creation/);
});

test('HTTP observation reaches the real worker and returns only sandbox recommendations', { skip }, async () => {
  const [fixture] = JSON.parse(execFileSync(lua,['tests/score-snapshot-original.lua',source],{cwd:projectRoot,encoding:'utf8'}));
  const requests: string[] = [];
  const http = createServer(async (request,response) => {
    let body='';for await(const chunk of request) body+=chunk;
    const rpc=JSON.parse(body);requests.push(rpc.method);
    const value=rpc.method==='sf.health'?{status:'ok',bridge:'balatro_mcp_mod',protocol:1,instanceId:'test',
      gameVersion:'1.0.1o-FULL',preservesTiming:true,capabilities:['scoring_snapshot']}:
      {contract:1,backend:'balatro_mcp_mod',revision:'test:1',runId:'test:run:1',gameVersion:'1.0.1o',
        ready:true,terminal:false,outcome:'ongoing',legality:'backend-authoritative',availableMethods:['play'],
        state:{state:'SELECTING_HAND',scoringSnapshot:fixture.snapshot}};
    response.end(JSON.stringify({jsonrpc:'2.0',id:rpc.id,result:value}));
  });
  await new Promise<void>(accept => http.listen(0,'127.0.0.1',accept));
  const address=http.address();assert.ok(address && typeof address==='object');
  const backend=new ForgeBridgeBackend(`http://127.0.0.1:${address.port}`,5000,'1.0.1o',
    options => new ScoringSandbox({...options,lua,sourceDir:source}));
  try {
    const observation=await backend.observe();
    assert.deepEqual(observation.state.plays,['0 1: Pair 210','2: High Card 96']);
    assert.doesNotMatch(JSON.stringify(observation),/scoringSnapshot|passiveEffectsApplied|pseudorandom/);
    assert.deepEqual(requests,['sf.health','sf.observe','sf.observe']);
  } finally {
    await backend.close();http.closeAllConnections();
    await new Promise<void>(accept => http.close(() => accept()));
  }
});
