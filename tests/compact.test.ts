import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Check } from 'typebox/value';
import { applyDelta, compactActionObservation, compactDeckObservation, compactObservation, FullObservationSchema, PartialObservationSchema, type ActionObservation } from '../env/compact.ts';
import { playerState, record, type Action, type Data, type Observation } from '../env/contract.ts';
const card = (over: Data = {}): Data => ({ index: 0, id: 'private-card-id', key: 'c_base', label: 'Default Base', set: 'Default',
    value: { rank: 'Ace', suit: 'Hearts', effect: 'not needed for a playing card' }, modifier: { enhancement: 'c_base' },
    state: { hidden: false }, cost: { buy: 1, sell: 1 }, canSell: false, ...over });
const joker = (id: string, label: string, effect: string, over: Data = {}): Data => card({ id, key: 'j_' + id, label, set: 'Joker', value: { effect, rulesKnown: true },
    modifier: {}, cost: { buy: 5, sell: 2 }, canSell: true, ...over });
const observation = (raw: Data = {}): Observation => ({ contract: 1, backend: 'balatro_mcp_mod', revision: 'i:7', runId: 'run1', gameVersion: '1.0.1o',
    ready: true, terminal: false, outcome: 'ongoing', legality: 'backend-authoritative', availableMethods: ['play', 'discard', 'use', 'sell', 'rearrange'],
    state: playerState({ state: 'SELECTING_HAND', deck: 'RED', stake: 'WHITE', seed: 'TEST', ante_num: 1, round_num: 1, money: 4, creditLimit: 0,
        remainingCards: 44, totalCards: 52, routeAnte: 1, currentBlind: 'Small', round: { chips: 0, hands_left: 4, discards_left: 3, handHistoryKnown: true, handTypeCounts: {} },
        blind: { key: 'bl_small', name: 'Small Blind', chips: 300, rules: [], rulesKnown: true },
        blinds: { Boss: { key: 'bl_head', name: 'The Head', status: 'Upcoming', rules: ['Hearts are', 'debuffed'], rulesKnown: true, target: 600 },
            Small: { key: 'bl_small', name: 'Small Blind', status: 'Current', rules: [], rulesKnown: true, target: 300 },
            Big: { key: 'bl_big', name: 'Big Blind', status: 'Upcoming', rules: [], rulesKnown: true, target: 450,
                skipReward: { key: 'tag_juggle', name: 'Juggle Tag', rules: ['+3 hand size', 'next round'], rulesKnown: true } } },
        hand: { limit: 8, highlighted_limit: 5, cards: [card()] }, jokers: { limit: 5, cards: [] }, consumables: { limit: 2, cards: [] }, ...raw }) });
const at = (o: Observation, revision: string, raw: Data = {}, extra: Partial<Observation> = {}): Observation =>
    ({ ...o, ...extra, revision, state: { ...o.state, ...playerState(raw) } });
