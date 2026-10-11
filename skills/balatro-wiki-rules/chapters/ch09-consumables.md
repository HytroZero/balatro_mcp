# ch09 Consumables, Targets, and State Changes

## Separate storage, immediate use, and capacity

Base consumable capacity is 2; Crystal Ball adds 1. Ordinary purchases store items. Buy-and-use resolves immediately and requires valid current targets. Playing-card consumables cannot freely modify the full deck in an ordinary shop without a target hand. Arcana/Spectral packs deal a target hand and use offers immediately; do not store every pack offer by default. Sources: [Consumables](https://balatrowiki.org/w/Consumables), [Booster Packs](https://balatrowiki.org/w/Booster_Packs).

Check room per generation event. Define the action boundary for releasing the used item's slot, removing Negative capacity, and reserving pending spawns. Keep `can_use` separate from execution. For “up to N,” support fewer than N valid targets without assuming zero-target use is legal.

## Resolve all 22 Tarot cards

| Tarot | Ability and targets |
| --- | --- |
| The Fool | Create the last-used non-Fool Tarot/Planet type; do not inherit Negative; Spectral is excluded from this memory |
| The Magician | Enhance up to two cards to Lucky |
| The High Priestess | Create up to two random Planets, subject to room |
| The Empress | Enhance up to two to Mult |
| The Emperor | Create up to two random Tarot cards |
| The Hierophant | Enhance up to two to Bonus |
| The Lovers | Enhance one to Wild |
| The Chariot | Enhance one to Steel |
| Justice | Enhance one to Glass |
| The Hermit | Add money equal to positive balance, capped at $20 gained; do not enlarge debt |
| The Wheel of Fortune | Listed 1/4 chance to give an eligible Base Joker Foil/Holographic/Polychrome |
| Strength | Increase rank of up to two cards; K→A and A→2 |
| The Hanged Man | Destroy up to two cards |
| Death | Select exactly two; transform the left card's properties into the right card's |
| Temperance | Gain the sum of current Joker sell values, capped at $50 |
| The Devil | Enhance one to Gold |
| The Tower | Enhance one to Stone |
| The Star | Convert up to three suits to Diamonds |
| The Moon | Convert up to three suits to Clubs |
| The Sun | Convert up to three suits to Hearts |
| Judgement | Create an eligible random Joker; require room |
| The World | Convert up to three suits to Spades |

Source: [Tarot cards](https://balatrowiki.org/w/Tarot_cards). Load individual entries for exact target-count legality and filtering.

Fool cannot copy itself. After Fool is the latest relevant use, another Tarot/Planet must be used before Fool becomes usable again. Store both the last relevant key and availability; Spectral use must not overwrite this memory. Source: [The Fool](https://balatrowiki.org/w/The_Fool).

Death copies rank, suit, Enhancement, Edition, Seal, and permanent chip bonuses. Retain the transformed entity's identity and position/forced-selection semantics; do not make it share the source object's reference. Handle copied/recomputed debuffs by cause. Sources: [Death](https://balatrowiki.org/w/Death), [Card modifiers](https://balatrowiki.org/w/Card_modifiers).

## Resolve Planets

The 12 Planets map to 12 canonical hand keys and increase their hand by one level per use; values are in [ch02](ch02-poker-hands.md). Planet use can grow Constellation; holding a Planet cannot. Observatory's held matching Planet multiplier does not consume it.

Ordinary Planet X/Ceres/Eris eligibility requires playing the corresponding hidden hand this run. Black Hole is Spectral but upgrades all 12 hand keys, including undiscovered ones. Source: [Planet cards](https://balatrowiki.org/w/Planet_cards).

## Resolve all 18 Spectral cards

| Spectral | Ability |
| --- | --- |
| Familiar | Destroy one random held card; add three random enhanced face cards |
| Grim | Destroy one random held card; add two random enhanced Aces |
| Incantation | Destroy one random held card; add four random enhanced numbered cards |
| Talisman | Add Gold Seal to one card |
| Aura | Give one eligible card Foil/Holographic/Polychrome |
| Wraith | Create a Rare Joker; set money to 0, including debt |
| Sigil | Convert the whole hand to one random suit |
| Ouija | Convert the whole hand to one random rank; -1 hand size |
| Ectoplasm | Give a random eligible Base Joker Negative; escalating hand-size cost |
| Immolate | Destroy five random held cards; +$20; check low-card eligibility separately |
| Ankh | Copy a random Joker; destroy other destroyable Jokers; remove Negative from the copy |
| Deja Vu | Add Red Seal to one card |
| Hex | Give an eligible random Joker Polychrome; destroy other destroyable Jokers |
| Trance | Add Blue Seal to one card |
| Medium | Add Purple Seal to one card |
| Cryptid | Add two complete playing-card copies of one selected card |
| The Soul | Create a Legendary Joker; require room |
| Black Hole | Increase all hand levels by 1 |

Source: [Spectral cards](https://balatrowiki.org/w/Spectral_cards). Familiar/Grim/Incantation add new entities, not replacements sharing destroyed IDs. Emit deck-size and growth events accurately.

The Soul/Black Hole use special 0.3% generation per eligible pack card slot. Soul can appear in Arcana/Spectral; Black Hole in Celestial/Spectral. Ordinary random Spectral generation and Ghost shops do not use the same eligibility. Check replacement and duplicate rules in [ch11](ch11-rng-reproducibility.md). Source: [The Soul](https://balatrowiki.org/w/The_Soul).

## Preserve copying and cost exceptions

Ectoplasm's nth use reduces hand size by n; the first three uses cost 6 total. Select only Base Edition Jokers; it is unusable if all already have Editions. Applying Negative after debuff has a reported capacity bug. Source: [Ectoplasm](https://balatrowiki.org/w/Ectoplasm).

Ankh selects a random target and leaves other Eternal Jokers intact. Its copy preserves growth, Edition except Negative, and Stickers. The Wiki reports that full Joker slots prevent use; future destruction does not make the precondition automatically valid. Source: [Ankh](https://balatrowiki.org/w/Ankh).

For Hex, combine target Edition eligibility with Eternal protection rather than clearing the entire Joker list. Source: [Hex](https://balatrowiki.org/w/Hex).

## Reconstructed cases and checks

**Death:** left card is 2♣; right is Red Seal/Polychrome/Glass King with 15 Hiker chips. Transform the left into the same properties, including 15 bonus chips; preserve both distinct IDs and leave the right unchanged. Transformation is not adding a playing card.

**Ectoplasm:** start at hand size 8 with no other changes. Three successful uses give 7, 5, then 2. Recompute eligible candidates each time; do not subtract 1 three times.

**Wraith:** money -8 becomes 0 on successful use.

Verify targets before/after, deck count, identity, capacity, last-used memory, growth hooks, and debuff causes. Test insufficient targets, absent eligible Jokers, and full capacity. Avoid partially committed actions that consume the item without completing its effect.

Related: [ch02 Planets](ch02-poker-hands.md), [ch04 Property layers](ch04-card-modifiers.md), [ch10 Pack targets](ch10-packs-tags-vouchers.md).
