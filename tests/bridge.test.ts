import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type ServerResponse } from 'node:http';
import { ForgeBridgeBackend } from '../play/client.ts';
import { BackendError, type Data } from '../env/contract.ts';

const scoringSnapshot = {status:'ready',selectionLimit:5,state:{
  hand:[{key:'S_A',ability:{set:'Default'},base:{value:'Ace',suit:'Spades'}}],deck:[],discard:[],passiveEffectsApplied:true,
  jokers:[],consumables:[],back:'b_red',backConfig:{},blind:{key:'bl_small',disabled:false},jokerSlots:5,handSize:8,
  hands:{'High Card':{level:1,chips:5,mult:1,played:0,played_this_round:0}},
  game:{dollars:0,bankrupt_at:0,chips:0,round:1,hands_played:0,skips:0,
    current_round:{hands_left:4,discards_left:3,hands_played:0,discards_used:0,most_played_poker_hand:'High Card',current_hand:{}},round_resets:{ante:1},
    probabilities:{normal:1},used_vouchers:{},modifiers:{},starting_params:{},cards_played:{}},
}};

async function server(handler: (request: Data,response: ServerResponse) => void) {
  const requests: Data[] = [];
  const http = createServer(async (incoming,response) => {
    let text=''; for await (const chunk of incoming) text += chunk;
    const request=JSON.parse(text) as Data; requests.push(request); handler(request,response);
  });
  await new Promise<void>(resolve => http.listen(0,'127.0.0.1',resolve));
  const address=http.address(); assert.ok(address && typeof address === 'object');
  return {endpoint:`http://127.0.0.1:${address.port}`,requests,close:async () => {http.closeAllConnections(); await new Promise<void>(resolve => http.close(() => resolve()));}};
}
const health={status:'ok',bridge:'balatro_mcp_mod',protocol:1,instanceId:'instance-a',gameVersion:'1.0.1o-FULL',preservesTiming:true,capabilities:['observe','deck_observe','act','operation']};
const observation=(revision='instance-a:1',state='MENU') => ({contract:1,backend:'balatro_mcp_mod',revision,runId:'run-1',gameVersion:'1.0.1o',ready:true,terminal:false,outcome:'ongoing',state:{state},availableMethods:state==='MENU'?['start']:['select'],legality:'backend-authoritative'});
function result(response: ServerResponse,request: Data,value: unknown) {response.end(JSON.stringify({jsonrpc:'2.0',id:request.id,result:value}));}
function failure(response: ServerResponse,request: Data,code: string) {response.end(JSON.stringify({jsonrpc:'2.0',id:request.id,error:{code:-32000,message:code,data:{code,applied:false}}}));}
const action={method:'start' as const,deck:'RED' as const,stake:'WHITE' as const};

test('bridge reads and inspections omit plays and internal snapshots without scoring or extra reads',async () => {
  let revision='instance-a:1';
  const raw=() => ({...observation(revision,'SELECTING_HAND'),state:{state:'SELECTING_HAND',scoringSnapshot,
    plays:['legacy shadow score'],seed:'HIDDEN_SEED'}});
  const mock=await server((req,res) => result(res,req,req.method==='sf.health'?{...health,capabilities:['scoring_snapshot']}:
    req.method==='sf.operation'?{actionId:'a1',status:'completed',applied:true,observation:raw()}:raw()));
  const client=new ForgeBridgeBackend(mock.endpoint,1000);
  try {
    for(let i=0;i<2;i++) {
      const current=await client.observe();
      assert.equal('plays' in current.state,false);
      assert.equal(current.state.scoringSnapshot,undefined);
      assert.doesNotMatch(JSON.stringify(current),/plays|passiveEffectsApplied|legacy shadow/);
    }
    const inspected=await client.inspectOperation('a1');
    assert.doesNotMatch(JSON.stringify(inspected),/plays|scoringSnapshot|passiveEffectsApplied|legacy shadow/);
    revision='instance-a:2'; await client.observe();
    assert.deepEqual(mock.requests.map(r => r.method),['sf.health','sf.observe','sf.observe','sf.health','sf.operation','sf.observe']);
  } finally {await client.close();await mock.close();}
});

