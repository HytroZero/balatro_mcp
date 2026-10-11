import { record, type Action, type Data, type DeckObservation, type Observation } from './contract.ts';

const ranks: Record<string,string> = { Ace:'A',King:'K',Queen:'Q',Jack:'J' };
const suits: Record<string,string> = { Spades:'S',Hearts:'H',Clubs:'C',Diamonds:'D' };

/** Action indices are explicit; default decoration and hidden identity are omitted. */
function compactCard(raw: unknown): string {
  const card = record(raw), state = record(card.state), value = record(card.value);
  const index = typeof card.index === 'number' ? card.index : 0;
  const flags = [state.forced === true ? 'forced' : '',state.highlight === true ? 'highlight' : ''].filter(Boolean);
  if (state.hidden === true) return index + ': hidden' + (flags.length ? ' [' + flags.join(',') + ']' : '');
  if (state.debuff === true || state.disabled === true) flags.push('debuffed');
  const playing = typeof value.rank === 'string' && typeof value.suit === 'string';
  const parts = [playing ? (ranks[String(value.rank)] ?? String(value.rank)) + (suits[String(value.suit)] ?? String(value.suit))
    : [card.label,card.key,card.set].filter(Boolean).join(' / ')];
  if (!playing && typeof value.effect === 'string' && value.effect.trim()) parts.push(value.effect.trim().replace(/\s+/g,' '));
  const decoration: string[] = [];
  for (const [key,item] of Object.entries(record(card.modifier))) {
    if (item !== undefined && item !== null && item !== false && item !== 'c_base' && !(item === 0 && ['bonusChips','permanentChips'].includes(key))) decoration.push(key === 'enhancement' ? String(item) : key + '=' + String(item));
  }
  if (decoration.length || flags.length) parts.push('[' + [...decoration,...flags].join(',') + ']');
  const cost = record(card.cost);
  if (!playing && cost.buy !== undefined) parts.push('buy=$' + cost.buy);
  if (cost.sell !== undefined && (!playing || card.canSell === true)) parts.push('sell=$' + cost.sell);
  if (card.canSell === true) parts.push('sellable');
  const target = record(card.target);
  if (target.min !== undefined || target.max !== undefined) parts.push('targets=' + (target.min ?? '?') + '..' + (target.max ?? '?'));
  if (target.aura === true) parts.push('aura target required');
  return index + ': ' + parts.join('; ');
}

function compactArea(raw: unknown): Data | undefined {
  if (raw === undefined || raw === null) return undefined;
  const area = record(raw), cards = Array.isArray(area.cards) ? area.cards : [];
  const out: Data = { count:area.count ?? cards.length };
  if (area.limit !== undefined) out.limit = area.limit;
  if (area.highlighted_limit !== undefined) out.highlighted_limit = area.highlighted_limit;
  if (cards.length) out.cards = cards.map(compactCard);
  return out;
}

/** Format observed values directly; only the default level 1 is omitted. */
function compactHands(raw: unknown): Data {
  return Object.fromEntries(Object.entries(record(raw)).map(([name,rawHand]) => {
    const hand = record(rawHand), parts: string[] = [];
    if (hand.level !== undefined && hand.level !== 1) parts.push('Lv' + hand.level);
    for (const key of ['chips','mult','played']) if (hand[key] !== undefined) parts.push(key + '=' + hand[key]);
    return [name,parts.join('; ')];
  }));
}

export function compactState(raw: Data): Data {
  const state: Data = {};
  for (const key of ['state','round_num','ante_num','money','won','deck','stake','seed','used_vouchers','round','blind','blinds','creditLimit','currentBlind','packChoices','tags','profileOptions']) {
    if (raw[key] !== undefined) state[key] = structuredClone(raw[key]);
  }
  if (raw.hands !== undefined) state.hands = compactHands(raw.hands);
  for (const name of ['hand','jokers','consumables','shop','vouchers','packs','pack']) {
    const area = compactArea(raw[name]);
    if (area) state[name] = area;
  }
  state.remainingCards = raw.remainingCards ?? record(raw.cards).count;
  return state;
}

/** Full compact snapshot for initial observation, recovery and phase changes. */
export function compactObservation(observation: Observation): Data {
  return { contract:observation.contract,backend:observation.backend,revision:observation.revision,runId:observation.runId,
    gameVersion:observation.gameVersion,terminal:observation.terminal,ready:observation.ready,notReadyReason:observation.notReadyReason,
    actionId:observation.actionId,outcome:observation.outcome,legality:observation.legality,availableMethods:observation.availableMethods,
    ...(observation.engine ? { engine:observation.engine } : {}),state:compactState(observation.state) };
}

