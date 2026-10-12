import { Type, type Static, type TSchema } from 'typebox';
import { isDeepStrictEqual } from 'node:util';
import { record, type Action, type Data, type DeckObservation, type Observation } from './contract.ts';
const ranks: Record<string, string> = { Ace: 'A', King: 'K', Queen: 'Q', Jack: 'J' };
const suits: Record<string, string> = { Spades: 'S', Hearts: 'H', Clubs: 'C', Diamonds: 'D' };
const phases = ['MENU', 'BLIND_SELECT', 'SELECTING_HAND', 'ROUND_EVAL', 'SHOP', 'PACK', 'GAME_OVER'] as const;
export type Phase = typeof phases[number];
/** Phase views exist only in these phases; clients drop them when the phase no longer uses them. */
export const phaseViews: Readonly<Record<string, readonly Phase[]>> = {
    hand: ['SELECTING_HAND', 'PACK'], deck: ['SELECTING_HAND', 'PACK'], round: ['SELECTING_HAND'], cashOut: ['ROUND_EVAL'],
    shop: ['SHOP', 'PACK'], pack: ['PACK'], profiles: ['MENU', 'GAME_OVER'], runResult: ['GAME_OVER'],
};
const validIn = (key: string, phase: Phase | null): boolean => !(key in phaseViews) || phase !== null && phaseViews[key]!.includes(phase);
// Run keys a phase decides on. Entering the phase resends them whole, so the decision does not rest on a delta from an earlier phase.
const phaseFocus: Partial<Record<Phase, readonly string[]>> = { BLIND_SELECT: ['blind', 'blinds'] };
// "?" is the single unknown marker; null inside a patched object deletes that member.
const known = Type.Union([Type.Number(), Type.Literal('?')]);
const lines = Type.Array(Type.String());
const area = Type.Union([lines, Type.Record(Type.String({ pattern: '^\\d+$' }), Type.String())]);
const members = <T extends TSchema>(value: T) => Type.Record(Type.String(), Type.Union([value, Type.Null()]));
const StateSchema = Type.Object({
    setup: Type.Optional(Type.String()), ante: Type.Optional(known), roundNo: Type.Optional(known), money: Type.Optional(known), credit: Type.Optional(Type.Number()),
    handSize: Type.Optional(known), jokerSlots: Type.Optional(known), consumableSlots: Type.Optional(known),
    hands: Type.Optional(members(Type.String())), jokers: Type.Optional(lines), consumables: Type.Optional(area), vouchers: Type.Optional(lines), tags: Type.Optional(lines),
    blind: Type.Optional(Type.String()), blinds: Type.Optional(members(Type.String())),
    round: Type.Optional(members(Type.Unknown())), deck: Type.Optional(Type.String()), hand: Type.Optional(area), cashOut: Type.Optional(members(Type.Unknown())),
    shop: Type.Optional(Type.Object({ cards: Type.Optional(lines), vouchers: Type.Optional(lines), packs: Type.Optional(lines) }, { additionalProperties: false })),
    pack: Type.Optional(members(Type.Unknown())), profiles: Type.Optional(members(Type.String())), runResult: Type.Optional(Type.String()),
}, { additionalProperties: false });
export type State = Static<typeof StateSchema>;
const common = {
    rev: Type.String(), phase: Type.Union([Type.Enum([...phases]), Type.Null()]), notReady: Type.Optional(Type.String()),
    outcome: Type.Optional(Type.Enum(['won', 'lost'])), actions: Type.Array(Type.String()), result: Type.Optional(Type.String()),
};
export const FullObservationSchema = Type.Object({ v: Type.Literal(3), full: Type.Literal(true), ...common, state: StateSchema }, { additionalProperties: false });
export type FullObservation = Static<typeof FullObservationSchema>;
export const PartialObservationSchema = Type.Object({ ...common, notReady: Type.Optional(Type.Never()), outcome: Type.Optional(Type.Never()),
    result: Type.String(), state: Type.Optional(StateSchema) }, { additionalProperties: false });