const runKeys = ['setup', 'ante', 'roundNo', 'money', 'handSize', 'jokerSlots', 'consumableSlots', 'hands', 'jokers', 'consumables', 'vouchers', 'tags', 'blind', 'blinds'];
test('full v3 snapshot is flat, typed, uses short revisions and does not mutate the backend observation', () => {
    const input = observation(), before = structuredClone(input), full = compactObservation(input);
    assert.ok(Check(FullObservationSchema, full));
    assert.equal(full.v, 3);
    assert.equal(full.full, true);
    assert.equal(full.rev, '7');
    assert.equal(full.phase, 'SELECTING_HAND');
    assert.deepEqual(full.actions, ['play 1-5', 'discard 1-5']);
    assert.deepEqual(Object.keys(full.state).sort(), [...runKeys, 'round', 'deck', 'hand'].sort());
    assert.equal(full.state.setup, 'RED deck, WHITE stake, seed TEST');
    assert.equal(full.state.deck, '44/52');
    assert.deepEqual(full.state.hand, ['0: AH']);
    assert.deepEqual(full.state.round, { score: 0, target: 300, hands: 4, discards: 3 });
    assert.deepEqual(full.state.blinds, { Small: '300', Big: '450; skip: Juggle Tag (+3 hand size next round)', Boss: 'The Head 600: Hearts are debuffed' });
    assert.equal(full.state.blind, 'Small');
    for (const absent of ['notReady', 'outcome', 'result', 'contract', 'partial', 'runId', 'source', 'availableMethods'])
        assert.equal(absent in full, false, absent);
    assert.doesNotMatch(JSON.stringify(full), /private-card-id|controls|rulesKnown|null/);
    assert.deepEqual(input, before);
});
test('each phase carries only its views, including over engine leftovers', () => {
    const views: Record<string, string[]> = { BLIND_SELECT: [], SELECTING_HAND: ['round', 'deck', 'hand'], ROUND_EVAL: ['cashOut'], SHOP: ['shop'],
        PACK: ['shop', 'pack', 'deck', 'hand'], GAME_OVER: ['runResult'] };
    for (const [phase, keys] of Object.entries(views)) {
        const full = compactObservation({ ...observation({ state: phase, packChoices: 2, shop: { cards: [card()] }, pack: { cards: [card()] }, completedRound: { ante: 1, target: 300 } }),
            terminal: phase === 'GAME_OVER', outcome: phase === 'GAME_OVER' ? 'lost' : 'ongoing' });
        assert.ok(Check(FullObservationSchema, full), phase);
        assert.equal(full.phase, phase);
        assert.deepEqual(Object.keys(full.state).sort(), [...runKeys, ...keys].sort(), phase);
    }
    const menu = compactObservation({ ...observation({ state: 'MENU', profileOptions: { decks: [{ deck: 'RED', unlocked: true, stakes: ['WHITE', 'RED'], stakesKnown: true },
        { deck: 'ZODIAC', unlocked: false }] } }), availableMethods: ['start'] });
    assert.deepEqual(menu.state, { profiles: { RED: 'WHITE RED', ZODIAC: 'locked' } });
    assert.deepEqual(menu.actions, ['start']);
});
const actions: Action[] = [{ method: 'start', deck: 'RED', stake: 'WHITE' }, { method: 'select' }, { method: 'skip' }, { method: 'play', cards: [0] },
    { method: 'discard', cards: [0] }, { method: 'cash_out' }, { method: 'next_round' }, { method: 'reroll' }, { method: 'reroll_boss' },
    { method: 'buy', card: 0 }, { method: 'buy', voucher: 0 }, { method: 'buy', pack: 0 }, { method: 'buy_and_use', card: 0 },
    { method: 'use', consumable: 0 }, { method: 'sell', joker: 0 }, { method: 'sell', consumable: 0 }, { method: 'pack', card: 0 }, { method: 'pack', skip: true },
    { method: 'rearrange', hand: [0] }, { method: 'rearrange', jokers: [0] }, { method: 'rearrange', consumables: [0] }];
