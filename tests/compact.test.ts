import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactActionObservation, compactObservation, compactState } from '../env/compact.ts';
import { playerState, record, type Data, type Observation } from '../env/contract.ts';

const card = (over: Data = {}): Data => ({
  index: 0, id: '1', key: 'c_base', label: 'Default Base', set: 'Default',
  value: { rank: 'Ace', suit: 'Hearts', effect: '+11  chips   Ace of  Hearts ' },
  modifier: { enhancement: 'c_base' }, cost: { buy: 1, sell: 1 },
  state: { debuff: false, forced: false, hidden: false, highlight: false }, target: { aura: false }, canSell: false, ...over,
});
const observation = (raw: Data): Observation => ({
  contract: 1, backend: 'balatro_mcp_mod', revision: 'i:7', runId: 'run-1', gameVersion: '1.0.1o',
  terminal: false, ready: true, outcome: 'ongoing', legality: 'backend-authoritative',
  availableMethods: ['play','discard'], state: playerState(raw),
});
const area = (state: Data, name: string): { count: number; limit?: number; highlighted_limit?: number; cards?: string[] } =>
  record(state[name]) as { count: number; limit?: number; highlighted_limit?: number; cards?: string[] };

test('compact observations keep every decision input and shed repeated card decoration',() => {
  const source = observation({ state: 'SELECTING_HAND', ante_num: 2, round_num: 2, money: 7, deck: 'RED', stake: 'GOLD',
    remainingCards: 44, blind: { name: 'Small Blind', chips: 300 },
    blinds: { Small: { key: 'bl_small', name: 'Small Blind', mult: 1, status: 'Current' },
      Big: { key: 'bl_big', name: 'Big Blind', mult: 1.5, status: 'Upcoming' },
      Boss: { key: 'bl_club', name: 'The Club', mult: 2, status: 'Upcoming' } },
    round: { chips: 46, hands_left: 1, discards_left: 4, reroll_cost: 5 },
    hand: { count: 3, limit: 8, highlighted_limit: 5, cards: [
      card(),
      card({ index: 1, id: '2', key: 'H_Steel', value: { rank: 'King', suit: 'Spades', effect: '' }, modifier: { enhancement: 'm_steel', edition: 'FOIL' }, cost: { buy: 2, sell: 3 }, state: { debuff: false, forced: true, hidden: false, highlight: true }, target: { aura: true }, canSell: true }),
      card({ index: 2, id: '3', state: { hidden: true, forced: false, highlight: false } })] },
    jokers: { count: 0, limit: 5, highlighted_limit: 1, cards: [] } });
  const compact = compactObservation(source);
  const state = compact["state"] as Data;

  assert.equal(compact["revision"],'i:7');
  assert.equal(state["state"],'SELECTING_HAND');
  assert.deepEqual(compact["availableMethods"],['play','discard']);
  assert.equal(state["ante_num"],2);
  assert.equal(state["money"],7);
  assert.equal(state["remainingCards"],44);
  assert.deepEqual(state["blind"],source.state.blind);
  assert.deepEqual(state["blinds"],source.state.blinds);
  assert.deepEqual(state["round"],{ chips: 46,hands_left: 1,discards_left: 4,reroll_cost: 5 });

  const hand = area(state,'hand'), jokers = area(state,'jokers');
  assert.equal(hand.count,3);
  assert.equal(hand.limit,8);
  assert.equal(hand.highlighted_limit,5);
  assert.equal(jokers.highlighted_limit,1);
  assert.equal(jokers.cards,undefined);
  const cards = hand.cards!;
  assert.equal(cards[0],'0: AH');
  assert.equal(cards[1],'1: KS; [m_steel,edition=FOIL,forced,highlight]; sell=$3; sellable; aura target required');
  assert.equal(cards[2],'2: hidden');
});

