-- Read-only input for the independent scoring worker. Never execute scoring here.
return function(json)
  local snapshot = {}
  local function copy(value, seen)
    local kind = type(value)
    if kind == 'nil' or kind == 'boolean' or kind == 'string' then return value end
    if kind == 'number' then
      assert(value == value and value ~= math.huge and value ~= -math.huge, 'Non-finite scoring value')
      return value
    end
    assert(kind == 'table', 'Unsupported scoring value: ' .. kind)
    seen = seen or {}
    assert(not seen[value], 'Cyclic scoring value')
    seen[value] = true
    local numeric, count = false, 0
    for k in pairs(value) do
      if type(k) == 'number' then numeric = true end
      count = count + 1
    end
    assert(not numeric or #value == count, 'Sparse or mixed scoring array')
    local out = (numeric or getmetatable(value) == json.array_mt) and json.array() or {}
    for k, v in pairs(value) do
      assert(type(k) == 'string' or type(k) == 'number', 'Unsupported scoring key')
      out[k] = copy(v, seen)
    end
    seen[value] = nil
    return out
  end
  local function vanilla(center)
    assert(type(center) == 'table' and type(center.key) == 'string' and not center.mod, 'Modded or missing scoring prototype')
    return center.key
  end
  local function card(c, playing)
    local center = c.config and c.config.center
    local key = vanilla(center)
    local edition = c.edition and c.edition.type
    if edition then assert(({foil=true,holo=true,polychrome=true,negative=true})[edition], 'Unsupported edition') end
    if c.seal then assert(({Red=true,Blue=true,Gold=true,Purple=true})[c.seal], 'Unsupported seal') end
    local out = {key=key, ability=copy(c.ability), debuff=c.debuff == true, sell_cost=c.sell_cost,
      edition=edition, editionValues=copy(c.edition), seal=c.seal}
    if playing then
      assert(type(c.config.card_key) == 'string' and G.P_CARDS[c.config.card_key], 'Missing playing card prototype')
      assert(not G.P_CARDS[c.config.card_key].mod, 'Modded playing card prototype')
      out.key, out.enhancement, out.base = c.config.card_key, key, copy(c.base)
    end
    return out
  end
  local function area(a, playing, unordered, hidden)
    assert(a and type(a.cards) == 'table', 'Missing scoring card area')
    local out = json.array()
    -- A face-down held card keeps its slot but exports no identity or ability.
    for _, c in ipairs(a.cards) do out[#out + 1] = hidden and c.facing == 'back' and {facing='back'} or card(c, playing) end
    -- Deck membership is public; its draw order is not part of a scoring snapshot.
    if unordered then table.sort(out, function(a,b) return json.encode(a) < json.encode(b) end) end
    return out
  end
  local function membership()
    local members, count = {}, 0
    for _, a in ipairs({G.hand,G.deck,G.discard}) do
      assert(a and type(a.cards) == 'table', 'Missing playing card area')
      for _, c in ipairs(a.cards) do
        assert(not members[c], 'Playing card occurs in multiple areas')
        members[c], count = true, count + 1
      end
    end
    assert(type(G.playing_cards) == 'table' and #G.playing_cards == count, 'Incomplete playing card membership')
    for _, c in ipairs(G.playing_cards) do assert(members[c], 'Playing card outside scoring areas') end
  end
  -- Everything except the playing card areas and the blind.
  local function shell()
    for _, a in ipairs({G.jokers, G.consumeables}) do
      for _, c in ipairs(a.cards) do assert(c.facing ~= 'back', 'Face-down cards cannot be scored') end
    end
    local live = assert(G.GAME, 'Missing game')
    local back = assert(live.selected_back and live.selected_back.effect, 'Missing deck back')
    local state = {jokers=area(G.jokers), consumables=area(G.consumeables),
      back=vanilla(back.center), backConfig=copy(back.config),
      jokerSlots=G.jokers.config.card_limit, handSize=G.hand.config.card_limit,
      hands={}, game={}, passiveEffectsApplied=true, random='fixed'}
    for name, h in pairs(live.hands) do
      state.hands[name] = {level=h.level,chips=h.chips,mult=h.mult,played=h.played,played_this_round=h.played_this_round}
    end
    -- No engine objects, save data, seed, or RNG streams cross this boundary.
    for _, key in ipairs({'dollars','bankrupt_at','chips','round','hands_played','skips',
      'probabilities','used_vouchers','modifiers','starting_params','cards_played','last_hand_played',
      'last_tarot_planet','consumeable_buffer','joker_buffer','dollar_buffer','discount_percent','inflation',
      'interest_amount','interest_cap','starting_deck_size','pool_flags','ecto_minus','blind_on_deck'}) do
      state.game[key] = copy(live[key])
    end
    -- Steamodded's blind_tag contains a cyclic Tag/Sprite UI graph, not scoring data.
    if live.round_resets then
      state.game.round_resets = {}
      for _, key in ipairs({'ante','hands','discards'}) do
        state.game.round_resets[key] = copy(live.round_resets[key])
      end
    end
    -- Shop/UI state (including Steamodded's mixed voucher table) is not scoring input.
    local round = assert(live.current_round, 'Missing current round')
    state.game.current_round = {}
    for _, key in ipairs({'hands_left','discards_left','hands_played','discards_used',
      'most_played_poker_hand','current_hand','idol_card','ancient_card','castle_card','mail_card'}) do
      state.game.current_round[key] = copy(round[key])
    end
    return state
  end
  local function build()
    local state = shell()
    local blind = assert(G.GAME.blind, 'Missing blind')
    membership()
    state.hand, state.deck, state.discard = area(G.hand, true, false, true), area(G.deck, true, true), area(G.discard, true, true)
    state.blind = {key=vanilla(blind.config and blind.config.blind), disabled=blind.disabled == true,
      only_hand=blind.only_hand or nil, hands=copy(blind.hands)}
    assert(#state.hand > 0, 'No hand to score')
    assert(type(G.hand.config.highlighted_limit) == 'number', 'Missing selection limit')
    return {status='ready',state=state,selectionLimit=math.min(5,G.hand.config.highlighted_limit)}
  end
  -- Public offers: shop cards, vouchers and opened pack cards. Unopened boosters have no known content.
  local function offers(a)
    local out = json.array()
    for i, c in ipairs(a and a.cards or {}) do
      local playing = c.ability and (c.ability.set == 'Default' or c.ability.set == 'Enhanced')
      local ok, value = pcall(card, c, playing)
      if ok and c.facing ~= 'back' then
        value.index, value.cost, value.set = i - 1, c.cost, c.ability.set
        out[#out + 1] = value
      end
    end
    return out
  end
  -- Outside a hand: the whole deck, this Ante's blinds and the rules for later ones.
  local function deckBuild()
    local state = shell()
    membership()
    -- Membership is public in the deck view; neither order nor area is exported.
    local pool = json.array()
    for _, c in ipairs(G.playing_cards) do pool[#pool + 1] = card(c, true) end
    table.sort(pool, function(a, b) return json.encode(a) < json.encode(b) end)
    state.hand, state.deck, state.discard = json.array(), pool, json.array()
    state.blind, state.random = {key='bl_small', disabled=false}, 'minimal'
    local live = G.GAME
    local resets = assert(live.round_resets, 'Missing round resets')
    -- After a Boss the blind choices already belong to the advanced Ante.
    local ante, scaling = resets.ante, live.starting_params.ante_scaling
    local blinds = {}
    for role, key in pairs(resets.blind_choices or {}) do
      local center = G.P_BLINDS[key]
      blinds[role] = {key=vanilla(center), status=resets.blind_states and resets.blind_states[role],
        target=get_blind_amount(ante) * center.mult * scaling}
    end
    -- Base amounts (before each blind's multiplier) by the original target formula.
    local amounts = json.array()
    for a = ante, math.max(ante, live.win_ante) + 1 do
      amounts[#amounts + 1] = get_blind_amount(a) * scaling
    end
    -- The Bosses get_new_boss can draw for the next Ante: its eligibility and least-used
    -- rule over the run's public Boss history. Which one it draws is random and not exported.
    -- Steamodded keeps the counts under bosses_used.boss; its optional weighted draw has no such rule.
    local nextAnte, eligible, least, bossPool = ante + 1, {}, math.huge, json.array()
    local used = type(live.bosses_used) == 'table' and type(live.bosses_used.boss) == 'table' and live.bosses_used.boss or live.bosses_used or {}
    local weighted = SMODS and SMODS.optional_features and SMODS.optional_features.object_weights
    local showdown = nextAnte % live.win_ante == 0 and nextAnte >= 2
    for key, b in pairs(G.P_BLINDS) do
      if b.boss and not b.mod and not (live.banned_keys or {})[key] and
          (b.boss.showdown and showdown or not b.boss.showdown and not showdown and b.boss.min <= math.max(1, nextAnte)) then
        eligible[key] = used[key] or 0
        least = math.min(least, eligible[key])
      end
    end
    for key, count in pairs(eligible) do
      if count == least then bossPool[#bossPool + 1] = {key=key, name=G.P_BLINDS[key].name, mult=G.P_BLINDS[key].mult} end
    end
    table.sort(bossPool, function(a, b) return a.key < b.key end)
    if weighted then bossPool = nil end
    return {state=state, round={hands=resets.hands, discards=resets.discards}, ante=ante, winAnte=live.win_ante,
      blinds=blinds, amounts=amounts, bossPool=bossPool,
      offers={shop=offers(G.shop_jokers), vouchers=offers(G.shop_vouchers), pack=offers(G.pack_cards)}}
  end
  -- Money rules the game shows in its own UI: interest, round rewards and rent.
  local function economy()
    local live = assert(G.GAME, 'Missing game')
    local modifiers, rewards, rentals = live.modifiers or {}, {}, 0
    for role, key in pairs(live.round_resets and live.round_resets.blind_choices or {}) do
      local blind = G.P_BLINDS and G.P_BLINDS[key]
      if blind and type(blind.dollars) == 'number' then
        rewards[role] = modifiers.no_blind_reward and modifiers.no_blind_reward[role] and 0 or blind.dollars
      end
    end
    for _, c in ipairs(G.jokers and G.jokers.cards or {}) do
      if c.facing ~= 'back' and c.ability.rental then rentals = rentals + 1 end
    end
    return {dollars=live.dollars, interestAmount=live.interest_amount, interestCap=live.interest_cap,
      noInterest=modifiers.no_interest == true, moneyPerHand=modifiers.money_per_hand or 1,
      moneyPerDiscard=modifiers.money_per_discard or 0, rentalRate=live.rental_rate, rentals=rentals,
      blindRewards=rewards, handsPlayed=live.hands_played, unusedDiscards=live.unused_discards, skips=live.skips}
  end
  -- On-demand input for game_analyze. Ordinary observations never call this.
  function snapshot.analysis(phase)
    local result = {phase=phase}
    if phase == 'SELECTING_HAND' then
      local ok, value = pcall(build)
      result.scoring = ok and value or {status='unavailable',message=tostring(value)}
    elseif phase == 'SHOP' or phase == 'PACK' or phase == 'BLIND_SELECT' then
      local ok, value = pcall(deckBuild)
      result.build = ok and {status='ready', input=value} or {status='unavailable', message=tostring(value)}
    end
    local ok, value = pcall(economy)
    if ok then result.economy = value end
    if pcall(json.encode, result) then return result end
    if result.build then
      result.build = {status='unavailable', message='Build snapshot cannot be serialized'}
      if pcall(json.encode, result) then return result end
    end
    return {phase=phase,build=result.build,scoring=result.scoring and {status='unavailable',message='Analysis snapshot cannot be serialized'}}
  end
  return snapshot
end