function checkDelta(before: Observation, after: Observation, action: Action): ActionObservation {
    const delta = compactActionObservation(after, action, before), full = compactObservation(after);
    assert.ok(Check(PartialObservationSchema, delta), JSON.stringify(delta));
    assert.equal('full' in delta, false);
    assert.ok(delta.result);
    assert.deepEqual(applyDelta(compactObservation(before), delta).state, full.state);
    for (const key of ['rev', 'phase', 'actions'] as const) assert.deepEqual(delta[key], full[key], key);
    return delta;
}
test('all action variants reconstruct the full projection; start alone forces full state', () => {
    for (const action of actions) {
        const after = at(observation(), 'i:8', { money: 9 }), result = compactActionObservation(after, action, observation());
        if (action.method === 'start') { assert.ok(Check(FullObservationSchema, result)); assert.equal('full' in result, true); assert.ok(result.result); continue; }
        assert.deepEqual(checkDelta(observation(), after, action).state, { money: 9 });
    }
    const unchanged = compactActionObservation(at(observation(), 'i:8'), { method: 'rearrange', hand: [0] }, observation());
    assert.deepEqual(unchanged, { rev: '8', phase: 'SELECTING_HAND', actions: ['play 1-5', 'discard 1-5'], result: 'Reordered the hand.' });
});
test('hand values are compact, ordered by hand rank and merge by name', () => {
    const full = compactObservation(observation({ hands: { Pair: { level: 4, chips: 71.5, mult: 9, played: 6 }, Flush: { level: 1, chips: 35, mult: 4, played: 0 }, 'High Card': { level: 0, chips: 0, mult: 1, played: 2 } } }));
    assert.deepEqual(Object.entries(full.state.hands!), [['High Card', '0x1 Lv0 played 2'], ['Pair', '71.5x9 Lv4 played 6'], ['Flush', '35x4']]);
    const before = observation({ hands: { Pair: { level: 1, chips: 10, mult: 2, played: 0 }, Flush: { level: 1, chips: 35, mult: 4, played: 0 } } });
    const after = at(before, 'i:8', { hands: { Pair: { level: 1, chips: 10, mult: 2, played: 1 }, Flush: { level: 1, chips: 35, mult: 4, played: 0 }, 'Five of a Kind': { level: 2, chips: 155, mult: 15, played: 0 } } });
    assert.deepEqual(checkDelta(before, after, { method: 'use', consumable: 0 }).state?.hands, { Pair: '10x2 played 1', 'Five of a Kind': '155x15 Lv2' });
    const removed = at(before, 'i:9', { hands: { Pair: { level: 1, chips: 10, mult: 2, played: 0 } } });
    assert.deepEqual(checkDelta(before, removed, { method: 'use', consumable: 0 }).state?.hands, { Flush: null });
});
test('discard sends round members, deck and hand; triggered side effects are included', () => {
    const before = observation();
    const after = at(before, 'i:8', { round: { chips: 0, hands_left: 4, discards_left: 2, handHistoryKnown: true, handTypeCounts: {} }, remainingCards: 43,
        hand: { limit: 8, highlighted_limit: 5, cards: [card({ id: 'next', value: { rank: 'King', suit: 'Spades' } })] } });
    const delta = checkDelta(before, after, { method: 'discard', cards: [0] });
    assert.deepEqual(delta.state, { round: { discards: 2 }, deck: '43/52', hand: ['0: KS'] });
    assert.equal(delta.result, 'Discarded 1 card.');
    const triggered = at(after, 'i:9', { money: 7, tags: [{ key: 'tag_double', name: 'Double Tag', rules: ['Gives a copy'], rulesKnown: true }],
        jokers: { limit: 6, cards: [joker('castle', 'Castle', '+9 Chips')] }, consumables: { limit: 2, cards: [card({ id: 'sun', set: 'Tarot', key: 'c_sun', label: 'The Sun', value: { effect: 'Converts cards' } })] },
        blind: { key: 'bl_small', name: 'Small Blind', chips: 300, rules: [], rulesKnown: true, ruleState: { active: false } } });
    const side = checkDelta(before, triggered, { method: 'discard', cards: [0] });
    assert.deepEqual(Object.keys(side.state!).sort(), ['blinds', 'consumables', 'deck', 'hand', 'jokerSlots', 'jokers', 'money', 'round', 'tags'].sort());
    assert.deepEqual(side.state?.blinds, { Small: '300 [disabled]' });
    assert.deepEqual(side.state?.consumables, ['0: The Sun [Tarot, sell $1]: Converts cards']);
});
test('ordered areas patch single elements only while membership and order are unchanged', () => {
    const jokers = (popcorn: string, order = ['smiley', 'popcorn']) => ({ limit: 5, cards: order.map(id => id === 'smiley'
        ? joker('smiley', 'Smiley Face', 'Played face cards give +5 Mult', { modifier: { eternal: true } }) : joker('popcorn', 'Popcorn', popcorn)) });
    const before = observation({ jokers: jokers('+16 Mult') });
    const decayed = checkDelta(before, at(before, 'i:8', { jokers: jokers('+12 Mult') }), { method: 'play', cards: [0] });
    assert.deepEqual(decayed.state?.jokers, { 1: '1: Popcorn [sell $2]: +12 Mult' });
    const swapped = checkDelta(before, at(before, 'i:8', { jokers: jokers('+16 Mult', ['popcorn', 'smiley']) }), { method: 'rearrange', jokers: [1, 0] });
    assert.deepEqual(swapped.state?.jokers, ['0: Popcorn [sell $2]: +16 Mult', '1: Smiley Face [eternal]: Played face cards give +5 Mult']);
    const sold = checkDelta(before, at(before, 'i:8', { jokers: jokers('+16 Mult', ['smiley']), money: 6 }), { method: 'sell', joker: 1 });
    assert.deepEqual(sold.state?.jokers, ['0: Smiley Face [eternal]: Played face cards give +5 Mult']);
    assert.equal(sold.result, 'Sold Popcorn.');
});
test('round end, cash-out, next blind and selection drop and add phase views', () => {
    const playing = observation({ hands: { Pair: { level: 1, chips: 10, mult: 2, played: 0 } } });
    const evaluated = at(playing, 'i:8', { state: 'ROUND_EVAL', ante_num: 2, round: { chips: 1950, hands_left: 3, discards_left: 2 }, hands: { Pair: { level: 1, chips: 10, mult: 2, played: 1 } },
        completedRound: { ante: 1, target: 300, blindName: 'Small Blind', defeated: true }, cashOut: { amount: 4, known: true, lines: [] }, hand: { limit: 8, cards: [] },
        blinds: { ...record(playing.state.blinds), Small: { name: 'Small Blind', status: 'Defeated', rules: [], rulesKnown: true, target: 300 } } }, { availableMethods: ['cash_out', 'use'] });
    const end = checkDelta(playing, evaluated, { method: 'play', cards: [0] });
    assert.deepEqual(end.state, { hands: { Pair: '10x2 played 1' }, blinds: { Small: '300 [defeated]' }, cashOut: { blind: 'Small Blind', score: 1950, target: 300, payout: 4 } });
    assert.equal(end.result, 'Played Pair (+1950). Blind defeated.');
    assert.deepEqual(end.actions, ['cash_out']);
    const shop = at(evaluated, 'i:9', { state: 'SHOP', money: 8, currentBlind: 'Big', shop: { cards: [joker('joker', 'Joker', '+4 Mult')] }, vouchers: { cards: [] },
        packs: { cards: [card({ id: 'p1', set: 'Booster', label: 'Arcana Pack', key: 'p_arcana_normal_1', value: { effect: 'Choose 1 of up to 3 Tarot cards to be used immediately' }, cost: { buy: 4 } })] },
        controls: { reroll: { available: true, price: 5 }, nextRound: { available: true } } }, { availableMethods: ['buy', 'buy_and_use', 'reroll', 'next_round', 'use', 'sell', 'rearrange'] });
    const cashed = checkDelta(evaluated, shop, { method: 'cash_out' });
    assert.deepEqual(cashed.state, { money: 8, blind: 'Big', shop: { cards: ['0: Joker [$5]: +4 Mult'], vouchers: [], packs: ['0: Arcana Pack [$4]: pick 1 of 3 Tarot'] } });
    assert.equal(cashed.result, 'Cashed out $4.');
    assert.deepEqual(cashed.actions, ['buy', 'buy_and_use', 'reroll $5', 'next_round']);
    const blind = at(shop, 'i:10', { state: 'BLIND_SELECT', controls: { select: { available: true }, skip: { available: true }, rerollBoss: { available: false } } }, { availableMethods: ['select', 'skip', 'reroll_boss', 'use'] });
    // blind and blinds did not change in the shop, but entering BLIND_SELECT resends them for the skip decision.
    assert.deepEqual(checkDelta(shop, blind, { method: 'next_round' }), { rev: '10', phase: 'BLIND_SELECT', actions: ['select', 'skip'], result: 'Left the shop.',
        state: { blind: 'Big', blinds: { Small: '300 [defeated]', Big: '450; skip: Juggle Tag (+3 hand size next round)', Boss: 'The Head 600: Hearts are debuffed' } } });
    const selected = at(blind, 'i:11', { state: 'SELECTING_HAND', round_num: 2, blind: { name: 'Big Blind', chips: 450 }, controls: {} }, { availableMethods: ['play', 'discard'] });
    const entered = checkDelta(blind, selected, { method: 'select' });
    assert.deepEqual(Object.keys(entered.state!).sort(), ['deck', 'hand', 'round', 'roundNo']);
    assert.equal(entered.result, 'Selected Big Blind.');
});
test('skip names the reward even when the Tag fires on pickup', () => {
    const orbital = { key: 'tag_orbital', name: 'Orbital Tag', rules: ['Upgrade Pair by 3 levels'], rulesKnown: true };
    const offer = at(observation(), 'i:8', { state: 'BLIND_SELECT', blinds: { ...record(observation().state.blinds),
        Small: { name: 'Small Blind', status: 'Select', rules: [], rulesKnown: true, target: 300, skipReward: orbital } }, controls: {} }, { availableMethods: ['select', 'skip'] });
    assert.equal(compactObservation(offer).state.blinds?.Small, '300; skip: Orbital Tag (Upgrade Pair by 3 levels)');
    const skipped = (raw: Data) => at(offer, 'i:9', { currentBlind: 'Big', blinds: { ...record(offer.state.blinds),
        Small: { name: 'Small Blind', status: 'Skipped', rules: [], rulesKnown: true, target: 300, skipReward: orbital } }, ...raw });
    assert.equal(checkDelta(offer, skipped({}), { method: 'skip' }).result, 'Skipped the Small Blind. Got Orbital Tag.');
    const held = checkDelta(offer, skipped({ tags: [{ key: 'tag_double', name: 'Double Tag', rules: [], rulesKnown: false }] }), { method: 'skip' });
    assert.equal(held.result, 'Skipped the Small Blind. Got Double Tag.');
});
test('Boss settlement keeps the blinds Ante until the next Ante exists', () => {
    const full = compactObservation(observation({ state: 'ROUND_EVAL', ante_num: 2, routeAnte: 1, currentBlind: 'Boss', round: { chips: 1950 },
        completedRound: { ante: 1, blindName: 'The Head', target: 600, defeated: true }, cashOut: { amount: 9, known: true, lines: [] } }));
    assert.equal(full.state.ante, 1);
    assert.deepEqual(full.state.cashOut, { blind: 'The Head', score: 1950, target: 600, payout: 9 });
    const attached = compactObservation(observation({ state: 'ROUND_EVAL', ante_num: 2, routeAnte: undefined, completedRound: undefined }));
    assert.equal(attached.state.ante, '?');
    assert.deepEqual(attached.state.cashOut, { blind: '?', score: 0, target: '?', payout: '?' });
});
test('a pack opened from the shop keeps the shop; closing it drops pack, hand and deck', () => {
    const pack = card({ id: 'p1', set: 'Booster', label: 'Arcana Pack', key: 'p_arcana_normal_1', value: { effect: 'Choose 1 of up to 3 Tarot cards' }, cost: { buy: 4 } });
    const shop = observation({ state: 'SHOP', hand: { limit: 8, cards: [] }, shop: { cards: [] }, vouchers: { cards: [] }, packs: { cards: [pack, { ...pack, id: 'p2' }] } });
    const opened = at(shop, 'i:8', { state: 'PACK', money: 0, packName: 'Arcana Pack', packChoices: 2, packs: { cards: [{ ...pack, id: 'p2' }] }, hand: { limit: 8, cards: [card()] },
        pack: { cards: [card({ id: 'sun', set: 'Tarot', label: 'The Sun', value: { effect: 'Converts up to 3 cards' }, target: { min: 1, max: 3 } }),
            card({ id: 'death', set: 'Tarot', label: 'Death', value: { effect: 'Convert the left card into the right card (Drag to rearrange)' }, target: { min: 2, max: 2 } })] } }, { availableMethods: ['pack', 'use'] });
    const open = checkDelta(shop, opened, { method: 'buy', pack: 0 });
    assert.deepEqual(open.state?.shop, { packs: ['0: Arcana Pack [$4]: pick 1 of 3 Tarot'] });
    assert.deepEqual(open.state?.pack, { name: 'Arcana Pack', picks: 2, items: ['0: The Sun [Tarot, 1-3 targets]: Converts up to 3 cards', '1: Death [Tarot, 2 targets]: Convert the left card into the right card'] });
    assert.deepEqual(open.state?.hand, ['0: AH']);
    assert.equal(open.result, 'Opened Arcana Pack.');
    const picked = at(opened, 'i:9', { packChoices: 1, pack: { cards: [card({ id: 'death', set: 'Tarot', label: 'Death', value: { effect: 'Convert' }, target: { min: 2, max: 2 } })] } });
    const pick = checkDelta(opened, picked, { method: 'pack', card: 0 });
    assert.deepEqual(pick.state, { pack: { picks: 1, items: ['0: Death [Tarot, 2 targets]: Convert'] } });
    assert.equal(pick.result, 'Picked The Sun. 1 pick left.');
    const back = at(picked, 'i:10', { state: 'SHOP', hand: { limit: 8, cards: [] } }, { availableMethods: ['buy', 'next_round'] });
    assert.deepEqual(checkDelta(picked, back, { method: 'pack', skip: true }).state, undefined);
    const tagPack = at(opened, 'i:11', { state: 'PACK' });
    delete tagPack.state.shop; delete tagPack.state.vouchers; delete tagPack.state.packs;
    assert.equal('shop' in compactObservation(tagPack).state, false);
});
test('missing baseline, source/run/readiness changes, start, terminal and vanished keys return full state', () => {
    const before = observation(), after = at(before, 'i:8');
    for (const [next, prior] of [[after, undefined], [{ ...after, backend: 'other' }, before], [{ ...after, gameVersion: 'other' }, before],
        [{ ...after, runId: 'run2' }, before], [{ ...after, ready: false }, before], [after, { ...before, ready: false }],
        [{ ...after, terminal: true, outcome: 'won' as const }, before], [after, at(before, 'i:7', { creditLimit: -20 })]] as const) {
        const result = compactActionObservation(next, { method: 'play', cards: [0] }, prior);
        assert.ok(Check(FullObservationSchema, result), JSON.stringify(result));
        assert.equal('full' in result, true);
        assert.ok(result.result);
    }
    assert.equal(compactObservation(at(before, 'i:7', { creditLimit: -20 })).state.credit, -20);
});
test('player state keeps the current deck count and ignores obsolete card data', () => {
    const state = playerState({ remainingCards: 44, cards: { count: 52 }, hand: { cards: [card({ operations: { use: true } })] } });
    assert.equal(state.remainingCards, 44);
    assert.equal('cards' in state, false);
    const hand = record(state.hand);
    assert.ok(Array.isArray(hand.cards));
    assert.equal('operations' in record(hand.cards[0]), false);
    assert.deepEqual(playerState({ cards: { count: 52 } }), {});
});