test('compact observations stay stable and about a third of their raw size',() => {
  const many = Array.from({ length: 8 },(_, index) => card({ index,id: String(index + 1),value: { rank: '10',suit: 'Clubs',effect: '+10  chips   10 of  Clubs ' } }));
  const source = observation({ state: 'SELECTING_HAND', ante_num: 1, money: 4, hand: { count: 8,limit: 8,highlighted_limit: 5,cards: many } });
  const compact = compactObservation(source);
  const raw = Buffer.byteLength(JSON.stringify(source)), shrunk = Buffer.byteLength(JSON.stringify(compact));
  assert.ok(shrunk < raw * 0.45,`expected under 45% of ${raw} bytes, got ${shrunk}`);
  const rawCards = (source.state["hand"] as Data)["cards"] as unknown[];
  assert.equal(rawCards.length,8);
  assert.equal(rawCards.length,area(compact["state"] as Data,'hand').cards!.length);
});

test('not-ready and uncertain-outcome fields survive compaction',() => {
  const compact = compactObservation({ ...observation({ state: 'BLIND_SELECT' }),ready: false,notReadyReason: 'Waiting for queued game events',actionId: 'action-9' });
  assert.equal(compact["ready"],false);
  assert.equal(compact["notReadyReason"],'Waiting for queued game events');
  assert.equal(compact["actionId"],'action-9');
});

test('pack decisions retain hand levels, blind restrictions and explicit target limits',() => {
  const source = observation({ state: 'PACK',packChoices: 1,
    hands: { Pair: { level: 4,chips: 55,mult: 5,played: 6 } },
    blind: { name: 'The Psychic',chips: 10000,blockPlay: true,disabled: false },
    blinds: { Boss: { key: 'bl_psychic',name: 'The Psychic',status: 'Upcoming',mult: 2 } },
    pack: { cards: [card({ key: 'c_strength',label: 'Strength',set: 'Tarot',value: { effect: 'Raise ranks' },target: { min: 1,max: 2,aura: false } })] } });
  const compact = compactObservation(source);
  const state = record(compact.state);
  assert.deepEqual(state.hands,{Pair:'Lv4; chips=55; mult=5; played=6'});
  assert.deepEqual(state.blind,source.state.blind);
  assert.deepEqual(state.blinds,source.state.blinds);
  assert.match(area(state,'pack').cards![0]!,/Strength \/ c_strength \/ Tarot; Raise ranks/);
  assert.match(area(state,'pack').cards![0]!,/targets=1\.\.2/);
});

test('hand strings preserve observed scoring values, omit only Lv1 and leave the backend state intact',() => {
  const source = observation({state:'SELECTING_HAND',hands:{
    'High Card':{level:1,chips:5,mult:1,played:0},
    Pair:{level:4,chips:71.5,mult:9,played:6},
    Flush:{level:0,chips:0,mult:1,played:2},
  }});
  const original = structuredClone(source);
  assert.deepEqual(record(compactObservation(source).state).hands,{
    'High Card':'chips=5; mult=1; played=0',
    Pair:'Lv4; chips=71.5; mult=9; played=6',
    Flush:'Lv0; chips=0; mult=1; played=2',
  });
  assert.deepEqual(source,original);
});

test('cards reach the model hidden only when the player cannot see their identity',() => {
  const compact = compactObservation(observation({ state: 'SELECTING_HAND',hand: { count: 1,limit: 8,highlighted_limit: 5,
    cards: [{ id: '9',index: 0,key: 'SECRET_CARD',value: { rank: 'K' },modifier: { edition: 'FOIL' },state: { hidden: true } }] } }));
  const text = JSON.stringify(compact);
  assert.doesNotMatch(text,/SECRET|"K"|FOIL/);
  assert.deepEqual(area(compact["state"] as Data,'hand').cards,['0: hidden']);
});

test('hidden cards retain forced selection without revealing identity',() => {
  const compact = compactObservation(observation({ state: 'SELECTING_HAND',hand: { cards: [card({ state: { hidden: true,forced: true,highlight: true } })] } }));
  assert.deepEqual(area(record(compact.state),'hand').cards,['0: hidden [forced,highlight]']);
  assert.doesNotMatch(JSON.stringify(compact),/Ace|Hearts|c_base/);
});

