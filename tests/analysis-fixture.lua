-- Headless original-game positions -> the mod's analysis snapshot, for tests/analysis.test.ts.
-- arg[1] is the original source directory, arg[2] a JSON array of sandbox positions. Each may
-- add test-only keys: hide (zero-based hand indices turned face down), forced (one index) and
-- phase. Outside SELECTING_HAND the hand joins the deck, and shop (Joker or consumable keys),
-- vouchers (keys), boss (this Ante's Boss key), defeated (roles) and dollars set the shop.
local json = dofile('play/mod/json.lua')
local runtime = dofile('env/sandbox/runtime.lua').new(assert(arg[1]), json)
local exporter = dofile('play/mod/score_snapshot.lua')(json)
local function upvalue(fn, wanted)
  for i = 1, 100 do
    local name, value = debug.getupvalue(fn, i)
    if name == wanted then return value end
    if not name then break end
  end
  error('Missing test upvalue: ' .. wanted)
end
local out = json.array()
for _, configuration in ipairs(json.decode(assert(arg[2]), 1048576)) do
  local hide, forced, phase = configuration.hide or {}, configuration.forced, configuration.phase or 'SELECTING_HAND'
  local shop, vouchers, boss, defeated, dollars = configuration.shop or {}, configuration.vouchers or {}, configuration.boss, configuration.defeated or {}, configuration.dollars
  for _, key in ipairs({'hide', 'forced', 'phase', 'shop', 'vouchers', 'boss', 'defeated', 'dollars'}) do configuration[key] = nil end
  configuration.random = 'fixed'
  -- Shop cards are created by the original constructors as extra Jokers or consumables, then moved.
  local env = upvalue(runtime.load, 'env')
  local P = upvalue(runtime.load, 'G').P_CENTERS
  local shopJokers, shopConsumables = 0, 0
  configuration.jokers, configuration.consumables = configuration.jokers or {}, configuration.consumables or {}
  for _, key in ipairs(shop) do
    if P[key].set == 'Joker' then configuration.jokers[#configuration.jokers + 1] = key; shopJokers = shopJokers + 1
    else configuration.consumables[#configuration.consumables + 1] = key; shopConsumables = shopConsumables + 1 end
  end
  local loaded = runtime.load(configuration)
  -- The Hook is refused only at the scoring boundary; its position still exports.
  assert(loaded.status == 'ready' or configuration.blind == 'bl_hook', loaded.message)
  G = upvalue(runtime.load, 'G')
  get_blind_amount = env.get_blind_amount
  G.hand.config.highlighted_limit = 5
  for _, index in ipairs(hide) do G.hand.cards[index + 1].facing = 'back' end
  if forced then G.hand.cards[forced + 1].ability.forced_selection = true end
  if phase ~= 'SELECTING_HAND' then
    for _, c in ipairs(G.hand.cards) do G.deck.cards[#G.deck.cards + 1] = c end
    G.hand.cards = {}
    G.shop_jokers, G.shop_vouchers, G.pack_cards = {cards={}}, {cards={}}, nil
    local order = {}
    for _, key in ipairs(shop) do order[#order + 1] = key end
    local jokers, consumables = {}, {}
    for i = #G.jokers.cards - shopJokers + 1, #G.jokers.cards do
      local c = G.jokers.cards[i]; c:remove_from_deck(); jokers[#jokers + 1] = c
    end
    for i = #G.consumeables.cards - shopConsumables + 1, #G.consumeables.cards do consumables[#consumables + 1] = G.consumeables.cards[i] end
    for _ = 1, shopJokers do G.jokers.cards[#G.jokers.cards] = nil end
    for _ = 1, shopConsumables do G.consumeables.cards[#G.consumeables.cards] = nil end
    for _, key in ipairs(order) do
      local c = table.remove(P[key].set == 'Joker' and jokers or consumables, 1)
      c.area = G.shop_jokers; G.shop_jokers.cards[#G.shop_jokers.cards + 1] = c
    end
    for _, key in ipairs(vouchers) do
      local center = P[key]
      G.shop_vouchers.cards[#G.shop_vouchers.cards + 1] = {config={center=center}, facing='front', debuff=false, cost=center.cost, sell_cost=0,
        ability={set='Voucher', name=center.name, extra=center.config.extra}}
    end
    G.GAME.round_resets.blind_choices = {Small='bl_small', Big='bl_big', Boss=boss or 'bl_club'}
    G.GAME.round_resets.blind_states = {Small='Select', Big='Upcoming', Boss='Upcoming'}
    for _, role in ipairs(defeated) do G.GAME.round_resets.blind_states[role] = 'Defeated' end
    G.GAME.round_resets.ante = G.GAME.round_resets.ante or 1
    G.GAME.dollars = dollars or G.GAME.dollars
  end
  out[#out + 1] = exporter.analysis(phase)
end
print(json.encode(out))
