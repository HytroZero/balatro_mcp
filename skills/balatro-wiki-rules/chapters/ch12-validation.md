# ch12 Turn Rules into Regression Evidence

## Define the evidence boundary

Use Wiki abilities, tables, and Guides as mechanics references. The testing workflow and coverage ledger below are engineering guidance. Verify environment rules before interpreting agent training results.

For each rule, record version/source revision, pre-state, action, event order, post-state, minimal reproduction, and implementation coverage. Track reported bugs, missing evidence, and historical changes through [version notes](../references/version-notes.md).

## Write a minimal case

Original test template; keys illustrate a case specification rather than an existing repository API:

```yaml
case: red_seal_two_with_hack
rules_version: 1.0.1o-FULL
source: https://balatrowiki.org/w/Card_modifiers
phase: playing
pre:
  played: [{id: c1, rank: 2, suit: Clubs, seal: Red}]
  jokers: [Hack]
  hand_level: {High Card: 1}
action: play_c1
expected:
  hand_type: High Card
  scoring_ids: [c1]
  card_trigger_count: 3
  chips: 11
  mult: 1
  score: 11
```

Level-1 High Card contributes base 5; three activations of the 2 add 6. Assert activation count as well as score to distinguish a missing Seal from repeated whole-hand effects.

## Validate in layers

1. **Mechanics:** hand classification, target eligibility, price rounding, timers, retrigger counts, capacity.
2. **Interactions:** within/across-phase ordering, copying, debuff, Eternal, pack use.
3. **Lifecycle:** Blind selection → play/discard → settlement → shop → pack → next Blind; separate skip and win/loss paths.
4. **Simulator replay:** identical seed/actions, snapshot resume, and observations that exclude hidden information.
5. **Live-game comparison:** align version and pre-state, compare observable events, and reduce the first divergence.
6. **Full-run evaluation:** after establishing coverage, measure Gold win rate separately for all 15 decks on seeds excluded from tuning.

For mechanics changes, run relevant regressions and a short smoke before broader experiments. Follow repository AGENTS instructions for Conda and test entrypoints; do not rerun all training for each rule fix.

## Prioritize diagnostic combinations

| Suspected error | Minimal comparison |
| --- | --- |
| Played/scoring conflation | High Card with incidental cards, then add Splash |
| Contains replaced by hand type | Four of a Kind with five cards of one suit; inspect Two Pair predicate |
| Recursive retriggers | Red Seal + Hack, with/without an independent Joker |
| Held activation count | Steel King + Red Seal + Mime + Baron |
| Stale sell price | Existing Joker before/after a discount Voucher |
| Negative-effect conflation | Same rank/suit in normal, debuffed, and face-down states |
| Incorrect capacity precheck | Full-slot Ankh, repeated Blue Seal generation, Negative sale |
| Wrong history scope | Eye resets next Blind; Pillar persists within the Ante |
| Sticker timing | Fifth-round Perishable Cash Out; Rental passive debt |
| Incorrect random eligibility | Ordinary Spectral excludes Soul; undiscovered hidden Planets |

## Use Challenges as targeted coverage cases

Challenges use White Stake and do not establish Gold success. Load starting entities, banned pools, and overrides together. Sources: [Challenge Decks](https://balatrowiki.org/w/Challenge_Decks), [Decks](https://balatrowiki.org/w/Decks). The table identifies validation targets, not complete ban lists.

| Challenge | Main validation target |
| --- | --- |
| The Omelette | Five Eggs; no Blind, unused-hand, or interest income |
| 15 Minute City | Special deck; Eternal Ride the Bus/Shortcut |
| Rich get Richer | Money-constrained chips; $100 start and interest Vouchers |
| On a Knife's Edge | Pinned Eternal Dagger and positional constraints |
| X-ray Vision | Face-down observations; exception to Oops |
| Mad World | 32 cards ranked 2–9; Pareidolia/Business Card; Plant ban; special income |
| Luxury Tax | Base hand size 10, decreasing per $5 |
| Non-Perishable | Forced Eternal setup and destruction/sale-object bans |
| Medusa | Starting face cards become Stone; Marble interaction |
| Double or Nothing | All Red Seal; played cards debuffed after scoring |
| Typecast | Eternal conversion after Ante 4 Boss; Joker slots become 0 |
| Inflation | Permanent price increase per purchase; purchase-event counting |
| Bram Poker | No shop Jokers; external generation is not universally banned |
| Fragile | All Glass; two Eternal Negative Oops; modification/addition-channel bans |
| Monolith | Eternal Obelisk, Negative Marble, run hand history |
| Blast Off | 2 hands, 2 discards, 4 Joker slots; Constellation/Rocket |
| Five-Card Draw | Hand size 5, 6 discards, 7 Joker slots |
| Golden Needle | $1 per discard; 1 hand, 6 discards, $10 start |
| Cruelty | 3 Joker slots; no direct Small/Big reward |
| Jokerless | 0 slots; all Joker-acquisition channels and unsuitable Bosses banned |

Load complete bans, especially Fragile/Jokerless restrictions spanning consumables, Vouchers, packs, Tags, and Boss pools.

## Maintain a coverage ledger

Original template:

```text
rule_id | source_url@revision | target_version | exact/approximate/unknown
case_id | affected_hooks | simulator_result | live_result | first_divergence
```

Use observable ground truth. When the game hides intermediates, first compare visible score, money, levels, and card changes. Label inferred intermediate values as inferences.

For a wrong Blue Seal Planet, inspect the last played hand key, held/non-debuffed eligibility, activations, capacity, and pool, then check for an obsolete random-Planet implementation. Diagnose the mechanism before changing rewards.

## Record evaluation context

Include version, coverage, profile, Deck, Stake, seed set, run count, full-run/early-Ante/simplified scope, training configuration, and checkpoint. Report per-Deck full-run win rates with uncertainty and failure Ante/Boss/money/action categories. Compare random, heuristic, and existing learned baselines under the same rules and seeds.

This skill supplies rules and validation methods. Report actual simulator tests, training, and live-game results independently; none were performed by the source conversion.

Related: [ch01 Lifecycle](ch01-run-lifecycle.md), [ch03 Traces](ch03-scoring-sequence.md), [ch11 Seeds](ch11-rng-reproducibility.md).
