# ch05 Joker Events, Growth, and Copying

## Load the object specification

The Wiki lists 150 Jokers: 61 Common, 64 Uncommon, 20 Rare, and 5 Legendary. Ordinary random rarity is 70%/25%/5%. Legendary Jokers come from The Soul and are excluded from ordinary shop rarity draws. Use [Joker abilities](../references/jokers.md) for concise rules and [objects.md](../references/objects.md) for metadata and article links. Source: [Jokers](https://balatrowiki.org/w/Jokers).

Before implementing an object, read its individual article for copyability, Eternal/Perishable compatibility, generation eligibility, and exceptions. The catalog's `Act` field often describes only its main scoring phase.

## Specify each event hook

This table is engineering guidance for turning source rules into event specifications.

| Event | Examples | Failure to prevent |
| --- | --- | --- |
| Blind selected | Marble Joker, Burglar, Riff-Raff, Madness | Applying Madness growth on Boss selection; it applies only on Small/Big |
| Before scoring / on played | DNA, Green Joker, Space Joker | Delaying growth past this hand's contribution |
| Each scoring card | Hiker, Wee Joker, suit Jokers, Photograph | Triggering on unscored or debuffed incidental cards |
| Held card | Baron, Raised Fist, Shoot the Moon | Collapsing held effects into one independent activation |
| Independent hand | Joker, Card Sharp, The Duo, Supernova | Repeating whole-hand effects for each card retrigger |
| Active discard | Burnt Joker, Trading Card, Mail-In Rebate | Treating played cards leaving the hand as discards |
| Sold / shop rerolled / pack skipped | Luchador, Flash Card, Red Card | Equating sale with destruction or omitting partial-Mega skip growth |
| End round / Cash Out / leave shop | Rocket, Golden Joker, Perkeo | Merging boundaries and changing interest, payouts, or copies |

Record acquisition channels, target set, predicate, event, execution position, mutated fields, reset scope, copyability, Sticker compatibility, destruction protection, generation capacity, and RNG domain. Specify multiple hooks separately.

## Interpret condition words precisely

`When scored` requires membership in the scoring set and eligibility for card abilities. `Contains Pair` is structural; `is Straight Flush` matches canonical hand type. `Full deck` includes all surviving playing cards, including those drawn or played this round. `Remaining deck` refers to the current draw pile. Steel Joker/Stone Joker use full deck; Blue Joker uses remaining draws.

Separate retrospective counters from entity-local growth. Fortune Teller and Throwback can read earlier run history. Constellation and Hologram retain growth accumulated while owned; acquiring them later does not credit all earlier events.

## Resolve Blueprint and Brainstorm

Blueprint targets the adjacent Joker to its right; Brainstorm targets the leftmost Joker. Use the current legal arrangement. Copy eligible abilities, not the target's Edition, Stickers, disabled abilities, passive hand-size/hand-typing changes, or its own growth/destruction. Sources: [Blueprint](https://balatrowiki.org/w/Blueprint), [Brainstorm](https://balatrowiki.org/w/Brainstorm).

Copying a scaling Joker's current scoring contribution does not create a new entity sharing its growth. Burglar's Blind-start effect is copyable, so a blanket rule excluding all hand/discard changes is wrong. Mime's held end-round activations are copyable; this does not establish copyability for Golden Joker's direct Cash Out payout.

Resolve ability chains and execute at the copier's position. Track side-effect ownership so the target does not grow again. Bound cycle resolution explicitly and verify exact failure behavior in the game; these references do not establish a precise maximum for every circular arrangement. Avoid unbounded recursion.

## Preserve special interactions

- **Madness:** Small/Big selection adds +0.5 XMult even if no destruction succeeds. Select another destroyable, non-Eternal Joker; exclude itself but allow another Madness. Source: [Madness](https://balatrowiki.org/w/Madness).
- **Flower Pot:** require four distinct scoring cards assignable to four suits; one Wild fills one suit. Debuffed ordinary suits still participate. Excluding debuffed Wild is marked as a bug. Source: [Flower Pot](https://balatrowiki.org/w/Flower_Pot).
- **Seeing Double:** require an eligible scoring Club and another non-Club card. Its debuff requirements differ from Flower Pot. Smeared's single-black-card exception is a reported bug, not general Wild behavior. Source: [Seeing Double](https://balatrowiki.org/w/Seeing_Double).
- **Raised Fist:** choose the rightmost lowest-rank held card; exclude Stone. A debuffed target gives 0. Red Seal/Mime can retrigger it. See [ch03](ch03-scoring-sequence.md).
- **Photograph / Hanging Chad:** track the first scoring face card and first scoring card respectively. Preserve scoring order. Sources: [Photograph](https://balatrowiki.org/w/Photograph), [Hanging Chad](https://balatrowiki.org/w/Hanging_Chad).
- **Matador:** use a supported Boss's hand-trigger event. Neither a below-target score nor arbitrary Boss activity is sufficient. See [ch07](ch07-blinds-bosses.md) and [Matador](https://balatrowiki.org/w/Matador).

## Reconstructed cases

**Madness:** start at X1 with one other Eternal Joker. Enter Big: Madness reaches X1.5 and the other Joker survives. Enter Boss: no further Madness growth.

**Raised Fist:** hold two 4s, one debuffed and one Red Seal. The rightmost tied card decides the target. Red Seal 4 on the right gives two +8 activations with no other effects; debuffed 4 on the right gives 0. Assert trace target IDs as well as Mult.

**Wee Joker:** begin with chips bonus 0 and score a Red Seal 2. Two card events add +16 to Wee; its independent contribution is then +16. Copying that contribution must not add another +16 to Wee's state.

## Filter generation pools

Filter by unlocks, run conditions, banned objects, and objects already present on screen/in held areas. Showman relaxes ordinary duplicate restrictions; Ankh/Invisible Joker explicitly copy entities. Read special eligibility such as Cavendish's individual rule. Check exhausted-pool fallbacks separately. Source: [Jokers](https://balatrowiki.org/w/Jokers).

Related: [ch03 Event order](ch03-scoring-sequence.md), [ch06 Stickers](ch06-decks-stakes.md), [ch11 Pools and sampling](ch11-rng-reproducibility.md).
