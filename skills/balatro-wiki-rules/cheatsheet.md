# Diagnostic Cheatsheet

| Symptom | Check first | Next step |
| --- | --- | --- |
| Score too high | Scoring IDs and activation count | Remove incidental cards, recursive retriggers, or repeated independent effects |
| Unexpected hand type | Canonical key versus contains | Check priority, levels, and different Four Fingers subsets |
| Joker swap changes nothing | Actual event phase | Order +Mult/XMult within the phase where each executes |
| Copy grows too quickly | Growth owner | Copy current contribution without mutating the target again |
| One Wild triggers Flower Pot | Distinct suit assignments | Require four distinct scoring cards; retriggers add no entities |
| Gold difficulty too low | Cumulative rules | Check Purple targets, Blue discard, compatible Stickers, Red Small reward |
| Excess fifth-round income | Perishable expiration | Expire after winning and before Cash Out |
| Ectoplasm costs too little | Run use count | First three costs sum to 1+2+3=6 |
| Interest too high | Round-end balance snapshot | Exclude later Cash Out rewards and Golden Joker money |
| Sell value stays stale | Current discount, minimum, bonus | Recompute instead of caching historical purchase cost |
| Reroll restores packs | Separate ordinary stock | Rerolls do not restock packs/Voucher |
| Wrong Blue Seal Planet | Last played canonical hand | Use matching Planet, not the old random rule |
| Shop appears after skip | Skip transition | No skipped Blind Cash Out/shop |
| Serpent hand too small | Fixed draw of 3 | Permit exceeding ordinary hand size |
| Pillar debuffs wrong cards | Identity and copied Ante marker | Avoid rank/suit-wide bans; preserve gameplay history |
| Seed replay diverges | Version/profile/RNG domains | Separate simulator replay from live-game PRNG parity |
| Every probability doubles | Listed-probability eligibility | Exclude rarity, Editions, Soul, and other unsupported rates |
| Unclear test scope | Preconditions → event → post-state | Use ch12; add minimal mechanics checks and relevant smoke |

Numerical routes: [hands](chapters/ch02-poker-hands.md), [15 Decks/8 Stakes](chapters/ch06-decks-stakes.md), [Ante/Boss](chapters/ch07-blinds-bosses.md), [prices/interest](chapters/ch08-shop-economy.md), [22 Tarot/18 Spectral](chapters/ch09-consumables.md), [packs/24 Tags/32 Vouchers](chapters/ch10-packs-tags-vouchers.md).

Find an object with `python scripts/lookup.py "Object Name"`.
