-- Shadow scoring: run the game's own evaluate_play on candidate selections from the
-- current hand, then put every touched value back. Never reads face-down identities.
return function(json, clock, budget)
  local scoring = {}
  local noop = function() end
  local randomUsed = false
  -- Presentation and profile side effects; scoring results do not depend on them.
  local silenced = {'card_eval_status_text','update_hand_text','juice_card','highlight_card','play_sound','delay','play_area_status_text',
    'attention_text','check_for_unlock','inc_career_stat','check_and_set_high_score','set_hand_usage'}
  -- Instant money changes (The Ox) land before Bull/Bootstraps read the balance. Queued ones
  -- would run after scoring; the game tracks money earned while scoring in dollar_buffer.
  local function easeDollars(mod, instant) if instant then G.GAME.dollars = G.GAME.dollars + (mod or 0) end end
  -- Every random check fails, so random effects contribute their lowest outcome.
  local random = {
    pseudorandom=function(_, min, max) randomUsed = true; if min and max then return min end; return 0.999999 end,
    pseudorandom_element=function(t) randomUsed = true; for k, v in pairs(t or {}) do return v, k end end,
    pseudoseed=function() randomUsed = true; return 0 end,
  }
  local smodsValues = {'last_hand','displayed_hand','displaying_scoring','post_prob','hand_debuff_source','debuff_text'}

  local function plain(v) return type(v) == 'table' and getmetatable(v) == nil end
  -- Record every key of t, and plain nested tables to the given depth, so they can be restored in place.
  local function snap(t, depth, seen)
    if seen[t] then return seen[t] end
    local record = {t=t, fields={}, nested={}}
    seen[t] = record
    for k, v in pairs(t) do
      record.fields[k] = v
      if depth > 0 and plain(v) then record.nested[k] = snap(v, depth - 1, seen) end
    end
    return record
  end
  local function restore(record, done)
    if done[record] then return end
    done[record] = true
    local t = record.t
    for k in pairs(t) do if record.fields[k] == nil then t[k] = nil end end
    for k, v in pairs(record.fields) do t[k] = v end
    for _, child in pairs(record.nested) do restore(child, done) end
  end
  -- {table, key, value} triples restored by assignment.
  local function remember(list, t, key) list[#list + 1] = {t, key, t[key]} end
  local function reassign(list) for i = #list, 1, -1 do local e = list[i]; e[1][e[2]] = e[3] end end

  local function capture()
    local seen, roots = {}, {}
    roots[#roots + 1] = snap(G.GAME, 4, seen)
    for _, object in ipairs({G.GAME.blind, G.GAME.selected_back}) do if type(object) == 'table' then roots[#roots + 1] = snap(object, 2, seen) end end
    for _, area in ipairs({G.hand, G.jokers, G.consumeables, G.vouchers}) do
      -- Top-level card fields by reference; only the scoring data tables are copied deeply.
      for _, card in ipairs(area and area.cards or {}) do
        roots[#roots + 1] = snap(card, 0, seen)
        for _, key in ipairs({'ability','base','edition'}) do if plain(card[key]) then roots[#roots + 1] = snap(card[key], 3, seen) end end
        -- set_ability changes center/center_key in place. Keep shared prototypes by reference.
        if plain(card.config) then roots[#roots + 1] = snap(card.config, 0, seen) end
      end
    end
    local values = {}
    remember(values, _G, 'mult'); remember(values, _G, 'hand_chips'); remember(values, _G, 'percent'); remember(values, _G, 'percent_delta')
    remember(values, G, 'play'); remember(values, G, 'hand')
    -- Card creators may increment the identifier before calling a blocked constructor.
    remember(values, G, 'playing_card')
    if SMODS then
      for _, key in ipairs(smodsValues) do remember(values, SMODS, key) end
      for _, parameter in pairs(SMODS.Scoring_Parameters or {}) do if type(parameter) == 'table' then remember(values, parameter, 'current') end end
    end
    return function()
      reassign(values)
      local done = {}
      for _, record in ipairs(roots) do restore(record, done) end
    end
  end

  local function isDNA(card)
    local center = type(card.config) == 'table' and card.config.center
    return card.ability and card.ability.name == 'DNA' or type(center) == 'table' and center.key == 'j_dna'
  end
  local function active(blind, name, key)
    local blindKey = blind.config and blind.config.blind and blind.config.blind.key
    return not blind.disabled and (blind.name == name or blindKey == key)
  end

  local function install()
    local saved = {}
    local creationAttempted = false
    local function rejectCreation()
      creationAttempted = true
      error('card creation is not supported during shadow scoring', 0)
    end
    for _, name in ipairs(silenced) do remember(saved, _G, name); _G[name] = noop end
    for name, fn in pairs(random) do remember(saved, _G, name); _G[name] = fn end
    remember(saved, _G, 'ease_dollars'); _G.ease_dollars = easeDollars
    -- Creating a Card also creates sprites, registers objects and consumes math.random.
    -- Stop before these side effects instead of trying to undo a newly created object.
    for _, name in ipairs({'copy_card','create_card','create_playing_card'}) do
      if type(_G[name]) == 'function' then remember(saved, _G, name); _G[name] = rejectCreation end
    end
    if type(Card) == 'table' and type(Card.init) == 'function' then
      saved[#saved + 1] = {Card, 'init', rawget(Card, 'init')}; rawset(Card, 'init', rejectCreation)
    end
    if SMODS and type(SMODS.add_card) == 'function' then remember(saved, SMODS, 'add_card'); SMODS.add_card = rejectCreation end
    -- DNA (also when copied by Blueprint/Brainstorm, which call it) is treated as having no effect.
    if type(Card) == 'table' and type(Card.calculate_joker) == 'function' then
      local calculate = Card.calculate_joker
      saved[#saved + 1] = {Card, 'calculate_joker', rawget(Card, 'calculate_joker')}
      rawset(Card, 'calculate_joker', function(self, ...)
        if isDNA(self) then return nil end
        return calculate(self, ...)
      end)
    end
    remember(saved, G, 'E_MANAGER'); G.E_MANAGER = {add_event=noop, clear_queue=noop}
    for _, class in ipairs({Card, Blind, Moveable}) do
      if type(class) == 'table' then saved[#saved + 1] = {class, 'juice_up', rawget(class, 'juice_up')}; rawset(class, 'juice_up', noop) end
    end
    if SMODS then remember(saved, SMODS, 'juice_up_blind'); SMODS.juice_up_blind = noop end
    return function() reassign(saved) end, function() return creationAttempted end
  end

  local function trial(cards, rest, liveHand, livePlay)
    local play = setmetatable({cards=cards}, {__index=livePlay})
    local held = setmetatable({cards=rest}, {__index=liveHand})
    G.play, G.hand = play, held
    for _, card in ipairs(cards) do card.area = play end
    for _, card in ipairs(rest) do card.area = held end
    -- The game spends the hand before evaluating it; "final hand" Jokers depend on this.
    local round = G.GAME.current_round
    round.hands_left = (round.hands_left or 1) - 1
    local blind = G.GAME.blind
    -- The Tooth's money loss is queued on press_play, ahead of the evaluation.
    if type(blind) == 'table' and active(blind, 'The Tooth', 'bl_tooth') then G.GAME.dollars = G.GAME.dollars - #cards end
    -- Otherwise evaluate_play clears flags on the cards of the last real hand.
    if SMODS then SMODS.last_hand = nil end
    randomUsed = false
    local name, _, pokerHands = G.FUNCS.get_poker_hand_info(cards)
    local blocked = type(blind) == 'table' and blind.debuff_hand and blind:debuff_hand(cards, pokerHands, name, true) and true or false
    G.FUNCS.evaluate_play()
    local score = SMODS and SMODS.calculate_round_score and SMODS.calculate_round_score() or (hand_chips or 0) * (mult or 0)
    return name, score, blocked, randomUsed
  end

  local function selections(n, forced, limit)
    local out = {}
    local function walk(start, size, chosen)
      if #chosen == size then
        local has = {}; for _, i in ipairs(chosen) do has[i] = true end
        for _, i in ipairs(forced) do if not has[i] then return end end
        out[#out + 1] = {unpack(chosen)}
        return
      end
      for i = start, n do chosen[#chosen + 1] = i; walk(i + 1, size, chosen); chosen[#chosen] = nil end
    end
    for size = math.min(limit, n), 1, -1 do walk(1, size, {}) end
    return out
  end

  local function number(v)
    if type(v) ~= 'number' then return '?' end
    if v ~= v or v == math.huge or v == -math.huge then return tostring(v) end
    v = math.floor(v)
    return math.abs(v) < 1e15 and string.format('%.0f', v) or string.format('%.4e', v)
  end

  local function evaluate(liveHand)
    local hand = liveHand.cards
    local forced = {}
    for i, card in ipairs(hand) do if card.ability and card.ability.forced_selection then forced[#forced + 1] = i end end
    local candidates = selections(#hand, forced, math.min(5, liveHand.config and liveHand.config.highlighted_limit or 5))
    local livePlay = G.play
    local undo = capture()
    local uninstall, creationAttempted = install()
    local best, scored, failure, started = {}, 0, nil, clock()
    local ok, err = pcall(function()
      for _, chosen in ipairs(candidates) do
        if clock() - started > budget then break end
        local cards, rest, picked = {}, {}, {}
        for _, i in ipairs(chosen) do cards[#cards + 1] = hand[i]; picked[i] = true end
        for i, card in ipairs(hand) do if not picked[i] then rest[#rest + 1] = card end end
        local done, name, score, blocked, random = pcall(trial, cards, rest, liveHand, livePlay)
        undo()
        -- Discard every candidate if an unsupported effect ran, even if a mod caught the error.
        if creationAttempted() then error('card creation is not supported during shadow scoring', 0) end
        if done and type(name) == 'string' then
          scored = scored + 1
          if blocked then score = 0 end
          local row = best[name]
          if not row or score > row.score or score == row.score and #chosen < #row.chosen then
            best[name] = {name=name, score=score, chosen=chosen, blocked=blocked, random=random}
          end
        elseif not done then failure = failure or tostring(name) end
      end
    end)
    undo(); uninstall()
    if not ok then error(err, 0) end
    local rows = {}
    for _, row in pairs(best) do rows[#rows + 1] = row end
    table.sort(rows, function(a, b) if a.score ~= b.score then return a.score > b.score end; return a.name < b.name end)
    local out = json.array()
    for i = 1, math.min(5, #rows) do
      local row, indices = rows[i], {}
      for _, index in ipairs(row.chosen) do indices[#indices + 1] = tostring(index - 1) end
      out[#out + 1] = table.concat(indices, ' ') .. ': ' .. row.name .. ' ' .. number(row.score) ..
        (row.random and ' random' or '') .. (row.blocked and ' not allowed' or '')
    end
    if scored == 0 then return json.array({'unavailable: ' .. (failure or 'no selection could be scored')}) end
    if scored < #candidates then out[#out + 1] = 'truncated: scored ' .. scored .. ' of ' .. #candidates .. ' selections' end
    return out
  end

  -- Candidate lines for the current hand, or nil when no hand is being played or a card is face-down.
  function scoring.plays()
    if not (G and G.GAME and G.hand and G.hand.cards and G.FUNCS and G.FUNCS.evaluate_play and G.FUNCS.get_poker_hand_info) then return nil end
    if #G.hand.cards == 0 then return nil end
    for _, area in ipairs({G.hand, G.jokers}) do
      for _, card in ipairs(area and area.cards or {}) do
        if card.facing == 'back' then return nil end
      end
    end
    local ok, result = pcall(evaluate, G.hand)
    if not ok then return json.array({'unavailable: ' .. tostring(result)}) end
    return result
  end
  return scoring
end
