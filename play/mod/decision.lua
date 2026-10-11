-- Player-visible decision inputs only. No constructors, gameplay hooks or RNG.
return function(json)
  local decision = {}
  local function name(key, set, fallback)
    if type(localize) == 'function' then
      local ok, value = pcall(localize, {type='name_text',key=key,set=set})
      if ok and type(value) == 'string' then return value end
    end
    return fallback or key
  end
  local function descriptions(key, set, vars)
    local lines = json.array()
    if type(localize) ~= 'function' then return lines, false end
    local ok, value = pcall(localize, {type='raw_descriptions',key=key,set=set,vars=vars or {}})
    if not ok or type(value) ~= 'table' then return lines, false end
    for _, line in ipairs(value) do if type(line) == 'string' then lines[#lines+1] = line end end
    return lines, true
  end
  local function pokerName(hand)
    if type(hand) ~= 'string' then return '?' end
    if type(localize) == 'function' then
      local ok, value = pcall(localize, hand, 'poker_hands')
      if ok and type(value) == 'string' then return value end
    end
    return hand
  end
  function decision.blind(key, center, active)
    center = center or {}; local run = G.GAME or {}; local round = run.current_round or {}
    local vars = center.vars
    if key == 'bl_ox' then vars = {pokerName(round.most_played_poker_hand)} end
    local rules, known = descriptions(key, 'Blind', vars)
    local state = {active=not active or active.disabled ~= true}
    if key == 'bl_ox' then
      state.moneyResetHand = round.most_played_poker_hand
      state.known = type(state.moneyResetHand) == 'string'
    elseif key == 'bl_mouth' then
      state.known = active ~= nil and active.only_hand ~= nil
      state.uncommitted = active ~= nil and active.only_hand == false
      if active and type(active.only_hand) == 'string' then state.requiredHandType = active.only_hand end
    elseif key == 'bl_eye' then
      state.known = active ~= nil and type(active.hands) == 'table'
      state.blockedHandTypes = json.array()
      for hand, played in pairs(active and active.hands or {}) do
        if played == true then state.blockedHandTypes[#state.blockedHandTypes+1] = hand end
      end
      table.sort(state.blockedHandTypes)
    elseif key == 'bl_psychic' then state.minimumPlayedCards = 5
    end
    return {key=key,name=center.name,displayName=name(key,'Blind',center.name),rules=rules,rulesKnown=known,ruleState=state}
  end
  function decision.round(run)
    local round = run.current_round or {}; local counts, types = {}, json.array()
    local known, seen, total = type(run.hands) == 'table', false, 0
    for hand, data in pairs(run.hands or {}) do
      if data.visible then
        seen = true
        if type(data.played_this_round) ~= 'number' then known = false
        else
          total = total + data.played_this_round
          if data.played_this_round > 0 then counts[hand] = data.played_this_round; types[#types+1] = hand end
        end
      end
    end
    table.sort(types)
    known = known and seen and type(round.hands_played) == 'number' and total == round.hands_played
    local lastKnown = round.hands_played == 0 or type(round.hands_played) == 'number' and round.hands_played > 0 and type(run.last_hand_played) == 'string'
    local result = {handsPlayed=round.hands_played,handHistoryKnown=known,handTypeCounts=counts,handTypesPlayed=types,lastHandKnown=not not lastKnown}
    -- Balatro retains last_hand_played across rounds; never label it as this round's first hand.
    if type(round.hands_played) == 'number' and round.hands_played > 0 and type(run.last_hand_played) == 'string' then result.lastHandType = run.last_hand_played end
    return result
  end
  function decision.tag(key, tag, blindType)
    if tag and tag.hide_ability then return {hidden=true} end
    local run = G.GAME or {}; local proto = G.P_TAGS and G.P_TAGS[key] or {}
    local config = tag and tag.config or proto.config or {}; local vars, values = {}, {}
    if key == 'tag_investment' then vars = {config.dollars}
    elseif key == 'tag_handy' then vars = {config.dollars_per_hand,(config.dollars_per_hand or 0)*(run.hands_played or 0)}
    elseif key == 'tag_garbage' then vars = {config.dollars_per_discard,(config.dollars_per_discard or 0)*(run.unused_discards or 0)}
    elseif key == 'tag_juggle' then vars = {config.h_size}
    elseif key == 'tag_top_up' then vars = {config.spawn_jokers}
    elseif key == 'tag_skip' then vars = {config.skip_bonus,(config.skip_bonus or 0)*((run.skips or 0)+1)}
    elseif key == 'tag_economy' then vars = {config.max}
    elseif key == 'tag_orbital' then
      local ante = run.round_resets and run.round_resets.ante
      local choices = run.orbital_choices and run.orbital_choices[ante]
      local hand = tag and tag.ability and tag.ability.orbital_hand or choices and choices[blindType]
      values.orbitalHandKnown = type(hand) == 'string' and run.hands and run.hands[hand] ~= nil or false
      if values.orbitalHandKnown then values.orbitalHand = hand end
      values.levels = config.levels
      vars = {pokerName(values.orbitalHand),config.levels}
    end
    local rules, known = descriptions(key,'Tag',vars)
    return {key=key,name=proto.name or tag and tag.name,displayName=name(key,'Tag',proto.name),rules=rules,rulesKnown=known,values=values,triggered=tag and tag.triggered == true or false}
  end
  function decision.tags(run)
    local tags = json.array()
    for _, tag in ipairs(run.tags or {}) do tags[#tags+1] = decision.tag(tag.key,tag) end
    return tags
  end
  function decision.profile(deckKeys, stakes)
    local decks, orderedStakes = json.array(), {}
    for stake, level in pairs(stakes) do orderedStakes[level] = stake end
    local orderedDecks = {}; for deck in pairs(deckKeys) do orderedDecks[#orderedDecks+1] = deck end; table.sort(orderedDecks)
    for _, deck in ipairs(orderedDecks) do
      local key = deckKeys[deck]; local center = G.P_CENTERS and G.P_CENTERS[key]
      if center then
        local entry = {deck=deck,key=key,unlocked=center.unlocked == true,stakes=json.array(),stakesKnown=false}
        if not entry.unlocked then entry.stakesKnown = true
        elseif type(get_deck_win_stake) == 'function' then
          local ok, won = pcall(get_deck_win_stake,key)
          if ok and type(won) == 'number' then
            entry.stakesKnown = true
            for level=1,math.min(8,won+1) do entry.stakes[#entry.stakes+1] = orderedStakes[level] end
          end
        end
        decks[#decks+1] = entry
      end
    end
    return {decks=decks}
  end
  return decision
end