test('expired Perishable status and permanent playing-card chips survive string formatting',() => {
  const compact = compactState(observation({state:'SELECTING_HAND',hand:{cards:[card({modifier:{enhancement:'c_base',permanentChips:15,bonusChips:0}})]},
    jokers:{cards:[card({value:{effect:'+4 Mult'},modifier:{perishable:0},state:{debuff:true}})]}}).state);
  assert.match(area(compact,'hand').cards![0]!,/permanentChips=15/); assert.doesNotMatch(area(compact,'hand').cards![0]!,/bonusChips=0|c_base/);
  assert.match(area(compact,'jokers').cards![0]!,/perishable=0,debuffed/);
});

test('the compacted state still reports the phase the action protocol validates against',() => {
  const state = compactState(playerState({ state: 'SHOP', money: 12, round: { reroll_cost: 5 },
    shop: { count: 2, limit: 2, highlighted_limit: 1, cards: [card({ id: 'a', key: 'j_joker', label: 'Joker', value: {}, cost: { buy: 4, sell: 2 } })] } }));
  assert.equal(state["state"],'SHOP');
  assert.equal(state["money"],12);
  assert.deepEqual(state["round"],{ reroll_cost: 5 });
  const shopCard = area(state,'shop').cards![0]!;
  assert.match(shopCard,/^0: Joker \/ j_joker/);
  assert.match(shopCard,/buy=\$4; sell=\$2/);

  const empty = compactState(playerState({ state: 'MENU', hand: { count: 0, limit: 8, cards: [] } }));
  assert.equal(area(empty,'hand').count,0);
  assert.equal(area(empty,'hand').cards,undefined,);
  assert.equal(empty["remainingCards"],undefined);
});

test('play returns new hand and resources, changed Joker growth and hand levels, and clears removed fields',() => {
  const before = observation({state:'SELECTING_HAND',deck:'RED',hands:{Pair:{level:1,played:0}},used_vouchers:{v_seed_money:true},money:7,
    round:{chips:0,hands_left:4,discards_left:3},blind:{name:'Small Blind',chips:300},remainingCards:44,
    hand:{cards:[card()]},jokers:{cards:[card({value:{effect:'+4 Mult'},label:'Bus'})]},consumables:{cards:[]}});
  const after: Observation = { ...before,revision:'i:8',state:{...before.state,round:{chips:16,hands_left:3,discards_left:3},remainingCards:43,
    hands:{Pair:{level:1,played:1}},hand:{cards:[card({value:{rank:'King',suit:'Spades'}})]},jokers:{cards:[card({value:{effect:'+5 Mult'},label:'Bus'})]}} };
  delete after.state.consumables;
  const value = compactActionObservation(after,{method:'play',cards:[0]},before), state = record(value.state);
  assert.equal(value.partial,true); assert.equal(value.baseRevision,before.revision); assert.equal(value.revision,after.revision);
  assert.deepEqual(area(state,'hand').cards,['0: KS']); assert.equal(state.remainingCards,43);
  assert.match(area(state,'jokers').cards![0]!,/\+5 Mult/); assert.deepEqual(state.handsPatch,{Pair:'played=1'}); assert.equal(state.consumables,null);
  assert.equal('hands' in state,false);
  for (const key of ['deck','blind','used_vouchers','money']) assert.equal(key in state,false);
  assert.equal(value.summary,'Played cards. Score: 16/300. Hands left: 3. Discards left: 3.');
});

test('rearrange returns only its area when other fields are unchanged; phase and run changes reset the snapshot',() => {
  const before = observation({state:'SELECTING_HAND',money:7,hand:{cards:[card()]},jokers:{cards:[]}});
  const after = {...before,revision:'i:8'};
  const reordered = compactActionObservation(after,{method:'rearrange',hand:[0]},before);
  assert.deepEqual(Object.keys(record(reordered.state)),['state','hand']);
  for (const changed of [{...after,state:{...after.state,state:'ROUND_EVAL'}},{...after,runId:'another-run'},{...after,terminal:true,outcome:'lost' as const}]) {
    const value = compactActionObservation(changed,{method:'play',cards:[0]},before);
    assert.equal(value.partial,false); assert.equal(record(value.state).money,7);
  }
});