export type PartialObservation = Static<typeof PartialObservationSchema>;
export type ActionObservation = FullObservation | PartialObservation;
// MCP outputSchema has an object root. The native executor still emits the
// exclusive success/error envelopes rather than combining their fields.
export const ObservationResultSchema = Type.Object({ ok: Type.Boolean(), value: Type.Optional(Type.Union([FullObservationSchema, PartialObservationSchema])), code: Type.Optional(Type.String()),
    applied: Type.Optional(Type.Union([Type.Boolean(), Type.Literal('unknown')])), message: Type.Optional(Type.String()) }, { additionalProperties: false });
export const FullObservationResultSchema = Type.Object({ ...ObservationResultSchema.properties, value: Type.Optional(FullObservationSchema) }, { additionalProperties: false });
const num = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const text = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v.replace(/\s*\(Drag to rearrange\)/gi, '').trim().replace(/\s+/g, ' ') : null;
/** Joins localized UI line fragments into one sentence. */
const words = (v: unknown): string | null => text(list(v).filter(line => typeof line === 'string').join(' '));
const isObject = (v: unknown): v is Data => v !== null && typeof v === 'object' && !Array.isArray(v);
/** Bridge revisions are `<instance>:<counter>`; the tool layer resolves the counter back to the full value. */
export function shortRevision(revision: string): string {
    return revision.slice(revision.lastIndexOf(':') + 1);
}
function line(index: number, name: string, tags: string[], effect?: string | null): string {
    return `${index}: ${name}${tags.length ? ` [${tags.join(', ')}]` : ''}${effect === undefined ? '' : ': ' + (effect ?? '?')}`;
}
const flags = (s: Data): string[] => [s.forced === true ? 'forced' : '', s.highlight === true ? 'selected' : ''].filter(Boolean);
function face(v: Data, m: Data): string {
    if (m.enhancement === 'm_stone') return 'Stone';
    return typeof v.rank === 'string' && typeof v.suit === 'string' ? (ranks[v.rank] ?? v.rank) + (suits[v.suit] ?? v.suit) : '?';
}
function cardAttrs(m: Data, s: Data): string[] {
    const attrs: string[] = [];
    // Only playing-card enhancements (m_*) are attributes; center keys of other cards are not.
    if (typeof m.enhancement === 'string' && m.enhancement.startsWith('m_') && m.enhancement !== 'm_stone') attrs.push(m.enhancement.slice(2));
    if (typeof m.edition === 'string') attrs.push(m.edition);
    if (typeof m.seal === 'string') attrs.push(m.seal.toLowerCase() + ' seal');
    if ((num(m.permanentChips) ?? 0) !== 0) attrs.push(`+${m.permanentChips} chips`);
    if (s.debuff === true || s.disabled === true) attrs.push('debuffed');
    return attrs;
}
function playingCard(raw: unknown, index: number): string {
    const c = record(raw), s = record(c.state);
    if (s.hidden === true) return line(index, '?', flags(s));
    return line(index, face(record(c.value), record(c.modifier)), [...cardAttrs(record(c.modifier), s), ...flags(s)]);
}
function targets(c: Data): string | null {
    const t = record(c.target), min = num(t.min), max = num(t.max);
    if (t.known === false || (min === null || max === null) && (t.aura === true || t.min !== undefined || t.max !== undefined)) return '? targets';
    if (min === null || max === null) return null;
    return (min === max ? String(max) : `${min}-${max}`) + (max === 1 ? ' target' : ' targets');
}
type Location = 'jokers' | 'consumables' | 'shop' | 'pack';
const isPlaying = (c: Data): boolean => ['Default', 'Enhanced'].includes(String(c.set)) || typeof record(c.value).rank === 'string' && record(c.value).rank !== '' && typeof record(c.value).suit === 'string';
function item(raw: unknown, index: number, location: Location): string {
    const c = record(raw), s = record(c.state), v = record(c.value), m = record(c.modifier), cost = record(c.cost), set = String(c.set ?? '');
    if (s.hidden === true) return line(index, '?', flags(s));
    const tags: string[] = [];
    if (['Tarot', 'Planet', 'Spectral'].includes(set)) tags.push(set);
    if (location === 'shop' && num(cost.buy) !== null) tags.push('$' + cost.buy);
    if (m.eternal === true) tags.push('eternal');
    else if ((location === 'jokers' || location === 'consumables') && num(cost.sell) !== null) tags.push(`sell $${cost.sell}`);
    if (m.rental === true) tags.push('rental');
    if (num(m.perishable) !== null) tags.push(`perishable ${m.perishable}`);
    if (isPlaying(c)) return line(index, face(v, m), [...tags, ...cardAttrs(m, s)]);
    if (typeof m.edition === 'string') tags.push(m.edition);
    if (s.debuff === true || s.disabled === true) tags.push('debuffed');
    const t = location === 'jokers' ? null : targets(c);
    if (t) tags.push(t);
    let effect = text(v.effect);
    if (set === 'Booster' && effect) effect = effect.replace(/^Choose (\d+) of up to (\d+) (.+?) cards?\b.*$/i, 'pick $1 of $2 $3');
    return line(index, String(c.label ?? c.key ?? '?'), tags, effect);
}
const cards = (raw: unknown): unknown[] => list(record(raw).cards);
const handOrder = ['High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush', 'Five of a Kind', 'Flush House', 'Flush Five'];
function hands(raw: unknown): Record<string, string> {
    const rank = (name: string) => { const i = handOrder.indexOf(name); return i < 0 ? handOrder.length : i; };
    return Object.fromEntries(Object.entries(record(raw)).sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b)).map(([name, value]) => {
        const h = record(value), parts = [`${num(h.chips) ?? '?'}x${num(h.mult) ?? '?'}`];
        if (h.level !== undefined && h.level !== 1) parts.push('Lv' + (num(h.level) ?? '?'));
        if ((num(h.played) ?? 0) > 0) parts.push(`played ${h.played}`);
        return [name, parts.join(' ')];
    }));
}
function tagRules(t: Data): string {
    return t.rulesKnown === false ? '?' : words(t.rules) ?? '?';
}
const tagName = (t: Data): string => String(t.name ?? t.displayName ?? t.key ?? '?');
function blinds(raw: Data, phase: Phase | null): Record<string, string> {
    const current = typeof raw.currentBlind === 'string' ? raw.currentBlind : null, entries = record(raw.blinds);
    const roles = ['Small', 'Big', 'Boss'].filter(role => role in entries).concat(Object.keys(entries).filter(role => !['Small', 'Big', 'Boss'].includes(role)));
    return Object.fromEntries(roles.map(role => {
        const b = record(entries[role]), active = phase === 'SELECTING_HAND' && role === current, d = active ? { ...b, ...record(raw.blind) } : b;
        const status = typeof b.status === 'string' ? b.status.toLowerCase() : '', state = record(d.ruleState);
        const target = num(b.target) ?? (active ? num(record(raw.blind).chips) : null);
        const marks = [['defeated', 'skipped'].includes(status) ? status : '', d.disabled === true || state.active === false ? 'disabled' : ''].filter(Boolean);
        let out = (role === 'Boss' ? `${d.name ?? d.displayName ?? d.key ?? '?'} ` : '') + (target ?? '?') + (marks.length ? ` [${marks.join(', ')}]` : '');
        const rules = d.rulesKnown === false ? '?' : words(d.rules);
        if (rules) {
            const used = state.known === true && Array.isArray(state.blockedHandTypes) && state.blockedHandTypes.length ? ` (used: ${state.blockedHandTypes.join(', ')})` : '';
            const locked = typeof state.requiredHandType === 'string' ? ` (locked: ${state.requiredHandType})` : '';
            out += `: ${rules}${used}${locked}`;
        }
        const reward = record(b.skipReward);
        if (role !== 'Boss' && !['defeated', 'skipped'].includes(status) && b.skipReward)
            out += reward.hidden === true ? '; skip: ?' : `; skip: ${tagName(reward)} (${tagRules(reward)})`;
        return [role, out];
    }));
}
function round(raw: Data): Data {
    const r = record(raw.round), out: Data = { score: num(r.chips) ?? '?', target: num(record(raw.blind).chips) ?? '?', hands: num(r.hands_left) ?? '?', discards: num(r.discards_left) ?? '?' };
    // This round's history; cumulative counts live in hands.
    if (r.handHistoryKnown !== true) out.played = '?';
    else if (Object.keys(record(r.handTypeCounts)).length) out.played = structuredClone(record(r.handTypeCounts));
    return out;
}
function runResult(raw: Data, outcome: Observation['outcome']): string {
    const blind = record(raw.blind), done = record(raw.completedRound), r = record(raw.round);
    const name = text(blind.name) ?? text(done.blindName), score = num(r.chips), target = num(done.target) ?? (blind.key || name ? num(blind.chips) : null);
    return `${outcome === 'won' ? 'Won' : 'Lost'} at Ante ${num(raw.ante_num) ?? '?'}${name ? ' ' + name : ''}` + (score !== null ? `: ${score}/${target ?? '?'}` : '');
}
function profiles(raw: unknown): Record<string, string> {
    return Object.fromEntries(list(record(raw).decks).map(d => {
        const deck = record(d);
        return [String(deck.deck ?? deck.key), deck.unlocked !== true ? 'locked' : deck.stakesKnown === true ? list(deck.stakes).join(' ') : '?'];
    }));
}
/** A complete snapshot: run keys plus only the views of the current phase. */
export function compactState(raw: Data, phase: Phase | null, ready = true, terminal = false, outcome: Observation['outcome'] = 'ongoing'): State {
    const hasRun = phase !== 'MENU' && (raw.deck !== undefined || raw.ante_num !== undefined || raw.round_num !== undefined), state: State = {};
    if (hasRun) {
        Object.assign(state, {
            setup: `${raw.deck ?? '?'} deck, ${raw.stake ?? '?'} stake${terminal ? `, seed ${raw.seed ?? '?'}` : ''}`,
            // The ante that owns blinds: it lags the engine pointer until the next Ante's blinds exist.
            ante: num(raw.routeAnte) ?? (phase === 'ROUND_EVAL' ? '?' : num(raw.ante_num) ?? '?'), roundNo: num(raw.round_num) ?? '?', money: num(raw.money) ?? '?',
        });
        if ((num(raw.creditLimit) ?? 0) !== 0) state.credit = raw.creditLimit as number;
        Object.assign(state, {
            handSize: num(record(raw.hand).limit) ?? '?', jokerSlots: num(record(raw.jokers).limit) ?? '?', consumableSlots: num(record(raw.consumables).limit) ?? '?',
            hands: hands(raw.hands), jokers: cards(raw.jokers).map((c, i) => item(c, i, 'jokers')), consumables: cards(raw.consumables).map((c, i) => item(c, i, 'consumables')),
            vouchers: Array.isArray(raw.redeemedVouchers) ? raw.redeemedVouchers.map(v => { const u = record(v); return `${u.name ?? u.key}: ${text(u.effect) ?? '?'}`; }) :
                Object.entries(record(raw.used_vouchers)).filter(([, v]) => v === true).map(([key]) => `${key}: ?`),
            tags: list(raw.tags).map(t => { const tag = record(t); return tag.hidden === true ? '?' : `${tagName(tag)}: ${tagRules(tag)}`; }),
            blind: typeof raw.currentBlind === 'string' ? raw.currentBlind : '?', blinds: blinds(raw, phase),
        });
    }
    if (terminal) {
        state.runResult = runResult(raw, outcome);
        if (raw.profileOptions) state.profiles = profiles(raw.profileOptions);
        return state;
    }
    if (!ready) return state;
    const deck = () => `${num(raw.remainingCards) ?? '?'}${num(raw.totalCards) !== null ? '/' + raw.totalCards : ''}`;
    if (phase === 'MENU' && raw.profileOptions) state.profiles = profiles(raw.profileOptions);
    else if (phase === 'SELECTING_HAND') Object.assign(state, { round: round(raw), deck: deck(), hand: cards(raw.hand).map(playingCard) });
    else if (phase === 'ROUND_EVAL') {
        const done = record(raw.completedRound), pay = record(raw.cashOut);
        state.cashOut = { blind: text(done.blindName) ?? '?', score: num(record(raw.round).chips) ?? '?', target: num(done.target) ?? '?',
            payout: pay.known === true ? num(pay.amount) ?? '?' : '?', ...(pay.linesKnown === true && list(pay.lines).length ? { lines: structuredClone(pay.lines) } : {}) };
    }
    if ((phase === 'SHOP' || phase === 'PACK') && (raw.shop || raw.vouchers || raw.packs))
        state.shop = { cards: cards(raw.shop).map((c, i) => item(c, i, 'shop')), vouchers: cards(raw.vouchers).map((c, i) => item(c, i, 'shop')), packs: cards(raw.packs).map((c, i) => item(c, i, 'shop')) };
    if (phase === 'PACK') {
        state.pack = { name: text(raw.packName) ?? '?', picks: num(raw.packChoices) ?? '?', items: cards(raw.pack).map((c, i) => item(c, i, 'pack')) };
        if (raw.hand) Object.assign(state, { deck: deck(), hand: cards(raw.hand).map(playingCard) });
    }
    return state;
}
function phaseOf(o: Observation): Phase | null {
    const name = o.state.state;
    return phases.includes(name as Phase) ? name as Phase : null;
}
/** Phase candidates with their limits. use/sell/rearrange are implicit for non-empty areas. */
function actions(o: Observation, ready: boolean): string[] {
    if (!ready) return [];
    const c = record(o.state.controls), open = (key: string) => record(c[key]).available !== false;
    const max = Math.min(5, num(record(c.play).maxCards) ?? num(record(o.state.hand).highlighted_limit) ?? 5), out: string[] = [];
    const gates: Record<string, string> = { discard: 'discard', select: 'select', skip: phaseOf(o) === 'PACK' ? 'packSkip' : 'skip', reroll_boss: 'rerollBoss', reroll: 'reroll', cash_out: 'cashOut', next_round: 'nextRound' };
    for (const method of o.availableMethods) {
        if (['use', 'sell', 'rearrange'].includes(method) || gates[method] && !open(gates[method])) continue;
        if (method === 'play' || method === 'discard') out.push(`${method} 1-${max}`);
        else if (method === 'reroll') {
            const price = num(record(c.reroll).price) ?? num(record(o.state.round).reroll_cost);
            out.push(price === null ? method : `reroll $${price}`);
        } else out.push(method);
    }
    return out;
}
const ready = (o: Observation): boolean => o.ready === true && phaseOf(o) !== null;
/** Wire protocol 1 remains unchanged; the model-facing projection is version 3. */
export function compactObservation(o: Observation): FullObservation {
    const phase = phaseOf(o), ok = ready(o), terminal = o.outcome === 'won' || o.outcome === 'lost';
    return { v: 3, full: true, rev: shortRevision(o.revision), phase, ...(ok ? {} : { notReady: o.notReadyReason ?? 'Waiting for a supported decision phase' }),
        ...(terminal ? { outcome: o.outcome as 'won' | 'lost' } : {}), actions: actions(o, ok), state: compactState(o.state, phase, ok, o.terminal || terminal, o.outcome) };
}
function nameAt(o: Observation | undefined, area: string, index: number): string {
    const c = record(cards(o?.state[area])[index]);
    if (!o || record(c.state).hidden === true || !Object.keys(c).length) return 'a card';
    return isPlaying(c) ? face(record(c.value), record(c.modifier)) : String(c.label ?? c.key ?? 'a card');
}
/** One English sentence of facts read from the observations around the action. */
function describe(action: Action, after: Observation, before?: Observation): string {
    const a = after.state, b = before?.state ?? {}, phase = phaseOf(after);
    let out: string;
    switch (action.method) {
        case 'start': out = `Started a ${action.deck} deck run on ${action.stake} stake.`; break;
        case 'select': out = `Selected ${text(record(a.blind).name) ?? 'the blind'}.`; break;
        case 'skip': {
            if (b.state === 'PACK') { out = 'Skipped the pack.'; break; }
            // Tags that fire on pickup (Orbital, Economy, ...) never reach the held list; name the offered reward instead.
            const reward = record(record(record(b.blinds)[String(b.currentBlind)]).skipReward);
            const held = before ? list(a.tags).slice(list(b.tags).length).map(t => tagName(record(t))) : [];
            const gained = held.length || !Object.keys(reward).length || reward.hidden === true ? held : [tagName(reward)];
            out = `Skipped the ${typeof b.currentBlind === 'string' ? b.currentBlind + ' ' : ''}Blind.` + (gained.length ? ` Got ${gained.join(', ')}.` : '');
            break;
        }
        case 'play': {
            const was = record(b.hands), type = before ? Object.keys(record(a.hands)).find(name => (num(record(record(a.hands)[name]).played) ?? 0) > (num(record(was[name]).played) ?? 0)) : undefined;
            const gain = before && num(record(a.round).chips) !== null && num(record(b.round).chips) !== null ? Number(record(a.round).chips) - Number(record(b.round).chips) : null;
            out = `Played ${type ?? `${action.cards.length} card${action.cards.length === 1 ? '' : 's'}`}${gain !== null ? ` (+${gain})` : ''}.` +
                (phase === 'ROUND_EVAL' && record(a.completedRound).defeated !== false ? ' Blind defeated.' : '');
            break;
        }
        case 'discard': out = `Discarded ${action.cards.length} card${action.cards.length === 1 ? '' : 's'}.`; break;
        case 'cash_out': {
            const pay = record(b.cashOut);
            out = pay.known === true && num(pay.amount) !== null ? `Cashed out $${pay.amount}.` : 'Cashed out.';
            break;
        }
        case 'next_round': out = 'Left the shop.'; break;
        case 'buy':
            out = 'card' in action ? `Bought ${nameAt(before, 'shop', action.card)}.` : 'voucher' in action ? `Bought ${nameAt(before, 'vouchers', action.voucher)}.` : `Opened ${nameAt(before, 'packs', action.pack)}.`;
            break;
        case 'buy_and_use': out = `Bought and used ${nameAt(before, 'shop', action.card)}.`; break;
        case 'reroll': out = 'Rerolled the shop.'; break;
        case 'reroll_boss': out = `Rerolled the Boss${record(record(a.blinds).Boss).name ? ': ' + record(record(a.blinds).Boss).name : ''}.`; break;
        case 'use': out = `Used ${nameAt(before, 'consumables', action.consumable)}.`; break;
        case 'sell': out = 'joker' in action ? `Sold ${nameAt(before, 'jokers', action.joker)}.` : `Sold ${nameAt(before, 'consumables', action.consumable)}.`; break;
        case 'pack': {
            const left = num(a.packChoices);
            out = `Picked ${nameAt(before, 'pack', action.card)}.` + (phase === 'PACK' && left !== null ? ` ${left} pick${left === 1 ? '' : 's'} left.` : '');
            break;
        }
        case 'rearrange': out = `Reordered ${'hand' in action ? 'the hand' : 'jokers' in action ? 'jokers' : 'consumables'}.`; break;
    }
    if (after.outcome === 'won' || after.outcome === 'lost') out += ` Run ${after.outcome}.`;
    return out;
}
// Ordered areas whose raw cards carry bridge IDs: an element patch is valid only when membership and order are unchanged.
const ordered = ['consumables', 'hand'];
const ids = (o: Observation, name: string): unknown[] | null => {
    const values = cards(o.state[name]).map(c => record(c).id);
    return values.every(id => id !== undefined) ? values : null;
};
/** Changed keys only; undefined when a still-valid key vanished and only a full snapshot is unambiguous. */
function diff(previous: FullObservation, next: FullObservation, before: Observation, after: Observation): State | undefined {
    const p = previous.state as Data, n = next.state as Data, out: Data = {};
    for (const key of Object.keys(p))
        if (!(key in n) && validIn(key, next.phase)) return undefined;
    const focus = previous.phase !== next.phase && next.phase !== null ? phaseFocus[next.phase] ?? [] : [];
    for (const [key, value] of Object.entries(n)) {
        const old = p[key];
        if (!(key in p) || !validIn(key, previous.phase)) out[key] = value;
        else if (focus.includes(key))
            out[key] = isObject(value) && isObject(old) ? { ...Object.fromEntries(Object.keys(old).map(name => [name, null])), ...value } : value;
        else if (isDeepStrictEqual(old, value)) continue;
        else if (Array.isArray(value) && Array.isArray(old) && ordered.includes(key) && old.length === value.length &&
            ids(before, key) !== null && isDeepStrictEqual(ids(before, key), ids(after, key)))
            out[key] = Object.fromEntries(value.flatMap((v, i) => isDeepStrictEqual(v, old[i]) ? [] : [[String(i), v]]));
        else if (isObject(value) && isObject(old))
            out[key] = Object.fromEntries([...new Set([...Object.keys(old), ...Object.keys(value)])]
                .filter(name => !isDeepStrictEqual(old[name], value[name])).map(name => [name, name in value ? value[name] : null]));
        else out[key] = value;
    }
    return out as State;
}
/** Full snapshot when no reliable baseline exists; otherwise the changed keys of the same projection. */
export function compactActionObservation(after: Observation, action: Action, before?: Observation): ActionObservation {
    const full = compactObservation(after), result = describe(action, after, before);
    const { state: fullState, ...head } = full, complete: FullObservation = { ...head, result, state: fullState };
    if (!before || action.method === 'start' || after.runId !== before.runId || after.backend !== before.backend || after.gameVersion !== before.gameVersion ||
        after.terminal || full.outcome !== undefined || !ready(after) || !ready(before))
        return complete;
    const state = diff(compactObservation(before), full, before, after);
    if (!state) return complete;
    return { rev: full.rev, phase: full.phase, actions: full.actions, result, ...(Object.keys(state).length ? { state } : {}) };
}
/** Reference client merge: rebuild the full projection from a baseline and a delta. */
export function applyDelta(base: FullObservation, delta: ActionObservation): FullObservation {
    if ('full' in delta) return structuredClone(delta);
    const state: Data = {};
    for (const [key, value] of Object.entries(base.state)) if (validIn(key, delta.phase)) state[key] = structuredClone(value);
    for (const [key, value] of Object.entries((delta.state ?? {}) as Data)) {
        const old = state[key];
        if (!isObject(value)) state[key] = structuredClone(value);
        else if (Array.isArray(old)) state[key] = old.map((v, i) => String(i) in value ? value[String(i)] : v);
        else state[key] = Object.fromEntries(Object.entries({ ...record(old), ...structuredClone(value) }).filter(([, v]) => v !== null));
    }
    return { v: 3, full: true, rev: delta.rev, phase: delta.phase, actions: [...delta.actions], result: delta.result, state: state as State };
}
/** Deck composition has no action indices, stable IDs or draw order. */
export function compactDeckObservation(o: DeckObservation): Data {
    return { rev: shortRevision(o.revision), remainingCards: o.remainingCards, previewCards: o.previewCards, uncertainCards: o.uncertainCards, cards: o.cards.map(c => {
            const attrs = cardAttrs({ enhancement: c.enhancement, edition: c.edition, seal: c.seal, permanentChips: c.permanentBonus }, { debuff: c.debuff });
            return `${c.count}x ${face({ rank: c.rank, suit: c.suit }, { enhancement: c.enhancement })}${attrs.length ? ` [${attrs.join(', ')}]` : ''}`;
        }) };
}
