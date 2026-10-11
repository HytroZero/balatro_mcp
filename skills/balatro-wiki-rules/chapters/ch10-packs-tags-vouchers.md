# ch10 Packs, Delayed Tags, and Permanent Vouchers

## Generate packs and enter selection

| Category | Normal offers/picks | Jumbo offers/picks | Mega offers/picks | Normal/Jumbo/Mega weights |
| --- | --- | --- | --- | --- |
| Arcana | 3/1 | 5/1 | 5/2 | 4 / 2 / .5 |
| Celestial | 3/1 | 5/1 | 5/2 | 4 / 2 / .5 |
| Standard | 3/1 | 5/1 | 5/2 | 4 / 2 / .5 |
| Buffoon | 2/1 | 4/1 | 4/2 | 1.2 / .6 / .15 |
| Spectral | 2/1 | 4/1 | 4/2 | .6 / .3 / .07 |

Base prices are 4/6/8. Despite “up to” wording, the Wiki says offers normally generate at full count; fewer picks or immediate skip are allowed. Apply weights to individual pack variants rather than drawing five categories and three sizes uniformly. Source: [Booster Packs](https://balatrowiki.org/w/Booster_Packs).

Buying opens the pack immediately. Save the return-shop context. Arcana/Spectral deals a target hand at current hand size, uses offers immediately, and permits existing consumables. Standard adds cards to deck; Buffoon adds Jokers; Celestial uses Planets. Commit Mega picks sequentially because the first can change targets/capacity for the second.

Selecting one Mega offer then skipping still grows Red Card by +3. Telescope guarantees the most-played hand's Planet even if already held; break ties toward higher hand priority. Source: [Telescope](https://balatrowiki.org/w/Telescope).

## Resolve all 24 Tags by event

Grouped rows cover each named Tag.

| Tag | Event and effect |
| --- | --- |
| Uncommon / Rare | Generate a free Joker of that rarity in a later shop |
| Negative / Foil / Holographic / Polychrome | Make the next eligible Base shop Joker free and apply the Edition |
| Investment | +$25 at Boss settlement |
| Voucher | Add one Voucher in the next shop |
| Boss | Reroll the current Boss |
| Standard / Charm / Meteor / Buffoon | Open a free corresponding Mega pack |
| Ethereal | Open a free Spectral Pack, not a default Mega |
| Handy | $1 per hand played this run |
| Garbage | $1 per earlier unused discard this run |
| Coupon | Free initial ordinary stock and packs in the next shop; exclude Vouchers |
| Double | Copy the next selected non-Double Tag |
| Juggle | +3 hand size next round |
| D6 | Next shop starts with reroll price 0 |
| Top-up | Create up to two Common Jokers when there is room |
| Speed | $5 per run skip |
| Orbital | +3 levels to the specified hand |
| Economy | Add money equal to positive balance, capped at $40 gained |

Retain acquisition order and consumption conditions. Older Tags resolve first, regardless of reverse display order. Double cannot copy Double. Consume each applicable entity when a non-Double reward resolves; do not permanently double every future reward. Source: [Tags](https://balatrowiki.org/w/Tags).

Ante 1 excludes Negative, Standard, Meteor, Buffoon, Handy, Garbage, Ethereal, Top-up, and Orbital. Rare and some Edition Tags depend on profile discovery. Record an all-unlocked policy explicitly.

## Resolve all 32 Vouchers in 16 pairs

Each normally costs $10. An unlocked upgrade can appear after its base was bought this run. Normally each Voucher is redeemed once per run; unbought Vouchers can reappear later. Exhausted pools can fall back to Blank. Source: [Vouchers](https://balatrowiki.org/w/Vouchers).

| Base → Upgrade | Effects |
| --- | --- |
| Overstock → Overstock Plus | Ordinary shop slots 2→3→4; refill added empty slots on purchase |
| Clearance Sale → Liquidation | Final discount .75→.5; update current sell values |
| Hone → Glow Up | Increase Edition rates; Negative does not scale identically, and Joker Polychrome is not a simple 2X/4X |
| Reroll Surplus → Reroll Glut | Starting reroll cost 5→3→1 |
| Crystal Ball → Omen Globe | +1 consumable slot; 20% Spectral replacement per Arcana offer |
| Telescope → Observatory | Guarantee most-played Planet; each held matching Planet gives X1.5 |
| Grabber → Nacho Tong | Each adds +1 permanent hand per round |
| Wasteful → Recyclomancy | Each adds +1 permanent discard per round |
| Tarot Merchant → Tarot Tycoon | Tarot category weight 4→9.6→32 |
| Planet Merchant → Planet Tycoon | Planet category weight 4→9.6→32 |
| Seed Money → Money Tree | Base interest cap 5→10→20 |
| Blank → Antimatter | Blank has no current effect; Antimatter adds one Joker slot |
| Magic Trick → Illusion | Enable shop playing cards; alter their modifier distribution |
| Hieroglyph → Petroglyph | Each reduces Ante by 1; base costs one hand per round, upgrade one discard |
| Director's Cut → Retcon | One Boss reroll per Ante → unlimited; $10 each |
| Paint Brush → Palette | Each adds +1 hand size |

Use the Edition probability tables linked from [ch04](ch04-card-modifiers.md); do not reconstruct every rate from descriptive multipliers. In the 1.0.1o snapshot, the Wiki marks Illusion behavior as a bug: shop cards have no Seal, ignore Hone/Glow Up, and use 40% Enhancement/20% Edition rates. Preserve this version distinction instead of substituting the nominal “may have Seals” description.

## Reconstructed cases

**Mega Arcana:** offers Death and The Hermit. Use Death, update target cards, and decrement remaining picks from 2 to 1. Hermit then reads current money, not the opening balance. If the remaining pick is skipped, apply Red Card growth. Return to the same shop with purchase/reroll state retained.

**Observatory:** play Pair with two held Mercury and one Pluto. After independent Jokers, multiply Mult by `1.5^2=2.25`. Do not consume Planets or grow Constellation. Source: [Observatory](https://balatrowiki.org/w/Observatory).

## Verify reward timing and persistence

Test immediate, next-shop, next-round, and Boss-payout Tags. Test Voucher permanence, upgrade prerequisites, unbought reappearance, and Ante refresh. Keep profile discovery separate from this run's redemption history.

Related: [ch01 Phases](ch01-run-lifecycle.md), [ch08 Stock and prices](ch08-shop-economy.md), [ch11 Generation pools](ch11-rng-reproducibility.md).
