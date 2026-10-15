Blind = Moveable:extend()
function Blind:modify_hand(cards, poker_hands, text, mult, hand_chips)
    if self.disabled then
return mult, hand_chips, false
end
    if self.name == "The Flint" then
self.triggered = true
return math.max(math.floor(mult*0.5 + 0.5), 1), math.max(math.floor(hand_chips*0.5 + 0.5), 0), true
end
    return mult, hand_chips, false
end
function Blind:debuff_hand(cards, hand, handname, check)
    if self.disabled then
return
end
    if self.debuff then
self.triggered = false
if self.debuff.hand and next(hand[self.debuff.hand]) then
self.triggered = true
return true
end
if self.debuff.h_size_ge and #cards < self.debuff.h_size_ge then
self.triggered = true
return true
end
if self.debuff.h_size_le and #cards > self.debuff.h_size_le then
self.triggered = true
return true
end
if self.name == "The Eye" then
if self.hands[handname] then
self.triggered = true
return true
end
if not check then
self.hands[handname] = true
end
end
if self.name == "The Mouth" then
if self.only_hand and self.only_hand ~= handname then
self.triggered = true
return true
end
if not check then
self.only_hand = handname
end
end
end
    if self.name == 'The Arm' then
self.triggered = false
if G.GAME.hands[handname].level > 1 then
self.triggered = true
if not check then
level_up_hand(self.children.animatedSprite, handname, nil, -1)
end
end
end
    if self.name == 'The Ox' then
self.triggered = false
if handname == G.GAME.current_round.most_played_poker_hand then
self.triggered = true
if not check then
ease_dollars(-G.GAME.dollars, true)
end
end
end
end
function Blind:debuff_card(card, from_blind)
    if self.debuff and not self.disabled and card.area ~= G.jokers then
if self.debuff.suit and card:is_suit(self.debuff.suit, true) then
card:set_debuff(true)
return
end
if self.debuff.is_face =='face' and card:is_face(true) then
card:set_debuff(true)
return
end
if self.name == 'The Pillar' and card.ability.played_this_ante then
card:set_debuff(true)
return
end
if self.debuff.value and self.debuff.value == card.base.value then
card:set_debuff(true)
return
end
if self.debuff.nominal and self.debuff.nominal == card.base.nominal then
card:set_debuff(true)
return
end
end
    if self.name == 'Crimson Heart' and not self.disabled and card.area == G.jokers then
return
end
    if self.name == 'Verdant Leaf' and not self.disabled and card.area ~= G.jokers then
card:set_debuff(true)
return
end
    card:set_debuff(false)
end
