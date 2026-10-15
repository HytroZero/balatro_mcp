-- Offline status-hook and action-lifecycle checks. No scoring is simulated.
local json = dofile('play/mod/json.lua')
local checks, calls = 0, 0
local function check(value, message) checks = checks + 1; assert(value, message) end
local function same(actual, expected) check(actual == expected, tostring(actual) .. ' ~= ' .. tostring(expected)) end
local last
card_eval_status_text = function(...)
  calls = calls + 1
  last = {...}
  return 'original', nil, 7
end
localize = function(args, group)
  local misc = G.localization.misc
  if type(args) == 'string' then return misc[group or 'dictionary'][args],nil,'localize-tail' end
  return (misc.v_dictionary[args.key]:gsub('#(%d+)#',function(index) return tostring(args.vars[tonumber(index)]) end)),nil,'localize-tail'
end
local decision = dofile('play/mod/decision.lua')(json,{misc={
  dictionary={k_again_ex='Again!',k_upgrade_ex='Upgraded!'},
  v_dictionary={a_mult='+#1# Mult',a_xmult='X#1# Mult',a_chips='+#1# Chips'},
}})
local effects = dofile('play/mod/effects.lua')(decision)
local function card(rank, suit, hidden, label)
  return {public={state={hidden=hidden},value={rank=rank,suit=suit},label=label},facing=hidden and 'back' or 'front'}
