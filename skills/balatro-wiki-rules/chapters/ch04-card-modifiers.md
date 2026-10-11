# ch04 Card Modifiers, Stickers, and Negative Effects

## Represent modifier layers separately

A playing card can have one Enhancement, one Edition, and one Seal simultaneously. A Joker can have one Edition and compatible in-run Stickers. Perkeo can create Negative consumables. Vouchers and packs do not carry these modifiers. A new Enhancement or Seal replaces the old one; Edition and Sticker assignment follow their own eligibility rules. Source: [Card modifiers](https://balatrowiki.org/w/Card_modifiers).

Suggested fields: `rank, suit, enhancement, edition, seal, permanent_bonus_chips, debuff_causes, face_down, forced_selected, card_id`. Store Joker timers, growth, and Stickers separately. Debuffing must retain original values.

## Resolve Enhancements

| Enhancement | State/event | Rule |
| --- | --- | --- |
| Bonus | Scoring | +30 Chips |
| Mult | Scoring | +4 Mult |
| Wild | Suit query | Matches any suit; suit Bosses can debuff it |
| Glass | Scoring / post-scoring break | X2 Mult per activation; one 1/4 break check after the full hand scores, unaffected by retrigger count |
| Steel | Held during hand resolution | X1.5 Mult |
| Stone | Scoring | +50 Chips; no effective rank/suit; can join an ordinary hand's scoring set |
| Gold | Held at round end | +$3 |
| Lucky | Scoring | Independent checks: 1/5 for +20 Mult and 1/15 for +$20 |

Glass retriggers repeat X2 without additional break rolls. Debuffed Glass gives no X2 and does not break. The Wiki also reports Glass Joker failing to grow for some Spectral destruction channels; see [version notes](../references/version-notes.md). Source: [Glass cards](https://balatrowiki.org/w/Glass_cards).

Lucky's checks can both succeed. Lucky Cat grows once for that card activation, even on dual success, rather than twice by +0.25 X. Sources: [Lucky cards](https://balatrowiki.org/w/Lucky_cards), [Lucky Cat](https://balatrowiki.org/w/Lucky_Cat).

## Resolve Seals

| Seal | Event | Rule |
| --- | --- | --- |
| Gold | Played and scoring | +$3; scoring retriggers repeat it |
| Red | Eligible card ability | +1 retrigger, added to Joker contributions |
| Blue | Held at round end | Create the Planet for the round's last played hand; check consumable room on every activation |
| Purple | Active discard | Create a Tarot if there is room |

Blue Seal creates the matching Planet, rather than a random one in this version. Mime can create additional activations. Check capacity at each generation event, not once before the batch. Sources: [Blue Seal](https://balatrowiki.org/w/Blue_Seal), [Mime](https://balatrowiki.org/w/Mime).

## Resolve Editions and capacity

Base has no added ability. Foil gives +50 Chips, Holographic +10 Mult, and Polychrome X1.5 Mult. Negative adds one slot to the relevant Joker/consumable area. Playing cards cannot be Negative. Card and Joker Editions resolve in different positions; see [ch03](ch03-scoring-sequence.md).

Bind Negative capacity changes to entity entry/exit. Ankh and Invisible Joker remove Negative from their copies. For complete playing-card property copies by DNA/Cryptid/Death, see [ch09](ch09-consumables.md).

## Apply Stickers

- **Eternal:** cannot be sold or destroyed. Eleven normally self-destructing or sale-triggered Jokers are incompatible; load the [Eternal](https://balatrowiki.org/w/Eternal) list.
- **Perishable:** permanently debuffed after five completed rounds; mutually exclusive with Eternal. Eighteen non-retroactive scaling Jokers are incompatible; load [Perishable](https://balatrowiki.org/w/Perishable). It expires after the fifth win and before Cash Out, so Golden Joker pays only in the first four rounds.
- **Rental:** purchase price $1 and -$3 each round; can stack with Eternal or Perishable. Passive fees may create debt regardless of purchase-credit permission. Source: [Rental](https://balatrowiki.org/w/Rental).
- **Stake Sticker:** collection win-history marker; no corresponding in-run effect.

Ordinary eligible Jokers have 30% Eternal, 30% Perishable, and 30% Rental rates where enabled. Do not model these as three independent Bernoulli variables: Eternal/Perishable are exclusive and compatibility matters. See [ch06](ch06-decks-stakes.md).

## Separate debuff, visibility, and forced selection

Debuffed ordinary cards retain basic rank/suit and can form hands. They provide no base/permanent card chips, modifiers, or most card-dependent Joker triggers. Stone remains rankless/suitless; Wild loses its any-suit ability. Keep debuffed cards in hand recognition. Source: [Negative Effects](https://balatrowiki.org/w/Negative_Effects).

A debuffed Joker's own abilities and Edition are normally disabled, but Abstract Joker, Swashbuckler, Temperance, and Baseball Card can still count it as a held entity. Existing Negative capacity normally remains. Applying Negative after debuff has a Wiki-reported capacity bug; preserve the version distinction.

Face-down changes observation and previews, not true hand classification or chips. Forced selection constrains actions. Recompute debuffs by cause after rank, suit, or Enhancement changes; Pillar has special recovery behavior in [ch07](ch07-blinds-bosses.md).

## Reconstructed cases

**Capacity per activation.** Hold a Blue Seal King with Mime; the last hand is Pair. With one empty consumable slot, create one Mercury, then reject the second generation for lack of room. With two slots, create two.

**Structure survives debuff.** Play three debuffed 7s. The hand is still Three of a Kind with level-1 base `30*3`; card chips are 0. Zany Joker can use the hand structure. Disabled per-card on-scored effects must not contribute.

Related: [ch02 Recognition](ch02-poker-hands.md), [ch03 Ordering](ch03-scoring-sequence.md), [ch06 Stakes](ch06-decks-stakes.md), [ch09 Mutation and copying](ch09-consumables.md).