test('completed actions omit plays without scoring or extra reads',async () => {
  let mutations=0,revision='instance-a:1';
  const raw=() => ({...observation(revision,'SELECTING_HAND'),availableMethods:['play'],state:{state:'SELECTING_HAND',scoringSnapshot,plays:['legacy shadow score']}});
  const mock=await server((req,res) => {
    if(req.method==='sf.health') return result(res,req,{...health,capabilities:['scoring_snapshot']});
    if(req.method==='sf.act') {
      mutations++;revision='instance-a:'+(mutations+1);
      return result(res,req,{actionId:(req.params as Data).actionId,status:'completed',applied:true,observation:raw()});
    }
    result(res,req,raw());
  });
  const client=new ForgeBridgeBackend(mock.endpoint,1000);
  try {
    const first=await client.act({method:'play',cards:[0]},revision);
    assert.equal(first.revision,'instance-a:2');assert.ok(first.actionId);
    assert.equal('plays' in first.state,false);
    assert.equal('scoringSnapshot' in first.state,false);
    await client.act({method:'play',cards:[0]},first.revision);
    assert.equal(mutations,2);
    assert.deepEqual(mock.requests.map(r => r.method),['sf.health','sf.observe','sf.act','sf.observe','sf.act']);
  } finally {await client.close();await mock.close();}
});

