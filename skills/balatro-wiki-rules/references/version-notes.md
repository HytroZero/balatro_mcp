# Version Changes, Source Conflicts, and Open Questions

Snapshot: 2026-10-02. Homepage label: 1.0.1o-FULL / Friends of Jimbo 4. Separate current rules from page history and demo behavior.

## Recorded historical changes

| Item | Adopted current rule | Historical rule |
| --- | --- | --- |
| Orange Stake | 30% Perishable on eligible Jokers | Before 1.0.1f: pack prices increased with Ante |
| Gold Stake | 30% Rental on eligible Jokers | Before 1.0.1f: -1 hand size |
| Blue Seal | Planet matching the round's last played hand | Before 1.0.1f: random Planet |
| The Arm | Minimum hand level 1 | Early versions could reduce to 0 |
| Hanging Chad | Two extra activations of the first scoring card | Changed in the 1.0.1f update |
| Vampire | +0.1 XMult per scoring Enhanced card | Different earlier value/target predicate |
| Investment Tag | +$25 after Boss | Before 1.0.1f: +$15 |
| Edition / rarity Tags | Applicable Joker is free | Earlier versions provided the Joker/Edition without free pricing |

Sources: [Update 1.0.1f](https://balatrowiki.org/w/Update_1.0.1f), [Update 1.0.1o](https://balatrowiki.org/w/Update_1.0.1o), [Blue Seal](https://balatrowiki.org/w/Blue_Seal), [Poker hands](https://balatrowiki.org/w/Poker_hands). Check individual articles for changes beyond this table.

## Preserve reported bugs and source limitations

- [Illusion](https://balatrowiki.org/w/Vouchers): snapshot shop playing cards have no Seals and ignore Hone/Glow Up. Record whether implementing faithful or corrected behavior.
- [Ectoplasm](https://balatrowiki.org/w/Ectoplasm) / [Negative Effects](https://balatrowiki.org/w/Negative_Effects): adding Negative to an already-debuffed Joker fails to add capacity, but selling it reduces capacity. Record any intentional correction.
- [Flower Pot](https://balatrowiki.org/w/Flower_Pot): debuffed ordinary suits count, but debuffed Wild exclusion is marked as a bug.
- [Seeing Double](https://balatrowiki.org/w/Seeing_Double): Smeared can let one black card satisfy Club/non-Club. Do not generalize to Wild.
- [Glass cards](https://balatrowiki.org/w/Glass_cards): Glass Joker fails to grow when Glass is destroyed by some Spectral effects such as Immolate, while some other destruction channels do grow it. Preserve channel-specific behavior.
- [Seed](https://balatrowiki.org/w/Seed): technical random-pool/queue details are incomplete. Verify exact PRNG against code or traces.
- [Booster Packs](https://balatrowiki.org/w/Booster_Packs): removing every target card inside Arcana/Spectral can softlock. Document an environment's intentional avoidance of this bug.

## Resolve the Lucky arithmetic conflict

[Lucky cards](https://balatrowiki.org/w/Lucky_cards) lists 1/15 for $20, implying expected cash $4/3; Usage notes says $1. With one Oops, 2/15 implies $8/3 while the page says $3. Chapters use the listed probabilities and label expectations as derivations. Do not use those rounded source expectations as exact measured results.

## Investigate unresolved boundaries on demand

- Blueprint/Brainstorm cycles, resolution limits, and animation-time reordering.
- Animation-timed Ankh/Negative capacity anomalies.
- Exact priority when special pricing sources collide, such as Rental/free Tags.
- Concurrent cash events, multiple To the Moon, and Perishable/Rental ordering.
- Complete Challenge ban lists and special acquisition/copy eligibility of objects without individual-article review.
- Platform/version differences, mods, and very large Endless values.

Mark affected implementation coverage `unknown` or `approximate` until checked. When new evidence resolves a boundary, update the source revision and regression case. The conversion did not perform live-game validation.
