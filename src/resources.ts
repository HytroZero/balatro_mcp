import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export const ruleTopics = [
  ['lifecycle', 'Run lifecycle', 'Objective, phases, playing, discarding, cash out, skipping and termination.'],
  ['hands', 'Poker hands', 'Hand recognition, scoring subsets, contains predicates and Planet values.'],
  ['scoring', 'Scoring order', 'Chips and Mult phases, held effects, retriggers, ordering and Plasma.'],
  ['modifiers', 'Card modifiers', 'Enhancements, Editions, Seals, Stickers, debuffs and visibility.'],
  ['decks-stakes', 'Decks and Stakes', 'All 15 Decks and eight cumulative Stake rules.'],
  ['blinds', 'Blinds and Bosses', 'Blind targets, Boss restrictions, history and disabling.'],
  ['economy', 'Shop and economy', 'Prices, selling, interest, rerolls and shop generation.'],
  ['consumables', 'Consumables', 'Tarot and Spectral effects, targeting, copies and capacity.'],
  ['packs', 'Booster packs', 'Pack contents, sizes and selection rules.'],
  ['tags', 'Tags', 'All Tag rewards and delayed resolution.'],
  ['vouchers', 'Vouchers', 'All Voucher upgrades and generation rules.'],
  ['jokers', 'Jokers', 'All 150 Joker abilities, events, copying, growth and generation exceptions.'],
  ['challenges', 'Challenges', 'All 20 Challenge setups and restrictions.'],
  ['randomness', 'Randomness', 'Listed probabilities, RNG boundaries and hidden information.'],
] as const;

export interface GameplayResource {
  name: string;
  uri: string;
  title: string;
  description: string;
  path: string;
}

/** Explicit allowlist: URIs never become arbitrary filesystem paths. */
export const gameplayResources: readonly GameplayResource[] = [
  { name: 'gameplay-guide', uri: 'balatro://guide', title: 'Tool and state guide', description: 'Read once before gameplay: state fields, delta merging, indices and card-order semantics.', path: 'guide.md' },
  { name: 'analysis-guide', uri: 'balatro://analysis', title: 'Analysis output reference', description: 'Read once before game_analyze: score labels, discard hit rates, order, audit and sampled build limitations.', path: 'analysis.md' },
  { name: 'game-rules', uri: 'balatro://rules', title: 'Rules directory', description: 'Small directory of rules by topic. Read the linked topic needed for the current question, or use balatro://objects/<name> for one object.', path: 'rules.md' },
  { name: 'decision-protocol', uri: 'balatro://protocol', title: 'Decision protocol', description: 'Read once before gameplay: authorization, recovery, legality, analysis cadence and pre-action explanations.', path: 'protocol.md' },
  { name: 'coach', uri: 'balatro://coach', title: 'Gold Stake coach', description: 'Read once before gameplay: engine selection, survival, growth, economy and Boss preparation toward an Ante 8 win.', path: 'coach.md' },
  ...ruleTopics.map(([topic, title, description]) => ({ name: `rules-${topic}`, uri: `balatro://rules/${topic}`, title, description, path: `rules/${topic}.md` })),
  { name: 'rules-sources', uri: 'balatro://rules/sources', title: 'Rules sources and license', description: 'Wiki snapshot coverage, revisions, attribution and CC BY-NC-SA 3.0 license.', path: 'rules/sources.md' },
  { name: 'coach-decisions', uri: 'balatro://coach/decisions', title: 'Decision comparisons', description: 'Read for difficult shop, engine, hand-size and restrictive Boss tradeoffs.', path: 'coach/decisions.md' },
  { name: 'coach-sources', uri: 'balatro://coach/sources', title: 'Coach sources', description: 'Strategy provenance, version boundaries and historical patch evidence.', path: 'coach/sources.md' },
  { name: 'coach-state-input', uri: 'balatro://coach/state-input', title: 'Run review template', description: 'State template for a requested run review.', path: 'coach/state-input.md' },
];

export async function readGameplayResource(root: string, resource: GameplayResource): Promise<string> {
  const base = await realpath(resolve(root, 'resources'));
  const target = await realpath(resolve(base, resource.path));
  const path = relative(base, target);
  if (path === '..' || path.startsWith('..' + sep) || isAbsolute(path)) throw new Error('Resource resolves outside the gameplay resources directory.');
  return readFile(target, 'utf8');
}
