# Economy and shop

Cash Out pays Blind reward, $1 per unused hand, applicable Joker/Tag payouts and interest. Green instead pays `2*unused hands+unused discards`, no interest. Red+ removes only Small's direct reward; skips have no settlement. Bones rescue has no direct Blind reward but can pay Investment on Boss.

Interest uses already-held settlement balance: scoring/held Gold income and earlier Rental charges count; later Blind/unused-hand/Golden/Rocket payouts do not. For balance>=5, formula is `interest_amount*min(floor(balance/5),interest_cap/5)` unless disabled. Defaults amount=1, cap=25 ($5 income). Seed/Money Tree caps=50/100 ($10/$20); each To the Moon adds 1 to amount, including at cap. Passive fees can create debt without Credit Card; Credit permits purchases to -$20. Debt alone does not lose. Ox/Wraith clear to zero; Hermit/Economy do not enlarge debt.

Default shop: two ordinary cards, two packs, one Ante Voucher; first shop's first pack normally Normal Buffoon unless banned. Category weights Joker/Tarot/Planet=20/4/4; Magic Trick adds playing card 4, Ghost Spectral 2; Merchant weight=9.6, Tycoon=32. Normalize. Conditional Joker rarity 70/25/5%; no ordinary Legendary.

Reroll replaces ordinary stock only. Paid cost starts $5, +$1 per paid reroll, resets per shop; Surplus/Glut start $3/$1. Chaos grants one free reroll per copy/shop; D6 sets next shop's starting price zero. Packs refresh per shop, ordinary Voucher per Ante; extra Tag Vouchers separate. Overstock can refill added slots.

Base costs: playing $1, Tarot/Planet $3, Spectral $4, Voucher $10, pack $4/$6/$8; Jokers below. Price=`max(1,floor((base+Edition+inflation+.5)*(100-discount)/100))`; Clearance/Liquidation set 25/50% discounts. Then Astronomer cost=0 and Rental=1. Sell=`max(1,floor(current cost/2))+Egg/Gift bonus`. Coupon makes eligible shop purchases free after sell calculation, so free acquisition does not imply zero sell value; use actual prices for collisions.

Buying equips Joker/adds playing card/stores consumable/redeems Voucher/opens pack by type. Buy-and-use immediately resolves a valid consumable. Room, money/credit, targets and phase constrain legality. Sale differs from destruction for Luchador, Diet Cola, Invisible, Campfire and Leaf.

Adapted from Balatro Wiki contributors, snapshot 2026-10-02, version 1.0.1o-FULL. [Sources and CC BY-NC-SA 3.0 license](balatro://rules/sources).
