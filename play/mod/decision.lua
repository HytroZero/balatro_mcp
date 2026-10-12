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
  -- English text for misc tables (poker_hands, ranks, suits_plural, suits_singular, v_dictionary).
  local singular = {Clubs='Club',Diamonds='Diamond',Hearts='Heart',Spades='Spade'}
  local function misc(group, key)
    if type(key) ~= 'string' then return '?' end
    local entries = english and english.misc and english.misc[group]
    if entries and type(entries[key]) == 'string' then return entries[key] end
    if english then return group == 'suits_singular' and singular[key] or key end
    if type(localize) == 'function' then
      local ok, value = pcall(localize, key, group)
      if ok and type(value) == 'string' then return value end
    end
    return key
  end
  local function pokerName(hand) return misc('poker_hands', hand) end
  local function dictionary(key, fallback)
    local entries = english and english.misc and english.misc.v_dictionary
    return entries and type(entries[key]) == 'string' and entries[key] or fallback
  end
  local function probability() return G.GAME and G.GAME.probabilities and G.GAME.probabilities.normal or 1 end
  local function product(a, b) return type(a) == 'number' and type(b) == 'number' and a * b or nil end
  local function plus(a, b) return type(a) == 'number' and a + b or nil end
  local function current(key) local round = G.GAME and G.GAME.current_round; return round and round[key] or {} end
  -- Display values follow Card:generate_UIBox_ability_table in card.lua. Read-only:
  -- never run tooltip constructors (Misprint's UI can inspect hidden deck cards).
  local jokers = {}
  local function joker(names, vars) for value in names:gmatch('[^|]+') do jokers[value] = vars end end
  local function extra(a) return {a.extra} end
  local function chips(a) local e = a.extra or {}; return {e.chips, e.chip_mod} end
  joker('Joker|Ceremonial Dagger|Swashbuckler', function(a) return {a.mult} end)
  joker('Jolly Joker|Zany Joker|Mad Joker|Crazy Joker|Droll Joker', function(a) return {a.t_mult, pokerName(a.type)} end)
  joker('Sly Joker|Wily Joker|Clever Joker|Devious Joker|Crafty Joker', function(a) return {a.t_chips, pokerName(a.type)} end)
  joker('The Duo|The Trio|The Family|The Order|The Tribe', function(a) return {a.x_mult, pokerName(a.type)} end)
  joker('Greedy Joker|Lusty Joker|Wrathful Joker|Gluttonous Joker', function(a) local e = a.extra or {}; return {e.s_mult, misc('suits_singular', e.suit)} end)
  joker('Chaos the Clown|Credit Card|Golden Joker|Banner|Fibonacci|Scary Face|Delayed Gratification|Even Steven|Odd Todd|Superposition|Egg|Burglar|DNA|Hiker|Astronomer|Golden Ticket|Acrobat|Certificate|Hanging Chad|Rough Gem|Arrowhead|Onyx Agate|Flower Pot|Seeing Double|Matador|Riff-raff|Vagabond|Baron|Photograph|Gift Card|To the Moon|Baseball Card|Trading Card|Seltzer|Smiley Face|Shoot the Moon|Triboulet|Perkeo', extra)
  joker('Hack|Dusk|Sock and Buskin', function(a) return {plus(a.extra, 1)} end)
  joker('Ride the Bus|Red Card|Flash Card', function(a) return {a.extra, a.mult} end)
  joker('Constellation|Throwback|Glass Joker|Hit the Road|Madness|Vampire|Hologram|Obelisk|Lucky Cat|Campfire', function(a) return {a.extra, a.x_mult} end)
  joker('Runner|Ice Cream|Wee Joker|Square Joker', chips)
  joker('Half Joker', function(a) local e = a.extra or {}; return {e.mult, e.size} end)
  joker('Fortune Teller', function(a) local total = G.GAME and G.GAME.consumeable_usage_total; return {a.extra, total and total.tarot or 0} end)
  joker('Steel Joker', function(a) return {a.extra, plus(product(a.extra, a.steel_tally or 0), 1)} end)
  joker('Stone Joker', function(a) return {a.extra, product(a.extra, a.stone_tally or 0)} end)
  joker('Cloud 9', function(a) return {a.extra, product(a.extra, a.nine_tally or 0)} end)
  joker('Space Joker|8 Ball|Business Card|Hallucination', function(a) return {probability(), a.extra} end)
  joker('Drunkard', function(a) return {a.d_size} end)
  joker('Juggler', function(a) return {a.h_size} end)
  joker('Merry Andy', function(a) return {a.d_size, a.h_size} end)
  joker('Troubadour', function(a) local e = a.extra or {}; return {e.h_size, type(e.h_plays) == 'number' and -e.h_plays or nil} end)
  joker('Green Joker', function(a) local e = a.extra or {}; return {e.hand_add, e.discard_sub, a.mult} end)
  joker('Blue Joker', function(a) return {a.extra, product(a.extra, G.deck and G.deck.cards and #G.deck.cards or 52)} end)
  joker('Faceless Joker', function(a) local e = a.extra or {}; return {e.dollars, e.faces} end)
  joker('Joker Stencil', function(a) return {a.x_mult} end)
  joker('Mystic Summit', function(a) local e = a.extra or {}; return {e.mult, e.d_remaining} end)
  joker('Loyalty Card', function(a)
    local e, remaining = a.extra or {}, a.loyalty_remaining
    local status = '?'
    if remaining == 0 then status = dictionary('loyalty_active', 'Active!')
    elseif type(remaining) == 'number' then status = dictionary('loyalty_inactive', '#1# remaining'):gsub('#1#', tostring(remaining)) end
    return {e.Xmult, plus(e.every, 1), status}
  end)
  joker('Abstract Joker', function(a) return {a.extra, product(G.jokers and G.jokers.cards and #G.jokers.cards or 0, a.extra)} end)
  joker('Gros Michel', function(a) local e = a.extra or {}; return {e.mult, probability(), e.odds} end)
  joker('Cavendish', function(a) local e = a.extra or {}; return {e.Xmult, probability(), e.odds} end)
  joker('Bloodstone', function(a) local e = a.extra or {}; return {probability(), e.odds, e.Xmult} end)
  joker('Reserved Parking', function(a) local e = a.extra or {}; return {e.dollars, probability(), e.odds} end)
  joker('Scholar', function(a) local e = a.extra or {}; return {e.mult, e.chips} end)
  joker('Walkie Talkie', function(a) local e = a.extra or {}; return {e.chips, e.mult} end)
  joker('Spare Trousers', function(a) return {a.extra, pokerName('Two Pair'), a.mult} end)
  joker('Blackboard', function(a) return {a.extra, misc('suits_plural', 'Spades'), misc('suits_plural', 'Clubs')} end)
  joker('To Do List', function(a) return {(a.extra or {}).dollars, pokerName(a.to_do_poker_hand)} end)
  joker('Card Sharp', function(a) return {(a.extra or {}).Xmult} end)
  joker('Seance', function(a) return {pokerName((a.extra or {}).poker_hand)} end)
  joker('Rocket', function(a) local e = a.extra or {}; return {e.dollars, e.increase} end)
  joker('Turtle Bean', function(a) local e = a.extra or {}; return {e.h_size, e.h_mod} end)
  joker('Stuntman', function(a) local e = a.extra or {}; return {e.chip_mod, e.h_size} end)
  joker('Popcorn', function(a) return {a.mult, a.extra} end)
  joker('Ramen', function(a) return {a.x_mult, a.extra} end)
  joker('Invisible Joker', function(a) return {a.extra, a.invis_rounds} end)
  joker("Driver's License", function(a) return {a.extra, a.driver_tally or 0} end)
  joker('Caino', function(a) return {a.extra, a.caino_xmult} end)
  joker('Yorick', function(a) local e = a.extra or {}; return {e.xmult, e.discards, a.yorick_discards, a.x_mult} end)
  joker('The Idol', function(a) local card = current('idol_card'); return {a.extra, misc('ranks', card.rank), misc('suits_plural', card.suit)} end)
  joker('Mail-In Rebate', function(a) return {a.extra, misc('ranks', current('mail_card').rank)} end)
  joker('Ancient Joker', function(a) return {a.extra, misc('suits_singular', current('ancient_card').suit)} end)
  joker('Castle', function(a) local e = a.extra or {}; return {e.chip_mod, misc('suits_singular', current('castle_card').suit), e.chips} end)
  joker('Erosion', function(a)
    local start = G.GAME and G.GAME.starting_deck_size
    local missing = type(start) == 'number' and G.playing_cards and start - #G.playing_cards or 0
    return {a.extra, type(a.extra) == 'number' and math.max(0, a.extra * missing) or nil, start}
  end)
  joker('Bull', function(a) local money = G.GAME and G.GAME.dollars; return {a.extra, type(money) == 'number' and product(a.extra, math.max(0, money)) or nil} end)
  joker('Bootstraps', function(a)
    local e, money = a.extra or {}, G.GAME and G.GAME.dollars
    local total = type(money) == 'number' and type(e.dollars) == 'number' and type(e.mult) == 'number' and e.mult * math.floor((money + (G.GAME.dollar_buffer or 0)) / e.dollars) or nil
    return {e.mult, e.dollars, total}
  end)
  joker('Diet Cola', function() return {name('tag_double', 'Tag', 'Double Tag')} end)
  joker('Satellite', function(a)
    local usage = G.GAME and G.GAME.consumeable_usage
    if type(usage) ~= 'table' then return {a.extra} end
    local planets = 0
    for _, used in pairs(usage) do if type(used) == 'table' and used.set == 'Planet' then planets = planets + 1 end end
    return {a.extra, product(planets, a.extra)}
  end)
  -- Consumables and vouchers read the center config, as generate_card_ui does.
  local function config(a, center, key)
    local c = center.config
    if type(c) == 'table' and c[key] ~= nil then return c[key] end
    if type(a.consumeable) == 'table' and a.consumeable[key] ~= nil then return a.consumeable[key] end
    return a[key]
  end
  function decision.card(card)
    local a, center = card.ability or {}, card.config and card.config.center or {}
    local key, set, vars = center.key, center.set or a.set, {}
    local function c(path) return config(a, center, path) end
    if set == 'Joker' then
      if a.name == 'Misprint' then
        -- The game shows a cycling random number; the range is the visible information.
        local e = a.extra or {}
        local known = type(e.min) == 'number' and type(e.max) == 'number'
        return name(key,set,a.name), ('+%s-%s Mult (random each hand)'):format(known and e.min or '?', known and e.max or '?'), known
      end
      if jokers[a.name] then vars = jokers[a.name](a) end
    elseif set == 'Planet' then
      local hand = c('hand_type')
      local h = G.GAME and G.GAME.hands and G.GAME.hands[hand] or {}
      vars = {h.level,pokerName(hand),h.l_mult,h.l_chips}
    elseif set == 'Tarot' then
      local enhancement, suit = c('mod_conv'), c('suit_conv')
      vars = {c('max_highlighted') or c('planets') or c('tarots') or c('extra')}
      if enhancement then vars[2] = name(enhancement,'Enhanced',enhancement) end
      if suit then vars[2] = misc('suits_plural', suit) end
      if key == 'c_wheel_of_fortune' then vars = {probability(),c('extra')} end
      if key == 'c_temperance' then
        local money, cap = 0, c('extra')
        for _, owned in ipairs(G.jokers and G.jokers.cards or {}) do
          if owned.ability and owned.ability.set == 'Joker' and type(owned.sell_cost) == 'number' then money = money + owned.sell_cost end
        end
        vars = {cap, type(cap) == 'number' and math.min(cap, money) or nil}
      end
      if key == 'c_fool' then local last = G.GAME.last_tarot_planet; local p = last and G.P_CENTERS[last]; vars = {p and name(last,p.set,p.name) or 'None'} end
    elseif set == 'Spectral' then
      vars = {type(c('extra')) == 'number' and c('extra') or nil}
      if key == 'c_immolate' and type(c('extra')) == 'table' then vars = {c('extra').destroy,c('extra').dollars} end
      if key == 'c_ectoplasm' then vars = {G.GAME.ecto_minus or 1} end
    elseif set == 'Voucher' then
      vars = {c('extra')}
      if key == 'v_tarot_merchant' or key == 'v_tarot_tycoon' or key == 'v_planet_merchant' or key == 'v_planet_tycoon' then vars = {c('extra_disp')} end
      if (key == 'v_seed_money' or key == 'v_money_tree') and type(c('extra')) == 'number' then vars = {c('extra') / 5} end
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
