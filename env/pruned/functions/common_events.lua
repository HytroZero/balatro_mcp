function level_up_hand(card, hand, instant, amount)
    amount = amount or 1
    G.GAME.hands[hand].level = math.max(0, G.GAME.hands[hand].level + amount)
    G.GAME.hands[hand].mult = math.max(G.GAME.hands[hand].s_mult + G.GAME.hands[hand].l_mult*(G.GAME.hands[hand].level - 1), 1)
    G.GAME.hands[hand].chips = math.max(G.GAME.hands[hand].s_chips + G.GAME.hands[hand].l_chips*(G.GAME.hands[hand].level - 1), 0)
end
function eval_card(card, context)
    context = context or {}
    local ret = {}
    if context.repetition_only then
local seals = card:calculate_seal(context)
if seals then
ret.seals = seals
end
return ret
end
    if context.cardarea == G.play then
local chips = card:get_chip_bonus()
if chips > 0 then
ret.chips = chips
end
local mult = card:get_chip_mult()
if mult > 0 then
ret.mult = mult
end
local x_mult = card:get_chip_x_mult(context)
if x_mult > 0 then
ret.x_mult = x_mult
end
local p_dollars = card:get_p_dollars()
if p_dollars > 0 then
ret.p_dollars = p_dollars
end
local jokers = card:calculate_joker(context)
if jokers then
ret.jokers = jokers
end
local edition = card:get_edition(context)
if edition then
ret.edition = edition
end
end
    if context.cardarea == G.hand then
local h_mult = card:get_chip_h_mult()
if h_mult > 0 then
ret.h_mult = h_mult
end
local h_x_mult = card:get_chip_h_x_mult()
if h_x_mult > 0 then
ret.x_mult = h_x_mult
end
local jokers = card:calculate_joker(context)
if jokers then
ret.jokers = jokers
end
end
    if context.cardarea == G.jokers or context.card == G.consumeables then
local jokers = nil
if context.edition then
jokers = card:get_edition(context)
elseif context.other_joker then
jokers = context.other_joker:calculate_joker(context)
else
jokers = card:calculate_joker(context)
end
if jokers then
ret.jokers = jokers
end
end
    return ret
end
function calculate_reroll_cost(skip_increment)
    if G.GAME.current_round.free_rerolls < 0 then
G.GAME.current_round.free_rerolls = 0
end
    if G.GAME.current_round.free_rerolls > 0 then
G.GAME.current_round.reroll_cost = 0
return
end
    G.GAME.current_round.reroll_cost_increase = G.GAME.current_round.reroll_cost_increase or 0
    if not skip_increment then
G.GAME.current_round.reroll_cost_increase = G.GAME.current_round.reroll_cost_increase + 1
end
    G.GAME.current_round.reroll_cost = (G.GAME.round_resets.temp_reroll_cost or G.GAME.round_resets.reroll_cost) + G.GAME.current_round.reroll_cost_increase
end
