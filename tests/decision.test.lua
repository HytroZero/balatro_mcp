-- Run from the repository root: luajit tests/decision.test.lua (Lua 5.1 also supported).
local json = assert(loadfile('play/mod/json.lua'))()
local decision = assert(loadfile('play/mod/decision.lua'))()(json)
local checks = 0
local function check(value, message) checks = checks + 1; assert(value, message) end
local function same(a, b, message) check(json.encode(a) == json.encode(b),message) end
local function copy(value)
  if type(value) ~= 'table' then return value end
  local out = {}; for key, item in pairs(value) do out[key] = copy(item) end; return out
end
local function equal(a,b)
  if type(a) ~= type(b) then return false end
  if type(a) ~= 'table' then return a == b end
  for key, value in pairs(a) do if not equal(value,b[key]) then return false end end
  for key in pairs(b) do if a[key] == nil then return false end end
  return true
end
local function reset()
  G = {VERSION='1.0.1o-FULL',STATES={MENU=1,SELECTING_HAND=2,BLIND_SELECT=3},STATE=2,STATE_COMPLETE=true,
    P_TAGS={tag_orbital={name='Orbital Tag',config={levels=3}},tag_skip={name='Skip Tag',config={skip_bonus=5}},tag_double={name='Double Tag',config={}}},
    P_CENTERS={b_red={key='b_red',unlocked=true},b_blue={key='b_blue',unlocked=false}},
    P_BLINDS={bl_eye={key='bl_eye',name='The Eye',mult=2},bl_small={key='bl_small',name='Small Blind',mult=1}},
    GAME={current_round={hands_played=2,hands_left=2,discards_left=3},
      hands={Pair={visible=true,played=100,played_this_round=1},Flush={visible=true,played=4,played_this_round=1},Secret={visible=false,played_this_round=0}},
      round_resets={ante=1,blind_choices={Small='bl_small',Boss='bl_eye'},blind_states={Small='Defeated',Boss='Current'},blind_tags={Small='tag_orbital'}},
      orbital_choices={[1]={Small='Pair'}},last_hand_played='Flush',tags={{key='tag_double',triggered=false}},skips=2}}
  get_deck_win_stake = function(key) return key == 'b_red' and 2 or 0 end
  localize = function(input, set)
    if type(input) == 'string' then return input end
    if input.type == 'name_text' then return input.key end
    if input.type == 'raw_descriptions' then
      local vars = {}; for _, value in ipairs(input.vars) do vars[#vars+1] = tostring(value) end
      return {input.key .. ': ' .. table.concat(vars,',')}
    end
    error('Unexpected localization')
  end
  -- Any accidental gameplay construction/RNG is a test failure.
  Tag = function() error('Tag constructor changes counters') end
  pseudorandom = function() error('Observation must not advance RNG') end
  pseudorandom_element = pseudorandom
end

reset()
local before
local round = decision.round(G.GAME)
check(round.handHistoryKnown,'complete round history is known')
same(round.handTypesPlayed,json.array({'Flush','Pair'}),'round hand types are sorted')
same(round.handTypeCounts,{Pair=1,Flush=1},'round counts do not use cumulative counts')
check(round.lastHandKnown and round.lastHandType == 'Flush','last hand belongs to current round')
G.GAME.current_round.hands_played = 0; G.GAME.hands.Pair.played_this_round = 0; G.GAME.hands.Flush.played_this_round = 0
round = decision.round(G.GAME)
check(round.lastHandKnown and round.lastHandType == nil,'old last hand is excluded before first play')
same(round.handTypesPlayed,json.array(),'empty histories serialize as arrays')
G.GAME.current_round.hands_played = 1; G.GAME.hands.Pair.played_this_round = nil
check(not decision.round(G.GAME).handHistoryKnown,'missing history is unknown')
G.GAME.hands.Pair.played_this_round = 0
check(not decision.round(G.GAME).handHistoryKnown,'inconsistent history is unknown')

reset()
local eye = decision.blind('bl_eye',G.P_BLINDS.bl_eye,{hands={Pair=true,Flush=false,['High Card']=true}})
check(eye.rulesKnown and #eye.rules == 1,'localized blind rules are included')
same(eye.ruleState.blockedHandTypes,json.array({'High Card','Pair'}),'Eye only blocks played hands')
check(eye.ruleState.known,'Eye history comes from actual blind')
check(not decision.blind('bl_eye',G.P_BLINDS.bl_eye).ruleState.known,'upcoming Eye has no invented round history')
local mouth = decision.blind('bl_mouth',{name='The Mouth'},{only_hand='Pair'})
check(mouth.ruleState.requiredHandType == 'Pair','Mouth exposes locked hand')
check(decision.blind('bl_mouth',{}, {only_hand=false}).ruleState.uncommitted,'Mouth begins uncommitted')
check(not decision.blind('bl_mouth',{}, {}).ruleState.known,'missing Mouth state is unknown')
G.GAME.current_round.most_played_poker_hand = 'Two Pair'
local ox = decision.blind('bl_ox',{name='The Ox'})
check(ox.ruleState.moneyResetHand == 'Two Pair','Ox exposes its displayed target')
check(ox.rules[1] == 'bl_ox: Two Pair','Ox rules interpolate target hand')
check(not decision.blind('bl_eye',{}, {disabled=true,hands={Pair=true}}).ruleState.active,'disabled Boss rules are inactive')
check(decision.blind('bl_psychic',{}).ruleState.minimumPlayedCards == 5,'Psychic requires five cards')

reset()
local tag = decision.tag('tag_orbital',nil,'Small')
check(tag.values.orbitalHandKnown and tag.values.orbitalHand == 'Pair','Orbital reads current Ante and blind reward')
check(tag.rules[1] == 'tag_orbital: Pair,3','Orbital description includes target and levels')
G.GAME.orbital_choices = nil
check(not decision.tag('tag_orbital',nil,'Small').values.orbitalHandKnown,'missing Orbital choice stays unknown')
check(decision.tag('tag_skip').rules[1] == 'tag_skip: 5,15','Skip reward matches displayed next skip value')
same(decision.tag('tag_orbital',{hide_ability=true}),{hidden=true},'hidden tag abilities stay hidden')
check(decision.tags(G.GAME)[1].key == 'tag_double','owned Tags are included')
local profile = decision.profile({RED='b_red',BLUE='b_blue'},{WHITE=1,RED=2,GREEN=3,BLACK=4,BLUE=5,PURPLE=6,ORANGE=7,GOLD=8})
check(not profile.decks[1].unlocked and #profile.decks[1].stakes == 0,'locked deck has no playable stakes')
same(profile.decks[2].stakes,json.array({'WHITE','RED','GREEN'}),'deck-specific stake unlocks are respected')
get_deck_win_stake = nil
check(not decision.profile({RED='b_red'},{WHITE=1}).decks[1].stakesKnown,'missing profile function is unknown')

reset()
G.GAME.blind = {name='The Eye',chips=600,disabled=false,config={blind=G.P_BLINDS.bl_eye},hands={Pair=true}}
before = copy(G.GAME)
local game = assert(loadfile('play/mod/game.lua'))()(json,decision)
local state = game.state()
check(state.blind.key == 'bl_eye' and state.blind.ruleState.blockedHandTypes[1] == 'Pair','active blind details reach game state')
check(state.blinds.Small.skipReward.values.orbitalHand == 'Pair','skip reward reaches game state')
check(state.round.lastHandType == 'Flush' and state.round.handHistoryKnown,'round history reaches game state')
check(state.tags[1].key == 'tag_double','owned tags reach game state')
check(state.profileOptions == nil,'profile choices omitted during a run')
check(equal(G.GAME,before),'observations do not mutate the run')
G.STATE = G.STATES.MENU
check(game.state().profileOptions ~= nil,'menu includes profile choices')
G.OVERLAY_MENU = {}
local bridge = assert(loadfile('play/mod/bridge.lua'))()(json,game,function() return 0 end,'test-instance',20)
G.STATE = G.STATES.SELECTING_HAND
local health = bridge.dispatch('sf.health',{})
check(not health.ready and health.notReadyReason == 'Close the open game dialog','health explains readiness blockers')
local capabilities={};for _,name in ipairs(health.capabilities)do capabilities[name]=true end
check(capabilities.decision_state and not capabilities.scoring_snapshot,'health advertises decision fields without scoring snapshots')

-- Graceful localization failure must not make observations unusable.
localize = function() error('Unsupported modded localization') end
check(not decision.blind('bl_eye',{}).rulesKnown,'unavailable rule text is explicit')
print('Decision observation checks passed: ' .. checks)
