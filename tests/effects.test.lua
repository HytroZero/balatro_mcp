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
local now, ready, blocker, invoke, dispatches = 0, true, 'Waiting for queued game events', function() end, 0
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
  ready=function() return ready, not ready and blocker or nil end,
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

-- Handler exceptions freeze their partial log and require a bridge restart,
-- even when the original game is otherwise ready.
invoke = function() card_eval_status_text(ace,'chips',8); error('game handler failed') end
local failed = bridge.dispatch('sf.act',request('failed'))
same(failed.status,'failed'); same(failed.effects,'hand[1](AS): +8 Chips')
card_eval_status_text(ace,'chips',99)
same(inspect('failed').effects,failed.effects)
same(effects.finish(),'')
bridge.update(); bridge.update()
local health = bridge.dispatch('sf.health',{})
same(health.gameReady,true); same(health.ready,false); same(health.mutationLock,'handler_failed')
same(inspect('failed').status,'failed')
check(not pcall(bridge.dispatch,'sf.act',request('after-handler-error')),'handler errors keep mutations locked')

-- Timeouts keep the original operation alive, including late status prompts.
bridge = dofile('play/mod/bridge.lua')(json,game,function() return now end,'effects-test',20,nil,effects)
invoke = function() card_eval_status_text(hidden,'h_x_mult',1.5) end
local timeoutRequest = request('timeout')
bridge.dispatch('sf.act',timeoutRequest)
local timeoutDispatches = dispatches
ready=false; now=21; bridge.update()
local timedout = inspect('timeout')
same(timedout.status,'timed_out'); same(timedout.applied,true)
same(timedout.timeoutReason,blocker); same(timedout.notReadyReason,blocker); same(timedout.gameReady,false)
same(timedout.effects,nil) -- The log is not final until completion.
health = bridge.dispatch('sf.health',{})
same(health.gameReady,false); same(health.gameNotReadyReason,blocker); same(health.mutationLock,'timed_out')
local waiting = bridge.dispatch('sf.observe',{})
check(waiting.notReadyReason:find(blocker,1,true),'observations retain the underlying blocker')
same(#waiting.availableMethods,0)
same(bridge.dispatch('sf.act',timeoutRequest).status,'timed_out')
check(not pcall(bridge.dispatch,'sf.act',request('during-timeout')),'new actions cannot bypass a timeout')
same(dispatches,timeoutDispatches)
card_eval_status_text(ace,'chips',99)
blocker='Close the open game dialog'; now=100; bridge.update()
same(inspect('timeout').notReadyReason,blocker)
same(inspect('timeout').timeoutReason,'Waiting for queued game events')
ready=true; bridge.update()
health = bridge.dispatch('sf.health',{})
same(health.gameReady,true); same(health.ready,false); same(health.mutationLock,'timed_out')
bridge.dispatch('sf.observe',{}); inspect('timeout')
same(inspect('timeout').quietFrames,1) -- Read-only calls cannot substitute for stable game frames.
ready=false; bridge.update()
same(inspect('timeout').quietFrames,0)
ready=true; bridge.update()
same(inspect('timeout').status,'timed_out')
bridge.update()
local recovered = inspect('timeout')
same(recovered.status,'completed'); same(recovered.applied,true); same(recovered.actionId,'timeout')
same(recovered.observation.ready,true)
same(recovered.timeoutReason,'Waiting for queued game events')
same(recovered.effects,'hand[0](QC): X1.5 Mult; hand[1](AS): +99 Chips')
same(bridge.dispatch('sf.act',timeoutRequest).status,'completed')
same(dispatches,timeoutDispatches)
card_eval_status_text(ace,'chips',100)
same(inspect('timeout').effects,recovered.effects)
local staleAfterTimeout = request('stale-after-timeout','discard')
staleAfterTimeout.revision = timeoutRequest.revision
check(not pcall(bridge.dispatch,'sf.act',staleAfterTimeout),'late completion invalidates the pre-action revision')
invoke=function() end
bridge.dispatch('sf.act',request('after-timeout','discard'))
same(complete('after-timeout').status,'completed')
same(dispatches,timeoutDispatches + 1)
same(bridge.dispatch('sf.health',{}).mutationLock,nil)

-- Reaching the deadline on the first ready frame must still allow the second
-- frame to complete the same operation, without another dispatch.
bridge.dispatch('sf.act',request('ready-at-deadline','discard'))
now=120; bridge.update()
same(inspect('ready-at-deadline').status,'timed_out')
same(inspect('ready-at-deadline').timeoutReason,'Waiting for consecutive ready frames')
bridge.update()
same(inspect('ready-at-deadline').status,'completed')
same(dispatches,timeoutDispatches + 2)

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
