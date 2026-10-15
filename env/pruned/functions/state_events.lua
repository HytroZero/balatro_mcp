G.FUNCS.get_poker_hand_info = function(_cards)
    local poker_hands = evaluate_poker_hand(_cards)
    local scoring_hand = {}
    local text,disp_text,loc_disp_text = 'NULL','NULL', 'NULL'
    if next(poker_hands["Flush Five"]) then
text = "Flush Five"
scoring_hand = poker_hands["Flush Five"][1]
elseif next(poker_hands["Flush House"]) then
text = "Flush House"
scoring_hand = poker_hands["Flush House"][1]
elseif next(poker_hands["Five of a Kind"]) then
text = "Five of a Kind"
scoring_hand = poker_hands["Five of a Kind"][1]
elseif next(poker_hands["Straight Flush"]) then
text = "Straight Flush"
scoring_hand = poker_hands["Straight Flush"][1]
elseif next(poker_hands["Four of a Kind"]) then
text = "Four of a Kind"
scoring_hand = poker_hands["Four of a Kind"][1]
elseif next(poker_hands["Full House"]) then
text = "Full House"
scoring_hand = poker_hands["Full House"][1]
elseif next(poker_hands["Flush"]) then
text = "Flush"
scoring_hand = poker_hands["Flush"][1]
elseif next(poker_hands["Straight"]) then
text = "Straight"
scoring_hand = poker_hands["Straight"][1]
elseif next(poker_hands["Three of a Kind"]) then
text = "Three of a Kind"
scoring_hand = poker_hands["Three of a Kind"][1]
elseif next(poker_hands["Two Pair"]) then
text = "Two Pair"
scoring_hand = poker_hands["Two Pair"][1]
elseif next(poker_hands["Pair"]) then
text = "Pair"
scoring_hand = poker_hands["Pair"][1]
elseif next(poker_hands["High Card"]) then
text = "High Card"
scoring_hand = poker_hands["High Card"][1]
end
    disp_text = text
    if text =='Straight Flush' then
local min = 10
for j = 1, #scoring_hand do
            if scoring_hand[j]:get_id() < min then
min =scoring_hand[j]:get_id()
end
        end
if min >= 10 then
disp_text = 'Royal Flush'
end
end
    loc_disp_text = localize(disp_text, 'poker_hands')
    return text, loc_disp_text, poker_hands, scoring_hand, disp_text
end
G.FUNCS.evaluate_play = function(e)
local text,disp_text,poker_hands,scoring_hand,non_loc_disp_text = G.FUNCS.get_poker_hand_info(G.play.cards)
G.GAME.hands[text].played = G.GAME.hands[text].played + 1
G.GAME.hands[text].played_this_round = G.GAME.hands[text].played_this_round + 1
G.GAME.last_hand_played = text
G.GAME.hands[text].visible = true
local pures = {}
for i=1, #G.play.cards do
        if next(find_joker('Splash')) then
scoring_hand[i] = G.play.cards[i]
else
if G.play.cards[i].ability.effect == 'Stone Card' then
local inside = false
for j=1, #scoring_hand do
                    if scoring_hand[j] == G.play.cards[i] then
inside = true
end
                end
if not inside then
table.insert(pures, G.play.cards[i])
end
end
end
    end
for i=1, #pures do
        table.insert(scoring_hand, pures[i])
    end
table.sort(scoring_hand, function (a, b) return a.T.x < b.T.x end )
for i=1, #scoring_hand do
    end
if not G.GAME.blind:debuff_hand(G.play.cards, poker_hands, text) then
mult = mod_mult(G.GAME.hands[text].mult)
hand_chips = mod_chips(G.GAME.hands[text].chips)
if G.GAME.first_used_hand_level and G.GAME.first_used_hand_level > 0 then
level_up_hand(G.deck.cards[1], text, nil, G.GAME.first_used_hand_level)
G.GAME.first_used_hand_level = nil
end
local hand_text_set = false
for i=1, #G.jokers.cards do
            local effects = eval_card(G.jokers.cards[i], {cardarea = G.jokers,
full_hand = G.play.cards,
scoring_hand = scoring_hand,
scoring_name = text,
poker_hands = poker_hands,
before = true})
            if effects.jokers then
if effects.jokers.level_up then
level_up_hand(G.jokers.cards[i], text)
end
end
        end
