function pseudorandom_element(_t, seed)
  if seed then
math.randomseed(seed)
end
  local keys = {}
  for k, v in pairs(_t) do
      keys[#keys+1] = {k = k,
v = v}
  end
  if keys[1] and keys[1].v and type(keys[1].v) == 'table' and keys[1].v.sort_id then
table.sort(keys, function (a, b) return a.v.sort_id < b.v.sort_id end)
else
table.sort(keys, function (a, b) return a.k < b.k end)
end
  local key = keys[math.random(#keys)].k
  return _t[key], key
end
function pseudohash(str)
  do
local num = 1
for i=#str, 1, -1 do
        num = ((1.1239285023/num)*string.byte(str, i)*math.pi + math.pi*i)%1
    end
return num
end
end
function pseudoseed(key, predict_seed)
  if key == 'seed' then
return math.random()
end
  if predict_seed then
local _pseed = pseudohash(key..(predict_seed or ''))
_pseed = math.abs(tonumber(string.format("%.13f", (2.134453429141+_pseed*1.72431234)%1)))
return (_pseed + (pseudohash(predict_seed) or 0))/2
end
  if not G.GAME.pseudorandom[key] then
G.GAME.pseudorandom[key] = pseudohash(key..(G.GAME.pseudorandom.seed or ''))
end
  G.GAME.pseudorandom[key] = math.abs(tonumber(string.format("%.13f", (2.134453429141+G.GAME.pseudorandom[key]*1.72431234)%1)))
  return (G.GAME.pseudorandom[key] + (G.GAME.pseudorandom.hashed_seed or 0))/2
end
function pseudorandom(seed, min, max)
  if type(seed) == 'string' then
seed = pseudoseed(seed)
end
  math.randomseed(seed)
  if min and max then
return math.random(min, max)
else
return math.random()
end
end
function HEX(hex)
  if #hex <= 6 then
hex = hex.."FF"
end
  local _,_,r,g,b,a = hex:find('(%x%x)(%x%x)(%x%x)(%x%x)')
  local color = {tonumber(r,16)/255,
tonumber(g,16)/255,
tonumber(b,16)/255,
tonumber(a,16)/255 or 255}
  return color
end
function evaluate_poker_hand(hand)
  local results = {["Flush Five"] = {},
["Flush House"] = {},
["Five of a Kind"] = {},
["Straight Flush"] = {},
["Four of a Kind"] = {},
["Full House"] = {},
["Flush"] = {},
["Straight"] = {},
["Three of a Kind"] = {},
["Two Pair"] = {},
["Pair"] = {},
["High Card"] = {},
top = nil}
  local parts = {_5 = get_X_same(5,hand),
_4 = get_X_same(4,hand),
_3 = get_X_same(3,hand),
_2 = get_X_same(2,hand),
_flush = get_flush(hand),
_straight = get_straight(hand),
_highest = get_highest(hand)}
  if next(parts._5) and next(parts._flush) then
results["Flush Five"] = parts._5
if not results.top then
results.top = results["Flush Five"]
end
end
  if next(parts._3) and next(parts._2) and next(parts._flush) then
local fh_hand = {}
local fh_3 = parts._3[1]
local fh_2 = parts._2[1]
for i=1, #fh_3 do
      fh_hand[#fh_hand+1] = fh_3[i]
    end
for i=1, #fh_2 do
      fh_hand[#fh_hand+1] = fh_2[i]
    end
table.insert(results["Flush House"], fh_hand)
if not results.top then
results.top = results["Flush House"]
end
end
  if next(parts._5) then
results["Five of a Kind"] = parts._5
if not results.top then
results.top = results["Five of a Kind"]
end
end
  if next(parts._flush) and next(parts._straight) then
local _s, _f, ret = parts._straight, parts._flush, {}
for _, v in ipairs(_f[1]) do
      ret[#ret+1] = v
    end
for _, v in ipairs(_s[1]) do
      local in_straight = nil
      for _, vv in ipairs(_f[1]) do
        if vv == v then
in_straight = true
end
      end
      if not in_straight then
ret[#ret+1] = v
end
    end
results["Straight Flush"] = {ret}
if not results.top then
results.top = results["Straight Flush"]
end
end
  if next(parts._4) then
results["Four of a Kind"] = parts._4
if not results.top then
results.top = results["Four of a Kind"]
end
end
  if next(parts._3) and next(parts._2) then
local fh_hand = {}
local fh_3 = parts._3[1]
local fh_2 = parts._2[1]
for i=1, #fh_3 do
      fh_hand[#fh_hand+1] = fh_3[i]
    end
for i=1, #fh_2 do
      fh_hand[#fh_hand+1] = fh_2[i]
    end
table.insert(results["Full House"], fh_hand)
if not results.top then
results.top = results["Full House"]
end
end
  if next(parts._flush) then
results["Flush"] = parts._flush
if not results.top then
results.top = results["Flush"]
end
end
  if next(parts._straight) then
results["Straight"] = parts._straight
if not results.top then
results.top = results["Straight"]
end
end
  if next(parts._3) then
results["Three of a Kind"] = parts._3
if not results.top then
results.top = results["Three of a Kind"]
end
end
  if (#parts._2 == 2) or (#parts._3 == 1 and #parts._2 == 1) then
local fh_hand = {}
local r = parts._2
local fh_2a = r[1]
local fh_2b = r[2]
if not fh_2b then
fh_2b = parts._3[1]
end
for i=1, #fh_2a do
      fh_hand[#fh_hand+1] = fh_2a[i]
    end
for i=1, #fh_2b do
      fh_hand[#fh_hand+1] = fh_2b[i]
    end
table.insert(results["Two Pair"], fh_hand)
if not results.top then
results.top = results["Two Pair"]
end
end
  if next(parts._2) then
results["Pair"] = parts._2
if not results.top then
results.top = results["Pair"]
end
end
  if next(parts._highest) then
results["High Card"] = parts._highest
if not results.top then
results.top = results["High Card"]
end
end
  if results["Five of a Kind"][1] then
results["Four of a Kind"] = {results["Five of a Kind"][1],
results["Five of a Kind"][2],
results["Five of a Kind"][3],
results["Five of a Kind"][4]}
end
  if results["Four of a Kind"][1] then
results["Three of a Kind"] = {results["Four of a Kind"][1],
results["Four of a Kind"][2],
results["Four of a Kind"][3]}
end
  if results["Three of a Kind"][1] then
results["Pair"] = {results["Three of a Kind"][1],
results["Three of a Kind"][2]}
end
  return results
end
function get_flush(hand)
  local ret = {}
  local four_fingers = next(find_joker('Four Fingers'))
  local suits = {"Spades",
"Hearts",
"Clubs",
"Diamonds"}
  if #hand > 5 or #hand < (5 - (four_fingers and 1 or 0)) then
return ret
else
for j = 1, #suits do
      local t = {}
      local suit = suits[j]
      local flush_count = 0
      for i=1, #hand do
        if hand[i]:is_suit(suit, nil, true) then
flush_count = flush_count + 1
t[#t+1] = hand[i]
end
      end
      if flush_count >= (5 - (four_fingers and 1 or 0)) then
table.insert(ret, t)
return ret
end
    end
return {}
end
end
function get_straight(hand)
  local ret = {}
  local four_fingers = next(find_joker('Four Fingers'))
  if #hand > 5 or #hand < (5 - (four_fingers and 1 or 0)) then
return ret
else
local t = {}
local IDS = {}
for i=1, #hand do
      local id = hand[i]:get_id()
      if id > 1 and id < 15 then
if IDS[id] then
IDS[id][#IDS[id]+1] = hand[i]
else
IDS[id] = {hand[i]}
end
end
    end
local straight_length = 0
local straight = false
local can_skip = next(find_joker('Shortcut'))
local skipped_rank = false
for j = 1, 14 do
      if IDS[j == 1 and 14 or j] then
straight_length = straight_length + 1
skipped_rank = false
for k, v in ipairs(IDS[j == 1 and 14 or j]) do
          t[#t+1] = v
        end
elseif can_skip and not skipped_rank and j ~= 14 then
skipped_rank = true
else
straight_length = 0
skipped_rank = false
if not straight then
t = {}
end
if straight then
break
end
end
      if straight_length >= (5 - (four_fingers and 1 or 0)) then
straight = true
end
    end
if not straight then
return ret
end
table.insert(ret, t)
return ret
end
end
function get_X_same(num, hand)
  local vals = {{},
{},
{},
{},
{},
{},
{},
{},
{},
{},
{},
{},
{},
{}}
  for i=#hand, 1, -1 do
    local curr = {}
    table.insert(curr, hand[i])
    for j=1, #hand do
      if hand[i]:get_id() == hand[j]:get_id() and i ~= j then
table.insert(curr, hand[j])
end
    end
    if #curr == num then
vals[curr[1]:get_id()] = curr
end
  end
  local ret = {}
  for i=#vals, 1, -1 do
    if next(vals[i]) then
table.insert(ret, vals[i])
end
  end
  return ret
end
function get_highest(hand)
  local highest = nil
  for k, v in ipairs(hand) do
    if not highest or v:get_nominal() > highest:get_nominal() then
highest = v
end
  end
  if #hand > 0 then
return {{highest}}
else
return {}
end
end
function mod_chips(_chips)
  if G.GAME.modifiers.chips_dollar_cap then
_chips = math.min(_chips, math.max(G.GAME.dollars, 0))
end
  return _chips
end
function mod_mult(_mult)
  return _mult
end
function find_joker(name, non_debuff)
  local jokers = {}
  if not G.jokers or not G.jokers.cards then
return {}
end
  for k, v in pairs(G.jokers.cards) do
    if v and type(v) == 'table' and v.ability.name == name and (non_debuff or not v.debuff) then
table.insert(jokers, v)
end
  end
  for k, v in pairs(G.consumeables.cards) do
    if v and type(v) == 'table' and v.ability.name == name and (non_debuff or not v.debuff) then
table.insert(jokers, v)
end
  end
  return jokers
end
function copy_table(O)
  local O_type = type(O)
  local copy
  if O_type == 'table' then
copy = {}
for k, v in next, O, nil do
          copy[copy_table(k)] = copy_table(v)
      end
setmetatable(copy, copy_table(getmetatable(O)))
else
copy = O
end
  return copy
end
utf8 = {pattern = '[%z\1-\127\194-\244][\128-\191]*'}
function get_starting_params()
return {dollars = 4,
hand_size = 8,
discards = 3,
hands = 4,
reroll_cost = 5,
joker_slots = 5,
ante_scaling = 1,
consumable_slots = 2,
no_faces = false,
erratic_suits_and_ranks = false}
end