/** Changed fields; handsPatch merges by hand name, with null deleting an entry. */
export function compactActionObservation(after: Observation, action: Action, before?: Observation): Data {
  const full = compactObservation(after);
  const labels: Record<Action['method'],string> = { start:'Started game',play:'Played cards',discard:'Discarded cards',select:'Selected blind',skip:'Skipped blind',
    buy:'Purchased item',buy_and_use:'Purchased and used card',sell:'Sold card',reroll:'Rerolled shop',reroll_boss:'Rerolled Boss',use:'Used consumable',
    rearrange:'Rearranged cards',cash_out:'Collected cash out',next_round:'Left shop',pack:'Resolved pack choice' };
  const round = record(after.state.round), parts = [labels[action.method] + '.'];
  if (after.terminal) parts.push('Run ' + after.outcome + '.');
  else if (after.state.state === 'SELECTING_HAND') {
    if (round.chips !== undefined && record(after.state.blind).chips !== undefined) parts.push('Score: ' + round.chips + '/' + record(after.state.blind).chips + '.');
    if (round.hands_left !== undefined) parts.push('Hands left: ' + round.hands_left + '.');
    if (round.discards_left !== undefined) parts.push('Discards left: ' + round.discards_left + '.');
  } else parts.push('Phase: ' + after.state.state + '.');
  full.summary = parts.join(' ');
  if (!before || before.runId !== after.runId || before.state.state !== after.state.state || after.terminal || before.ready !== after.ready) return { ...full,partial:false };
  const state = record(full.state), previous = compactState(before.state), keys = new Set<string>(['state']);
  if (action.method === 'play' || action.method === 'discard') for (const key of ['hand','round','remainingCards']) keys.add(key);
  if (['buy','sell','reroll','buy_and_use'].includes(action.method)) for (const key of ['money','creditLimit']) keys.add(key);
  if (action.method === 'reroll') for (const key of ['round','shop','vouchers','packs']) keys.add(key);
  if (action.method === 'rearrange') for (const key of ['hand','jokers','consumables']) if (key in action) keys.add(key);
  for (const key of new Set([...Object.keys(previous),...Object.keys(state)])) if (JSON.stringify(previous[key]) !== JSON.stringify(state[key])) keys.add(key);
  const changed = Object.fromEntries([...keys].map(key => [key,state[key] ?? null]));
  if (keys.has('hands') && previous.hands !== undefined && state.hands !== undefined) {
    const oldHands = record(previous.hands), newHands = record(state.hands);
    const patch = Object.fromEntries([...new Set([...Object.keys(oldHands),...Object.keys(newHands)])]
      .filter(name => oldHands[name] !== newHands[name]).map(name => [name,newHands[name] ?? null]));
    delete changed.hands;
    if (Object.keys(patch).length) changed.handsPatch = patch;
  }
  return { revision:after.revision,baseRevision:before.revision,runId:after.runId,terminal:after.terminal,outcome:after.outcome,ready:after.ready,
    notReadyReason:after.notReadyReason,actionId:after.actionId,availableMethods:after.availableMethods,partial:true,summary:full.summary,
    state:changed };
}

/** Deck composition has no action indices, stable IDs or draw order. */
export function compactDeckObservation(observation: DeckObservation): Data {
  return { revision:observation.revision,runId:observation.runId,remainingCards:observation.remainingCards,previewCards:observation.previewCards,
    uncertainCards:observation.uncertainCards,cards:observation.cards.map(card => {
      const attrs = [card.enhancement === 'c_base' ? '' : card.enhancement,card.edition && 'edition=' + card.edition,card.seal && 'seal=' + card.seal,
        card.bonus ? 'bonus=' + card.bonus : '',card.permanentBonus ? 'permanentBonus=' + card.permanentBonus : '',card.debuff ? 'debuffed' : ''].filter(Boolean);
      const face = card.enhancement === 'm_stone' ? 'Stone' : (ranks[card.rank] ?? card.rank) + (suits[card.suit] ?? card.suit);
      return card.count + 'x ' + face + (attrs.length ? ' [' + attrs.join(',') + ']' : '');
    }) };
}