test('deck observation is read-only and rejects malformed or inconsistent deck responses',async () => {
  const deck={revision:'instance-a:1',runId:'run-1',remainingCards:2,previewCards:3,uncertainCards:1,
    cards:[{rank:'Ace',suit:'Hearts',enhancement:'m_steel',edition:'foil',seal:'Red',count:3}]};
  let value: unknown=deck;
  const mock=await server((req,res) => result(res,req,req.method==='sf.health'?health:value));
  try {
    const client=new ForgeBridgeBackend(mock.endpoint,1000);
    assert.deepEqual(await client.observeDeck(),deck);
    for (const malformed of [{...deck,revision:'foreign:1'},{...deck,previewCards:4},{...deck,uncertainCards:4},
      {...deck,remainingCards:4},{...deck,cards:[{...deck.cards[0],id:'HIDDEN_CARD'}]}]) {
      value=malformed; await assert.rejects(client.observeDeck(),/Invalid bridge deck/);
    }
    assert.ok(mock.requests.every(req => req.method==='sf.health' || req.method==='sf.deck_observe'));
  } finally {await mock.close();}
});
test('standalone client submits one action then polls its correlated completion',async () => {
  let calls=0, polls=0, id='';
  const mock=await server((req,res) => {
    if(req.method==='sf.health') result(res,req,health);
    else if(req.method==='sf.observe') result(res,req,observation());
    else if(req.method==='sf.act') {calls++; id=String((req.params as Data).actionId); result(res,req,{actionId:id,status:'pending',applied:true});}
    else {polls++; result(res,req,{actionId:id,status:'completed',applied:true,observation:observation('instance-a:2','BLIND_SELECT')});}
  });
  try {const client=new ForgeBridgeBackend(mock.endpoint,1000); const before=await client.observe(); const after=await client.act(action,before.revision);
    assert.equal(calls,1); assert.equal(polls,1); assert.equal(after.state.state,'BLIND_SELECT'); assert.equal(after.revision,'instance-a:2');
    const sent=mock.requests.find(v=>v.method==='sf.act')?.params as Data; assert.equal(sent.instanceId,'instance-a'); assert.equal(sent.revision,before.revision);
  } finally {await mock.close();}
});
test('deck_observe reports an outdated installed mod before attempting the unsupported RPC',async () => {
  const mock=await server((req,res) => result(res,req,{...health,capabilities:['observe','act','operation']}));
  try {
    await assert.rejects(new ForgeBridgeBackend(mock.endpoint,1000).observeDeck(),error => error instanceof BackendError && error.code==='incompatible_backend' && /restart Balatro/.test(error.message));
    assert.equal(mock.requests.length,1); assert.equal(mock.requests[0]?.method,'sf.health');
  } finally {await mock.close();}
});
test('concurrent preflight observations still permit only one action dispatch',async () => {
  let mutations=0;
  const mock=await server((req,res)=>{
    if(req.method==='sf.health') result(res,req,health);
    else if(req.method==='sf.observe') result(res,req,observation());
    else {
      mutations++;
      setTimeout(()=>result(res,req,{actionId:(req.params as Data).actionId,status:'completed',applied:true,observation:observation('instance-a:2','BLIND_SELECT')}),20);
    }
  });
  try {
    const client=new ForgeBridgeBackend(mock.endpoint,1000); const revision=(await client.observe()).revision;
    const results=await Promise.allSettled([client.act(action,revision),client.act(action,revision)]);
    assert.equal(results.filter(value=>value.status==='fulfilled').length,1);
    assert.equal(mutations,1);
  } finally {await mock.close();}
});
test('server-side stale rejection is propagated without poisoning the session',async () => {
  let reject=true;
  const mock=await server((req,res)=>{
    if(req.method==='sf.health') result(res,req,health); else if(req.method==='sf.observe') result(res,req,observation());
    else if(reject) failure(res,req,'stale_state'); else result(res,req,{actionId:(req.params as Data).actionId,status:'completed',applied:true,observation:observation('instance-a:2')});
  });
  try {const client=new ForgeBridgeBackend(mock.endpoint,1000); const before=await client.observe();
    await assert.rejects(client.act(action,before.revision),(e:unknown)=>e instanceof BackendError && e.code==='stale_state' && e.applied===false);
    reject=false; await client.act(action,before.revision);
  } finally {await mock.close();}
});
test('lost dispatch response blocks resubmission but preserves operation inspection',async () => {
  let mutations=0;
  const mock=await server((req,res)=>{
    if(req.method==='sf.health') result(res,req,health); else if(req.method==='sf.observe') result(res,req,observation());
    else if(req.method==='sf.act') {mutations++;} else result(res,req,{actionId:(req.params as Data).actionId,status:'pending',applied:true});
  });
  try {const client=new ForgeBridgeBackend(mock.endpoint,100); const before=await client.observe();
    await assert.rejects(client.act(action,before.revision),(e:unknown)=>e instanceof BackendError && e.code==='uncertain_outcome' && e.applied==='unknown');
    await assert.rejects(client.act(action,before.revision),/unresolved/); assert.equal((await client.inspectOperation()).status,'pending'); assert.equal(mutations,1);
  } finally {await mock.close();}
});
test('pending operation obeys one overall deadline and never repeats mutation',async () => {
  let mutations=0;
  const mock=await server((req,res)=>{
    if(req.method==='sf.health') result(res,req,health); else if(req.method==='sf.observe') result(res,req,observation());
    else {if(req.method==='sf.act') mutations++; result(res,req,{actionId:(req.params as Data).actionId,status:'pending',applied:true});}
  });
  try {const client=new ForgeBridgeBackend(mock.endpoint,100); const before=await client.observe();
    await assert.rejects(client.act(action,before.revision),(e:unknown)=>e instanceof BackendError && e.code==='uncertain_outcome'); assert.equal(mutations,1);
  } finally {await mock.close();}
});
test('observation verifies a late correlated completion before allowing a fresh action',async () => {
  let mutations=0, completed=false, id='';
  const controller=new AbortController();
  const mock=await server((req,res)=>{
    if(req.method==='sf.health') result(res,req,health);
    else if(req.method==='sf.observe') result(res,req,observation(completed?'instance-a:2':'instance-a:1',completed?'BLIND_SELECT':'MENU'));
    else {
      if(req.method==='sf.act') {mutations++; id=String((req.params as Data).actionId);}
      // Cancel only after the client has received the pending action and started polling.
      if(req.method==='sf.operation' && !completed) {controller.abort(); return;}
      result(res,req,{actionId:id,status:completed?'completed':'pending',applied:true,
        ...(completed?{observation:observation('instance-a:2','BLIND_SELECT')}:{})});
    }
  });
  try {
    const client=new ForgeBridgeBackend(mock.endpoint,1000);
    await assert.rejects(client.act(action,(await client.observe()).revision,{signal:controller.signal}),error => error instanceof BackendError && error.code==='uncertain_outcome' && error.applied===true);
    assert.equal(mutations,1);
    completed=true; const fresh=await client.observe();
    await assert.rejects(client.act(action,'instance-a:1'),/State changed/);
    await client.act({method:'select'},fresh.revision); assert.equal(mutations,2);
  } finally {await mock.close();}
});
test('a bridge restart clears an unresolved client lock and requires a new revision without replaying the old action',async () => {
  let instance='instance-a', mutations=0;
  const mock=await server((req,res)=>{
    if(req.method==='sf.health') result(res,req,{...health,instanceId:instance});
    else if(req.method==='sf.observe') result(res,req,observation(instance+':1'));
    else if(req.method==='sf.act') {
      mutations++;
      if(instance==='instance-b') result(res,req,{actionId:(req.params as Data).actionId,status:'completed',applied:true,observation:observation('instance-b:2','BLIND_SELECT')});
    } else result(res,req,{actionId:(req.params as Data).actionId,status:'pending',applied:true});
  });
  try {
    const client=new ForgeBridgeBackend(mock.endpoint,100); const before=await client.observe();
    await assert.rejects(client.act(action,before.revision),/may have been dispatched/);
    instance='instance-b'; const fresh=await client.observe();
    assert.equal(client.lastActionId,undefined); assert.equal(mutations,1);
    await assert.rejects(client.act(action,before.revision),/State changed/);
    await client.act(action,fresh.revision); assert.equal(mutations,2);
  } finally {await mock.close();}
});
test('wrong implementation and incompatible build block actions; a restarted bridge reconnects',async () => {
  let value:unknown=health;
  const mock=await server((req,res)=>result(res,req,req.method==='sf.health'?value:observation((value as Data).instanceId + ':1')));
  try {const client=new ForgeBridgeBackend(mock.endpoint,1000); await client.observe();
    value={...health,instanceId:'other'}; assert.equal((await client.observe()).revision,'other:1');
    await assert.rejects(client.act(action,'instance-a:1'),/State changed/);
    value={status:'ok'}; await assert.rejects(new ForgeBridgeBackend(mock.endpoint).observe(),/standalone/);
    value={...health,gameVersion:'BAD'}; await assert.rejects(new ForgeBridgeBackend(mock.endpoint).observe(),/version/);
    assert.ok(mock.requests.every(v=>['sf.health','sf.observe'].includes(String(v.method))));
  } finally {await mock.close();}
});
test('malformed, mismatched and foreign completed results cannot be accepted',async () => {
  for (const mode of ['rpc-id','action-id','observation']) {
    const mock=await server((req,res)=>{
      if(req.method==='sf.health') result(res,req,health); else if(req.method==='sf.observe') result(res,req,observation());
      else if(mode==='rpc-id') result(res,{...req,id:-1},{});
      else result(res,req,{actionId:mode==='action-id'?'WRONG':(req.params as Data).actionId,status:'completed',applied:true,observation:observation('foreign:2')});
    });
    try {const client=new ForgeBridgeBackend(mock.endpoint,1000); await assert.rejects(client.act(action,(await client.observe()).revision),(e:unknown)=>e instanceof BackendError && e.code==='uncertain_outcome');}
    finally {await mock.close();}
  }
});
test('client filters hidden identities, rejects unknown actions and restricts endpoints',async () => {
  const mock=await server((req,res)=>result(res,req,req.method==='sf.health'?health:{...observation(),state:{state:'MENU',hand:{cards:[{id:1,key:'SECRET',state:{hidden:true,forced:true},value:{rank:'K'}}]}}}));
  try {const client=new ForgeBridgeBackend(mock.endpoint); const before=await client.observe(); assert.doesNotMatch(JSON.stringify(before),/SECRET|rank/); assert.match(JSON.stringify(before),/forced/);
    await assert.rejects(client.act({method:'set'} as never,before.revision),/schema/);
    for(const url of ['https://example.com','http://user:password@localhost','http://127.0.0.1/path','http://127.0.0.1/#fragment']) assert.throws(()=>new ForgeBridgeBackend(url));
  } finally {await mock.close();}
});

