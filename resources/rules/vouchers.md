# All Vouchers

Normally $10 each; upgrade requires profile unlock plus base redeemed this run. Redeemed Vouchers do not normally recur, unbought ones can; empty pool falls back to Blank.

| Base -> Upgrade (32 Vouchers) | Effects |
| --- | --- |
| Overstock -> Overstock Plus | Ordinary stock capacity 2->3->4 |
| Clearance Sale -> Liquidation | Final discount 25%->50% |
| Hone -> Glow Up | Set Edition rate parameter 2->4; Negative uses its own threshold |
| Reroll Surplus -> Reroll Glut | Base reroll $5->$3->$1 |
| Crystal Ball -> Omen Globe | +1 consumable slot; 20% Arcana Spectral replacement |
| Telescope -> Observatory | Guarantee most-played Planet; held matching Planet gives X1.5 each |
| Grabber -> Nacho Tong | Each adds one hand per round |
| Wasteful -> Recyclomancy | Each adds one discard per round |
| Tarot Merchant -> Tarot Tycoon | Tarot shop weight 4->9.6->32 |
| Planet Merchant -> Planet Tycoon | Planet shop weight 4->9.6->32 |
| Seed Money -> Money Tree | Interest threshold cap $25->$50->$100; base payout $5->$10->$20 |
| Blank -> Antimatter | Blank no run effect; Antimatter +1 Joker slot |
| Magic Trick -> Illusion | Shop playing-card weight 4; shop card modifier distribution changes |
| Hieroglyph -> Petroglyph | Each -1 Ante; base -1 hand per round, upgrade -1 discard per round |
| Director's Cut -> Retcon | Boss reroll once per Ante -> unlimited; each costs $10 |
| Paint Brush -> Palette | Each adds one hand size |

Edition poll thresholds in order: Negative >`1-.003*mod`; Polychrome >`1-.006*edition_rate*mod`; Holo >`1-.02*edition_rate*mod`; Foil >`1-.04*edition_rate*mod`. Defaults: .3% Negative, .3% Poly, 1.4% Holo, 2% Foil, 96% Base; disabling Negative leaves its interval to Poly. Hone/Glow do not multiply all final probabilities. Guaranteed Aura/Wheel polling is a separate no-Negative distribution.

Illusion shop cards: 40% Enhanced, Edition 3% Poly/7% Holo/10% Foil/80% Base; no Seals, ignoring Hone/Glow. This source behavior differs from nominal wording.

Adapted from Balatro Wiki contributors, snapshot 2026-10-02, version 1.0.1o-FULL. [Sources and CC BY-NC-SA 3.0 license](balatro://rules/sources).
