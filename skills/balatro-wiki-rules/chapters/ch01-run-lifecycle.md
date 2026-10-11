# ch01 Run Lifecycle

## Model progression boundaries

Treat one entered Blind as one round. An Ante contains Small, Big, and Boss Blinds. A normal run starts at Ante 1 and wins upon completing the Ante 8 Showdown; continuing in Endless is a separate choice. Small and Big can be skipped; Boss must be handled. Skipping creates no combat, Cash Out, or shop for that Blind. Sources: [Blinds and Antes](https://balatrowiki.org/w/Blinds_and_Antes), [Skip](https://balatrowiki.org/w/Skip).

## Define phases and state

Use this table as environment-interface guidance, rather than a Wiki API.

| Phase | Main decisions | State to retain |
| --- | --- | --- |
| Configuration | Deck, Stake, seed, unlock policy | Rules version, profile unlocks, RNG state |
| Blind selection | Enter, skip Small/Big, reroll Boss when allowed | Ante, Blind type, target, Tag, Boss-selection history |
| Playing | Play/discard 1–5 selected cards, reorder, use consumables | Hands, discards, hand, draw pile, accumulated score |
| Round settlement | Resolve held effects, timers, rewards | Last hand type, Joker state, money, pending rewards |
| Shop | Buy, sell, reroll, open pack, use consumable, leave | Ordinary stock, packs, Voucher, reroll price |
| Pack selection | Choose, use consumables, reorder targets, skip | Offers, picks remaining, pack hand, return context |
| Win/loss | End; continue Endless when allowed | Win/loss reason, final Ante |

Expose meaningful decision points. Define animation-time actions separately if the live-game integration supports them.

## Separate playing from discarding

Base resources are 4 hands and 3 discards per round, with hand size 8. Decks, Stakes, Vouchers, Jokers, and Bosses modify them. Ordinary starting hand allowance has a minimum of 1. Playing spends one hand; actively discarding spends one discard regardless of selected-card count. Refilling normally depends on hand size; The Serpent draws exactly 3 after either action. Sources: [Hands](https://balatrowiki.org/w/Hands), [Discards](https://balatrowiki.org/w/Discards), [The Serpent](https://balatrowiki.org/w/The_Serpent).

Retain five collections: current hand, played cards, scoring cards, held cards, and actively discarded cards. Unscored cards included in a play leave the hand without firing discard hooks. When the draw pile is exhausted, do not introduce automatic reshuffling of played cards; resolve exhaustion within the current round's rules.

Pass the Blind once accumulated score reaches the target. Running out of hands below the target normally loses. Mr. Bones can consume itself to rescue a failure at 25% of the target; payout differs from an ordinary win. See [ch08](ch08-shop-economy.md) and [Blinds and Antes](https://balatrowiki.org/w/Blinds_and_Antes).

## Advance skips and counters correctly

- Advance the Blind sequence and award its Tag. The reward may open a pack immediately or wait for a shop or Boss payout.
- Do not award unused-hand money or interest for the skipped Blind.
- Separate run-wide hands played, round-local hand-type history, and Ante-local card history.
- Count completed rounds for Perishable. A skip must not consume its lifetime. Throwback can use earlier run skips even when acquired later. Sources: [Tags](https://balatrowiki.org/w/Tags), [Jokers](https://balatrowiki.org/w/Jokers).

## Reconstructed cases

**Skip with a pending Double Tag.** Start at Ante 1 Small with a Double Tag waiting for the next non-Double Tag. Skip Small and receive an immediate-pack Tag. Resolve copied rewards using [ch10](ch10-packs-tags-vouchers.md), enter pack selection, then return to the advanced Blind selection. Produce no Small Cash Out or shop.

**Five played cards, one scoring card.** Play `A, K, 9, 7, 3` as High Card. Played count is 5, ordinary scoring count is 1, and discard count is 0. Half Joker checks played count. Calling discard hooks on the other four cards incorrectly changes Green Joker, Purple Seal, and Mail-In Rebate.

## Verify the interface

Check legal actions, resource spending, reset scopes, skip/pack return paths, and the exact win point. In Gymnasium, use `terminated` for actual win/loss and `truncated` for external time or step limits. This is interface guidance, not a game reward rule.

Related: [ch02 Hand sets](ch02-poker-hands.md), [ch07 Bosses](ch07-blinds-bosses.md), [ch10 Modal rewards](ch10-packs-tags-vouchers.md), [ch12 Validation](ch12-validation.md).
