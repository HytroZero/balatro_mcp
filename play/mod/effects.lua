-- Record actual status prompts during one play; never evaluate an effect.
return function()
  local effects, active = {}, nil
  local ranks = {Ace='A',King='K',Queen='Q',Jack='J'}
  local suits = {Spades='S',Hearts='H',Clubs='C',Diamonds='D'}
  local function text(value)
    return type(value) == 'string' and value:gsub('%s+', ' '):match('^%s*(.-)%s*$') or ''
  end
  local function name(card)
    if not card or card.state and card.state.hidden then return '?' end
    local value, modifier = card.value or {}, card.modifier or {}
    if modifier.enhancement == 'm_stone' then return 'Stone' end
    if value.rank and value.suit then return (ranks[value.rank] or value.rank) .. (suits[value.suit] or value.suit) end
    local label = text(card.label)
    return label ~= '' and label or '?'
  end
  function effects.begin(state)
    active = {cards={},lines={},new=0}
    for _, area in ipairs({'hand','jokers','consumables'}) do
      local live = area == 'consumables' and G.consumeables or G[area]
      local visible = state[area] and state[area].cards or {}
      for i, card in ipairs(live and live.cards or {}) do
        active.cards[card] = area .. '[' .. (i - 1) .. '](' .. name(visible[i]) .. ')'
      end
    end
  end
  function effects.finish()
    local result = active and table.concat(active.lines, '; ') or ''
    active = nil
    return result
  end
  local function record(card, kind, amount, extra)
    extra = type(extra) == 'table' and extra or {}
    card = extra.focus or card
    if not card then return end
    local message
    if kind == 'extra' or kind == 'jokers' then message = text(extra.message)
    elseif kind == 'debuff' then message = 'Debuffed'
    elseif kind == 'swap' then message = 'Swapped'
    elseif type(amount) == 'number' and amount ~= 0 then
      if kind == 'chips' then message = (amount > 0 and '+' or '') .. amount .. ' Chips'
      elseif kind == 'mult' or kind == 'h_mult' then message = (amount > 0 and '+' or '') .. amount .. ' Mult'
      elseif kind == 'x_mult' or kind == 'h_x_mult' then message = 'X' .. amount .. ' Mult'
      elseif kind == 'x_chips' then message = 'X' .. amount .. ' Chips'
      elseif kind == 'dollars' then message = (amount < 0 and '-' or '+') .. '$' .. math.abs(amount) end
    end
    if not message or message == '' then return end
    if not active.cards[card] then
      -- Cards created during the play have no pre-action index or known face.
      active.cards[card] = 'card[new' .. active.new .. '](?)'
      active.new = active.new + 1
    end
    active.lines[#active.lines + 1] = active.cards[card] .. ': ' .. message
  end
  local original = assert(card_eval_status_text, 'Missing original status prompt function')
  card_eval_status_text = function(card, kind, amount, percent, dir, extra, ...)
    -- A diagnostic must not prevent the game's own prompt or change its returns.
    if active then pcall(record, card, kind, amount, extra) end
    return original(card, kind, amount, percent, dir, extra, ...)
  end
  return effects
end