test('hidden cards and items never expose identity or modifiers', () => {
    const hidden = card({ key: 'SECRET', value: { rank: 'King', suit: 'Spades', effect: 'SECRET' }, modifier: { edition: 'SECRET' }, state: { hidden: true, forced: true, highlight: true } });
    const full = compactObservation(observation({ hand: { cards: [hidden] }, jokers: { cards: [hidden] } }));
    assert.deepEqual(full.state.hand, ['0: ? [forced, selected]']);
    assert.deepEqual(full.state.jokers, ['0: ? [forced, selected]']);
    assert.doesNotMatch(JSON.stringify(full), /SECRET|private-card-id|King|Spades/);
});
test('playing cards show enhancements, seals and permanent chips; other centers are never enhancements', () => {
    const full = compactObservation(observation({ hand: { cards: [card({ modifier: { enhancement: 'm_stone', permanentChips: 15, bonusChips: 0 }, state: { debuff: true } }),
        card({ modifier: { enhancement: 'm_bonus', edition: 'foil', seal: 'Red' } })] },
    jokers: { limit: 5, cards: [joker('smiley', 'Smiley Face', '+5 Mult', { modifier: { enhancement: 'j_smiley' } })] } }));
    assert.deepEqual(full.state.hand, ['0: Stone [+15 chips, debuffed]', '1: AH [bonus, foil, red seal]']);
    assert.deepEqual(full.state.jokers, ['0: Smiley Face [sell $2]: +5 Mult']);
    assert.deepEqual(compactDeckObservation({ revision: 'i:7', runId: 'run1', remainingCards: 3, previewCards: 3, uncertainCards: 0,
        cards: [{ rank: 'Ace', suit: 'Spades', enhancement: 'm_glass', seal: 'Gold', count: 2 }, { rank: '', suit: '', enhancement: 'm_stone', count: 1 }] }).cards, ['2x AS [glass, gold seal]', '1x Stone']);
});
test('item lines carry stickers, editions, prices and targets but no derived eligibility', () => {
    const full = compactObservation({ ...observation({ state: 'SHOP', money: 2, controls: { reroll: { available: false, price: 5 } },
        jokers: { limit: 5, cards: [joker('popcorn', 'Popcorn', '+16 Mult', { modifier: { eternal: true, perishable: 0, rental: true }, state: { debuff: true } })] },
        consumables: { limit: 2, cards: [card({ id: 'aura', set: 'Spectral', label: 'Aura', value: { effect: 'Add an edition' }, target: { aura: true } })] },
        shop: { cards: [joker('joker', 'Joker', '+4 Mult', { index: 9, modifier: { edition: 'negative' } }), card({ id: 'pc', cost: { buy: 3 }, modifier: { enhancement: 'm_gold' } })] },
        vouchers: { cards: [card({ id: 'v', set: 'Voucher', label: 'Overstock', value: { effect: '+1 card slot' }, cost: { buy: 10 } })] }, packs: { cards: [] } }),
        availableMethods: ['buy', 'buy_and_use', 'reroll', 'next_round', 'sell'] });
    assert.deepEqual(full.state.jokers, ['0: Popcorn [eternal, rental, perishable 0, debuffed]: +16 Mult']);
    assert.deepEqual(full.state.consumables, ['0: Aura [Spectral, sell $1, ? targets]: Add an edition']);
    assert.deepEqual(full.state.shop, { cards: ['0: Joker [$5, negative]: +4 Mult', '1: AH [$3, gold]'], vouchers: ['0: Overstock [$10]: +1 card slot'], packs: [] });
    assert.deepEqual(full.actions, ['buy', 'buy_and_use', 'next_round']);
    assert.doesNotMatch(JSON.stringify(full), /available|reason|insufficient/);
});
test('blind lines keep order, skip rewards, dynamic Boss state and unknowns', () => {
    const full = compactObservation(observation({ currentBlind: 'Boss', blind: { key: 'bl_eye', name: 'The Eye', chips: 1200, rules: ['No repeat hand types'], rulesKnown: true,
        ruleState: { known: true, blockedHandTypes: ['Flush', 'Pair'] } }, blinds: {
        Boss: { key: 'bl_eye', name: 'The Eye', status: 'Current', rules: ['No repeat hand types'], rulesKnown: true, target: 1200 },
        Big: { name: 'Big Blind', status: 'Skipped', rules: [], rulesKnown: true, target: 900, skipReward: { name: 'Juggle Tag', rules: [], rulesKnown: false } },
        Small: { name: 'Small Blind', status: 'Defeated', rules: [], rulesKnown: true } } }));
    assert.deepEqual(Object.entries(full.state.blinds!), [['Small', '? [defeated]'], ['Big', '900 [skipped]'], ['Boss', 'The Eye 1200: No repeat hand types (used: Flush, Pair)']]);
    const mouth = compactObservation(observation({ currentBlind: 'Boss', blind: { name: 'The Mouth', chips: 900, rules: ['Play only 1 hand type'], rulesKnown: true, ruleState: { known: true, requiredHandType: 'Pair' } },
        blinds: { Boss: { name: 'The Mouth', status: 'Current', rules: ['Play only 1 hand type'], rulesKnown: true, target: 900 }, Small: { name: 'Small Blind', status: 'Upcoming', target: 300, rules: [], rulesKnown: true,
            skipReward: { hidden: true } } } }));
    assert.deepEqual(mouth.state.blinds, { Small: '300; skip: ?', Boss: 'The Mouth 900: Play only 1 hand type (locked: Pair)' });
});
test('round history distinguishes unknown from empty and never leaks private state', () => {
    const unknown = compactObservation(observation({ round: { chips: 0, hands_left: 3, discards_left: 2, handHistoryKnown: false, handTypeCounts: { Pair: 1 } }, privateRng: 'DO_NOT_EXPOSE',
        tags: [{ key: 'tag_orbital', name: 'Orbital Tag', rules: ['Upgrade', 'Pair by 3 levels'], rulesKnown: true }] }));
    assert.equal(unknown.state.round?.played, '?');
    assert.deepEqual(unknown.state.tags, ['Orbital Tag: Upgrade Pair by 3 levels']);
    assert.doesNotMatch(JSON.stringify(unknown), /DO_NOT_EXPOSE/);
    const played = compactObservation(observation({ round: { chips: 40, hands_left: 3, discards_left: 2, handHistoryKnown: true, handTypeCounts: { Pair: 1 } } }));
    assert.deepEqual(played.state.round, { score: 40, target: 300, hands: 3, discards: 2, played: { Pair: 1 } });
});
test('readiness and terminal results are explicit only when abnormal', () => {
    const blocked = compactObservation({ ...observation(), ready: false, notReadyReason: 'Waiting for queued game events' });
    assert.equal(blocked.notReady, 'Waiting for queued game events');
    assert.deepEqual(blocked.actions, []);
    assert.deepEqual(Object.keys(blocked.state).sort(), [...runKeys].sort());
    const won = compactObservation({ ...observation({ state: 'ROUND_EVAL', blind: { name: 'Big Blind', chips: 0 }, completedRound: { target: 600 }, round: { chips: 700 } }),
        terminal: true, outcome: 'won', availableMethods: ['start'] });
    assert.equal(won.outcome, 'won');
    assert.equal(won.state.runResult, 'Won at Ante 1 Big Blind: 700/600');
    assert.equal('cashOut' in won.state, false);
    for (const phase of ['ANIMATING', 'SMODS_BOOSTER_OPENED']) {
        const unknown = compactObservation(observation({ state: phase }));
        assert.equal(unknown.phase, null);
        assert.ok(unknown.notReady);
        assert.deepEqual(unknown.actions, []);
        assert.equal('pack' in unknown.state, false);
    }
});