test('pre-cancelled actions dispatch neither health nor game requests', async () => {
  const mock = await server((req,res) => result(res,req,health));
  try {
    const controller = new AbortController(); controller.abort();
    const client = new ForgeBridgeBackend(mock.endpoint,1000);
    await assert.rejects(client.act(action,'instance-a:1',{signal:controller.signal}), e => e instanceof BackendError && e.code === 'cancelled' && e.applied === false);
    assert.equal(mock.requests.length,0); assert.equal(client.lastActionId,undefined);
  } finally { await mock.close(); }
});

test('cancellation during either preflight RPC never dispatches sf.act', async () => {
  for (const target of ['sf.health','sf.observe']) {
    const controller = new AbortController();
    const mock = await server((req,res) => {
      if (req.method === target) { controller.abort(); return; }
      result(res,req,req.method === 'sf.health' ? health : observation());
    });
    try {
      const client = new ForgeBridgeBackend(mock.endpoint,1000);
      await assert.rejects(client.act(action,'instance-a:1',{signal:controller.signal}), e => e instanceof BackendError && e.code === 'cancelled' && e.applied === false);
      assert.equal(mock.requests.some(req => req.method === 'sf.act'),false);
      assert.equal(client.lastActionId,undefined);
    } finally { await mock.close(); }
  }
});

