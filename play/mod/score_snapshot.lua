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
  local function build(hiddenHand)
    -- Check before inspecting any identity or ability of a hidden card.
    for _, a in ipairs(hiddenHand and {G.jokers, G.consumeables} or {G.hand, G.jokers, G.consumeables}) do
      for _, c in ipairs(a.cards) do assert(c.facing ~= 'back', 'Face-down cards cannot be scored') end
    end
    local live = assert(G.GAME, 'Missing game')
    local blind = assert(live.blind, 'Missing blind')
    local back = assert(live.selected_back and live.selected_back.effect, 'Missing deck back')
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
    local state = {hand=area(G.hand, true, false, hiddenHand), jokers=area(G.jokers), consumables=area(G.consumeables),
      deck=area(G.deck, true, true), discard=area(G.discard, true, true),
      back=vanilla(back.center), backConfig=copy(back.config),
      blind={key=vanilla(blind.config and blind.config.blind), disabled=blind.disabled == true,
        only_hand=blind.only_hand, hands=copy(blind.hands)},
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
    assert(#state.hand > 0, 'No hand to score')
    assert(type(G.hand.config.highlighted_limit) == 'number', 'Missing selection limit')
    return {status='ready',state=state,selectionLimit=math.min(5,G.hand.config.highlighted_limit)}
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
      local ok, value = pcall(build, true)
      result.scoring = ok and value or {status='unavailable',message=tostring(value)}
    end
    local ok, value = pcall(economy)
    if ok then result.economy = value end
    if pcall(json.encode, result) then return result end
    return {phase=phase,scoring={status='unavailable',message='Analysis snapshot cannot be serialized'}}
  end
  function snapshot.read()
    local ok, result = pcall(build)
    if ok then
      -- Keep unsupported values from making the ordinary observation unreadable.
      local encoded = pcall(json.encode, result)
      if encoded then return result end
      return {status='unavailable',message='Scoring snapshot cannot be serialized'}
    end
    return {status='unavailable',message=tostring(result)}
  end
  return snapshot
end
