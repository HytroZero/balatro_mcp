-- Scoring adapter for unchanged Balatro 1.0.1o source. Each worker owns its Lua VM.
local sandbox = {}
local function noop() end
local function clone(value)
  if type(value) ~= 'table' then return value end
  local result = {}
  for k, v in pairs(value) do result[k] = clone(v) end
  return result
end
local function merge(target, values)
  for k, v in pairs(values or {}) do
    if type(v) == 'table' and type(target[k]) == 'table' then merge(target[k], v)
    else target[k] = clone(v) end
  end
end

-- Compile a restoration plan once per loaded position, preserving table identities.
local function checkpoint(roots, immutable)
  local records, seen = {}, {}
  local function visit(t)
    if type(t) ~= 'table' or seen[t] or immutable[t] then return end
    seen[t] = true
    local keys, values, fields = {}, {}, {}
    records[#records + 1] = {t, keys, values, fields}
    for k, v in pairs(t) do
      keys[#keys + 1], values[#values + 1], fields[k] = k, v, true
      visit(v)
    end
  end
  for _, root in ipairs(roots) do visit(root) end
  return function()
    for i = 1, #records do
      local r = records[i]
      local t, keys, values, fields = r[1], r[2], r[3], r[4]
      for k in pairs(t) do if not fields[k] then t[k] = nil end end
      for j = 1, #keys do t[keys[j]] = values[j] end
    end
  end
end

function sandbox.new(source, json)
  -- The worker owns this VM and its math.random state for its entire lifetime.
  local env = setmetatable({}, {__index = _G})
  env._G = env
  env.math = clone(math)
  env.love = {system={getOS=function() return 'Sandbox' end},
    filesystem={getInfo=noop, createDirectory=noop, append=noop}}
  local function load(path)
    local chunk, err = loadfile(source .. '/' .. path)
    assert(chunk, 'Missing Balatro source (' .. path .. '); run npm run sandbox:prepare: ' .. tostring(err))
    return setfenv(chunk, env)()
  end
  load('engine/object.lua')
  env.Moveable = env.Object:extend()
  load('game.lua')
  load('functions/misc_functions.lua')
  load('functions/common_events.lua')
  load('globals.lua')
  local G = env.G
  assert(G.VERSION == '1.0.1o-FULL', 'Sandbox requires Balatro 1.0.1o-FULL')
  -- Prototype initialization reads an empty in-memory profile, never a live save.
  env.localize = function(value) return type(value) == 'table' and (value.key or '') or value end
  env.get_compressed = noop
  env.STR_UNPACK = function() return {} end
  env.convert_save_to_meta = noop
  G.SETTINGS.profile = 1
  G.save_progress = noop
  G:init_item_prototypes()
  for _, center in pairs(G.P_CENTERS) do center.discovered = true end
  G.GAME = G:init_game_object()
  load('card.lua')
  load('blind.lua')
  load('back.lua')
  load('functions/state_events.lua')

  local input, all, restoreBaseline, baselineId, seedHash
  local scoreOnly, evaluating = false, false
  local scoringFinished = {}
  local trace, randomUsed, minimalUsed, denied, name, display, scoring
  local traceChips, traceMult = 0, 0
  local loads, calculations = 0, 0
  local runtime = {}
  for _, name in ipairs({'card_eval_status_text','juice_card','highlight_card','play_sound','delay',
    'attention_text','check_for_unlock','inc_career_stat','check_and_set_high_score','set_hand_usage','ease_discard',
    'get_joker_win_sticker','juice_card_until'}) do env[name] = noop end
  env.Event = function(event) return event end
  -- evaluate_play computes score synchronously; queued animations and post-hand
  -- mutations are outside this one-hand query. Instant money changes (The Ox)
  -- are relevant during scoring; ordinary ease_dollars is queued in the game.
  G.E_MANAGER = {add_event=noop}
  env.ease_dollars = function(amount, instant)
    if instant then G.GAME.dollars = G.GAME.dollars + (amount or 0) end
  end
  env.play_area_status_text = function() denied = true end
  env.update_hand_text = function(_, values)
    if trace and (values.chips ~= nil or values.mult ~= nil) then
      traceChips = env.hand_chips or (type(values.chips) == 'number' and values.chips) or traceChips
      traceMult = env.mult or (type(values.mult) == 'number' and values.mult) or traceMult
      trace[#trace + 1] = {chips=traceChips, mult=traceMult}
    end
  end
  env.Card.set_sprites, env.Card.juice_up, env.Card.update_alert = noop, noop, noop
  env.Blind.juice_up, env.Blind.wiggle = noop, noop
  env.Blind.disable = function(self) self.disabled = true end
  local function rejectCreation() error({status='unsupported', message='Card creation during scoring is not supported'}, 0) end
  env.copy_card, env.create_card, env.create_playing_card = rejectCreation, rejectCreation, rejectCreation
  env.Card.init = rejectCreation

  -- Skip lifecycle-only contexts at the original dispatch boundary, including
  -- calls reached recursively through Blueprint/Brainstorm. Never invent cards.
  local calculateJoker = env.Card.calculate_joker
  env.Card.calculate_joker = function(self, context)
    if scoreOnly then
      if context.after or context.destroying_card or context.remove_playing_cards or context.cards_destroyed then return end
      if context.before and self.ability.name == 'DNA' then return end
      if context.individual and self.ability.name == '8 Ball' then return end
      if context.joker_main and (self.ability.name == 'Vagabond' or self.ability.name == 'Superposition' or self.ability.name == 'Seance') then return end
    end
    return calculateJoker(self, context)
  end
  local triggerBack = env.Back.trigger_effect
  env.Back.trigger_effect = function(self, context)
    local chips, mult = triggerBack(self, context)
    if scoreOnly and context and context.context == 'final_scoring_step' then
      -- Original scoring is complete here (including Plasma). Everything below
      -- this boundary is destruction, animations, and after-hand lifecycle.
      env.hand_chips, env.mult = env.mod_chips(chips or env.hand_chips), env.mod_mult(mult or env.mult)
      error(scoringFinished, 0)
    end
    return chips, mult
  end

  local immutable = {}
  for _, pool in ipairs({G.P_CENTERS, G.P_CARDS, G.P_BLINDS}) do
    for _, prototype in pairs(pool) do immutable[prototype] = true end
  end
  local originals = {pseudorandom=env.pseudorandom, pseudoseed=env.pseudoseed, pseudorandom_element=env.pseudorandom_element}
  -- These original 1.0.1o RNG streams only award chance-based scoring bonuses
  -- or money. Minimal means they do not trigger, even if odds exceed 100%.
  -- Infinity is an explicit failed-comparison sentinel, not a sampled roll.
  local chanceBonuses = {lucky_mult=true, lucky_money=true, space=true, bloodstone=true, business=true, parking=true}
  env.pseudorandom = function(seed, min, max)
    randomUsed = true
    if input.random == 'fixed' then return min and max and min or 0.999999 end
    if input.random == 'minimal' and evaluating then
      if seed == 'misprint' and min ~= nil and max ~= nil then minimalUsed = true; return min end
      if chanceBonuses[seed] then minimalUsed = true; return math.huge end
      error({status='unsupported', message='Unsupported minimal scoring randomness: ' .. tostring(seed)}, 0)
    end
    return originals.pseudorandom(seed, min, max)
  end
  env.pseudoseed = function(...)
    randomUsed = true
    if input.random == 'fixed' then return 0 end
    return originals.pseudoseed(...)
  end
  env.pseudorandom_element = function(t, seed)
    randomUsed = true
    if input.random == 'minimal' and evaluating then
      error({status='unsupported', message='Unsupported minimal random scoring selection'}, 0)
    end
    if input.random ~= 'fixed' then return originals.pseudorandom_element(t, seed) end
    local keys = {}; for k in pairs(t) do keys[#keys + 1] = k end
    table.sort(keys, function(a,b) return tostring(a) < tostring(b) end)
    return t[keys[1]], keys[1]
  end
  local mathRandom = env.math.random
  env.math.random = function(...)
    randomUsed = true
    if input and input.random == 'minimal' and evaluating then
      error({status='unsupported', message='Unsupported minimal math.random during scoring'}, 0)
    end
    return mathRandom(...)
  end
  local getId = env.Card.get_id
  env.Card.get_id = function(self)
    if input and input.random == 'minimal' and evaluating and self.ability.effect == 'Stone Card' and not self.vampired then
      -- Original get_id samples a negative number only to keep rankless Stones
      -- distinct. A unique negative identity preserves that poker-hand rule.
      return -self.playing_card
    end
    return getId(self)
  end
  local getHand = G.FUNCS.get_poker_hand_info
  G.FUNCS.get_poker_hand_info = function(cards)
    local poker, unlocalized
    name, display, poker, scoring, unlocalized = getHand(cards)
    return name, display, poker, scoring, unlocalized
  end

  function runtime.load(snapshot, onlyScore)
    restoreBaseline = nil -- A failed load invalidates the previous position.
    input = clone(snapshot)
    if onlyScore == true then input.random = 'minimal' end
    scoreOnly = onlyScore == true or input.random == 'minimal'
    evaluating = false
    trace, randomUsed, denied = input.trace and json.array() or nil, false, false
    traceChips, traceMult = 0, 0
    G.GAME = G:init_game_object()
    env.hand_chips, env.mult, env.percent, env.percent_delta = nil, nil, nil, nil
    merge(G.GAME, input.game)
    G.GAME.pseudorandom.seed = input.seed or G.GAME.pseudorandom.seed or 'SANDBOX'
    G.GAME.pseudorandom.hashed_seed = env.pseudohash(G.GAME.pseudorandom.seed)
    seedHash = env.pseudohash(G.GAME.pseudorandom.seed)
    env.math.randomseed(seedHash)
    for name, values in pairs(input.hands or {}) do
      assert(G.GAME.hands[name], 'Unknown poker hand: ' .. name)
      if values.level then env.level_up_hand(nil, name, true, values.level - 1) end
      merge(G.GAME.hands[name], values)
    end
    local back = assert(G.P_CENTERS[input.back or 'b_red'], 'Unknown deck back')
    assert(back.set == 'Back', 'back must identify a deck back')
    G.GAME.current_round.hands_left = (input.game and input.game.current_round and input.game.current_round.hands_left) or (4 + (back.config.hands or 0))
    G.GAME.current_round.discards_left = (input.game and input.game.current_round and input.game.current_round.discards_left) or (3 + (back.config.discards or 0))
    G.GAME.round_resets.hands, G.GAME.round_resets.discards = 4 + (back.config.hands or 0), 3 + (back.config.discards or 0)
    merge(G.GAME.round_resets, input.game and input.game.round_resets)
    G.GAME.selected_back = env.Back(back)
    if input.backConfig then G.GAME.selected_back.effect.config = clone(input.backConfig) end
    G.GAME.selected_back_key = back.key
    G.STAGE, G.STATE = G.STAGES.RUN, G.STATES.SELECTING_HAND
    local function area(kind, limit)
      return {cards={}, config={type=kind, card_limit=limit}, T={x=0,y=0,w=10,h=1},
        change_size=function(self, amount) self.config.card_limit = self.config.card_limit + amount end}
    end
    G.hand, G.play = area('hand', input.handSize or (8 + (back.config.hand_size or 0))), area('play', 5)
    G.jokers, G.consumeables = area('joker', input.jokerSlots or (5 + (back.config.joker_slot or 0))), area('consumeable', 2)
    G.deck, G.discard = area('deck', 52), area('discard', 52)
    G.playing_cards, G.playing_card = {}, 0

    local blindInput = type(input.blind) == 'table' and input.blind or {key=input.blind or 'bl_small'}
    local blind = assert(G.P_BLINDS[blindInput.key], 'Unknown blind')
    G.GAME.blind = setmetatable({name=blind.name, config={blind=blind}, debuff=clone(blind.debuff),
      boss=not not blind.boss, disabled=blindInput.disabled or false, hands=clone(blindInput.hands or {}),
      only_hand=blindInput.only_hand, children={animatedSprite={juice_up=noop}}}, env.Blind)

    local function card(spec, target, index, set)
      spec = type(spec) == 'string' and {key=spec} or spec
      if spec.facing == 'back' then error({status='unavailable', message='Face-down cards cannot be scored'}, 0) end
      local front = set == 'playing' and assert(G.P_CARDS[spec.key], 'Unknown playing card: ' .. spec.key) or nil
      local center = assert(G.P_CENTERS[front and (spec.enhancement or 'c_base') or spec.key], 'Unknown card center')
      assert(front and (center.set == 'Default' or center.set == 'Enhanced') or center.set == set, 'Invalid card center type')
      local result = setmetatable({T={x=index,y=0,w=1,h=1.4}, VT={x=index,y=0,w=1,h=1.4}, config={}, params={},
        unique_val=index, sort_id=index, children={}, states={focus={is=false}}, sticker_run='NONE', facing='front', debuff=false, area=target}, env.Card)
      env.Card.set_base(result, front, true)
      env.Card.set_ability(result, center, true)
      if input.passiveEffectsApplied then
        if spec.base then result.base = clone(spec.base) end
        if spec.ability then result.ability = clone(spec.ability) end
      else merge(result.ability, spec.ability) end
      if spec.edition then
        assert(G.P_CENTERS['e_' .. spec.edition], 'Unknown edition')
        result:set_edition({[spec.edition]=true}, true, true)
      end
      if spec.editionValues then result.edition = clone(spec.editionValues) end
      result.seal = spec.seal
      result:set_debuff(spec.debuff or false)
      if result.ability.perma_debuff then result.debuff = true end
      result:set_cost()
      result.sell_cost = spec.sell_cost or result.sell_cost
      if front then
        G.playing_card = G.playing_card + 1; result.playing_card = G.playing_card
        G.playing_cards[#G.playing_cards + 1] = result
      end
      target.cards[#target.cards + 1] = result
      return result
    end
    for i, spec in ipairs(input.jokers or {}) do card(spec, G.jokers, i, 'Joker') end
    for i, spec in ipairs(input.consumables or {}) do
      local key = type(spec) == 'string' and spec or spec.key
      local center = assert(G.P_CENTERS[key], 'Unknown consumable')
      assert(center.consumeable, 'Expected a consumable')
      card(spec, G.consumeables, i, center.set)
    end
    all = {}
    for i, spec in ipairs(input.hand) do all[i] = card(spec, G.hand, i, 'playing') end
    for i, spec in ipairs(input.discard or {}) do card(spec, G.discard, i, 'playing') end
    if input.deck then
      for i, spec in ipairs(input.deck) do card(spec, G.deck, i, 'playing') end
    else
      -- A standard deck is the explicit default; callers with a modified deck
      -- supply its remaining cards. Remove one occurrence of each visible card.
      local used = {}; for _, c in ipairs(G.playing_cards) do used[c.config.card_key] = (used[c.config.card_key] or 0) + 1 end
      local keys = {}; for key in pairs(G.P_CARDS) do keys[#keys + 1] = key end; table.sort(keys)
      for _, key in ipairs(keys) do
        if (used[key] or 0) > 0 then used[key] = used[key] - 1 else card(key, G.deck, #G.deck.cards + 1, 'playing') end
      end
    end
    -- Passive deck-wide effects (e.g. Oops! All 6s) use the original hooks.
    if not input.passiveEffectsApplied then
      for _, c in ipairs(G.jokers.cards) do if not c.debuff then c:add_to_deck() end end
      for _, c in ipairs(G.jokers.cards) do c:update(0) end
    end
    if blind.name == 'The Hook' and not G.GAME.blind.disabled then
      return {status='unsupported', message='The Hook pre-scoring discards are not supported'}
    end
    for _, c in ipairs(G.playing_cards) do
      local explicit = c.debuff
      if not input.passiveEffectsApplied then G.GAME.blind:debuff_card(c) end
      if explicit then c.debuff = true end
      if not input.passiveEffectsApplied then c:update(0) end
    end
    assert(G.GAME.current_round.hands_left > 0, 'No hands left')
    baselineId = G.playing_card
    restoreBaseline = checkpoint({G.GAME, G.hand, G.play, G.jokers, G.consumeables, G.deck.config}, immutable)
    loads = loads + 1
    return {status='ready'}
  end

  local function evaluate(selection, scalar)
    assert(restoreBaseline, 'Load a position before scoring')
    assert(type(selection) == 'table' and #selection >= 1 and #selection <= 5, 'Select 1-5 cards')
    trace, randomUsed, denied = input.trace and not scalar and json.array() or nil, false, false
    minimalUsed = false
    traceChips, traceMult = 0, 0
    env.hand_chips, env.mult, env.percent, env.percent_delta = nil, nil, nil, nil
    env.math.randomseed(seedHash)
    local selected = {}
    for _, index in ipairs(selection) do
      assert(type(index) == 'number' and index % 1 == 0 and all[index + 1] and not selected[index + 1], 'Invalid or duplicate play index')
      selected[index + 1] = true
    end
    G.hand.cards = {}
    for i, c in ipairs(all) do
      assert(not c.ability.forced_selection or selected[i], 'play must include every forced card')
      if selected[i] then c.area = G.play; G.play.cards[#G.play.cards + 1] = c
      else G.hand.cards[#G.hand.cards + 1] = c end
    end
    G.GAME.current_round.hands_left = G.GAME.current_round.hands_left - 1
    if G.GAME.blind.name == 'The Tooth' and not G.GAME.blind.disabled then G.GAME.dollars = G.GAME.dollars - #G.play.cards end
    randomUsed = false -- Constructor randomness is not a random scoring effect.
    evaluating = true
    local ok, result = pcall(G.FUNCS.evaluate_play)
    evaluating = false
    if not ok and result ~= scoringFinished then error(result, 0) end
    local total = env.hand_chips * env.mult
    assert(total == total and total ~= math.huge and total ~= -math.huge, 'Non-finite score')
    if scalar == true then return math.floor(total) end
    if scalar == 'play' then return {status='ok', hand=name, score=math.floor(total), notAllowed=denied, minimal=minimalUsed} end
    local indices = json.array()
    for _, c in ipairs(scoring) do for i, original in ipairs(all) do if original == c then indices[#indices + 1] = i - 1 end end end
    return {status='ok', version=G.VERSION, hand=name, displayHand=display, chips=env.hand_chips, mult=env.mult,
      score=math.floor(total), scoringCards=indices, notAllowed=denied, random=randomUsed,
      randomPolicy=input.random or 'seeded', seed=G.GAME.pseudorandom.seed, trace=input.trace and trace or nil}
  end

  function runtime.score(selection, scalar)
    calculations = calculations + 1
    local ok, result = pcall(evaluate, selection, scalar)
    evaluating = false
    if restoreBaseline then restoreBaseline(); G.playing_card = baselineId end
    if not ok then return type(result) == 'table' and result or {status='error', message=tostring(result)} end
    return result
  end

  function runtime.plays(snapshot, selectionLimit)
    local ok, result = pcall(function()
      local loaded = runtime.load(snapshot, true)
      if loaded.status ~= 'ready' then error(loaded, 0) end
      assert(type(selectionLimit) == 'number' and selectionLimit % 1 == 0 and selectionLimit >= 0 and selectionLimit <= 5, 'Invalid selection limit')
      local required, requiredCount = {}, 0
      for i, c in ipairs(all) do
        if c.ability.forced_selection then required[i] = true; requiredCount = requiredCount + 1 end
      end
      local max = math.min(#all, selectionLimit)
      if max < math.max(1, requiredCount) then error({message='no legal selection'}, 0) end
      local best, picked = {}, {}
      local function precedes(a, b)
        if a.score ~= b.score then return a.score > b.score end
        if #a.play ~= #b.play then return #a.play < #b.play end
        for i = 1, #a.play do
          if a.play[i] ~= b.play[i] then return a.play[i] < b.play[i] end
        end
        return false
      end
      local function trial()
        local scored = runtime.score(picked, 'play')
        if scored.status ~= 'ok' then error(scored, 0) end
        scored.play = picked
        local at = #best + 1
        while at > 1 and precedes(scored, best[at - 1]) do at = at - 1 end
        if at <= 15 then
          scored.play = clone(picked)
          table.insert(best, at, scored)
          if #best > 15 then best[16] = nil end
        end
      end
      -- Depth-first combinations retain only the active selection and top 15.
      -- A forced index ends sibling traversal so no required card is skipped.
      local function walk(start, remaining, needed)
        if needed > remaining then return end
        if remaining == 0 then trial(); return end
        for i = start, #all - remaining + 1 do
          picked[#picked + 1] = i - 1
          walk(i + 1, remaining - 1, needed - (required[i] and 1 or 0))
          picked[#picked] = nil
          if required[i] then break end
        end
      end
      for size = max, math.max(1, requiredCount), -1 do walk(1, size, requiredCount) end
      local lines = json.array()
      for i, candidate in ipairs(best) do
        lines[i] = table.concat(candidate.play, ' ') .. ': ' .. candidate.hand .. ' ' .. string.format('%.0f', candidate.score) ..
          (candidate.notAllowed and ' not allowed' or '') .. (candidate.minimal and ' minimal' or '')
      end
      return lines
    end)
    if not ok then return json.array({'unavailable: ' .. (type(result) == 'table' and result.message or tostring(result))}) end
    return result
  end
  function runtime.stats()
    return {sourceLoads=1, positionLoads=loads, calculations=calculations, luaMemoryKiB=collectgarbage('count')}
  end
  return runtime
end

-- Convenience for one-off Lua callers. Long-running callers use new/load/score.
function sandbox.score(input, source, json)
  local runtime = sandbox.new(source, json)
  local loaded = runtime.load(input)
  if loaded.status ~= 'ready' then return loaded end
  return runtime.score(input.play)
end

return sandbox
