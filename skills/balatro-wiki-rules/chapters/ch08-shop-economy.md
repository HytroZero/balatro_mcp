# ch08 Shop, Pricing, and Round Economy

## Generate ordinary stock

The default shop has two ordinary card slots, two packs, and one Voucher. The first shop normally guarantees a Normal Buffoon Pack in its first pack slot; check exceptions such as Jokerless. Ordinary category weights are Joker:Tarot:Planet=`20:4:4`. Draw a category, then an eligible object. Joker rarity 70/25/5 is conditional on that category. Source: [The Shop](https://balatrowiki.org/w/The_Shop).

Magic Trick adds Playing Card weight 4; Ghost adds Spectral weight 2. Tarot/Planet Merchant sets its category weight to 9.6, and Tycoon to 32. Renormalize all enabled weights instead of multiplying final probabilities by descriptive 2X/4X labels. Overstock/Plus raises ordinary slots to 3/4.

## Keep reroll and restock boundaries separate

A reroll replaces remaining ordinary stock; it does not restock packs or Vouchers. Base reroll price is $5, increasing $1 after each paid reroll and resetting next shop. Surplus/Glut sets the starting price to 3/1; Chaos grants a free reroll; D6 Tag starts the next shop at 0. Specify how each source consumes free opportunities and affects later prices. Source: [The Shop](https://balatrowiki.org/w/The_Shop).

Packs refresh on entering a new shop. Ordinary Vouchers refresh at the new Ante after Boss. Retain purchased slots, current Voucher eligibility, and extra Voucher Tag slots separately. Buying, rerolling, and leaving fire distinct hooks.

## Compute purchase and sell prices

Base prices: playing card $1, Tarot/Planet $3, Spectral $4, Voucher $10, Normal/Jumbo/Mega pack $4/$6/$8. Read each Joker's base price; Legendary has base value $20 despite exclusion from ordinary shops.

Edition surcharges: Foil +2, Holographic +3, Polychrome +5, Negative +5 where supported. Clearance Sale uses .75; Liquidation sets the final discount to .5 rather than multiplying .75 and .5.

1. Add `base + edition + inflation_extra`.
2. Multiply by the current discount.
3. Apply **round half down** (`8.5→8`), then the ordinary minimum purchase price of 1.
4. Apply special pricing: Rental=1; Astronomer Planet/Celestial=0; Coupon eligible goods=0, excluding Vouchers.

Recompute current purchase cost for selling: `max(1, floor(buy_cost/2)) + sell_value_bonus`. Add Egg/Gift Card bonuses last, outside the discount. Do not permanently cache half the historical amount paid, including for free acquisitions. Check colliding special-price rules in [version notes](../references/version-notes.md). Source: [The Shop — Pricing](https://balatrowiki.org/w/The_Shop#Pricing).

## Fix the interest snapshot

Normal Cash Out includes Blind reward, unused hands, Joker money effects, Investment, and interest. UI display order does not establish the balance used to calculate interest. Source: [Money](https://balatrowiki.org/w/Money).

Compute interest from money already held at round end. Held Gold cards and money earned during scoring can affect it. Cash Out money from Golden Joker/Rocket, Blind reward, and unused hands does not enter this round's interest base. Source: [Interest](https://balatrowiki.org/w/Interest).

Base interest is `min(5, floor(max(balance,0)/5))`. Seed Money/Money Tree raises the base cap to 10/20. To the Moon adds income per $5. Green Deck, Omelette, and Mad World have no interest. Verify multiple To the Moon and cash-event timing against object rules; record money timing in the trace.

Green's unused-resource payout is `2*remaining_hands + remaining_discards`. Red+ removes only direct Small Blind reward; normal remaining-hand and economic effects still apply. Mr. Bones rescue pays no Blind reward, but Investment can still pay for a rescued Boss. Source: [Money](https://balatrowiki.org/w/Money).

## Allow passive debt

Credit Card permits purchases down to -$20. Rental/Tooth can create negative balances without Credit Card; do not clamp passive fees to zero. Wraith/Ox sets money to zero and can clear debt. Hermit/Economy does not enlarge debt. Source: [Money](https://balatrowiki.org/w/Money).

Check purchase legality against money/credit, capacity, item availability, and current modal phase. Negative money alone normally does not end a run.

## Reconstructed calculations

**Discount and bonus.** A base-7 Polychrome Joker with Clearance Sale costs `(7+5)*.75=9`; ordinary sell price is 4. Gift Card bonus 3 raises it to 7. A base-5 uneditioned Joker with 50% discount costs 2.5 before rounding, then 2. Python's default bankers rounding is not a general half-down implementation; 3.5 exposes the difference.

**Interest timing.** Balance 24 plus one held Gold activation gives base 27 and interest 5. Balance 24 with Golden Joker's later +4 still gives interest 4. Assert the phase as well as final money.

## Verify economy boundaries

Cover half-integer prices, free items, minimum sell value, accumulated bonuses, discount upgrades, Rental, Inflation, and Coupon's Voucher exclusion. After purchases and rerolls, ensure packs do not reappear. Check reroll/pack refresh per shop and Voucher refresh per Ante.

Related: [ch04 Editions](ch04-card-modifiers.md), [ch09 Hermit/Wraith](ch09-consumables.md), [ch10 Vouchers/Tags](ch10-packs-tags-vouchers.md).
