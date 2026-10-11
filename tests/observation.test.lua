-- Read-only observation checks; optionally pass the original en-us.lua path.
local json = assert(loadfile('play/mod/json.lua'))()
local english = arg[1] and assert(loadfile(arg[1]))() or {descriptions={
  Joker={j_popcorn={name='Popcorn',text={'+#1# Mult','Loses #2# Mult per round'}},j_smiley={name='Smiley Face',text={'Scored face cards give +#1# Mult'}},
    j_jolly={name='Jolly Joker',text={'+#1# Mult if played','hand contains','a #2#'}},j_bull={name='Bull',text={'+#1# Chips for','each $1 you have','(Currently +#2# Chips)'}},
    j_todo_list={name='To Do List',text={'Earn $#1# if poker hand','is a #2#'}}},
  Blind={bl_small={name='Small Blind',text={}},bl_head={name='The Head',text={'Hearts are debuffed'}}},
  Tarot={c_heirophant={name='The Hierophant',text={'Enhance #1# cards to #2#'}}},
  Enhanced={m_bonus={name='Bonus Card',text={'+#1# Chips'}}},
  Voucher={v_clearance_sale={name='Clearance Sale',text={'Cards cost #1#% less'}}},
}}
local checks=0
local function check(v,message) checks=checks+1; assert(v,message) end
G={VERSION='1.0.1o-FULL',STATES={MENU=1,SELECTING_HAND=2,ROUND_EVAL=3,SHOP=4,BLIND_SELECT=5,TAROT_PACK=6},STATE=2,
  P_BLINDS={bl_small={key='bl_small',name='Small Blind',mult=1},bl_head={key='bl_head',name='The Head',mult=2}},
  P_CENTERS={v_clearance_sale={key='v_clearance_sale',set='Voucher',name='Clearance Sale',config={extra=25}}},
  GAME={dollars=4,bankrupt_at=0,round=3,stake=1,selected_back={effect={center={key='b_red'}}},
    pseudorandom={seed='TEST'},probabilities={normal=1},starting_params={ante_scaling=1},
    current_round={hands_left=4,discards_left=3,hands_played=0,dollars=9},
    round_resets={ante=1,blind_ante=1,blind_choices={Small='bl_small',Boss='bl_head'},blind_states={Small='Defeated',Boss='Current'}},
    blind_on_deck='Boss',blind={name='The Head',chips=600,config={blind={key='bl_head',name='The Head',mult=2}}},
    hands={Pair={visible=true,level=1,chips=10,mult=2,played=0,played_this_round=0}},used_vouchers={v_clearance_sale=true}}}
local function card(key,set,a)
  return {base={},ability=a or {},config={center={key=key,set=set}},cost=4,sell_cost=2,
    can_sell_card=function()return false end,
    generate_UIBox_ability_table=function()error('Observation must never create a tooltip')end}