mult = mod_mult(G.GAME.hands[text].mult)
hand_chips = mod_chips(G.GAME.hands[text].chips)
local modded = false
mult, hand_chips, modded = G.GAME.blind:modify_hand(G.play.cards, poker_hands, text, mult, hand_chips)
mult, hand_chips = mod_mult(mult), mod_chips(hand_chips)
for i=1, #scoring_hand do
            if scoring_hand[i].ability.effect ~= 'Stone Card' then
G.GAME.cards_played[scoring_hand[i].base.value].total = G.GAME.cards_played[scoring_hand[i].base.value].total + 1
G.GAME.cards_played[scoring_hand[i].base.value].suits[scoring_hand[i].base.suit] = true
end
            if scoring_hand[i].debuff then
G.GAME.blind.triggered = true
else
local reps = {1}
local eval = eval_card(scoring_hand[i], {repetition_only = true,
cardarea = G.play,
full_hand = G.play.cards,
scoring_hand = scoring_hand,
scoring_name = text,
poker_hands = poker_hands,
repetition = true})
if next(eval) then
for h = 1, eval.seals.repetitions do
                        reps[#reps+1] = eval
                    end
end
for j=1, #G.jokers.cards do
                    local eval = eval_card(G.jokers.cards[j], {cardarea = G.play,
full_hand = G.play.cards,
scoring_hand = scoring_hand,
scoring_name = text,
poker_hands = poker_hands,
other_card = scoring_hand[i],
repetition = true})
                    if next(eval) and eval.jokers then
for h = 1, eval.jokers.repetitions do
                            reps[#reps+1] = eval
                        end
end
                end
for j=1,#reps do
                    local effects = {eval_card(scoring_hand[i], {cardarea = G.play,
full_hand = G.play.cards,
scoring_hand = scoring_hand,
poker_hand = text})}
                    for k=1, #G.jokers.cards do
                        local eval = G.jokers.cards[k]:calculate_joker({cardarea = G.play,
full_hand = G.play.cards,
scoring_hand = scoring_hand,
scoring_name = text,
poker_hands = poker_hands,
other_card = scoring_hand[i],
individual = true})
                        if eval then
table.insert(effects, eval)
end
                    end
                    scoring_hand[i].lucky_trigger = nil
                    for ii = 1, #effects do
                        if effects[ii].chips then
hand_chips = mod_chips(hand_chips + effects[ii].chips)
end
                        if effects[ii].mult then
mult = mod_mult(mult + effects[ii].mult)
end
                        if effects[ii].p_dollars then
ease_dollars(effects[ii].p_dollars)
end
                        if effects[ii].dollars then
ease_dollars(effects[ii].dollars)
end
                        if effects[ii].extra then
local extras = {mult = false,
hand_chips = false}
if effects[ii].extra.mult_mod then
mult =mod_mult( mult + effects[ii].extra.mult_mod)
extras.mult = true
end
if effects[ii].extra.chip_mod then
hand_chips = mod_chips(hand_chips + effects[ii].extra.chip_mod)
extras.hand_chips = true
end
if effects[ii].extra.swap then
local old_mult = mult
mult = mod_mult(hand_chips)
hand_chips = mod_chips(old_mult)
extras.hand_chips = true
extras.mult = true
end
if effects[ii].extra.func then
effects[ii].extra.func()
end
end
                        if effects[ii].x_mult then
mult = mod_mult(mult*effects[ii].x_mult)
end
                        if effects[ii].edition then
hand_chips = mod_chips(hand_chips + (effects[ii].edition.chip_mod or 0))
mult = mult + (effects[ii].edition.mult_mod or 0)
mult = mod_mult(mult*(effects[ii].edition.x_mult_mod or 1))
end
                    end
                end
end
        end
local mod_percent = false
for i=1, #G.hand.cards do
                mod_percent = false
                local reps = {1}
                local j = 1
                while j <= #reps do
                    local effects = {eval_card(G.hand.cards[i], {cardarea = G.hand,
full_hand = G.play.cards,
scoring_hand = scoring_hand,
scoring_name = text,
poker_hands = poker_hands})}
                    for k=1, #G.jokers.cards do
                        local eval = G.jokers.cards[k]:calculate_joker({cardarea = G.hand,
full_hand = G.play.cards,
scoring_hand = scoring_hand,
scoring_name = text,
poker_hands = poker_hands,
other_card = G.hand.cards[i],
individual = true})
                        if eval then
mod_percent = true
table.insert(effects, eval)
end
                    end
                    if reps[j] == 1 then
local eval = eval_card(G.hand.cards[i], {repetition_only = true,
cardarea = G.hand,
full_hand = G.play.cards,
scoring_hand = scoring_hand,
scoring_name = text,
poker_hands = poker_hands,
repetition = true,
card_effects = effects})
if next(eval) and (next(effects[1]) or #effects > 1) then
for h  = 1, eval.seals.repetitions do
                                reps[#reps+1] = eval
                            end
end
for j=1, #G.jokers.cards do
                            local eval = eval_card(G.jokers.cards[j], {cardarea = G.hand,
full_hand = G.play.cards,
scoring_hand = scoring_hand,
scoring_name = text,
poker_hands = poker_hands,
other_card = G.hand.cards[i],
repetition = true,
card_effects = effects})
                            if next(eval) then
for h  = 1, eval.jokers.repetitions do
                                    reps[#reps+1] = eval
                                end
end
                        end
end
                    for ii = 1, #effects do
                        if effects[ii].card then
mod_percent = true
end
                        if effects[ii].dollars then
ease_dollars(effects[ii].dollars)
end
                        if effects[ii].h_mult then
mod_percent = true
mult = mod_mult(mult + effects[ii].h_mult)
end
                        if effects[ii].x_mult then
mod_percent = true
mult = mod_mult(mult*effects[ii].x_mult)
end
                        if effects[ii].message then
mod_percent = true
end
                    end
                    j = j +1
                end
            end
for i=1, #G.jokers.cards + #G.consumeables.cards do
            local _card = G.jokers.cards[i] or G.consumeables.cards[i - #G.jokers.cards]
            local edition_effects = eval_card(_card, {cardarea = G.jokers,
full_hand = G.play.cards,
scoring_hand = scoring_hand,
scoring_name = text,
poker_hands = poker_hands,
edition = true})
            if edition_effects.jokers then
edition_effects.jokers.edition = true
if edition_effects.jokers.chip_mod then
hand_chips = mod_chips(hand_chips + edition_effects.jokers.chip_mod)
end
if edition_effects.jokers.mult_mod then
mult = mod_mult(mult + edition_effects.jokers.mult_mod)
end
end
            local effects = eval_card(_card, {cardarea = G.jokers,
full_hand = G.play.cards,
scoring_hand = scoring_hand,
scoring_name = text,
poker_hands = poker_hands,
joker_main = true})
            if effects.jokers then
local extras = {mult = false,
hand_chips = false}
if effects.jokers.mult_mod then
mult = mod_mult(mult + effects.jokers.mult_mod)
extras.mult = true
end
if effects.jokers.chip_mod then
hand_chips = mod_chips(hand_chips + effects.jokers.chip_mod)
extras.hand_chips = true
end
if effects.jokers.Xmult_mod then
mult = mod_mult(mult*effects.jokers.Xmult_mod)
extras.mult = true
end
end
            for _, v in ipairs(G.jokers.cards) do
                local effect = v:calculate_joker{full_hand = G.play.cards,
scoring_hand = scoring_hand,
scoring_name = text,
poker_hands = poker_hands,
other_joker = _card}
                if effect then
local extras = {mult = false,
hand_chips = false}
if effect.mult_mod then
mult = mod_mult(mult + effect.mult_mod)
extras.mult = true
end
if effect.chip_mod then
hand_chips = mod_chips(hand_chips + effect.chip_mod)
extras.hand_chips = true
end
if effect.Xmult_mod then
mult = mod_mult(mult*effect.Xmult_mod)
extras.mult = true
end
end
            end
            if edition_effects.jokers then
if edition_effects.jokers.x_mult_mod then
mult = mod_mult(mult*edition_effects.jokers.x_mult_mod)
end
end
        end
local nu_chip, nu_mult = G.GAME.selected_back:trigger_effect{context = 'final_scoring_step',
chips = hand_chips,
mult = mult}
mult = mod_mult(nu_mult or mult)
hand_chips = mod_chips(nu_chip or hand_chips)
else
mult = mod_mult(0)
hand_chips = mod_chips(0)
play_area_status_text("Not Allowed!")
for i=1, #G.jokers.cards do
            local effects = eval_card(G.jokers.cards[i], {cardarea = G.jokers,
full_hand = G.play.cards,
scoring_hand = scoring_hand,
scoring_name = text,
poker_hands = poker_hands,
debuffed_hand = true})
        end
end
end