end
local ace, bonus, hidden = card('Ace','Spades'), card('King','Hearts'), card('Queen','Clubs',true)
local joker1, joker2 = card(nil,nil,false,'Joker'), card(nil,nil,false,'Joker')
G = {GAME={},hand={cards={ace,bonus,hidden}},jokers={cards={joker1,joker2}},consumeables={cards={}}}
local now, ready, invoke, dispatches = 0, true, function() end, 0
local game = {
  state=function()
    local state = {state='SELECTING_HAND'}
    for _, area in ipairs({'hand','jokers'}) do
      local rows = json.array()
      for _, c in ipairs(G[area].cards) do rows[#rows + 1] = c.public end
      state[area] = {cards=rows}
    end
    return state
  end,
  ready=function() return ready end,
  cards=function() return {} end,
  methods=function() return json.array({'play','discard'}) end,
  fail=function(code) error(code) end,
  prepare=function(action)
    if action.method == 'invalid' then error('illegal action') end
    return function() dispatches = dispatches + 1; invoke() end
  end,
}
local bridge = dofile('play/mod/bridge.lua')(json,game,function() return now end,'effects-test',20,nil,effects)
local function request(id, method)
  return {instanceId='effects-test',actionId=id,revision=bridge.dispatch('sf.observe',{}).revision,
    action={method=method or 'play',cards=json.array({0})}}
end
local function inspect(id) return bridge.dispatch('sf.operation',{instanceId='effects-test',actionId=id}) end
local function complete(id) bridge.update(); bridge.update(); return inspect(id) end

card_eval_status_text(ace,'chips',99)
local req = request('first')
invoke = function()
  local a,b,c = card_eval_status_text(ace,'chips',11,0.5,'down',{instant=true},'tail')
  same(a,'original'); same(b,nil); same(c,7)
  same(last[1],ace); same(last[4],0.5); same(last[5],'down'); same(last[7],'tail')
  card_eval_status_text(bonus,'chips',40) -- Base and Bonus chips are one prompt.
  card_eval_status_text(hidden,'h_x_mult',1.5)
  card_eval_status_text(bonus,'extra',nil,nil,nil,{message='X2 Mult',edition=true})
  card_eval_status_text(joker1,'jokers',nil,nil,nil,{message='+4 Mult'})
  card_eval_status_text(joker2,'extra',nil,nil,nil,{message='Again!'})
  card_eval_status_text(bonus,'chips',40)
  card_eval_status_text(hidden,'dollars',3)
  card_eval_status_text(hidden,'dollars',-1)
  -- Blank/zero prompts are not displayed; other_card does not define causality.
  card_eval_status_text(ace,'chips',0)
  card_eval_status_text(ace,'extra',nil,nil,nil,{message='',other_card=hidden})
end
same(bridge.dispatch('sf.act',req).status,'pending')
-- Prompts queued for later frames retain pre-action identities after movement/reveal.
G.hand.cards = {hidden,ace,bonus}; hidden.facing='front'; hidden.public.state.hidden=false
card_eval_status_text(ace,'h_mult',5)
card_eval_status_text(ace,'jokers',nil,nil,nil,{focus=joker2,message=' +50\nChips '})
local result = complete('first')
local expected = 'hand[0](AS): +11 Chips; hand[1](KH): +40 Chips; hand[2](?): X1.5 Mult; ' ..
  'hand[1](KH): X2 Mult; jokers[0](Joker): +4 Mult; jokers[1](Joker): Again!; ' ..
  'hand[1](KH): +40 Chips; hand[2](?): +$3; hand[2](?): -$1; hand[0](AS): +5 Mult; jokers[1](Joker): +50 Chips'
same(result.effects,expected)
same(dispatches,1)
same(bridge.dispatch('sf.act',req).effects,expected)
same(dispatches,1)
same(inspect('first').effects,expected)
local observed = bridge.dispatch('sf.observe',{})
same(observed.effects,nil)
same(observed.revision,result.observation.revision)
card_eval_status_text(ace,'chips',99)
same(inspect('first').effects,expected)
same(bridge.dispatch('sf.observe',{}).revision,observed.revision)

invoke = function() end
bridge.dispatch('sf.act',request('empty'))
same(complete('empty').effects,'')
invoke = function() card_eval_status_text(ace,'chips',7) end
bridge.dispatch('sf.act',request('discard','discard'))
same(complete('discard').effects,nil)
bridge.dispatch('sf.act',request('next'))
same(complete('next').effects,'hand[1](AS): +7 Chips')
local stale = request('stale'); stale.revision='old:1'
check(not pcall(bridge.dispatch,'sf.act',stale),'stale action is rejected before recording')
check(not pcall(bridge.dispatch,'sf.act',request('illegal','invalid')),'invalid action is rejected before recording')
card_eval_status_text(ace,'chips',99)
same(effects.finish(),'')

-- Newly created cards receive distinct action-local references without reading faces.
invoke = function()
  local new1,new2 = card('Ace','Hearts'),card('King','Clubs')
  card_eval_status_text(new1,'chips',5); card_eval_status_text(new2,'mult',2); card_eval_status_text(new1,'chips',5)
end
bridge.dispatch('sf.act',request('new-cards'))
same(complete('new-cards').effects,'card[new0](?): +5 Chips; card[new1](?): +2 Mult; card[new0](?): +5 Chips')

-- Both failure paths freeze their partial log and stop capturing late callbacks.
invoke = function() card_eval_status_text(ace,'chips',8); error('game handler failed') end
local failed = bridge.dispatch('sf.act',request('failed'))
same(failed.status,'failed'); same(failed.effects,'hand[1](AS): +8 Chips')
card_eval_status_text(ace,'chips',99)
same(inspect('failed').effects,failed.effects)
same(effects.finish(),'')
bridge = dofile('play/mod/bridge.lua')(json,game,function() return now end,'effects-test',20,nil,effects)
invoke = function() card_eval_status_text(hidden,'h_x_mult',1.5) end
bridge.dispatch('sf.act',request('timeout'))
ready=false; now=21; bridge.update()
local timedout = inspect('timeout')
same(timedout.status,'failed'); same(timedout.applied,true)
same(timedout.effects,'hand[0](QC): X1.5 Mult')
card_eval_status_text(ace,'chips',99)
same(inspect('timeout').effects,timedout.effects)
same(effects.finish(),'')

-- Localized UI prompts use the same English data as observations. Neither the
-- arguments passed to the game nor its language/localization tables change.
G.localization = {misc={dictionary={k_again_ex='再来一次！',k_upgrade_ex='升级！'},
  v_dictionary={a_mult='+#1# 倍率',a_xmult='X#1# 倍率',a_chips='+#1# 筹码'}}}
G.SETTINGS = {language='zh_CN'}
local localization = json.encode(G.localization)
effects.begin(game.state())
local extra = {message=localize{type='variable',key='a_xmult',vars={2}},edition=true}
card_eval_status_text(bonus,'extra',nil,nil,nil,extra)
same(last[6],extra); same(extra.message,'X2 倍率')
card_eval_status_text(joker1,'jokers',nil,nil,nil,{message=localize{type='variable',key='a_mult',vars={12}}})
local localized,nil_return,tail = localize('k_again_ex')
same(localized,'再来一次！'); same(nil_return,nil); same(tail,'localize-tail')
card_eval_status_text(joker2,'extra',nil,nil,nil,{message=localized})
card_eval_status_text(joker2,'extra',nil,nil,nil,{message=localize('k_upgrade_ex')})
card_eval_status_text(bonus,'extra',nil,nil,nil,{message=localize{type='variable',key='a_chips',vars={50}}})
same(effects.finish(),'hand[2](KH): X2 Mult; jokers[0](Joker): +12 Mult; jokers[1](Joker): Again!; ' ..
  'jokers[1](Joker): Upgraded!; hand[2](KH): +50 Chips')
same(G.SETTINGS.language,'zh_CN'); same(json.encode(G.localization),localization)
check(calls > 20,'every prompt still invokes the original handler')
print('Effect recording checks passed: ' .. checks)