end
local popcorn=card('j_popcorn','Joker',{name='Popcorn',set='Joker',mult=16,extra=4,perish_tally=0})
G.jokers={cards={popcorn},config={card_limit=5,highlighted_limit=1}}
G.consumeables={cards={},config={card_limit=2}}
G.hand={cards={},config={card_limit=8,highlighted_limit=5}}
G.deck={cards={{base={value='SECRET'}}}}
G.playing_cards={{},{},{},{}}
localize=function()error('English observations must not depend on the UI language')end
get_blind_amount=function(ante)return ante==1 and 300 or 1000 end
pseudorandom=function()error('Observation must not advance RNG')end
pseudorandom_element=pseudorandom
local decision=assert(loadfile('play/mod/decision.lua'))()(json,english)
local game=assert(loadfile('play/mod/game.lua'))()(json,decision)
local before=json.encode(G.GAME)
local state=game.state()
check(json.encode(G.GAME)==before,'observation must not mutate the run')
check(not json.encode(state):find('SECRET',1,true),'ordinary observation must not disclose draw identities')
check(state.totalCards==4,'total cards reflect actual surviving deck')
check(state.jokers.cards[1].value.rulesKnown,'Popcorn description resolves observed values')
check(state.jokers.cards[1].value.effect:find('16',1,true),'current Mult, not original base')
check(state.jokers.cards[1].modifier.perishable==0,'expired timer remains observable')
check(state.jokers.cards[1].modifier.enhancement==nil,'a Joker center key is not an enhancement')
check(state.blind.rulesKnown and table.concat(state.blind.rules,' '):find('Heart',1,true),'English Boss rule')
check(state.blinds.Boss.target==600,'target uses original UI inputs')
check(state.redeemedVouchers[1].key=='v_clearance_sale' and state.redeemedVouchers[1].rulesKnown,'redeemed voucher effect is separate from shop stock')
check(state.controls.play.maxCards==5,'selection limits are visible')
check(state.packChoices==nil,'pack choices do not leak into a hand')
local jokerName,effect,known=decision.card(card('j_smiley','Joker',{name='Smiley Face',set='Joker',extra=5}))
check(jokerName=='Smiley Face' and known and effect:find('5',1,true),'simple scalar description uses live extra')
local _,jolly,jollyKnown=decision.card(card('j_jolly','Joker',{name='Jolly Joker',set='Joker',t_mult=8,type='Pair'}))
check(jollyKnown and jolly:find('+8 Mult',1,true) and jolly:find('Pair',1,true),'type jokers read top-level t_mult and type')
local _,bull,bullKnown=decision.card(card('j_bull','Joker',{name='Bull',set='Joker',extra=2}))
check(bullKnown and bull:find('+8 Chips',1,true),'Bull reads current money')
local _,todo,todoKnown=decision.card(card('j_todo_list','Joker',{name='To Do List',set='Joker',extra={dollars=4,poker_hand='High Card'},to_do_poker_hand='Flush'}))
check(todoKnown and todo:find('$4',1,true) and todo:find('Flush',1,true),'To Do List reads its own target hand')
local _,_,unknown=decision.card(card('j_popcorn','Joker',{name='Popcorn',set='Joker',extra=4}))
check(not unknown,'missing dynamic values are explicit, not fabricated')
local _,_,modded=decision.card(card('j_unknown','Joker',{name='Unknown',set='Joker',extra=5}))
check(not modded,'unrecognized modded effects are unknown')
local bonus=card('m_bonus','Enhanced',{set='Enhanced'}); bonus.base={value='Ace',suit='Spades'}
G.hand.cards={bonus}
check(game.state().hand.cards[1].modifier.enhancement=='m_bonus','playing cards keep their enhancement')
G.hand.cards={}
G.STATE=G.STATES.ROUND_EVAL
G.GAME.round_resets.ante=2
G.GAME.round_resets.blind_states.Boss='Defeated'
G.GAME.blind={name='',chips=0}
state=game.state()
check(state.routeAnte==1 and state.completedRound.ante==1,'settlement keeps blind_ante after ante increment')
check(state.completedRound.blindKey=='bl_head' and state.completedRound.target==600,'completed blind survives reset')
check(state.cashOut.known and state.cashOut.amount==9 and not state.cashOut.linesKnown,'known total does not invent income lines')
G.STATE=G.STATES.TAROT_PACK
G.GAME.pack_choices=2
G.GAME.PACK_INTERRUPT=G.STATES.BLIND_SELECT
SMODS={OPENED_BOOSTER={ability={set='Booster',name='Mega Arcana Pack',extra=5},config={center={key='p_arcana_mega_1',set='Booster',config={choose=2}}}}}
G.pack_cards={cards={card('c_heirophant','Tarot',{name='The Hierophant',set='Tarot',consumeable={max_highlighted=2},mod_conv='m_bonus'})},config={}}
state=game.state()
check(state.packChoices==2 and state.packReturnPhase=='BLIND_SELECT','tag pack return context is observed')
check(state.packKey=='p_arcana_mega_1','opened booster identity comes from Steamodded, not guessed from choices')
check(state.pack.cards[1].target.min==1 and state.pack.cards[1].target.max==2,'target default matches original min-one selection')
check(state.pack.cards[1].value.rulesKnown,'Tarot effect uses English enhancement name')
check(state.shop==nil,'a tag pack outside the shop has no shop stock')
G.shop={}; G.shop_jokers={cards={popcorn},config={card_limit=2}}
check(game.state().shop.cards[1].key=='j_popcorn','a pack opened from the shop keeps its stock visible')
G.STATE=G.STATES.SHOP
check(game.state().packChoices==nil,'choices removed on return to shop')
print('Full observation Lua checks passed: '..checks)
