-- Player-visible decision inputs only. No constructors, gameplay hooks or RNG.
return function(json, english)
  local decision = {}
  -- Load the game's own English data without changing G.localization/language.
  if not english and love and love.filesystem and love.filesystem.load then
    local ok, chunk = pcall(love.filesystem.load, 'localization/en-us.lua')
    if ok and type(chunk) == 'function' then local loaded, value = pcall(chunk); if loaded and type(value) == 'table' then english = value end end
  end
  local function entry(key, set)
    return english and english.descriptions and english.descriptions[set] and english.descriptions[set][key]
  end
  local function render(key, set, vars)
    local source = entry(key, set); local lines, known = json.array(), true
    if not source or type(source.text) ~= 'table' then return lines, false end
    for _, line in ipairs(source.text) do
      line = line:gsub('{[^}]*}', ''):gsub('#(%d+)#', function(index)
        local value = vars and vars[tonumber(index)]
        if value == '?' or type(value) ~= 'string' and type(value) ~= 'number' then known = false; return '?' end
        return tostring(value)
      end)
      lines[#lines+1] = line
    end
    return lines, known
  end
  local function name(key, set, fallback)
    local source = entry(key, set)
    if source and type(source.name) == 'string' then return source.name end
    if english then return fallback or key end
    if type(localize) == 'function' then
      local ok, value = pcall(localize, {type='name_text',key=key,set=set})
      if ok and type(value) == 'string' then return value end
    end
    return fallback or key
  end
  local function descriptions(key, set, vars)
    if english then return render(key, set, vars) end
    local lines = json.array()
    if type(localize) ~= 'function' then return lines, false end
    local ok, value = pcall(localize, {type='raw_descriptions',key=key,set=set,vars=vars or {}})
    if not ok or type(value) ~= 'table' then return lines, false end
    for _, line in ipairs(value) do if type(line) == 'string' then lines[#lines+1] = line end end
    return lines, true
  end
  local function pokerName(hand)
    if type(hand) ~= 'string' then return '?' end
    if english then return hand end
    if type(localize) == 'function' then
      local ok, value = pcall(localize, hand, 'poker_hands')
      if ok and type(value) == 'string' then return value end
    end
    return hand
  end
  -- Display bindings read visible ability values. Unknown bindings remain '?';
  -- never run tooltip constructors (Misprint's UI can inspect hidden deck cards).
  local bindings = {}
  local function bind(names, fields)
    for value in names:gmatch('[^|]+') do bindings[value] = fields end
  end
  bind('Joker|Swashbuckler', {'mult'})
  bind('Popcorn', {'mult','extra'})
  bind('Green Joker|Red Card|Ride the Bus|Flash Card', {'extra','mult'})
  bind('Hologram|Vampire|Madness|Obelisk|Lucky Cat|Campfire|Throwback', {'extra','x_mult'})
  bind('Ramen', {'x_mult','extra'})
  bind('Jolly Joker|Zany Joker|Mad Joker|Crazy Joker|Droll Joker', {'t_mult','type'})
  bind('Sly Joker|Wily Joker|Clever Joker|Devious Joker|Crafty Joker', {'t_chips','type'})
  bind('Greedy Joker|Lusty Joker|Wrathful Joker|Gluttonous Joker', {'extra.s_mult','extra.suit'})
  bind('Mystic Summit', {'extra.mult','extra.d_remaining'})
  bind('Scholar', {'extra.mult','extra.chips'})
  bind('Walkie Talkie', {'extra.chips','extra.mult'})
  bind('Square Joker|Wee Joker', {'extra.chips','extra.chip_mod'})
  bind('Ice Cream', {'extra.chips','extra.chip_mod'})
  bind('Rocket', {'extra.dollars','extra.increase'})
  bind('Turtle Bean', {'extra.h_size','extra.h_mod'})
  bind('Stuntman', {'extra.chip_mod','extra.h_size'})
  bind('Gros Michel', {'extra.mult','@probability','extra.odds'})
  bind('Cavendish', {'extra.Xmult','@probability','extra.odds'})
  bind('Bloodstone', {'@probability','extra.odds','extra.Xmult'})
  bind('Reserved Parking', {'extra.dollars','@probability','extra.odds'})
  bind('Space Joker|Business Card|8 Ball|Hallucination', {'@probability','extra'})
  bind('Invisible Joker', {'extra','invis_rounds'})
  bind("Driver's License", {'extra','driver_tally'})
  bind('Caino', {'extra','caino_xmult'})
  bind('Yorick', {'extra.xmult','extra.discards','yorick_discards','x_mult'})
  bind('Card Sharp', {'extra.Xmult'})
  bind('Glass Joker', {'extra','x_mult'})
  bind('The Duo|The Trio|The Family|The Order|The Tribe', {'x_mult','type'})
  bind('Misprint', {'extra.min','extra.max'})
  local function field(raw, path)
    if path == '@probability' then return G.GAME and G.GAME.probabilities and G.GAME.probabilities.normal end
    for key in path:gmatch('[^.]+') do raw = type(raw) == 'table' and raw[key] or nil end
    return raw
  end
  function decision.card(card)
    local a, center = card.ability or {}, card.config and card.config.center or {}
    local key, set, vars = center.key, center.set or a.set, {}
    if set == 'Joker' then
      if bindings[a.name] then for i, path in ipairs(bindings[a.name]) do vars[i] = field(a,path) end
      elseif type(a.extra) == 'number' then vars[1] = a.extra end
      if a.name == 'Abstract Joker' then vars = {a.extra, G.jokers and G.jokers.cards and type(a.extra) == 'number' and #G.jokers.cards * a.extra or nil} end
      if a.name == 'Spare Trousers' then vars = {a.extra,'Two Pair',a.mult} end
      if a.name == 'To Do List' then vars = {field(a,'extra.dollars'), pokerName(a.to_do_poker_hand)} end
      if a.name == 'Bull' then vars = {a.extra, type(a.extra) == 'number' and G.GAME and type(G.GAME.dollars) == 'number' and a.extra * math.max(0,G.GAME.dollars) or nil} end
      if a.name == 'Satellite' and type(a.extra) == 'number' and G.GAME and type(G.GAME.consumeable_usage) == 'table' then
        local planets = 0
        for _, usage in pairs(G.GAME.consumeable_usage) do if type(usage) == 'table' and usage.set == 'Planet' then planets = planets + 1 end end
        vars = {a.extra, planets * a.extra}
      end
    elseif set == 'Planet' then
      local h = G.GAME and G.GAME.hands and G.GAME.hands[a.hand_type or center.config and center.config.hand_type] or {}
      vars = {h.level,a.hand_type or center.config and center.config.hand_type,h.l_mult,h.l_chips}
    elseif set == 'Tarot' then
      vars = {a.consumeable and a.consumeable.max_highlighted or a.max_highlighted or a.planets or a.tarots or a.extra}
      local enhancement = a.mod_conv or center.config and center.config.mod_conv
      if enhancement then vars[2] = name(enhancement,'Enhanced',enhancement) end
      if key == 'c_wheel_of_fortune' then vars = {field(a,'@probability'),a.extra} end
      if key == 'c_fool' then local last = G.GAME.last_tarot_planet; local c = last and G.P_CENTERS[last]; vars = {c and name(last,c.set,c.name) or 'None'} end
    elseif set == 'Spectral' then
      vars = {type(a.extra) == 'number' and a.extra or nil}
      if key == 'c_immolate' and type(a.extra) == 'table' then vars = {a.extra.destroy,a.extra.dollars} end
      if key == 'c_ectoplasm' then vars = {G.GAME.ecto_minus or 1} end
    elseif set == 'Voucher' then vars = {a.extra}
    elseif set == 'Booster' then
      key, set = (key or ''):gsub('_%d+$',''), 'Other'
      vars = {center.config and center.config.choose,a.extra}
    end
    local lines, known = render(key,set,vars)
    return name(key,set,a.name or center.name or center.key), #lines > 0 and table.concat(lines,' ') or nil, known
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