test('shop reroll and consumable use return their affected observations without repeating unrelated state',() => {
  const before = observation({state:'SHOP',money:20,creditLimit:0,round:{reroll_cost:5},used_vouchers:{v_seed_money:true},
    shop:{cards:[card({value:{},label:'Joker',key:'j_joker'})]},jokers:{cards:[]},hands:{Pair:{level:1}}});
  const after = {...before,revision:'i:8',state:{...before.state,money:15,round:{reroll_cost:6},shop:{cards:[]}}};
  const rerolled = record(compactActionObservation(after,{method:'reroll'},before).state);
  assert.equal(rerolled.money,15); assert.equal(area(rerolled,'shop').count,0); assert.equal('used_vouchers' in rerolled,false); assert.equal('hands' in rerolled,false); assert.equal('handsPatch' in rerolled,false);
  const used = {...after,revision:'i:9',state:{...after.state,hands:{Pair:{level:2}}}};
  assert.deepEqual(record(compactActionObservation(used,{method:'use',consumable:0},after).state).handsPatch,{Pair:'Lv2'});
});

test('hand patches reset level 1, add newly visible hands and remove entries without repeating unchanged hands',() => {
  const highCard = {level:1,chips:5,mult:1,played:0};
  const before = observation({state:'SELECTING_HAND',hands:{
    'High Card':highCard,Pair:{level:2,chips:25,mult:3,played:6},Flush:{level:1,chips:35,mult:4,played:1},
  }});
  const after = {...before,revision:'i:8',state:{...before.state,hands:{
    'High Card':highCard,Pair:{level:1,chips:10,mult:2,played:7},'Five of a Kind':{level:1,chips:120,mult:12,played:1},
  }}};
  const action = {method:'play' as const,cards:[0]};
  const state = record(compactActionObservation(after,action,before).state);
  assert.deepEqual(state.handsPatch,{Pair:'chips=10; mult=2; played=7',Flush:null,'Five of a Kind':'chips=120; mult=12; played=1'});
  assert.equal('hands' in state,false);
  for (const full of [compactActionObservation(after,action),compactActionObservation({...after,state:{...after.state,state:'ROUND_EVAL'}},action,before)]) {
    assert.equal(full.partial,false);
    assert.deepEqual(record(full.state).hands,record(compactObservation(after).state).hands);
    assert.equal('handsPatch' in record(full.state),false);
  }
  const empty = {...after,state:{...after.state,hands:{}}};
  assert.deepEqual(record(compactActionObservation(empty,action,before).state).handsPatch,{'High Card':null,Pair:null,Flush:null});
  const noHands: Observation = {...before,state:{state:'SELECTING_HAND'}};
  assert.deepEqual(record(compactActionObservation(after,action,noHands).state).hands,record(compactObservation(after).state).hands);
  assert.equal(record(compactActionObservation(noHands,action,before).state).hands,null);
});

test('decision inputs survive player filtering, compaction and incremental updates', () => {
  const raw = {state:'SELECTING_HAND',round:{hands_left:3,handHistoryKnown:true,handTypesPlayed:['Pair'],handTypeCounts:{Pair:1},lastHandKnown:true,lastHandType:'Pair'},
    blind:{key:'bl_mouth',rules:['Only one hand type'],ruleState:{requiredHandType:'Pair',known:true}},
    blinds:{Small:{skipReward:{key:'tag_orbital',values:{orbitalHand:'Pair',levels:3}}}},
    tags:[{key:'tag_double',rules:['Copy next tag']}],
    profileOptions:{decks:[{deck:'RED',unlocked:true,stakes:['WHITE','RED']}]},
    privateRng:'DO_NOT_EXPOSE'};
  const before = observation(raw), full = compactObservation(before);
  for (const field of ['blind','blinds','round','tags','profileOptions']) assert.deepEqual(record(full.state)[field],raw[field as keyof typeof raw]);
  assert.doesNotMatch(JSON.stringify(full),/DO_NOT_EXPOSE/);
  const after = {...before,revision:'i:8',state:{...before.state,tags:[],round:{...raw.round,handTypesPlayed:['Pair','Flush'],lastHandType:'Flush'}}};
  const patch = compactActionObservation(after,{method:'play',cards:[0]},before);
  assert.equal(patch.partial,true);
  assert.deepEqual(record(patch.state).tags,[]);
  assert.equal(record(record(patch.state).round).lastHandType,'Flush');
  assert.equal(record(patch.state).blind,undefined);
});
