Card = Moveable:extend()
function Card:set_base(card, initial)
    card = card or {}
    self.config.card = card
    for k, v in pairs(G.P_CARDS) do
        if card == v then
self.config.card_key = k
end
    end
    if next(card) then
end
    local suit_base_nominal_original = nil
    if self.base and self.base.suit_nominal_original then
suit_base_nominal_original = self.base.suit_nominal_original
end
    self.base = {name = self.config.card.name,
suit = self.config.card.suit,
value = self.config.card.value,
nominal = 0,
suit_nominal = 0,
face_nominal = 0,
times_played = 0}
    if self.base.value == '2' then
self.base.nominal = 2
self.base.id = 2
elseif self.base.value == '3' then
self.base.nominal = 3
self.base.id = 3
elseif self.base.value == '4' then
self.base.nominal = 4
self.base.id = 4
elseif self.base.value == '5' then
self.base.nominal = 5
self.base.id = 5
elseif self.base.value == '6' then
self.base.nominal = 6
self.base.id = 6
elseif self.base.value == '7' then
self.base.nominal = 7
self.base.id = 7
elseif self.base.value == '8' then
self.base.nominal = 8
self.base.id = 8
elseif self.base.value == '9' then
self.base.nominal = 9
self.base.id = 9
elseif self.base.value == '10' then
self.base.nominal = 10
self.base.id = 10
elseif self.base.value == 'Jack' then
self.base.nominal = 10
self.base.face_nominal = 0.1
self.base.id = 11
elseif self.base.value == 'Queen' then
self.base.nominal = 10
self.base.face_nominal = 0.2
self.base.id = 12
elseif self.base.value == 'King' then
self.base.nominal = 10
self.base.face_nominal = 0.3
self.base.id = 13
elseif self.base.value == 'Ace' then
self.base.nominal = 11
self.base.face_nominal = 0.4
self.base.id = 14
end
    if initial then
self.base.original_value = self.base.value
end
    if self.base.suit == 'Diamonds' then
self.base.suit_nominal = 0.01
self.base.suit_nominal_original = suit_base_nominal_original or 0.001
elseif self.base.suit == 'Clubs' then
self.base.suit_nominal = 0.02
self.base.suit_nominal_original = suit_base_nominal_original or 0.002
elseif self.base.suit == 'Hearts' then
self.base.suit_nominal = 0.03
self.base.suit_nominal_original = suit_base_nominal_original or 0.003
elseif self.base.suit == 'Spades' then
self.base.suit_nominal = 0.04
self.base.suit_nominal_original = suit_base_nominal_original or 0.004
end
    if not initial then
G.GAME.blind:debuff_card(self)
end
end
function Card:set_ability(center, initial, delay_sprites)
    local X, Y, W, H = self.T.x, self.T.y, self.T.w, self.T.h
    local old_center = self.config.center
    self.config.center = center
    self.sticker_run = nil
    for k, v in pairs(G.P_CENTERS) do
        if center == v then
self.config.center_key = k
end
    end
    if center.name == "Half Joker" and (center.discovered or self.bypass_discovery_center) then
H = H/1.7
self.T.h = H
end
    if center.name == "Photograph" and (center.discovered or self.bypass_discovery_center) then
H = H/1.2
self.T.h = H
end
    if center.name == "Square Joker" and (center.discovered or self.bypass_discovery_center) then
H = W
self.T.h = H
end
    if center.name == "Wee Joker" and (center.discovered or self.bypass_discovery_center) then
H = H*0.7
W = W*0.7
self.T.h = H
self.T.w = W
end
    if self.ability and old_center and old_center.config.bonus then
self.ability.bonus = self.ability.bonus - old_center.config.bonus
end
    self.ability = {name = center.name,
effect = center.effect,
set = center.set,
mult = center.config.mult or 0,
h_mult = center.config.h_mult or 0,
h_x_mult = center.config.h_x_mult or 0,
h_dollars = center.config.h_dollars or 0,
p_dollars = center.config.p_dollars or 0,
t_mult = center.config.t_mult or 0,
t_chips = center.config.t_chips or 0,
x_mult = center.config.Xmult or 1,
h_size = center.config.h_size or 0,
d_size = center.config.d_size or 0,
extra = copy_table(center.config.extra) or nil,
extra_value = 0,
type = center.config.type or '',
order = center.order or nil,
forced_selection = self.ability and self.ability.forced_selection or nil,
perma_bonus = self.ability and self.ability.perma_bonus or 0}
    self.ability.bonus = (self.ability.bonus or 0) + (center.config.bonus or 0)
    if center.consumeable then
self.ability.consumeable = center.config
end
    if self.ability.name == "Invisible Joker" then
self.ability.invis_rounds = 0
end
    if self.ability.name == 'To Do List' then
local _poker_hands = {}
for k, v in pairs(G.GAME.hands) do
            if v.visible then
