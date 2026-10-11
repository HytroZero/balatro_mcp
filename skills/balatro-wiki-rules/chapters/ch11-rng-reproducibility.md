# ch11 Probability, RNG Domains, and Seed Reproducibility

## Distinguish three claims

1. **Correct distribution:** category weights, rarity, Editions, Stickers, and special pack replacements follow the rules.
2. **Simulator reproducibility:** the same configuration, seed, and actions produce identical states/events.
3. **Live-game seed parity:** domains, queues, call order, and PRNG match the target game.

Validate each claim independently. The Wiki's [Seed](https://balatrowiki.org/w/Seed) page explicitly lacks technical pool/queue details. `random.Random(seed)` can establish simulator reproducibility without establishing live-game parity.

## Record seed and configuration

Manual seeds accept 0–8 uppercase alphanumeric characters; input 0 becomes O. Automatic seeds have eight characters and exclude O/0. Character generation is not fully uniform: letter and number groups have different probabilities. Exact live PRNG implementation still requires target-version code or traces.

Record Deck, Stake, version, profile unlocks, and Gold collection Stickers alongside the seed. The first Soul result at Gold can depend on Legendary Jokers missing Gold Stickers. A different profile with the same seed is not necessarily identical ground truth. Source: [Seed](https://balatrowiki.org/w/Seed).

Actions change random calls. Skips, rerolls, pack types, and random card activations can consume different domains. Establish domain/call behavior rather than assuming one global stream faithfully reproduces the game.

## Apply listed-probability modifiers selectively

Oops! All 6s doubles supported listed probabilities: Lucky, Glass, Bloodstone, Business Card, Hallucination, Reserved Parking, 8 Ball, Space Joker, Gros Michel, Cavendish, Wheel of Fortune, Boss The Wheel, and related supported effects. Multiple Oops compound; 2/2 guarantees success. Sources: [Listed probability](https://balatrowiki.org/w/Listed_probability), [Oops! All 6s](https://balatrowiki.org/w/Oops!_All_6s).

Do not double all random rates. Shop rarity, Soul appearance, Editions, and Stickers are separate. The Wiki explicitly excludes X-ray Vision's 1/4 face-down rate. Suggested specification field: `probability_kind`, with modifiers scoped to supported kinds.

## Roll Lucky twice per activation

Independently check 1/5 for +20 Mult and 1/15 for +$20. Both can succeed, and retriggers consume fresh checks. Without modifiers, the listed probabilities imply:

- Expected added Mult: `20/5=4`.
- Expected money: `20/15=4/3`.
- Dual-success probability: `1/5*1/15=1/75`.

These are mathematical derivations. [Lucky cards](https://balatrowiki.org/w/Lucky_cards) Usage notes instead reports $1 expected cash; with one Oops it reports $3, while the listed probability implies $8/3. Retain the inconsistency and use explicit probabilities, game evidence, and independent statistics when resolving it.

Lucky Cat grows once by +0.25 X if at least one check succeeds in that activation; dual success still grows once. Its generation pool requires a Lucky card in the current deck. Source: [Lucky Cat](https://balatrowiki.org/w/Lucky_Cat).

## Expose generation pools

Ordinary shop generation conceptually selects category, eligible object/rarity, then modifiers; verify the exact random call order separately. Ordinary Spectral pools exclude Soul/Black Hole, which use special .3% pack logic.

Distinguish ordinary deduplication, Showman, Telescope guarantees, explicit Ankh copies, Challenge bans, hidden-Planet discovery, and fallback objects. Emit candidate counts and exclusion reasons for diagnosis. See [ch05](ch05-jokers.md), [ch09](ch09-consumables.md), and [ch10](ch10-packs-tags-vouchers.md).

## Design replay diagnostics

Engineering guidance: save initial configuration, seed, full RNG state, action list, and step snapshots. Trace domain/draw indices using diagnostic labels such as `shop_type, joker_rarity, pack_arcana, lucky_mult, lucky_money, boss_select`. These labels are proposed instrumentation, not proven game PRNG keys.

Resume from a snapshot and execute the remaining actions. Require identical states/traces to uninterrupted execution. Compare new Wiki revisions explicitly; do not silently change old experiments when fetching current pages.

## Verify controlled outcomes before statistics

Inject all four Lucky success/failure pairs and assert `(Mult delta, money delta)` of `(0,0)`, `(+20,0)`, `(0,+20)`, and `(+20,+20)`. With Red Seal, require a fresh pair of draws rather than reused results.

Use held-out seeds and predefined confidence ranges for statistical checks. One hundred draws without a .3% Soul occurrence is not sufficient evidence of a bug. Controlled sampling boundaries and legal pools test mechanisms; statistics detect systematic distribution errors.

Related: [ch04 Probability effects](ch04-card-modifiers.md), [ch08 Weights](ch08-shop-economy.md), [ch12 Evidence](ch12-validation.md).
