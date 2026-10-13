-- Shadow scoring checks against a mock game whose evaluate_play has the side effects of the real one.
local json = assert(loadfile('play/mod/json.lua'))()
local checks = 0
local function check(v, message) checks = checks + 1; assert(v, message) end

-- Order-independent dump of plain data; metatables and functions are skipped.
local function dump(v, seen)
  seen = seen or {}
  if type(v) ~= 'table' then return type(v) == 'function' and 'fn' or tostring(v) end
  if seen[v] then return '<cycle>' end
  seen[v] = true
  local keys = {}
  for k in pairs(v) do keys[#keys + 1] = k end
  table.sort(keys, function(a, b) return tostring(a) < tostring(b) end)
  local out = {}
  for _, k in ipairs(keys) do out[#out + 1] = tostring(k) .. '=' .. dump(v[k], seen) end
  seen[v] = nil
  return '{' .. table.concat(out, ',') .. '}'
end

local function forbid(name) return function() error(name .. ' must not run during shadow scoring') end end
for _, name in ipairs({'card_eval_status_text','update_hand_text','juice_card','play_sound','delay','check_for_unlock','set_hand_usage','ease_dollars'}) do _G[name] = forbid(name) end
pseudorandom = forbid('pseudorandom'); pseudoseed = forbid('pseudoseed'); pseudorandom_element = forbid('pseudorandom_element')
Card = {juice_up = forbid('Card:juice_up')}; Card.__index = Card
local Blind = {}; Blind.__index = Blind
function Blind:debuff_hand(cards, _, name, check)
  if not check then self.triggered = true end
  if self.name == 'The Ox' and not check and name == G.GAME.current_round.most_played_poker_hand then ease_dollars(-G.GAME.dollars, true) end
  return self.name == 'The Psychic' and #cards < 5 or self.only == name
end

local function playing(rank, suit, extra)
  local card = setmetatable({base={value=rank, suit=suit, nominal=({['2']=2,['3']=3,['5']=5,K=10,A=11})[rank], times_played=0}, ability={set='Default'}, facing='front'}, Card)
  for k, v in pairs(extra or {}) do card[k] = v end
  return card
end
local function joker(name, ability) return setmetatable({ability=ability, facing='front'}, Card) end

local events = {add_event = forbid('add_event')}
local function reset()
  G = {E_MANAGER = events, FUNCS = {}, play = {cards = {}, config = {}}}
  G.GAME = {dollars = 10, current_round = {hands_left = 2, current_hand = {}}, hand_usage = {},
    hands = {Pair = {chips = 10, mult = 2, played = 0}, ['High Card'] = {chips = 5, mult = 1, played = 0}, ['Three of a Kind'] = {chips = 30, mult = 3, played = 0}},
    blind = setmetatable({name = 'Small Blind', chips = 300}, Blind)}
  G.hand = {config = {highlighted_limit = 5}, cards = {
    playing('K', 'Spades'), playing('K', 'Hearts'), playing('2', 'Clubs'), playing('A', 'Spades', {lucky = true})}}
  G.jokers = {cards = {joker('Green', {mult = 1, extra = {gain = 1}}), joker('Acrobat', {x = 3})}}
  G.consumeables = {cards = {}}
  SMODS = {last_hand = {full_hand = {G.hand.cards[1]}}, Scoring_Parameters = {mult = {current = 0}, chips = {current = 0}}}
  mult, hand_chips = 0, 0
  -- Pair/High Card/Three of a Kind by rank counts.
  G.FUNCS.get_poker_hand_info = function(cards)
    local counts, top = {}, 0
    for _, card in ipairs(cards) do counts[card.base.value] = (counts[card.base.value] or 0) + 1; top = math.max(top, counts[card.base.value]) end
    local name = top >= 3 and 'Three of a Kind' or top == 2 and 'Pair' or 'High Card'
    return name, name, {}, cards
  end
  G.FUNCS.evaluate_play = function()
    local text = G.FUNCS.get_poker_hand_info(G.play.cards)
    if SMODS.last_hand then for _, card in ipairs(SMODS.last_hand.full_hand) do card.ability.SMODS_full_hand = nil end end
    SMODS.last_hand = {full_hand = G.play.cards}
    G.GAME.hands[text].played = G.GAME.hands[text].played + 1
    set_hand_usage(text)
    if G.GAME.blind:debuff_hand(G.play.cards, {}, text) then mult, hand_chips = 0, 0; return end
    hand_chips, mult = G.GAME.hands[text].chips, G.GAME.hands[text].mult
    for _, card in ipairs(G.play.cards) do
      hand_chips = hand_chips + card.base.nominal
      if card.lucky and pseudorandom('lucky') < 0.2 then mult = mult + 20; ease_dollars(20) end
      card.lucky_trigger = true
      card_eval_status_text(card, 'chips')
    end
    for _, card in ipairs(G.hand.cards) do if card.base.value == 'K' then mult = mult + 1 end end -- held Kings
    for _, j in ipairs(G.jokers.cards) do
      if j.ability.extra then j.ability.mult = j.ability.mult + j.ability.extra.gain; mult = mult + j.ability.mult end
      if j.ability.x and G.GAME.current_round.hands_left == 0 then mult = mult * j.ability.x end
      if j.ability.bull then hand_chips = hand_chips + j.ability.bull * math.max(0, G.GAME.dollars + (G.GAME.dollar_buffer or 0)) end
      j:juice_up()
    end
    G.E_MANAGER:add_event({})
    SMODS.Scoring_Parameters.mult.current, SMODS.Scoring_Parameters.chips.current = mult, hand_chips
  end
  SMODS.calculate_round_score = function() return SMODS.Scoring_Parameters.chips.current * SMODS.Scoring_Parameters.mult.current end
end

local now = 0
local scoring = assert(loadfile('play/mod/scoring.lua'))()(json, function() return now end, 1)
local function world() return dump({G.GAME, G.hand, G.jokers, G.play, SMODS, mult, hand_chips}) end

reset()
local liveHand, livePlay, before = G.hand, G.play, world()
local plays = scoring.plays()
check(world() == before, 'shadow scoring restores the game, cards, Jokers and scoring globals')
check(G.hand == liveHand and G.play == livePlay, 'live areas are restored')
check(G.E_MANAGER == events and Card.juice_up and pcall(Card.juice_up) == false, 'stubs are removed afterwards')
check(getmetatable(plays) == json.array_mt and #plays == 2, 'one line per poker hand')
-- Pair of Kings with 2 and A: 10+10+10+2+11 chips = 43; mult 2 + Green 2 = 4; random Ace adds nothing when it fails.
check(plays[1] == '0 1 2 3: Pair 172 random', 'best Pair keeps the Lucky Ace and reports the lowest outcome: ' .. plays[1])
check(plays[2] == '0 2 3: High Card 112 random', 'held King adds Mult to a single-King play: ' .. tostring(plays[2]))
check(SMODS.last_hand.full_hand[1] == liveHand.cards[1], 'the last real hand is left in place')

-- The final hand activates Acrobat through hands_left.
reset(); G.GAME.current_round.hands_left = 1
plays = scoring.plays()
check(plays[1] == '0 1 2 3: Pair 516 random', 'hands_left is spent before evaluation: ' .. plays[1])

-- Boss rejection is reported, not hidden.
reset(); G.GAME.blind.only = 'Pair'
plays = scoring.plays()
local blocked = false
for _, line in ipairs(plays) do if line:find('Pair 0 not allowed', 1, true) then blocked = true end end
check(blocked, 'a rejected poker hand scores 0 and says so')

-- Forced cards are always included.
reset(); G.hand.cards[3].ability.forced_selection = true
plays = scoring.plays()
for _, line in ipairs(plays) do check(line:match('^[%d ]*'):find('2', 1, true), 'every selection contains the forced card: ' .. line) end

-- Face-down cards stop scoring before any game code runs, and plays is omitted.
reset(); G.hand.cards[2].facing = 'back'; G.FUNCS.evaluate_play = forbid('evaluate_play')
check(scoring.plays() == nil, 'face-down hand card')
reset(); G.jokers.cards[1].facing = 'back'; G.FUNCS.evaluate_play = forbid('evaluate_play')
check(scoring.plays() == nil, 'face-down Joker')

-- A failing evaluation is contained and still restored.
reset(); before = world()
G.FUNCS.evaluate_play = function() G.GAME.dollars = 999; G.jokers.cards[1].ability.mult = 5; error('boom') end
plays = scoring.plays()
check(#plays == 1 and plays[1]:find('unavailable:', 1, true) and plays[1]:find('boom', 1, true), 'failure reported')
check(world() == before, 'failed evaluation leaves no trace')
check(G.GAME.dollars == 10 and G.jokers.cards[1].ability.mult == 1, 'failed evaluation is undone')

-- Vampire/Midas Mask replace ability and change config in place through set_ability.
for _, fail in ipairs({false, true}) do
  for _, target in ipairs({'c_base', 'm_gold'}) do
    reset()
    local originalCenter, newCenter = {key='m_mult'}, {key=target}
    local card = G.hand.cards[1]
    card.config = {center=originalCenter, center_key='m_mult'}
    local originalConfig, originalAbility = card.config, card.ability
    local evaluatePlay, trials = G.FUNCS.evaluate_play, 0
    before = world()
    G.FUNCS.evaluate_play = function()
      assert(card.config.center == originalCenter and card.config.center_key == 'm_mult', 'each trial starts with the real enhancement')
      card.config.center, card.config.center_key = newCenter, target
      card.ability = {set='Enhanced', bonus=50}
      trials = trials + 1
      if fail then error('set_ability failure') end
      evaluatePlay()
    end
    plays = scoring.plays()
    check(trials == 15, 'all enhancement trials execute')
    check(world() == before, 'enhancement restored after ' .. target .. (fail and ' failure' or ' success'))
    check(card.config == originalConfig and card.config.center == originalCenter and card.ability == originalAbility,
      'config, shared center and ability identities are preserved')
    check(fail and plays[1]:find('set_ability failure', 1, true) or not fail and not plays[1]:find('unavailable:', 1, true),
      'enhancement evaluation has the expected outcome')
  end
end

-- Card creation is rejected before touching registries, deck capacity, sprites or RNG.
for _, entry in ipairs({'copy_card','create_card','create_playing_card','init','add_card'}) do
  reset()
  G.playing_card = 52
  G.playing_cards = {G.hand.cards[1]}
  G.deck = {config={card_limit=52}}
  G.I = {CARD={G.hand.cards[1]}}
  local function create()
    G.deck.config.card_limit = G.deck.config.card_limit + 1
    G.playing_cards[#G.playing_cards+1] = {}
    G.I.CARD[#G.I.CARD+1] = {}
    error('real constructor must not run')
  end
  local owner = entry == 'init' and Card or entry == 'add_card' and SMODS or _G
  local original = rawget(owner, entry)
  owner[entry] = create
  local evaluatePlay, calls = G.FUNCS.evaluate_play, 0
  G.FUNCS.evaluate_play = function()
    calls = calls + 1
    -- A creating effect on single-card selections only; earlier candidates can succeed.
    if #G.play.cards == 1 then
      G.playing_card = G.playing_card + 1
      -- A mod catching the rejection must not turn partial results into advice.
      pcall(owner[entry])
    end
    evaluatePlay()
  end
  before = world()
  local registries = dump({G.playing_cards, G.deck, G.I})
  plays = scoring.plays()
  check(#plays == 1 and plays[1]:find('unavailable: card creation', 1, true), 'creation rejects all advice: ' .. entry)
  check(calls > 1 and calls < 15, 'stop on the first unsupported candidate: ' .. entry)
  check(G.playing_card == 52 and dump({G.playing_cards, G.deck, G.I}) == registries and world() == before,
    'creation leaves no changes: ' .. entry)
  check(owner[entry] == create and G.E_MANAGER == events, 'constructor and event stubs removed: ' .. entry)
  owner[entry] = original
end

-- DNA, directly or through a copying Joker, is treated as having no effect.
for _, keyed in ipairs({false, true}) do
  reset()
  local baseline = scoring.plays()
  local dna = joker('DNA', keyed and {} or {name='DNA'})
  if keyed then dna.config = {center={key='j_dna'}} end
  local blueprint = joker('Blueprint', {name='Blueprint'})
  table.insert(G.jokers.cards, 1, blueprint); table.insert(G.jokers.cards, 2, dna)
  copy_card = forbid('copy_card')
  function Card:calculate_joker()
    if self == blueprint then return dna:calculate_joker() end
    if self == dna and #G.play.cards == 1 then G.playing_card = (G.playing_card or 0) + 1; copy_card() end
  end
  local evaluatePlay = G.FUNCS.evaluate_play
  G.FUNCS.evaluate_play = function() for _, j in ipairs(G.jokers.cards) do j:calculate_joker() end; evaluatePlay() end
  before = world()
  plays = scoring.plays()
  check(dump(plays) == dump(baseline), 'DNA has no effect on any selection: ' .. table.concat(plays, ' | '))
  check(world() == before and rawget(Card, 'calculate_joker') ~= nil and G.playing_card == nil, 'DNA scoring is restored')
  Card.calculate_joker, copy_card = nil, nil
end

-- The Tooth spends $1 per played card before evaluation.
for _, useKey in ipairs({false, true}) do
  reset()
  if useKey then G.GAME.blind.config = {blind={key='bl_tooth'}} else G.GAME.blind.name = 'The Tooth' end
  G.jokers.cards[#G.jokers.cards + 1] = joker('Bull', {bull = 2})
  local evaluatePlay, seen = G.FUNCS.evaluate_play, {}
  G.FUNCS.evaluate_play = function() seen[#seen + 1] = {#G.play.cards, G.GAME.dollars}; evaluatePlay() end
  before = world()
  plays = scoring.plays()
  local spent = #seen == 15
  for _, s in ipairs(seen) do spent = spent and s[2] == 10 - s[1] end
  check(spent, 'evaluation sees the Tooth payment')
  -- Pair 10+10+11 chips with $7 left: +14 chips, x4 Mult.
  check(plays[1] == '0 1 3: Pair 220 random', 'Bull reads the reduced balance: ' .. plays[1])
  check(world() == before and G.GAME.dollars == 10, 'Tooth payment is undone')
  G.GAME.blind.disabled = true; seen = {}
  scoring.plays()
  local kept = #seen == 15
  for _, s in ipairs(seen) do kept = kept and s[2] == 10 end
  check(kept, 'disabled Tooth costs nothing')
end

-- The Ox empties the balance before Jokers score the most played hand.
reset()
G.GAME.blind.name = 'The Ox'; G.GAME.current_round.most_played_poker_hand = 'Pair'
G.jokers.cards[#G.jokers.cards + 1] = joker('Bull', {bull = 2})
before = world()
plays = scoring.plays()
-- Pair: 43 chips x4 with no Bull bonus; High Card keeps $10: (28+20) x4.
check(plays[1] == '0 2 3: High Card 192 random' and plays[2] == '0 1 2 3: Pair 172 random', 'Ox reset only hits the most played hand: ' .. table.concat(plays, ' | '))
check(world() == before and G.GAME.dollars == 10, 'Ox reset is undone')

-- The time budget stops enumeration and says so.
reset()
local timed = assert(loadfile('play/mod/scoring.lua'))()(json, function() now = now + 1; return now end, 2.5)
plays = timed.plays()
check(plays[#plays]:find('^truncated: scored %d+ of 15 selections'), 'truncation is explicit: ' .. plays[#plays])

-- The bridge attaches cached plays after the fingerprint and poisons itself if scoring leaks.
local counter, calls = 0, 0
G = {GAME = {}}
local fake = {state = function() return {state = 'SELECTING_HAND', counter = counter} end, ready = function() return true end,
  cards = function() return {} end, methods = function() return json.array() end, phase = function() return 'SELECTING_HAND' end,
  fail = function(_, message) error(message, 0) end}
local bridge = assert(loadfile('play/mod/bridge.lua'))()(json, fake, function() return 0 end, 'test', 20,
  {plays = function() calls = calls + 1; return json.array({'0: High Card 5'}) end})
local first = bridge.dispatch('sf.observe', {})
local second = bridge.dispatch('sf.observe', {})
check(first.state.plays[1] == '0: High Card 5' and calls == 1, 'plays are cached by fingerprint')
check(first.revision == second.revision, 'plays do not change the revision')
local leaky = assert(loadfile('play/mod/bridge.lua'))()(json, fake, function() return 0 end, 'test', 20,
  {plays = function() counter = counter + 1; return json.array() end})
local poisoned = leaky.dispatch('sf.observe', {})
check(not poisoned.ready and poisoned.notReadyReason:find('Shadow scoring changed', 1, true) and poisoned.state.plays == nil, 'a leak poisons the bridge')
check(not pcall(leaky.dispatch, 'sf.act', {action = {method = 'play', cards = json.array({0})}, revision = poisoned.revision, instanceId = 'test', actionId = 'a1'}), 'no action after a leak')

print('Shadow scoring checks passed: ' .. checks)
