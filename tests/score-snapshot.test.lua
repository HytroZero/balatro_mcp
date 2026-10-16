local json = dofile('play/mod/json.lua')
local snapshot = dofile('play/mod/score_snapshot.lua')(json)
local checks = 0
local function check(v, message) checks = checks + 1; assert(v, message) end
local function card(key, rank)
  return {config={center={key='c_base'},card_key=key},base={value=rank,suit='Spades'},
    ability={set='Default',bonus=0,extra={1,2}},debuff=false,facing='front'}
end
local a,b,c = card('S_A','Ace'),card('S_K','King'),card('S_2','2')
G = {P_CARDS={S_A={},S_K={},S_2={}},hand={cards={a},config={card_limit=8,highlighted_limit=5}},
  jokers={cards={},config={card_limit=5}},consumeables={cards={},config={card_limit=2}},
  deck={cards={b,c}},discard={cards={}},playing_cards={a,b,c},
  GAME={selected_back={effect={center={key='b_red'},config={}}},blind={config={blind={key='bl_eye'}},hands={Pair=true}},
    current_round={hands_left=3,voucher={'v_tarot_merchant',spawn={v_tarot_merchant=true}}},probabilities={normal=2},hands={['High Card']={level=1,chips=5,mult=1,played=0,played_this_round=0}},
    round_resets={ante=5,hands=5,discards=2},
    dollars=20,pseudorandom={seed='PRIVATE_SEED',hidden_stream=0.2}}}
