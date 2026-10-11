# ch06 Decks and Cumulative Stakes

## Build the starting state

Base state: 52 standard cards (A–K in each suit), $4, hand size 8, 4 hands/3 discards per round, 5 Joker slots, and 2 consumable slots. Apply Deck differences, then Stake rules, permanent upgrades, active Jokers, and Bosses. Separate starting/permanent parameters from temporary effects. Sources: [Decks](https://balatrowiki.org/w/Decks), [Money](https://balatrowiki.org/w/Money), [Hands](https://balatrowiki.org/w/Hands).

| Deck | Changes |
| --- | --- |
| Red | +1 discard per round |
| Blue | +1 hand per round |
| Yellow | +$10 starting money; total $14 |
| Green | At settlement: $2 per unused hand and $1 per unused discard; no interest |
| Black | +1 Joker slot; -1 hand per round |
| Magic | Start with Crystal Ball and two The Fool cards; include the Voucher's capacity effect |
| Nebula | Start with Telescope; -1 consumable slot |
| Ghost | Shop Spectral category weight 2; start with Hex |
| Abandoned | Remove J/Q/K; 40 cards and no natural face cards |
| Checkered | 26 Spades and 26 Hearts; two of each rank in each suit |
| Zodiac | Start with Tarot Merchant, Planet Merchant, and Overstock |
| Painted | +2 hand size; -1 Joker slot |
| Anaglyph | Receive a Double Tag after each Boss win |
| Plasma | Double all Blind targets; balance final Chips/Mult as in ch03 |
| Erratic | Randomize rank/suit for 52 cards; retain entity IDs and generation RNG state |

Apply starting Vouchers' effects, not just their observation labels. Use each Deck's actual initial size for Erosion; do not hardcode 52. Starting consumables can duplicate: ordinary generation deduplication must not remove Magic's two Fools.

## Apply all eight Stakes cumulatively

| Order | Stake | Added rule |
| --- | --- | --- |
| 1 | White | Base difficulty |
| 2 | Red | No direct Small Blind reward; resolve other normal income |
| 3 | Green | Use the faster Ante-target column |
| 4 | Black | Eligible shop/pack Jokers can be Eternal |
| 5 | Blue | -1 discard per round |
| 6 | Purple | Use the fastest Ante-target column |
| 7 | Orange | Eligible Jokers can be Perishable, with a five-round lifetime |
| 8 | Gold | Eligible Jokers can be Rental: $1 purchase price, -$3 per round |

Higher Stakes include all preceding rules. Source: [Stakes](https://balatrowiki.org/w/Stakes).

Faster target scaling selects another table column; Green and Purple are not repeatedly multiplied factors. Gold uses Purple's column, Blue's discard penalty, all enabled Stickers, and Red's Small reward rule. See [ch07](ch07-blinds-bosses.md).

## Check Sticker eligibility and channels

For ordinary Jokers compatible with both Eternal and Perishable at Orange/Gold, the exclusive categories are 30% Eternal, 30% Perishable, and 40% neither. Rental at Gold is independently 30% and may stack with either category. Thus a fully eligible ordinary Joker is clean with probability `0.4*0.7=0.28`, not `0.7^3`. Do not apply 28% to incompatible objects. Source: [Card modifiers](https://balatrowiki.org/w/Card_modifiers).

Read the individual compatibility lists for the 11 Eternal-incompatible and 18 Perishable-incompatible objects. For Judgement, The Soul, Riff-Raff, and explicit copies, check that acquisition channel's Sticker rules. The ordinary shop/pack model cannot be applied solely because the run is Gold Stake.

Eternal changes selling/destruction legality. Perishable disables abilities. Rental changes prices and can create debt. Model these effects in actions, events, and economy rather than as generic score penalties. Existing Negative capacity normally survives debuff; exceptions are in [version notes](../references/version-notes.md).

## Record profile and unlock policy

Stake unlock progression is Deck-specific: one Deck's White win does not unlock Red for every Deck. Challenges use White Stake. If training uses an all-unlocked profile, record it: object pools, Tag eligibility, Voucher upgrades, and Gold Soul outcomes can depend on profile state. Sources: [Decks](https://balatrowiki.org/w/Decks), [Seed](https://balatrowiki.org/w/Seed).

## Reconstructed cases

**Black + Gold:** 6 Joker slots, 3 hands, 2 discards per round before other effects. Ante 8 Violet Vessel target=`200000*6=1200000`.

**Plasma + Gold:** 4 hands, 2 discards, 5 Joker slots. Ante 8 Violet Vessel target=`200000*6*2=2400000`. Plasma's X2 stacks with the Boss factor and affects every Blind type.

An environment that runs only Small/Big through Ante 8 has not reached the Gold win condition; it must complete the Showdown.

## Verify combinations

Check starting parameters, decks, consumables, Voucher effects, and targets across all 15 Deck × 8 Stake combinations. Preserve any Deck feature that changes mechanics. Exclude historical Orange/Gold rules using [version notes](../references/version-notes.md).

Related: [ch07 Targets](ch07-blinds-bosses.md), [ch08 Green settlement](ch08-shop-economy.md), [ch10 Anaglyph Tags](ch10-packs-tags-vouchers.md).
