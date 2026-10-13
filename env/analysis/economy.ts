import { record, type Data } from '../contract.ts';
import type { Economy } from './snapshot.ts';

const usd = (value: number): string => (value < 0 ? '-$' : '$') + Math.abs(value);

/** Cash-out interest at `dollars` held, by the original round evaluation formula. */
export function interest(economy: Economy, dollars = economy.dollars): number {
  if (economy.noInterest || dollars < 5) return 0;
  return economy.interestAmount * Math.min(Math.floor(dollars / 5), economy.interestCap / 5);
}

/** One line: interest now, what can be spent without losing it, the next step and rent. */
export function economyLine(economy: Economy): string {
  const { dollars } = economy, parts: string[] = [];
  if (economy.noInterest) parts.push('no interest on this deck');
  else {
    const steps = Math.floor(Math.max(0, dollars) / 5), cap = economy.interestCap / 5;
    parts.push(`interest ${usd(interest(economy))} at cash-out`);
    if (steps >= 1) parts.push(`spend up to ${usd(dollars - 5 * Math.min(steps, cap))} keeps it`);
    parts.push(steps >= cap ? `at the interest cap (${usd(economy.interestCap)})` : `next step at ${usd(5 * (steps + 1))}`);
    if (steps >= 1) parts.push(`each $5 below costs ${usd(economy.interestAmount)}/round`);
  }
  if (economy.rentals > 0) parts.push(`rent ${usd(economy.rentals * economy.rentalRate)}/round (${economy.rentals} Rental)`);
  return `${usd(dollars)}: ${parts.join('; ')}`;
}

const open = (blind: Data): boolean => !['Defeated', 'Skipped'].includes(String(blind.status));
const extras = (economy: Economy): string => `${usd(economy.moneyPerHand)} per unused hand` +
  (economy.moneyPerDiscard > 0 ? `, ${usd(economy.moneyPerDiscard)} per unused discard` : '');

/** Base rewards of the blinds still to play this Ante. */
export function rewardsLine(economy: Economy, state: Data): string | undefined {
  const blinds = record(state.blinds);
  const rows = ['Small', 'Big', 'Boss'].filter(role => economy.blindRewards[role] !== undefined && open(record(blinds[role])))
    .map(role => `${role} ${usd(economy.blindRewards[role]!)}`);
  return rows.length ? `${rows.join(', ')}; plus ${extras(economy)}` : undefined;
}

/** Money a Tag pays from values the game already shows; undefined when the Tag has no computable payout. */
function tagMoney(key: string, economy: Economy): string | undefined {
  switch (key) {
    case 'tag_economy': return `${usd(Math.min(Math.max(0, economy.dollars), 40))} now`;
    case 'tag_investment': return '$25 after the Boss is defeated';
    case 'tag_handy': return economy.handsPlayed === undefined ? undefined : `${usd(economy.handsPlayed)} now`;
    case 'tag_garbage': return economy.unusedDiscards === undefined ? undefined : `${usd(economy.unusedDiscards)} now`;
    case 'tag_skip': return economy.skips === undefined ? undefined : `${usd(5 * (economy.skips + 1))} now`;
    default: return undefined;
  }
}

/** What skipping the offered Small or Big Blind gives and forgoes. */
export function skipLine(economy: Economy, state: Data): string | undefined {
  const role = String(state.currentBlind);
  if (state.state !== 'BLIND_SELECT' || (role !== 'Small' && role !== 'Big')) return undefined;
  const reward = record(record(record(state.blinds)[role]).skipReward);
  if (typeof reward.key !== 'string' || reward.hidden === true) return undefined;
  const name = String(reward.displayName ?? reward.name ?? reward.key), paid = tagMoney(reward.key, economy);
  return `skip ${role}: gives ${name}${paid ? ` (${paid})` : ''}; forgoes ${usd(economy.blindRewards[role] ?? 0)} reward, ${extras(economy)}, ` +
    `this round's Joker scaling and the shop after it`;
}