test('one overall action budget includes all preflight RPCs', async () => {
  const mock = await server((req,res) => {
    if (req.method === 'sf.act') return result(res,req,{actionId:(req.params as Data).actionId,status:'completed',applied:true,observation:observation('instance-a:2')});
    setTimeout(() => result(res,req,req.method === 'sf.health' ? health : observation()),80);
  });
  try {
    const client = new ForgeBridgeBackend(mock.endpoint,120);
    await assert.rejects(client.act(action,'instance-a:1'), e => e instanceof BackendError && e.code === 'timeout' && e.applied === false);
    assert.equal(mock.requests.some(req => req.method === 'sf.act'),false);
    assert.equal(client.lastActionId,undefined);
  } finally { await mock.close(); }
});

test('a caller deadline is shared across observation and action instead of resetting', async () => {
  const mock = await server((req,res) => {
    setTimeout(() => result(res,req,req.method === 'sf.health' ? health : observation()),40);
  });
  try {
    const client = new ForgeBridgeBackend(mock.endpoint,1000), context = {deadline:performance.now() + 100};
    const before = await client.observe(context);
    await assert.rejects(client.act(action,before.revision,context), e => e instanceof BackendError && e.code === 'timeout' && e.applied === false);
    assert.equal(mock.requests.some(req => req.method === 'sf.act'),false);
  } finally { await mock.close(); }
});

test('cancelling after dispatch preserves uncertainty, operation inspection and the mutation lock', async () => {
  const controller = new AbortController(); let mutations = 0;
  const mock = await server((req,res) => {
    if (req.method === 'sf.health') return result(res,req,health);
    if (req.method === 'sf.observe') return result(res,req,observation());
    if (req.method === 'sf.act') { mutations++; setTimeout(() => controller.abort(),10); }
    result(res,req,{actionId:(req.params as Data).actionId,status:'pending',applied:true});
  });
  try {
    const client = new ForgeBridgeBackend(mock.endpoint,1000);
    await assert.rejects(client.act(action,'instance-a:1',{signal:controller.signal}), e => e instanceof BackendError && e.code === 'uncertain_outcome' && e.applied === true);
    assert.ok(client.lastActionId);
    assert.equal((await client.inspectOperation()).status,'pending');
    await assert.rejects(client.act(action,'instance-a:1'),/unresolved/);
    assert.equal(mutations,1);
  } finally { await mock.close(); }
});

test('an immediate action uses one preflight snapshot and one dispatch', async () => {
  const mock = await server((req,res) => result(res,req,req.method === 'sf.health' ? health : req.method === 'sf.observe' ? observation() : {actionId:(req.params as Data).actionId,status:'completed',applied:true,observation:observation('instance-a:2')}));
  try {
    await new ForgeBridgeBackend(mock.endpoint,1000).act(action,'instance-a:1');
    assert.deepEqual(mock.requests.map(req => req.method),['sf.health','sf.observe','sf.act']);
  } finally { await mock.close(); }
});

test('health runs once per bridge instance; later reads and actions skip it until the instance changes', async () => {
  let instance = 'instance-a', counter = 1;
  const mock = await server((req,res) => result(res,req,req.method === 'sf.health' ? {...health,instanceId:instance} : req.method === 'sf.observe' ? observation(instance + ':' + counter)
    : {actionId:(req.params as Data).actionId,status:'completed',applied:true,observation:observation(instance + ':' + ++counter)}));
  try {
    const client = new ForgeBridgeBackend(mock.endpoint,1000);
    await client.act(action,(await client.observe()).revision);
    await client.act(action,'instance-a:2');
    assert.deepEqual(mock.requests.map(req => req.method),['sf.health','sf.observe','sf.observe','sf.act','sf.observe','sf.act']);
    mock.requests.length = 0; instance = 'instance-b';
    assert.equal((await client.observe()).revision,'instance-b:3');
    assert.deepEqual(mock.requests.map(req => req.method),['sf.observe','sf.health']);
  } finally { await mock.close(); }
});