_poker_hands[#_poker_hands+1] = k
end
        end
local old_hand = self.ability.to_do_poker_hand
self.ability.to_do_poker_hand = nil
while not self.ability.to_do_poker_hand do
            self.ability.to_do_poker_hand = pseudorandom_element(_poker_hands, pseudoseed((self.area and self.area.config.type == 'title') and 'false_to_do' or 'to_do'))
            if self.ability.to_do_poker_hand == old_hand then
self.ability.to_do_poker_hand = nil
end
        end
end
    if self.ability.name == 'Caino' then
self.ability.caino_xmult = 1
end
    if self.ability.name == 'Yorick' then
self.ability.yorick_discards = self.ability.extra.discards
end
    if self.ability.name == 'Loyalty Card' then
self.ability.burnt_hand = 0
self.ability.loyalty_remaining = self.ability.extra.every
end
    self.base_cost = center.cost or 1
    self.ability.hands_played_at_create = G.GAME and G.GAME.hands_played or 0
    self.label = center.label or self.config.card.label or self.ability.set
    if self.ability.set == 'Joker' then
self.label = self.ability.name
end
    if self.ability.set == 'Edition' then
self.label = self.ability.name
end
    if self.ability.consumeable then
self.label = self.ability.name
end
    if self.ability.set == 'Voucher' then
self.label = self.ability.name
end
    if self.ability.set == 'Booster' then
self.label = self.ability.name
self.mouse_damping = 1.5
end
    if not G.OVERLAY_MENU then
for k, v in pairs(G.P_CENTERS) do
            if v.name == self.ability.name then
G.GAME.used_jokers[k] = true
end
        end
end
    if not initial then
G.GAME.blind:debuff_card(self)
end
end
function Card:set_cost()
    self.extra_cost = 0 + G.GAME.inflation
    if self.edition then
self.extra_cost = self.extra_cost + (self.edition.holo and 3 or 0) + (self.edition.foil and 2 or 0) +
        (self.edition.polychrome and 5 or 0) + (self.edition.negative and 5 or 0)
end
    self.cost = math.max(1, math.floor((self.base_cost + self.extra_cost + 0.5)*(100-G.GAME.discount_percent)/100))
    if self.ability.set == 'Booster' and G.GAME.modifiers.booster_ante_scaling then
self.cost = self.cost + G.GAME.round_resets.ante - 1
end
    if self.ability.set == 'Booster' and (not G.SETTINGS.tutorial_complete) and G.SETTINGS.tutorial_progress and (not G.SETTINGS.tutorial_progress.completed_parts['shop_1']) then
self.cost = self.cost + 3
end
    if (self.ability.set == 'Planet' or (self.ability.set == 'Booster' and self.ability.name:find('Celestial'))) and #find_joker('Astronomer') > 0 then
self.cost = 0
end
    if self.ability.rental then
self.cost = 1
end
    self.sell_cost = math.max(1, math.floor(self.cost/2)) + (self.ability.extra_value or 0)
    if self.area and self.ability.couponed and (self.area == G.shop_jokers or self.area == G.shop_booster) then
self.cost = 0
end
end
function Card:set_edition(edition, immediate, silent)
    self.edition = nil
    if not edition then
return
end
    if edition.holo then
if not self.edition then
self.edition = {}
end
self.edition.mult = G.P_CENTERS.e_holo.config.extra
self.edition.holo = true
self.edition.type = 'holo'
elseif edition.foil then
if not self.edition then
self.edition = {}
end
self.edition.chips = G.P_CENTERS.e_foil.config.extra
self.edition.foil = true
self.edition.type = 'foil'
elseif edition.polychrome then
if not self.edition then
self.edition = {}
end
self.edition.x_mult = G.P_CENTERS.e_polychrome.config.extra
self.edition.polychrome = true
self.edition.type = 'polychrome'
elseif edition.negative then
if not self.edition then
self.edition = {}
if self.added_to_deck then
if self.ability.consumeable then
G.consumeables.config.card_limit = G.consumeables.config.card_limit + 1
else
G.jokers.config.card_limit = G.jokers.config.card_limit + 1
end
end
end
self.edition.negative = true
self.edition.type = 'negative'
end
    if self.edition and not silent then
        G.CONTROLLER.locks.edition = true
        G.E_MANAGER:add_event(Event({
            trigger = 'after',
            delay = not immediate and 0.2 or 0,
            blockable = not immediate,
            func = function()
                self:juice_up(1, 0.5)
                if self.edition.foil then play_sound('foil1', 1.2, 0.4) end
                if self.edition.holo then play_sound('holo1', 1.2*1.58, 0.4) end
                if self.edition.polychrome then play_sound('polychrome1', 1.2, 0.7) end
                if self.edition.negative then play_sound('negative', 1.5, 0.4) end
               return true
            end
          }))
          G.E_MANAGER:add_event(Event({
            trigger = 'after',
            delay = 0.1,
            func = function()
                G.CONTROLLER.locks.edition = false
               return true
            end
          }))
    end
    self:set_cost()
end
function Card:set_debuff(should_debuff)
    if self.ability.perishable and self.ability.perish_tally <= 0 then
if not self.debuff then
self.debuff = true
if self.area == G.jokers then
self:remove_from_deck(true)
end
end
return
end
    if should_debuff ~= self.debuff then
if self.area == G.jokers then
if should_debuff then
self:remove_from_deck(true)
else
self:add_to_deck(true)
end
end
self.debuff = should_debuff
end
end
function Card:change_suit(new_suit)
    local new_code = (new_suit == 'Diamonds' and 'D_') or
    (new_suit == 'Spades' and 'S_') or
    (new_suit == 'Clubs' and 'C_') or
    (new_suit == 'Hearts' and 'H_')
    local new_val = (self.base.value == 'Ace' and 'A') or
    (self.base.value == 'King' and 'K') or
    (self.base.value == 'Queen' and 'Q') or
    (self.base.value == 'Jack' and 'J') or
    (self.base.value == '10' and 'T') or
    (self.base.value)
    local new_card = G.P_CARDS[new_code..new_val]
    self:set_base(new_card)
    G.GAME.blind:debuff_card(self)
end
function Card:add_to_deck(from_debuff)
    if not self.added_to_deck then
self.added_to_deck = true
if self.ability.set == 'Enhanced' or self.ability.set == 'Default' then
return
end
if self.ability.h_size ~= 0 then
G.hand:change_size(self.ability.h_size)
end
if self.ability.d_size > 0 then
G.GAME.round_resets.discards = G.GAME.round_resets.discards + self.ability.d_size
end
if self.ability.name == 'Credit Card' then
G.GAME.bankrupt_at = G.GAME.bankrupt_at - self.ability.extra
end
if self.ability.name == 'Chicot' and G.GAME.blind and G.GAME.blind.boss and not G.GAME.blind.disabled then
G.GAME.blind:disable()
end
if self.ability.name == 'Chaos the Clown' then
G.GAME.current_round.free_rerolls = G.GAME.current_round.free_rerolls + 1
calculate_reroll_cost(true)
end
if self.ability.name == 'Turtle Bean' then
G.hand:change_size(self.ability.extra.h_size)
end
if self.ability.name == 'Oops! All 6s' then
for k, v in pairs(G.GAME.probabilities) do
                G.GAME.probabilities[k] = v*2
            end
end
if self.ability.name == 'To the Moon' then
G.GAME.interest_amount = G.GAME.interest_amount + self.ability.extra
end
if self.ability.name == 'Troubadour' then
G.hand:change_size(self.ability.extra.h_size)
G.GAME.round_resets.hands = G.GAME.round_resets.hands + self.ability.extra.h_plays
end
if self.ability.name == 'Stuntman' then
G.hand:change_size(-self.ability.extra.h_size)
end
if self.edition and self.edition.negative then
if from_debuff then
self.ability.queue_negative_removal = nil
else
if self.ability.consumeable then
G.consumeables.config.card_limit = G.consumeables.config.card_limit + 1
else
G.jokers.config.card_limit = G.jokers.config.card_limit + 1
end
end
end
end
end
function Card:remove_from_deck(from_debuff)
    if self.added_to_deck then
self.added_to_deck = false
if self.ability.h_size ~= 0 then
G.hand:change_size(-self.ability.h_size)
end
if self.ability.d_size > 0 then
G.GAME.round_resets.discards = G.GAME.round_resets.discards - self.ability.d_size
end
if self.ability.name == 'Credit Card' then
G.GAME.bankrupt_at = G.GAME.bankrupt_at + self.ability.extra
end
if self.ability.name == 'Chaos the Clown' then
G.GAME.current_round.free_rerolls = G.GAME.current_round.free_rerolls - 1
calculate_reroll_cost(true)
end
if self.ability.name == 'Turtle Bean' then
G.hand:change_size(-self.ability.extra.h_size)
end
if self.ability.name == 'Oops! All 6s' then
for k, v in pairs(G.GAME.probabilities) do
                G.GAME.probabilities[k] = v/2
            end
end
if self.ability.name == 'To the Moon' then
G.GAME.interest_amount = G.GAME.interest_amount - self.ability.extra
end
if self.ability.name == 'Troubadour' then
G.hand:change_size(-self.ability.extra.h_size)
G.GAME.round_resets.hands = G.GAME.round_resets.hands - self.ability.extra.h_plays
end
if self.ability.name == 'Stuntman' then
G.hand:change_size(self.ability.extra.h_size)
end
if self.edition and self.edition.negative and G.jokers then
if from_debuff then
self.ability.queue_negative_removal = true
else
if self.ability.consumeable then
G.consumeables.config.card_limit = G.consumeables.config.card_limit - 1
else
G.jokers.config.card_limit = G.jokers.config.card_limit - 1
end
end
end
end
end
function Card:get_nominal(mod)
    local mult = 1
    if mod == 'suit' then
mult = 1000
end
    if self.ability.effect == 'Stone Card' then
mult = -1000
end
    return self.base.nominal + self.base.suit_nominal*mult + (self.base.suit_nominal_original or 0)*0.0001*mult + self.base.face_nominal + 0.000001*self.unique_val
end
function Card:get_id()
    if self.ability.effect == 'Stone Card' and not self.vampired then
return -math.random(100, 1000000)
end
    return self.base.id
end
function Card:is_face(from_boss)
    if self.debuff and not from_boss then
return
end
    local id = self:get_id()
    if id == 11 or id == 12 or id == 13 or next(find_joker("Pareidolia")) then
return true
end
end
function Card:get_chip_bonus()
    if self.debuff then
return 0
end
    if self.ability.effect == 'Stone Card' then
return self.ability.bonus + (self.ability.perma_bonus or 0)
end
    return self.base.nominal + self.ability.bonus + (self.ability.perma_bonus or 0)
end
function Card:get_chip_mult()
    if self.debuff then
return 0
end
    if self.ability.set == 'Joker' then
return 0
end
    if self.ability.effect == "Lucky Card" then
if pseudorandom('lucky_mult') < G.GAME.probabilities.normal/5 then
self.lucky_trigger = true
return self.ability.mult
else
return 0
end
else
return self.ability.mult
end
end
function Card:get_chip_x_mult(context)
    if self.debuff then
return 0
end
    if self.ability.set == 'Joker' then
return 0
end
    if self.ability.x_mult <= 1 then
return 0
end
    return self.ability.x_mult
end
function Card:get_chip_h_mult()
    if self.debuff then
return 0
end
    return self.ability.h_mult
end
function Card:get_chip_h_x_mult()
    if self.debuff then
return 0
end
    return self.ability.h_x_mult
end
function Card:get_edition()
    if self.debuff then
return
end
    if self.edition then
local ret = {card = self}
if self.edition.x_mult then
ret.x_mult_mod = self.edition.x_mult
end
if self.edition.mult then
ret.mult_mod = self.edition.mult
end
if self.edition.chips then
ret.chip_mod = self.edition.chips
end
return ret
end
end
function Card:get_p_dollars()
    if self.debuff then
return 0
end
    local ret = 0
    if self.seal == 'Gold' then
ret = ret +  3
end
    if self.ability.p_dollars > 0 then
if self.ability.effect == "Lucky Card" then
if pseudorandom('lucky_money') < G.GAME.probabilities.normal/15 then
self.lucky_trigger = true
ret = ret +  self.ability.p_dollars
end
else
ret = ret + self.ability.p_dollars
end
end
    if ret > 0 then
G.GAME.dollar_buffer = (G.GAME.dollar_buffer or 0) + ret
end
    return ret
end
function Card:calculate_seal(context)
    if self.debuff then
return nil
end
    if context.repetition then
if self.seal == 'Red' then
return {repetitions = 1,
card = self}
end
end
end
local scoring_jokers = {}
local function scoring_common_main(self,context)
end
local function scoring_common_individual(self,context)
if self.ability.effect == 'Suit Mult' and
                    context.other_card:is_suit(self.ability.extra.suit) then
return {mult = self.ability.extra.s_mult,
card = self}
end
end
scoring_jokers["Blueprint"] = function(self,context)
do
local other_joker = nil
for i = 1, #G.jokers.cards do
                if G.jokers.cards[i] == self then
other_joker = G.jokers.cards[i+1]
end
            end
if other_joker and other_joker ~= self then
context.blueprint = (context.blueprint and (context.blueprint + 1)) or 1
context.blueprint_card = context.blueprint_card or self
if context.blueprint > #G.jokers.cards + 1 then
return
end
local other_joker_ret = other_joker:calculate_joker(context)
if other_joker_ret then
other_joker_ret.card = context.blueprint_card or self
return other_joker_ret
end
end
end
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Brainstorm"] = function(self,context)
do
local other_joker = G.jokers.cards[1]
if other_joker and other_joker ~= self then
context.blueprint = (context.blueprint and (context.blueprint + 1)) or 1
context.blueprint_card = context.blueprint_card or self
if context.blueprint > #G.jokers.cards + 1 then
return
end
local other_joker_ret = other_joker:calculate_joker(context)
if other_joker_ret then
other_joker_ret.card = context.blueprint_card or self
return other_joker_ret
end
end
end
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Flash Card"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
if self.ability.name == 'Flash Card' and self.ability.mult > 0 then
return {mult_mod = self.ability.mult}
end
end
end
end
end
scoring_jokers["Red Card"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
if self.ability.name == 'Red Card' and self.ability.mult > 0 then
return {mult_mod = self.ability.mult}
end
end
end
end
end
scoring_jokers["DNA"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
if self.ability.name == 'DNA' and G.GAME.current_round.hands_played == 0 then
if #context.full_hand == 1 then
G.playing_card = (G.playing_card and G.playing_card + 1) or 1
local _card = copy_card(context.full_hand[1], nil, nil, G.playing_card)
_card:add_to_deck()
G.deck.config.card_limit = G.deck.config.card_limit + 1
table.insert(G.playing_cards, _card)
G.hand:emplace(_card)
_card.states.visible = nil
return {card = self,
playing_cards_created = {true}}
end
end
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Ceremonial Dagger"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
if self.ability.name == 'Ceremonial Dagger' and self.ability.mult > 0 then
return {mult_mod = self.ability.mult}
end
end
end
end
end
scoring_jokers["Caino"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
if self.ability.name == 'Caino' and self.ability.caino_xmult > 1 then
return {Xmult_mod = self.ability.caino_xmult}
end
end
end
end
end
scoring_jokers["Fortune Teller"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
if self.ability.name == 'Fortune Teller' and G.GAME.consumeable_usage_total and G.GAME.consumeable_usage_total.tarot > 0 then
return {mult_mod = G.GAME.consumeable_usage_total.tarot}
end
end
end
end
end
scoring_jokers["Matador"] = function(self,context)
if context.debuffed_hand then
do
if G.GAME.blind.triggered then
ease_dollars(self.ability.extra)
G.GAME.dollar_buffer = (G.GAME.dollar_buffer or 0) + self.ability.extra
return {dollars = self.ability.extra}
end
end
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
do
if G.GAME.blind.triggered then
ease_dollars(self.ability.extra)
G.GAME.dollar_buffer = (G.GAME.dollar_buffer or 0) + self.ability.extra
return {dollars = self.ability.extra}
end
end
end
end
end
end
scoring_jokers["Castle"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
if self.ability.name == 'Castle' and (self.ability.extra.chips > 0) then
return {chip_mod = self.ability.extra.chips}
end
end
end
end
end
scoring_jokers["Green Joker"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
if self.ability.name == 'Green Joker' and not context.blueprint then
self.ability.mult = self.ability.mult + self.ability.extra.hand_add
return {card = self}
end
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
if self.ability.name == 'Green Joker' and self.ability.mult > 0 then
return {mult_mod = self.ability.mult}
end
end
end
end
end
scoring_jokers["Mime"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
if context.cardarea == G.hand then
if self.ability.name == 'Mime' and
                (next(context.card_effects[1]) or #context.card_effects > 1) then
return {repetitions = self.ability.extra,
card = self}
end
end
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Popcorn"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
if self.ability.name == 'Popcorn' and self.ability.mult > 0 then
return {mult_mod = self.ability.mult}
end
end
end
end
end
scoring_jokers["To Do List"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
if self.ability.name == 'To Do List' and context.scoring_name == self.ability.to_do_poker_hand then
ease_dollars(self.ability.extra.dollars)
G.GAME.dollar_buffer = (G.GAME.dollar_buffer or 0) + self.ability.extra.dollars
return {dollars = self.ability.extra.dollars}
end
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Gros Michel"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
do
return {mult_mod = self.ability.extra.mult}
end
end
end
end
end
scoring_jokers["Cavendish"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
do
return {Xmult_mod = self.ability.extra.Xmult}
end
end
end
end
end
scoring_jokers["Hiker"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
do
context.other_card.ability.perma_bonus = context.other_card.ability.perma_bonus or 0
context.other_card.ability.perma_bonus = context.other_card.ability.perma_bonus + self.ability.extra
return {extra = {},
card = self}
end
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Lucky Cat"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
if self.ability.name == 'Lucky Cat' and context.other_card.lucky_trigger and not context.blueprint then
self.ability.x_mult = self.ability.x_mult + self.ability.extra
return {extra = {focus = self},
card = self}
end
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Wee Joker"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
if self.ability.name == 'Wee Joker' and
                    context.other_card:get_id() == 2 and not context.blueprint then
self.ability.extra.chips = self.ability.extra.chips + self.ability.extra.chip_mod
return {extra = {focus = self},
card = self}
end
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
do
return {chip_mod = self.ability.extra.chips}
end
end
end
end
end
scoring_jokers["Photograph"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
do
local first_face = nil
for i = 1, #context.scoring_hand do
                        if context.scoring_hand[i]:is_face() then
first_face = context.scoring_hand[i]
break
end
                    end
if context.other_card == first_face then
return {x_mult = self.ability.extra,
card = self}
end
end
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["8 Ball"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
if self.ability.name == '8 Ball' and #G.consumeables.cards + G.GAME.consumeable_buffer < G.consumeables.config.card_limit then
if (context.other_card:get_id() == 8) and (pseudorandom('8ball') < G.GAME.probabilities.normal/self.ability.extra) then
G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1
return {extra = {focus = self,
func = function()
                            end},
card = self}
end
end
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["The Idol"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
if self.ability.name == 'The Idol' and
                    context.other_card:get_id() == G.GAME.current_round.idol_card.id and
                    context.other_card:is_suit(G.GAME.current_round.idol_card.suit) then
return {x_mult = self.ability.extra,
card = self}
end
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Scary Face"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
if self.ability.name == 'Scary Face' and (
                    context.other_card:is_face()) then
return {chips = self.ability.extra,
card = self}
end
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Smiley Face"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
if self.ability.name == 'Smiley Face' and (
                    context.other_card:is_face()) then
return {mult = self.ability.extra,
card = self}
end
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Golden Ticket"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
if self.ability.name == 'Golden Ticket' and
                    context.other_card.ability.name == 'Gold Card' then
G.GAME.dollar_buffer = (G.GAME.dollar_buffer or 0) + self.ability.extra
return {dollars = self.ability.extra,
card = self}
end
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Scholar"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
if self.ability.name == 'Scholar' and
                    context.other_card:get_id() == 14 then
return {chips = self.ability.extra.chips,
mult = self.ability.extra.mult,
card = self}
end
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Walkie Talkie"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
if self.ability.name == 'Walkie Talkie' and
                (context.other_card:get_id() == 10 or context.other_card:get_id() == 4) then
return {chips = self.ability.extra.chips,
mult = self.ability.extra.mult,
card = self}
end
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Business Card"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
if self.ability.name == 'Business Card' and
                    context.other_card:is_face() and
                    pseudorandom('business') < G.GAME.probabilities.normal/self.ability.extra then
G.GAME.dollar_buffer = (G.GAME.dollar_buffer or 0) + 2
return {dollars = 2,
card = self}
end
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Fibonacci"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
if self.ability.name == 'Fibonacci' and (
                context.other_card:get_id() == 2 or
                context.other_card:get_id() == 3 or
                context.other_card:get_id() == 5 or
                context.other_card:get_id() == 8 or
                context.other_card:get_id() == 14) then
return {mult = self.ability.extra,
card = self}
end
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Even Steven"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
if self.ability.name == 'Even Steven' and
                context.other_card:get_id() <= 10 and
                context.other_card:get_id() >= 0 and
                context.other_card:get_id()%2 == 0 then
return {mult = self.ability.extra,
card = self}
end
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Odd Todd"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
if self.ability.name == 'Odd Todd' and
                ((context.other_card:get_id() <= 10 and
                context.other_card:get_id() >= 0 and
                context.other_card:get_id()%2 == 1) or
                (context.other_card:get_id() == 14)) then
return {chips = self.ability.extra,
card = self}
end
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Rough Gem"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
if self.ability.name == 'Rough Gem' and
                context.other_card:is_suit("Diamonds") then
G.GAME.dollar_buffer = (G.GAME.dollar_buffer or 0) + self.ability.extra
return {dollars = self.ability.extra,
card = self}
end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Onyx Agate"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
if self.ability.name == 'Onyx Agate' and
                context.other_card:is_suit("Clubs") then
return {mult = self.ability.extra,
card = self}
end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Arrowhead"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
if self.ability.name == 'Arrowhead' and
                context.other_card:is_suit("Spades") then
return {chips = self.ability.extra,
card = self}
end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Bloodstone"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
if self.ability.name ==  'Bloodstone' and
                context.other_card:is_suit("Hearts") and
                pseudorandom('bloodstone') < G.GAME.probabilities.normal/self.ability.extra.odds then
return {x_mult = self.ability.extra.Xmult,
card = self}
end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Ancient Joker"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
if self.ability.name == 'Ancient Joker' and
                context.other_card:is_suit(G.GAME.current_round.ancient_card.suit) then
return {x_mult = self.ability.extra,
card = self}
end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Triboulet"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
if self.ability.name == 'Triboulet' and
                    (context.other_card:get_id() == 12 or context.other_card:get_id() == 13) then
return {x_mult = self.ability.extra,
card = self}
end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Shoot the Moon"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
if context.cardarea == G.hand then
if self.ability.name == 'Shoot the Moon' and
                        context.other_card:get_id() == 12 then
if context.other_card.debuff then
return {card = self}
else
return {h_mult = 13,
card = self}
end
end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Baron"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
if context.cardarea == G.hand then
if self.ability.name == 'Baron' and
                        context.other_card:get_id() == 13 then
if context.other_card.debuff then
return {card = self}
else
return {x_mult = self.ability.extra,
card = self}
end
end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Reserved Parking"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
if context.cardarea == G.hand then
if self.ability.name == 'Reserved Parking' and
                    context.other_card:is_face() and
                    pseudorandom('parking') < G.GAME.probabilities.normal/self.ability.extra.odds then
if context.other_card.debuff then
return {card = self}
else
G.GAME.dollar_buffer = (G.GAME.dollar_buffer or 0) + self.ability.extra.dollars
return {dollars = self.ability.extra.dollars,
card = self}
end
end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Raised Fist"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
if context.cardarea == G.hand then
do
local temp_Mult, temp_ID = 15, 15
local raised_card = nil
for i=1, #G.hand.cards do
                            if temp_ID >= G.hand.cards[i].base.id and G.hand.cards[i].ability.effect ~= 'Stone Card' then
temp_Mult = G.hand.cards[i].base.nominal
temp_ID = G.hand.cards[i].base.id
raised_card = G.hand.cards[i]
end
                        end
if raised_card == context.other_card then
if context.other_card.debuff then
return {card = self}
else
return {h_mult = 2*temp_Mult,
card = self}
end
end
end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Sock and Buskin"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
if context.cardarea == G.play then
if self.ability.name == 'Sock and Buskin' and (
                context.other_card:is_face()) then
return {repetitions = self.ability.extra,
card = self}
end
end
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Hanging Chad"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
if context.cardarea == G.play then
if self.ability.name == 'Hanging Chad' and (
                context.other_card == context.scoring_hand[1]) then
return {repetitions = self.ability.extra,
card = self}
end
end
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Dusk"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
if context.cardarea == G.play then
if self.ability.name == 'Dusk' and G.GAME.current_round.hands_left == 0 then
return {repetitions = self.ability.extra,
card = self}
end
end
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Seltzer"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
if context.cardarea == G.play then
do
return {repetitions = 1,
card = self}
end
end
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Hack"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
if context.cardarea == G.play then
if self.ability.name == 'Hack' and (
                context.other_card:get_id() == 2 or
                context.other_card:get_id() == 3 or
                context.other_card:get_id() == 4 or
                context.other_card:get_id() == 5) then
return {repetitions = self.ability.extra,
card = self}
end
end
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Baseball Card"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
if self.ability.name == 'Baseball Card' and context.other_joker.config.center.rarity == 2 and self ~= context.other_joker then
return {Xmult_mod = self.ability.extra}
end
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Spare Trousers"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
if self.ability.name == 'Spare Trousers' and (next(context.poker_hands['Two Pair']) or next(context.poker_hands['Full House'])) and not context.blueprint then
self.ability.mult = self.ability.mult + self.ability.extra
return {card = self}
end
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
if self.ability.name == 'Spare Trousers' and self.ability.mult > 0 then
return {mult_mod = self.ability.mult}
end
end
end
end
end
scoring_jokers["Space Joker"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
if self.ability.name == 'Space Joker' and pseudorandom('space') < G.GAME.probabilities.normal/self.ability.extra then
return {card = self,
level_up = true}
end
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Square Joker"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
if self.ability.name == 'Square Joker' and #context.full_hand == 4 and not context.blueprint then
self.ability.extra.chips = self.ability.extra.chips + self.ability.extra.chip_mod
return {card = self}
end
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
do
return {chip_mod = self.ability.extra.chips}
end
end
end
end
end
scoring_jokers["Runner"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
if self.ability.name == 'Runner' and next(context.poker_hands['Straight']) and not context.blueprint then
self.ability.extra.chips = self.ability.extra.chips + self.ability.extra.chip_mod
return {card = self}
end
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
do
return {chip_mod = self.ability.extra.chips}
end
end
end
end
end
scoring_jokers["Midas Mask"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
if self.ability.name == 'Midas Mask' and not context.blueprint then
local faces = {}
for k, v in ipairs(context.scoring_hand) do
                            if v:is_face() then
faces[#faces+1] = v
v:set_ability(G.P_CENTERS.m_gold, nil, true)
end
                        end
if #faces > 0 then
return {card = self}
end
end
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Vampire"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
if self.ability.name == 'Vampire' and not context.blueprint then
local enhanced = {}
for k, v in ipairs(context.scoring_hand) do
                            if v.config.center ~= G.P_CENTERS.c_base and not v.debuff and not v.vampired then
enhanced[#enhanced+1] = v
v.vampired = true
v:set_ability(G.P_CENTERS.c_base, nil, true)
end
                        end
if #enhanced > 0 then
self.ability.x_mult = self.ability.x_mult + self.ability.extra*#enhanced
return {card = self}
end
end
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Ride the Bus"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
if self.ability.name == 'Ride the Bus' and not context.blueprint then
local faces = false
for i = 1, #context.scoring_hand do
                            if context.scoring_hand[i]:is_face() then
faces = true
end
                        end
if faces then
local last_mult = self.ability.mult
self.ability.mult = 0
if last_mult > 0 then
return {card = self}
end
else
self.ability.mult = self.ability.mult + self.ability.extra
end
end
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
if self.ability.name == 'Ride the Bus' and self.ability.mult > 0 then
return {mult_mod = self.ability.mult}
end
end
end
end
end
scoring_jokers["Obelisk"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
if self.ability.name == 'Obelisk' and not context.blueprint then
local reset = true
local play_more_than = (G.GAME.hands[context.scoring_name].played or 0)
for k, v in pairs(G.GAME.hands) do
                            if k ~= context.scoring_name and v.played >= play_more_than and v.visible then
reset = false
end
                        end
if reset then
if self.ability.x_mult > 1 then
self.ability.x_mult = 1
return {card = self}
end
else
self.ability.x_mult = self.ability.x_mult + self.ability.extra
end
end
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Ice Cream"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
do
return {chip_mod = self.ability.extra.chips}
end
end
end
end
end
scoring_jokers["Loyalty Card"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
do
self.ability.loyalty_remaining = (self.ability.extra.every-1-(G.GAME.hands_played - self.ability.hands_played_at_create))%(self.ability.extra.every+1)
if context.blueprint then
if self.ability.loyalty_remaining == self.ability.extra.every then
return {Xmult_mod = self.ability.extra.Xmult}
end
else
if self.ability.loyalty_remaining == 0 then
local eval = function(card) return (card.ability.loyalty_remaining == 0) end
elseif self.ability.loyalty_remaining == self.ability.extra.every then
return {Xmult_mod = self.ability.extra.Xmult}
end
end
end
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
scoring_jokers["Seeing Double"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
do
local suits = {['Hearts'] = 0,
['Diamonds'] = 0,
['Spades'] = 0,
['Clubs'] = 0}
for i = 1, #context.scoring_hand do
                                if context.scoring_hand[i].ability.name ~= 'Wild Card' then
if context.scoring_hand[i]:is_suit('Hearts') then
suits["Hearts"] = suits["Hearts"] + 1
end
if context.scoring_hand[i]:is_suit('Diamonds') then
suits["Diamonds"] = suits["Diamonds"] + 1
end
if context.scoring_hand[i]:is_suit('Spades') then
suits["Spades"] = suits["Spades"] + 1
end
if context.scoring_hand[i]:is_suit('Clubs') then
suits["Clubs"] = suits["Clubs"] + 1
end
end
                            end
for i = 1, #context.scoring_hand do
                                if context.scoring_hand[i].ability.name == 'Wild Card' then
if context.scoring_hand[i]:is_suit('Clubs') and suits["Clubs"] == 0 then
suits["Clubs"] = suits["Clubs"] + 1
elseif context.scoring_hand[i]:is_suit('Diamonds') and suits["Diamonds"] == 0 then
suits["Diamonds"] = suits["Diamonds"] + 1
elseif context.scoring_hand[i]:is_suit('Spades') and suits["Spades"] == 0 then
suits["Spades"] = suits["Spades"] + 1
elseif context.scoring_hand[i]:is_suit('Hearts') and suits["Hearts"] == 0 then
suits["Hearts"] = suits["Hearts"] + 1
end
end
                            end
if (suits["Hearts"] > 0 or
                            suits["Diamonds"] > 0 or
                            suits["Spades"] > 0) and
                            suits["Clubs"] > 0 then
return {Xmult_mod = self.ability.extra}
end
end
end
end
end
end
scoring_jokers["Half Joker"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
if self.ability.name == 'Half Joker' and #context.full_hand <= self.ability.extra.size then
return {mult_mod = self.ability.extra.mult}
end
end
end
end
end
scoring_jokers["Abstract Joker"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
do
local x = 0
for i = 1, #G.jokers.cards do
                                if G.jokers.cards[i].ability.set == 'Joker' then
x = x + 1
end
                            end
return {mult_mod = x*self.ability.extra}
end
end
end
end
end
scoring_jokers["Acrobat"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
if self.ability.name == 'Acrobat' and G.GAME.current_round.hands_left == 0 then
return {Xmult_mod = self.ability.extra}
end
end
end
end
end
scoring_jokers["Mystic Summit"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
if self.ability.name == 'Mystic Summit' and G.GAME.current_round.discards_left == self.ability.extra.d_remaining then
return {mult_mod = self.ability.extra.mult}
end
end
end
end
end
scoring_jokers["Misprint"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
do
local temp_Mult = pseudorandom('misprint', self.ability.extra.min, self.ability.extra.max)
return {mult_mod = temp_Mult}
end
end
end
end
end
scoring_jokers["Banner"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
if self.ability.name == 'Banner' and G.GAME.current_round.discards_left > 0 then
return {chip_mod = G.GAME.current_round.discards_left*self.ability.extra}
end
end
end
end
end
scoring_jokers["Stuntman"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
do
return {chip_mod = self.ability.extra.chip_mod}
end
end
end
end
end
scoring_jokers["Supernova"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
do
return {mult_mod = G.GAME.hands[context.scoring_name].played}
end
end
end
end
end
scoring_jokers["Vagabond"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
if self.ability.name == 'Vagabond' and #G.consumeables.cards + G.GAME.consumeable_buffer < G.consumeables.config.card_limit then
if G.GAME.dollars <= self.ability.extra then
G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1
return {card = self}
end
end
end
end
end
end
scoring_jokers["Superposition"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
if self.ability.name == 'Superposition' and #G.consumeables.cards + G.GAME.consumeable_buffer < G.consumeables.config.card_limit then
local aces = 0
for i = 1, #context.scoring_hand do
                                if context.scoring_hand[i]:get_id() == 14 then
aces = aces + 1
end
                            end
if aces >= 1 and next(context.poker_hands["Straight"]) then
local card_type = 'Tarot'
G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1
return {card = self}
end
end
end
end
end
end
scoring_jokers["Seance"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
if self.ability.name == 'Seance' and #G.consumeables.cards + G.GAME.consumeable_buffer < G.consumeables.config.card_limit then
if next(context.poker_hands[self.ability.extra.poker_hand]) then
G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1
return {card = self}
end
end
end
end
end
end
scoring_jokers["Flower Pot"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
do
local suits = {['Hearts'] = 0,
['Diamonds'] = 0,
['Spades'] = 0,
['Clubs'] = 0}
for i = 1, #context.scoring_hand do
                                if context.scoring_hand[i].ability.name ~= 'Wild Card' then
if context.scoring_hand[i]:is_suit('Hearts', true) and suits["Hearts"] == 0 then
suits["Hearts"] = suits["Hearts"] + 1
elseif context.scoring_hand[i]:is_suit('Diamonds', true) and suits["Diamonds"] == 0 then
suits["Diamonds"] = suits["Diamonds"] + 1
elseif context.scoring_hand[i]:is_suit('Spades', true) and suits["Spades"] == 0 then
suits["Spades"] = suits["Spades"] + 1
elseif context.scoring_hand[i]:is_suit('Clubs', true) and suits["Clubs"] == 0 then
suits["Clubs"] = suits["Clubs"] + 1
end
end
                            end
for i = 1, #context.scoring_hand do
                                if context.scoring_hand[i].ability.name == 'Wild Card' then
if context.scoring_hand[i]:is_suit('Hearts') and suits["Hearts"] == 0 then
suits["Hearts"] = suits["Hearts"] + 1
elseif context.scoring_hand[i]:is_suit('Diamonds') and suits["Diamonds"] == 0 then
suits["Diamonds"] = suits["Diamonds"] + 1
elseif context.scoring_hand[i]:is_suit('Spades') and suits["Spades"] == 0 then
suits["Spades"] = suits["Spades"] + 1
elseif context.scoring_hand[i]:is_suit('Clubs') and suits["Clubs"] == 0 then
suits["Clubs"] = suits["Clubs"] + 1
end
end
                            end
if suits["Hearts"] > 0 and
                            suits["Diamonds"] > 0 and
                            suits["Spades"] > 0 and
                            suits["Clubs"] > 0 then
return {Xmult_mod = self.ability.extra}
end
end
end
end
end
end
scoring_jokers["Blue Joker"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
if self.ability.name == 'Blue Joker' and #G.deck.cards > 0 then
return {chip_mod = self.ability.extra*#G.deck.cards}
end
end
end
end
end
scoring_jokers["Erosion"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
if self.ability.name == 'Erosion' and (G.GAME.starting_deck_size - #G.playing_cards) > 0 then
return {mult_mod = self.ability.extra*(G.GAME.starting_deck_size - #G.playing_cards)}
end
end
end
end
end
scoring_jokers["Stone Joker"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
if self.ability.name == 'Stone Joker' and self.ability.stone_tally > 0 then
return {chip_mod = self.ability.extra*self.ability.stone_tally}
end
end
end
end
end
scoring_jokers["Steel Joker"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
if self.ability.name == 'Steel Joker' and self.ability.steel_tally > 0 then
return {Xmult_mod = 1 + self.ability.extra*self.ability.steel_tally}
end
end
end
end
end
scoring_jokers["Bull"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
if self.ability.name == 'Bull' and (G.GAME.dollars + (G.GAME.dollar_buffer or 0)) > 0 then
return {chip_mod = self.ability.extra*math.max(0,(G.GAME.dollars + (G.GAME.dollar_buffer or 0)))}
end
end
end
end
end
scoring_jokers["Driver's License"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
do
if (self.ability.driver_tally or 0) >= 16 then
return {Xmult_mod = self.ability.extra}
end
end
end
end
end
end
scoring_jokers["Blackboard"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
do
local black_suits, all_cards = 0, 0
for k, v in ipairs(G.hand.cards) do
                                all_cards = all_cards + 1
                                if v:is_suit('Clubs', nil, true) or v:is_suit('Spades', nil, true) then
black_suits = black_suits + 1
end
                            end
if black_suits == all_cards then
return {Xmult_mod = self.ability.extra}
end
end
end
end
end
end
scoring_jokers["Joker Stencil"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
do
if (G.jokers.config.card_limit - #G.jokers.cards) > 0 then
return {Xmult_mod = self.ability.x_mult}
end
end
end
end
end
end
scoring_jokers["Swashbuckler"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
if self.ability.name == 'Swashbuckler' and self.ability.mult > 0 then
return {mult_mod = self.ability.mult}
end
end
end
end
end
scoring_jokers["Joker"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
do
return {mult_mod = self.ability.mult}
end
end
end
end
end
scoring_jokers["Card Sharp"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
if self.ability.name == 'Card Sharp' and G.GAME.hands[context.scoring_name] and G.GAME.hands[context.scoring_name].played_this_round > 1 then
return {Xmult_mod = self.ability.extra.Xmult}
end
end
end
end
end
scoring_jokers["Bootstraps"] = function(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
if self.ability.name == 'Bootstraps' and math.floor((G.GAME.dollars + (G.GAME.dollar_buffer or 0))/self.ability.extra.dollars) >= 1 then
return {mult_mod = self.ability.extra.mult*math.floor((G.GAME.dollars + (G.GAME.dollar_buffer or 0))/self.ability.extra.dollars)}
end
end
end
end
end
local function scoring_other(self,context)
if context.debuffed_hand then
elseif context.individual then
if context.cardarea == G.play then
local effect = scoring_common_individual(self,context)
if effect then return effect end
end
elseif context.repetition then
elseif context.other_joker then
else
if context.cardarea == G.jokers then
if context.before then
else
if self.ability.name ~= 'Seeing Double' and self.ability.x_mult > 1 and (self.ability.type == '' or next(context.poker_hands[self.ability.type])) then
return {Xmult_mod = self.ability.x_mult}
end
if self.ability.t_mult > 0 and next(context.poker_hands[self.ability.type]) then
return {mult_mod = self.ability.t_mult}
end
if self.ability.t_chips > 0 and next(context.poker_hands[self.ability.type]) then
return {chip_mod = self.ability.t_chips}
end
end
end
end
end
function Card:calculate_joker(context)
if self.debuff then
return nil
end
if self.ability.set == "Planet" and not self.debuff then
if context.joker_main then
if G.GAME.used_vouchers.v_observatory and self.ability.consumeable.hand_type == context.scoring_name then
return {Xmult_mod = G.P_CENTERS.v_observatory.config.extra}
end
end
end
if self.ability.set == "Joker" then return (scoring_jokers[self.ability.name] or scoring_other)(self,context) end
end
function Card:is_suit(suit, bypass_debuff, flush_calc)
    if flush_calc then
if self.ability.effect == 'Stone Card' then
return false
end
if self.ability.name == "Wild Card" and not self.debuff then
return true
end
if next(find_joker('Smeared Joker')) and (self.base.suit == 'Hearts' or self.base.suit == 'Diamonds') == (suit == 'Hearts' or suit == 'Diamonds') then
return true
end
return self.base.suit == suit
else
if self.debuff and not bypass_debuff then
return
end
if self.ability.effect == 'Stone Card' then
return false
end
if self.ability.name == "Wild Card" then
return true
end
if next(find_joker('Smeared Joker')) and (self.base.suit == 'Hearts' or self.base.suit == 'Diamonds') == (suit == 'Hearts' or suit == 'Diamonds') then
return true
end
return self.base.suit == suit
end
end
function Card:update(dt)
if self.ability and self.ability.perma_debuff then
self.debuff = true
end
if self.ability.name == 'Throwback' then
self.ability.x_mult = 1 + G.GAME.skips*self.ability.extra
end
if self.ability.name == "Driver's License" then
self.ability.driver_tally = 0
for k, v in pairs(G.playing_cards) do
                if v.config.center ~= G.P_CENTERS.c_base then
self.ability.driver_tally = self.ability.driver_tally+1
end
            end
end
if self.ability.name == "Steel Joker" then
self.ability.steel_tally = 0
for k, v in pairs(G.playing_cards) do
                if v.config.center == G.P_CENTERS.m_steel then
self.ability.steel_tally = self.ability.steel_tally+1
end
            end
end
if self.ability.name == "Cloud 9" then
self.ability.nine_tally = 0
for k, v in pairs(G.playing_cards) do
                if v:get_id() == 9 then
self.ability.nine_tally = self.ability.nine_tally+1
end
            end
end
if self.ability.name == "Stone Joker" then
self.ability.stone_tally = 0
for k, v in pairs(G.playing_cards) do
                if v.config.center == G.P_CENTERS.m_stone then
self.ability.stone_tally = self.ability.stone_tally+1
end
            end
end
if self.ability.name == "Joker Stencil" then
self.ability.x_mult = (G.jokers.config.card_limit - #G.jokers.cards)
for i = 1, #G.jokers.cards do
                if G.jokers.cards[i].ability.name == 'Joker Stencil' then
self.ability.x_mult = self.ability.x_mult + 1
end
            end
end
if self.ability.name == 'Swashbuckler' then
local sell_cost = 0
for i = 1, #G.jokers.cards do
                if G.jokers.cards[i] ~= self and (G.jokers.cards[i].area and G.jokers.cards[i].area == G.jokers) then
sell_cost = sell_cost + G.jokers.cards[i].sell_cost
end
            end
self.ability.mult = sell_cost
end
end