local before = G.GAME.dollars
local first = snapshot.analysis('SELECTING_HAND').scoring
check(first.status == 'ready', first.message or 'snapshot ready')
check(first.state.passiveEffectsApplied and first.state.game.probabilities.normal == 2, 'already applied effects are explicit')
check(first.state.blind.hands.Pair == true, 'Boss memory is exported')
check(getmetatable(first.state.hand[1].ability.extra) == json.array_mt, 'nested arrays retain Lua indexing')
check(not json.encode(first):find('PRIVATE_SEED',1,true) and not first.state.game.pseudorandom, 'seed and RNG are excluded')
G.deck.cards={c,b}
check(json.encode(snapshot.analysis('SELECTING_HAND').scoring) == json.encode(first), 'draw order is excluded')
check(G.GAME.dollars == before and G.hand.cards[1] == a, 'read leaves run and card objects unchanged')
G.GAME.blind.config.blind.key='bl_mouth'
G.GAME.blind.only_hand=false
local unlocked = snapshot.analysis('SELECTING_HAND').scoring
check(unlocked.status == 'ready' and unlocked.state.blind.only_hand == nil, 'unset Mouth lock is omitted from scoring input')
check(G.GAME.blind.only_hand == false, 'snapshot preserves the live unset Mouth lock')
G.GAME.blind.only_hand='Two Pair'
local locked = snapshot.analysis('SELECTING_HAND').scoring
check(locked.status == 'ready' and locked.state.blind.only_hand == 'Two Pair', 'Mouth lock retains the chosen hand type')
check(G.GAME.blind.only_hand == 'Two Pair', 'snapshot preserves the live chosen Mouth lock')
G.GAME.blind.config.blind.key='bl_eye'
G.GAME.blind.only_hand=nil
local tag = {key='tag_holo'}
tag.tag_sprite = {config={tag=tag}}
G.GAME.round_resets.blind_tag = tag
local withTag = snapshot.analysis('SELECTING_HAND').scoring
check(withTag.status == 'ready', withTag.message or 'UI Tag must not block scoring')
check(json.encode(withTag) == json.encode(first), 'UI-only blind Tag does not change scoring input')
check(G.GAME.round_resets.blind_tag.tag_sprite.config.tag == tag, 'snapshot leaves live Tag cycle untouched')
a.facing='back'; a.ability=function() error('must not inspect hidden ability') end
local partial = snapshot.analysis('SELECTING_HAND')
check(partial.scoring.status == 'ready' and partial.scoring.state.hand[1].facing == 'back', 'analysis keeps a hidden hand slot')
check(next(partial.scoring.state.hand[1], 'facing') == nil and not json.encode(partial):find('S_A',1,true), 'hidden hand slot exports no identity')
a.facing='front'; a.ability={set='Default'}
G.GAME.modifiers={no_blind_reward={Small=true},money_per_hand=2}; G.GAME.interest_amount=1; G.GAME.interest_cap=25; G.GAME.rental_rate=3
G.GAME.round_resets.blind_choices={Small='bl_small',Big='bl_big',Boss='bl_eye'}
G.P_BLINDS={bl_small={dollars=3},bl_big={dollars=4},bl_eye={dollars=5}}
G.jokers.cards={{facing='front',config={center={key='j_joker'}},ability={rental=true}}}
local shop = snapshot.analysis('SHOP')
check(shop.scoring == nil and shop.phase == 'SHOP', 'only the hand phase exports scoring input')
check(shop.economy.dollars == 20 and shop.economy.interestCap == 25 and shop.economy.moneyPerHand == 2 and shop.economy.rentals == 1, 'economy rules are exported')
check(shop.economy.blindRewards.Small == 0 and shop.economy.blindRewards.Big == 4 and shop.economy.blindRewards.Boss == 5, 'stake reward rules apply per blind')
check(not json.encode(shop):find('PRIVATE_SEED',1,true), 'analysis excludes the seed')
check(shop.build and shop.build.status == 'unavailable', 'an incomplete build snapshot is reported, not guessed')
G.GAME.starting_params={ante_scaling=2}; G.GAME.win_ante=8; G.GAME.banned_keys={bl_mouth=true}
G.GAME.bosses_used={bl_eye=1,bl_club=0,bl_goad=0,bl_mouth=0,bl_final_bell=0}
get_blind_amount=function(ante) return 100*ante end
for key, b in pairs(G.P_BLINDS) do b.key = key end
G.P_BLINDS.bl_small.mult, G.P_BLINDS.bl_big.mult, G.P_BLINDS.bl_eye.mult = 1, 1.5, 2
G.P_BLINDS.bl_eye.boss={min=3}; G.P_BLINDS.bl_club={key='bl_club',name='The Club',mult=2,boss={min=1}}; G.P_BLINDS.bl_goad={key='bl_goad',name='The Goad',mult=2,boss={min=6}}
G.P_BLINDS.bl_mouth={key='bl_mouth',name='The Mouth',mult=2,boss={min=2}}; G.P_BLINDS.bl_final_bell={key='bl_final_bell',name='Cerulean Bell',mult=2,boss={min=10,showdown=true}}
G.GAME.round_resets.blind_states={Small='Defeated',Big='Upcoming',Boss='Upcoming'}
G.shop_jokers={cards={{facing='front',config={center={key='j_cavendish'}},ability={set='Joker'},cost=4}}}
local built = snapshot.analysis('SHOP').build
check(built.status == 'ready', built.message or 'build snapshot ready')
local input = built.input
check(#input.state.hand == 0 and #input.state.deck == 3 and input.state.random == 'minimal', 'the whole deck is one unordered pool')
check(input.ante == 5 and input.amounts[1] == 1000 and input.amounts[#input.amounts] == 1800, 'base amounts from this Ante with the stake scaling')
check(input.blinds.Big.target == 1500 and input.blinds.Small.status == 'Defeated', 'blind targets and states')
check(#input.bossPool == 2 and input.bossPool[1].key == 'bl_club' and input.bossPool[2].key == 'bl_goad' and input.bossPool[2].mult == 2, 'next Boss pool: eligible, not banned, least used')
check(input.offers.shop[1].key == 'j_cavendish' and input.offers.shop[1].cost == 4 and input.offers.shop[1].index == 0, 'shop offers keep their index and price')
check(not json.encode(built):find('PRIVATE_SEED',1,true), 'build snapshot excludes the seed')
G.GAME.interest_cap=math.huge
local invalid = snapshot.analysis('SHOP')
check(invalid.build.status == 'unavailable' and invalid.economy == nil and invalid.scoring == nil, 'serialization failures retain the phase input')
G.GAME.interest_cap=25
G.jokers.cards={}; G.GAME.modifiers=nil; G.GAME.round_resets.blind_choices=nil
a.config.center.mod={id='custom'}
check(snapshot.analysis('SELECTING_HAND').scoring.status == 'unavailable', 'custom prototypes explicitly unsupported')
a.config.center.mod=nil
G.playing_cards[#G.playing_cards+1]={}
check(snapshot.analysis('SELECTING_HAND').scoring.status == 'unavailable', 'missing members cannot receive guessed deck defaults')
G.playing_cards[4]=nil

G.VERSION='1.0.1o-FULL'
local fake = {state=function()return {state='SELECTING_HAND'}end,ready=function()return true end,
  cards=function()return {}end,methods=function()return json.array()end,phase=function()return 'SELECTING_HAND'end}
local analysisReads = 0
local bridge = dofile('play/mod/bridge.lua')(json,fake,function()return 0 end,'test',20,{
  analysis=function(phase) analysisReads = analysisReads + 1; return {phase=phase} end})
local observed = bridge.dispatch('sf.observe',{})
check(observed.state.scoringSnapshot == nil and observed.state.plays == nil, 'bridge does not build scoring snapshots or plays')
check(observed.revision == bridge.dispatch('sf.observe',{}).revision, 'repeated input retains revision')
G.GAME.probabilities.normal=4
check(observed.revision == bridge.dispatch('sf.observe',{}).revision, 'unused scoring-only dependencies do not change observation revision')
check(analysisReads == 0, 'ordinary observations never build the analysis snapshot')
local analysed = bridge.dispatch('sf.analysis_snapshot',{})
check(analysisReads == 1 and analysed.analysis.phase == 'SELECTING_HAND' and analysed.observation.revision == observed.revision, 'analysis read returns the same-frame observation without a new revision')
check(not pcall(bridge.dispatch,'sf.analysis_snapshot',{revision='x'}), 'analysis read rejects unexpected arguments')
local capabilities = bridge.dispatch('sf.health',{}).capabilities
check(capabilities[#capabilities] == 'analysis_snapshot', 'analysis capability is advertised')
print('Score snapshot checks passed: ' .. checks)
