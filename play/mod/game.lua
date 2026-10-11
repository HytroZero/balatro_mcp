-- Original-game binding layer. Rules, scoring and animation remain in Balatro.
return function(json, decision)
  assert(decision, 'Decision observation module is required')
  local game = {}
  local packs = {TAROT_PACK=true, SPECTRAL_PACK=true, PLANET_PACK=true, STANDARD_PACK=true, BUFFOON_PACK=true, SMODS_BOOSTER_OPENED=true}
  local deckKeys = {RED='b_red', BLUE='b_blue', YELLOW='b_yellow', GREEN='b_green', BLACK='b_black', MAGIC='b_magic', NEBULA='b_nebula', GHOST='b_ghost', ABANDONED='b_abandoned', CHECKERED='b_checkered', ZODIAC='b_zodiac', PAINTED='b_painted', ANAGLYPH='b_anaglyph', PLASMA='b_plasma', ERRATIC='b_erratic'}
  local stakes = {WHITE=1, RED=2, GREEN=3, BLACK=4, BLUE=5, PURPLE=6, ORANGE=7, GOLD=8}
  local ids = setmetatable({}, {__mode='k'}); local nextId = 0
  local function fail(code, message) error({code=code, message=message, applied=false}, 0) end
  game.fail = fail
  -- Recognition only: never execute this copy. Stripped LuaJIT bytecode identifies
  -- the unchanged 1.0.1o background callback even when loaders shift source lines.
  local backgroundSpin = function()
    local _dt = G.ARGS.spin.amount > G.ARGS.spin.eased and G.real_dt*2. or 0.3*G.real_dt
    local delta = G.ARGS.spin.real - G.ARGS.spin.eased
    if math.abs(delta) > _dt then delta = delta*_dt/math.abs(delta) end
    G.ARGS.spin.eased = G.ARGS.spin.eased + delta
    G.ARGS.spin.amount = _dt*(G.ARGS.spin.eased) + (1 - _dt)*G.ARGS.spin.amount
    G.TIMERS.BACKGROUND = G.TIMERS.BACKGROUND - 60*(G.ARGS.spin.eased - G.ARGS.spin.amount)*_dt
  end
  -- Recognition only: the original hover watcher never returns true if
  -- deck_info removes self.deck_preview first. Keep it running in the engine,
  -- but exclude it from readiness only while its captured preview is absent.
  local function deckPreviewWatcher(self)
    return function()
      if self.deck_preview and not (((self.deck and self.deck.cards[1] and self.deck.cards[1].states.collide.is and not self.CONTROLLER.HID.controller)) or G.CONTROLLER.held_buttons.triggerleft) then
        self.deck_preview:remove()
        self.deck_preview = nil
        local _card = G.CONTROLLER.focused.target
        local start = G.TIMERS.REAL
        self.E_MANAGER:add_event(Event({
          func = function()
            if _card and _card.area and _card.area == G.hand then
              local _x, _y = _card:put_focused_cursor()
              G.CONTROLLER:update_cursor({x=_x/(G.TILESCALE*G.TILESIZE),y=_y/(G.TILESCALE*G.TILESIZE)})
            end
            if start + 0.4 < G.TIMERS.REAL then
              return true
            end
          end
        }))
        return true
      end
    end
  end
  -- LuaJIT may change capability/patch flags without changing the instructions.
  -- Ignore only these two metadata bits; all instructions/constants still match.
  local function callbackBytecode(func)
    local ok, code = pcall(string.dump, func, true)
    -- Balatro ships LuaJIT 2.0.5 (dump version 1); the headless test runtime
    -- uses LuaJIT 2.1 (version 2). Compare within the running runtime, retaining
    -- its version byte and all instruction/constant bytes in the fingerprint.
    if not ok or code:sub(1,3) ~= '\27LJ' or (code:byte(4) ~= 1 and code:byte(4) ~= 2) then return nil end
    local flags = code:byte(5)
    if flags % 4 < 2 then return nil end -- Only stripped dumps have this layout.
    local prototype = 6
    while code:byte(prototype) and code:byte(prototype) >= 128 do prototype = prototype + 1 end
    prototype = prototype + 1 -- Skip the ULEB128 prototype length.
    local protoFlags = code:byte(prototype)
    if not protoFlags then return nil end
    if flags % 32 >= 16 then flags = flags - 16 end
    return code:sub(1,4) .. string.char(flags) .. code:sub(6,prototype-1)
      .. string.char(protoFlags % 128) .. code:sub(prototype+1)
  end
  local backgroundCode = callbackBytecode(backgroundSpin)
  local previewCode = callbackBytecode(deckPreviewWatcher(G))
  local callbackKinds = setmetatable({}, {__mode='k'})
  local function inactivePresentationEvent(event)
    if type(event) ~= 'table' or event.trigger ~= 'immediate' or event.blocking ~= false or event.blockable ~= false or type(event.func) ~= 'function' then return false end
    local kind = callbackKinds[event.func]
    if kind == nil then
      local code = callbackBytecode(event.func)
      kind = backgroundCode ~= nil and code == backgroundCode and 'background'
        or previewCode ~= nil and code == previewCode and 'preview' or false
      callbackKinds[event.func] = kind
    end
    if kind == 'background' then return true end
    if kind == 'preview' and debug and debug.getupvalue then
      -- Recheck captured state on every read, including after cache hits.
      local _, owner = debug.getupvalue(event.func, 1)
      return owner == G and owner.deck_preview == nil
    end
    return false
  end
  function game.phase()
    for name, value in pairs(G.STATES or {}) do if value == G.STATE then return packs[name] and 'PACK' or name end end
    return 'UNKNOWN'
  end
  function game.ready()
    local phase = game.phase()
    -- Starting another game uses the original wipe even from a terminal screen.
    if G.screenwipe then return false, 'Waiting for the screen transition' end
    if phase == 'GAME_OVER' or G.GAME and G.GAME.won then return true end
    if not ({MENU=true,BLIND_SELECT=true,SELECTING_HAND=true,ROUND_EVAL=true,SHOP=true,PACK=true})[phase] then return false, 'Waiting for a decision phase' end
    if G.OVERLAY_MENU then return false, 'Close the open game dialog' end
    if G.TAROT_INTERRUPT or G.CONTROLLER and G.CONTROLLER.locked then return false, 'Waiting for the game controls' end
    for _, lock in pairs(G.CONTROLLER and G.CONTROLLER.locks or {}) do if lock then return false, 'Waiting for the game controls' end end
    for _, name in ipairs({'hand','jokers','consumeables','pack_cards'}) do
      for _, card in ipairs(G[name] and G[name].cards or {}) do if card.states and card.states.drag and card.states.drag.is then return false, 'Finish dragging the card' end end
    end
    if G.GAME and (G.GAME.STOP_USE or 0) > 0 then return false, 'Waiting for the card animation' end
    if G.E_MANAGER and G.E_MANAGER.queues then
      for _, event in ipairs(G.E_MANAGER.queues.base or {}) do
        -- All other events, including nonblocking gameplay events, must settle.
        if not inactivePresentationEvent(event) then return false, 'Waiting for queued game events' end
      end
    end
    if phase ~= 'MENU' and not G.STATE_COMPLETE then return false, 'Waiting for the phase to initialize' end
    if phase == 'PACK' and (not G.pack_cards or not G.pack_cards.cards or not G.pack_cards.cards[1]) then return false, 'Waiting for booster cards' end
    return true
  end
  local function cardAt(area, index)
    if type(index) ~= 'number' or index % 1 ~= 0 or index < 0 or not area or not area.cards or not area.cards[index + 1] then fail('invalid_arguments', 'Card index is absent or out of range') end
    return area.cards[index + 1]
  end
  local function selection(indices, max, forced)
    if type(indices) ~= 'table' or getmetatable(indices) ~= json.array_mt or #indices > max then fail('invalid_arguments', 'Expected bounded unique card indices') end
    local chosen, wanted = {}, {}
    for _, index in ipairs(indices) do
      local card = cardAt(G.hand, index)
      if wanted[card] then fail('invalid_arguments', 'Duplicate target card') end
      wanted[card] = true; chosen[#chosen + 1] = card
    end
    if forced or #indices > 0 then
      for _, card in ipairs(G.hand.cards) do if card.ability.forced_selection and not wanted[card] then fail('illegal_action', 'The forced card must be included') end end
    end
    return chosen
  end
  local function withSelection(cards, fn, commit)
    if not G.hand then return fn() end
    local old = {}; for _, card in ipairs(G.hand.highlighted or {}) do old[#old + 1] = card end
    -- Use CardArea methods; do not mutate forced-selection rules or card abilities.
    for i = #(G.hand.highlighted or {}), 1, -1 do G.hand:remove_from_highlighted(G.hand.highlighted[i]) end
    for _, card in ipairs(cards) do if not card.highlighted then G.hand:add_to_highlighted(card, true) end end
    local ok, result = pcall(fn)
    if not ok or not commit then
      for i = #G.hand.highlighted, 1, -1 do G.hand:remove_from_highlighted(G.hand.highlighted[i]) end
      for _, card in ipairs(old) do if not card.highlighted then G.hand:add_to_highlighted(card, true) end end
    end
    if not ok then error(result, 0) end
    return result
  end
  local function element(card, id)
    return {config={ref_table=card,id=id}, children={{children={{config={}}}}}, UIBox={states={visible=true},alignment={offset={}}}}
  end
  local function findButton(handler)
    local visited = {}
    local function visit(node)
      if type(node) ~= 'table' or visited[node] then return end
      visited[node] = true
      if node.config and node.config.button == handler then return node end
      for _, child in pairs(node.children or {}) do local result = visit(child); if result then return result end end
    end
    for _, box in pairs(G.I and G.I.UIBOX or {}) do local button = visit(box.UIRoot); if button then return button end end
  end
  local function afford(card)
    return (card.cost or 0) <= 0 or (card.cost or 0) <= (G.GAME.dollars or 0) - (G.GAME.bankrupt_at or 0)
  end
  local function capacity(card)
    local area = card.ability.set == 'Joker' and G.jokers or card.ability.consumeable and G.consumeables
    return not area or #area.cards < area.config.card_limit + (card.edition and card.edition.negative and 1 or 0)
  end
  local function params(action, allowed)
    for key in pairs(action) do if key ~= 'method' and not allowed[key] then fail('invalid_arguments', 'Unexpected action field: ' .. tostring(key)) end end
  end
  local function targetCards(card, indices)
    if (card.ability.consumeable and card.ability.consumeable.max_highlighted or card.ability.name == 'Aura') and (not indices or #indices == 0) then fail('invalid_arguments', 'Explicit hand targets are required') end
    return selection(indices or json.array(), G.hand and G.hand.config.highlighted_limit or 5, false)
  end
  function game.prepare(action)
    if type(action) ~= 'table' or getmetatable(action) == json.array_mt or type(action.method) ~= 'string' then fail('invalid_arguments', 'Expected action object') end
    local method, phase = action.method, game.phase()
    if not game.ready() or method ~= 'start' and (phase == 'GAME_OVER' or G.GAME and G.GAME.won) then fail('illegal_action', 'Game is terminal, animating, or awaiting a manual dialog') end
    local function need(value) if not value then fail('illegal_action', 'Action is unavailable in this state') end end
    if method == 'start' then
      params(action, {deck=true,stake=true,seed=true}); need(phase == 'MENU' or phase == 'GAME_OVER' or G.GAME and G.GAME.won)
      need(not G.screenwipe)
      local center = G.P_CENTERS[deckKeys[action.deck] or '']; local stake = stakes[action.stake]
      if not center or not stake or action.seed ~= nil and (type(action.seed) ~= 'string' or #action.seed < 1 or #action.seed > 64) then fail('invalid_arguments', 'Invalid deck, stake or seed') end
      need(center.unlocked == true)
      -- Preserve profile locks; the API never unlocks cards, decks or stakes.
      local unlockedStake = get_deck_win_stake and get_deck_win_stake(center.key) or 0
      if stake > unlockedStake + 1 then fail('illegal_action', 'Requested stake is locked for this deck') end
      return function()
        G.FUNCS.setup_run({config={id=phase == 'GAME_OVER' and 'from_game_over' or G.GAME.won and 'from_game_won' or nil}}); G.FUNCS.exit_overlay_menu()
        G.GAME.viewed_back:change_to(center); G.GAME.selected_back:change_to(center)
        G.FUNCS.start_run(nil, {stake=stake,seed=action.seed})
      end
    elseif method == 'play' or method == 'discard' then
      params(action, {cards=true}); need(phase == 'SELECTING_HAND')
      local cards = selection(action.cards, math.min(5, G.hand.config.highlighted_limit or 5), true); need(#cards > 0)
      if method == 'discard' then need(G.GAME.current_round.discards_left > 0) end
      local handler = method == 'play' and 'play_cards_from_highlighted' or 'discard_cards_from_highlighted'
      local check = method == 'play' and 'can_play' or 'can_discard'
      withSelection(cards, function() local e = element(nil); G.FUNCS[check](e); need(e.config.button == handler) end, false)
      return function() withSelection(cards, function() G.FUNCS[handler](element(nil)) end, true) end
    elseif method == 'select' or method == 'skip' or method == 'cash_out' then
      params(action, {}); need(method == 'cash_out' and phase == 'ROUND_EVAL' or method ~= 'cash_out' and phase == 'BLIND_SELECT')
      if method == 'skip' then need(G.GAME.blind_on_deck ~= 'Boss') end
      local handler = method == 'select' and 'select_blind' or method == 'skip' and 'skip_blind' or 'cash_out'
      local button = findButton(handler); need(button ~= nil)
      return function() G.FUNCS[handler](button) end
    elseif method == 'reroll' or method == 'reroll_boss' or method == 'next_round' then
      params(action, {})
      need(method == 'reroll_boss' and phase == 'BLIND_SELECT' or method ~= 'reroll_boss' and phase == 'SHOP')
      if method == 'reroll' then
        local e = element(nil); G.FUNCS.can_reroll(e); need(e.config.button == 'reroll_shop')
        return function() G.FUNCS.reroll_shop(nil) end
      elseif method == 'reroll_boss' then
        local e = element(nil); G.FUNCS.reroll_boss_button(e); need(e.config.button == 'reroll_boss')
        return function() G.FUNCS.reroll_boss(e) end
      end
      need(G.shop ~= nil); return function() G.FUNCS.toggle_shop(nil) end
    elseif method == 'buy' or method == 'buy_and_use' then
      params(action, method == 'buy' and {card=true,voucher=true,pack=true} or {card=true,cards=true}); need(phase == 'SHOP')
      local count = (action.card ~= nil and 1 or 0) + (action.voucher ~= nil and 1 or 0) + (action.pack ~= nil and 1 or 0)
      if count ~= 1 then fail('invalid_arguments', 'Specify one purchase index') end
      local area = action.card ~= nil and G.shop_jokers or action.voucher ~= nil and G.shop_vouchers or G.shop_booster
      local card = cardAt(area, action.card or action.voucher or action.pack); need(afford(card))
      if method == 'buy_and_use' then
        need(card.ability.consumeable ~= nil)
        local cards = targetCards(card, action.cards)
        withSelection(cards, function() need(card:can_use_consumeable()); need(not card:check_use()) end, false)
        return function() withSelection(cards, function() G.FUNCS.buy_from_shop(element(card, 'buy_and_use')) end, true) end
      end
      need(capacity(card))
      if action.card ~= nil then return function() G.FUNCS.buy_from_shop(element(card)) end end
      need(not card:check_use()); return function() G.FUNCS.use_card(element(card)) end
    elseif method == 'use' or method == 'sell' then
      params(action, method == 'use' and {consumable=true,cards=true} or {joker=true,consumable=true})
      need(phase == 'SELECTING_HAND' or phase == 'SHOP' or phase == 'BLIND_SELECT' or phase == 'ROUND_EVAL' or phase == 'PACK')
      if method == 'sell' then
        if (action.joker ~= nil) == (action.consumable ~= nil) then fail('invalid_arguments', 'Specify one sell index') end
        local card = cardAt(action.joker ~= nil and G.jokers or G.consumeables, action.joker or action.consumable)
        need(card:can_sell_card()); return function() G.FUNCS.sell_card(element(card)) end
      end
      local card = cardAt(G.consumeables, action.consumable)
      local cards = targetCards(card, action.cards)
      withSelection(cards, function() need(card:can_use_consumeable()); need(not card:check_use()) end, false)
      return function() withSelection(cards, function() G.FUNCS.use_card(element(card)) end, true) end
    elseif method == 'pack' then
      params(action, {card=true,targets=true,skip=true}); need(phase == 'PACK')
      if action.skip == true then
        if action.card ~= nil or action.targets ~= nil then fail('invalid_arguments', 'Skip cannot include targets') end
        local e = element(nil); G.FUNCS.can_skip_booster(e); need(e.config.button == 'skip_booster')
        return function() G.FUNCS.skip_booster(e) end
      end
      if action.skip ~= nil then fail('invalid_arguments', 'Invalid skip flag') end
      local card = cardAt(G.pack_cards, action.card)
      local cards = card.ability.consumeable and targetCards(card, action.targets) or selection(action.targets or json.array(), 5, false)
      if card.ability.consumeable then
        withSelection(cards, function() need(card:can_use_consumeable()); need(not card:check_use()) end, false)
      else need(#cards == 0); need(capacity(card)) end
      return function() withSelection(cards, function() G.FUNCS.use_card(element(card)) end, true) end
    elseif method == 'rearrange' then
      params(action, {hand=true,jokers=true,consumables=true}); need(phase ~= 'MENU')
      local count = (action.hand and 1 or 0) + (action.jokers and 1 or 0) + (action.consumables and 1 or 0)
      if count ~= 1 then fail('invalid_arguments', 'Specify one area to reorder') end
      local area = action.hand and G.hand or action.jokers and G.jokers or G.consumeables
      local indices = action.hand or action.jokers or action.consumables
      need(not action.hand or phase == 'SELECTING_HAND' or phase == 'PACK')
      if not area or not area.cards or getmetatable(indices) ~= json.array_mt or #indices ~= #area.cards then fail('invalid_arguments', 'Expected full permutation') end
      local cards, seen = {}, {}
      for _, index in ipairs(indices) do local card = cardAt(area, index); if seen[card] then fail('invalid_arguments', 'Duplicate permutation entry') end; seen[card] = true; cards[#cards + 1] = card end
      for i, card in ipairs(area.cards) do if card.pinned and cards[i] ~= card then fail('illegal_action', 'Pinned card cannot change position') end end
      return function()
        -- Dragging rearranges the per-area card sequence. Shared prototypes stay untouched.
        for i, card in ipairs(cards) do area.cards[i] = card; card.T.x = area.T.x + i * 0.0001 end
        area:align_cards()
      end
    end
    fail('invalid_arguments', 'Unknown game action')
  end
  local function visibleCard(card, index)
    if not ids[card] then nextId = nextId + 1; ids[card] = tostring(nextId) end
    local state = {hidden=card.facing == 'back',highlight=card.highlighted == true,forced=card.ability and card.ability.forced_selection == true,debuff=card.debuff == true}
    if state.hidden then return {index=index,id=ids[card],state=state} end
    local base, ability, center = card.base or {}, card.ability or {}, card.config and card.config.center or {}
    local effect = ''
    -- Read localized UI text and dispose only the temporary objects created for it.
    if card.generate_UIBox_ability_table then
      local ok, ui = pcall(card.generate_UIBox_ability_table, card)
      if ok and type(ui) == 'table' then
        local texts, visited, objects = {}, {}, {}
        local function walk(node)
          if type(node) ~= 'table' or visited[node] then return end; visited[node] = true
          if type(node.config) == 'table' then
            if type(node.config.text) == 'string' then texts[#texts + 1] = node.config.text end
            if node.config.object then objects[node.config.object] = true end
          end
          local keys={}; for key in pairs(node) do if key~='config' then keys[#keys+1]=key end end
          table.sort(keys,function(a,b)
            if type(a)=='number' and type(b)=='number' then return a<b end
            return type(a)..tostring(a)<type(b)..tostring(b)
          end)
          for _,key in ipairs(keys) do walk(node[key]) end
        end
        walk(ui); effect = table.concat(texts, ' ')
        for object in pairs(objects) do if type(object.remove) == 'function' then pcall(object.remove, object) end end
      end
    end
    local modifier = {seal=card.seal,edition=card.edition and card.edition.type,enhancement=center.key,eternal=ability.eternal,perishable=ability.perish_tally,rental=ability.rental,
      bonusChips=ability.bonus,permanentChips=ability.perma_bonus}
    return {index=index,id=ids[card],key=center.key,label=ability.name,set=ability.set,value={rank=base.value,suit=base.suit,effect=effect},modifier=modifier,state=state,
      cost={buy=card.cost,sell=card.sell_cost},canSell=card.can_sell_card and card:can_sell_card() or false,
      target={min=ability.consumeable and ability.consumeable.min_highlighted,max=ability.consumeable and ability.consumeable.max_highlighted,aura=ability.name == 'Aura'}}
  end
  local function areaData(area)
    if not area or area.REMOVED then return end
    local cards = json.array(); for index, card in ipairs(area.cards or {}) do cards[#cards + 1] = visibleCard(card, index - 1) end
    return {cards=cards,count=#cards,limit=area.config.card_limit,highlighted_limit=area.config.highlighted_limit}
  end
  -- Same membership as the original unplayed deck preview. Never expose order,
  -- bridge card IDs or which preview entry belongs to a wheel-flipped held card.
  function game.cards()
    local groups, entries, uncertain, total = {}, json.array(), 0, 0
    if game.phase() == 'MENU' then return {remainingCards=0,previewCards=0,uncertainCards=0,cards=entries} end
    for _, card in ipairs(G.playing_cards or {}) do
      local ability, base = card.ability or {}, card.base or {}
      if card.area == G.deck or ability.wheel_flipped then
        total = total + 1
        if ability.wheel_flipped then uncertain = uncertain + 1 end
        local center = card.config and card.config.center or {}
        local stone = center.key == 'm_stone'
        local entry = {rank=stone and '' or tostring(base.value or ''),suit=stone and '' or tostring(base.suit or ''),enhancement=center.key or 'c_base',
          edition=card.edition and card.edition.type,seal=card.seal,bonus=ability.bonus or 0,permanentBonus=ability.perma_bonus or 0,debuff=card.debuff == true}
        local key = json.encode(entry)
        if groups[key] then groups[key].count = groups[key].count + 1
        else entry.count = 1; groups[key] = entry; entries[#entries+1] = entry end
      end
    end
    table.sort(entries,function(a,b) return json.encode(a) < json.encode(b) end)
    return {remainingCards=G.deck and G.deck.cards and #G.deck.cards or 0,previewCards=total,uncertainCards=uncertain,cards=entries}
  end
  function game.state()
    local run = G.GAME or {}; local phase = game.phase()
    local selected = run.selected_back and run.selected_back.effect and run.selected_back.effect.center or {}
    local deck, stake
    for name, key in pairs(deckKeys) do if selected.key == key then deck = name end end
    for name, level in pairs(stakes) do if run.stake == level then stake = name end end
    local round = run.current_round or {}
    local activeKey = run.blind and run.blind.config and run.blind.config.blind and run.blind.config.blind.key
    local state = {state=phase,deck=deck,stake=stake,seed=run.pseudorandom and run.pseudorandom.seed,won=run.won == true,money=run.dollars,
      creditLimit=-(run.bankrupt_at or 0),round_num=run.round,ante_num=run.round_resets and run.round_resets.ante,
      remainingCards=G.deck and G.deck.cards and #G.deck.cards,packChoices=run.pack_choices,
      round={hands_left=round.hands_left,discards_left=round.discards_left,reroll_cost=round.reroll_cost,chips=run.chips},
      currentBlind=run.blind_on_deck,blind=run.blind and {name=run.blind.name,chips=run.blind.chips,disabled=run.blind.disabled,blockPlay=run.blind.block_play},
      hand=areaData(G.hand),jokers=areaData(G.jokers),consumables=areaData(G.consumeables)}
    for key, value in pairs(decision.round(run)) do state.round[key] = value end
    if activeKey and state.blind then
      local details = decision.blind(activeKey,run.blind.config.blind,run.blind)
      for key, value in pairs(details) do if key ~= 'name' then state.blind[key] = value end end
    end
    state.tags = decision.tags(run)
    if phase == 'MENU' or phase == 'GAME_OVER' or run.won then state.profileOptions = decision.profile(deckKeys,stakes) end
    if phase == 'SHOP' then state.shop=areaData(G.shop_jokers); state.vouchers=areaData(G.shop_vouchers); state.packs=areaData(G.shop_booster) end
    if phase == 'PACK' then state.pack=areaData(G.pack_cards) end
    local hands = {}; for name, hand in pairs(run.hands or {}) do if hand.visible then hands[name]={level=hand.level,chips=hand.chips,mult=hand.mult,played=hand.played} end end
    state.hands = hands
    local vouchers = {}; for key, value in pairs(run.used_vouchers or {}) do if value then vouchers[key]=true end end; state.used_vouchers = vouchers
    local blinds = {}
    for name, key in pairs(run.round_resets and run.round_resets.blind_choices or {}) do
      local blind = G.P_BLINDS and G.P_BLINDS[key] or {}
      local active = activeKey == key and run.blind or nil
      local details = decision.blind(key,blind,active)
      details.status = run.round_resets.blind_states[name]; details.mult = blind.mult
      local tagKey = run.round_resets.blind_tags and run.round_resets.blind_tags[name]
      if name ~= 'Boss' and tagKey then details.skipReward = decision.tag(tagKey,nil,name) end
      blinds[name] = details
    end
    state.blinds = blinds
    return state
  end
  function game.methods()
    local result = json.array(); local phase = game.phase()
    if not game.ready() then return result end
    if G.GAME and G.GAME.won or phase == 'GAME_OVER' then result[1]='start'; return result end
    local phaseMethods = {MENU={'start'},BLIND_SELECT={'select','skip','reroll_boss','use','sell','rearrange'},SELECTING_HAND={'play','discard','use','sell','rearrange'},ROUND_EVAL={'cash_out','use','sell','rearrange'},SHOP={'buy','buy_and_use','reroll','next_round','use','sell','rearrange'},PACK={'pack','use','sell','rearrange'}}
    for _, method in ipairs(phaseMethods[phase] or {}) do
      if method ~= 'skip' or G.GAME.blind_on_deck ~= 'Boss' then
        if method ~= 'discard' or G.GAME.current_round.discards_left > 0 then result[#result + 1]=method end
      end
    end
    return result
  end
  return game
end
