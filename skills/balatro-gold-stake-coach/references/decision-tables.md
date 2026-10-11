# Gold Stake Decision Tables

Use these tables to compare actions against an observed state. The entrypoint contains the execution contract; these tables add strategic detail. Recommendations are conditional heuristics, not measured win-rate claims.

## Shop priorities

| Observed condition | Preferred comparison | Cost or exception |
| --- | --- | --- |
| Next required blind is unsafe | Buy immediate Chips, Mult, XMult, a usable Planet, or an effective consumable | Keep enough cash for any necessary follow-up; speculative growth may not rescue the next round. |
| Damage barely clears on favorable draws | Improve draw consistency, reliable output, or usable hand count | Do not budget random procs as guaranteed damage. |
| Scoring is safe and cash is below an interest breakpoint | Save, or buy an economy engine with a plausible payback window | Green Deck has no interest; immediate core upgrades may outweigh the breakpoint. |
| Additive Mult scales well but late targets outpace output | Compare compatible XMult and retriggers | Card Sharp needs a repeated hand within the round; The Eye and The Needle counter it. |
| Chips are strong but Mult is weak | Compare additive Mult, hand levels, and XMult | An XMult source needs enough existing Mult to multiply. |
| Hand levels already provide useful Chips and Mult | Spend on the missing contribution or consistency | A dedicated Chips Joker is not automatically necessary. |
| A visible Blue Seal is offered in a Standard pack | Compare held access, remaining rounds, cost, and dilution with other choices | Do not assume another seal appears in an unopened pack or future shop. |
| An Eternal Joker is offered | Evaluate permanent slot value and Boss compatibility | An Eternal Rental retains its carrying cost; Verdant Leaf may require another sellable Joker. |
| A Perishable Joker is offered | Buy temporary survival with a replacement horizon | Read its actual timer; debuff does not free its slot or stop Rental charges. |
| A Rental Joker is offered | Estimate immediate benefit minus $3 per completed round | Selling before the fee can reduce cost when legal and when the lost effect is acceptable. |
| Shop has no affordable improvement | Compare one purposeful reroll with keeping the reserve and leaving | Rerolling replaces ordinary stock, not every Voucher and pack. Reassess before rerolling again. |
| Joker/consumable capacity is full | Compare legal sale, immediate use, or leaving the item | Evaluate displaced value and special capacity effects; do not blindly sell a core. |

Assess each serious purchase over three horizons: the next required blind, this Ante's revealed Boss, and the Ante 8 showdown. Use current prices and available information. Future stock is unknown.

## Pair and held-value checklist

Before using Pair as the current play:

1. Compute the remaining target from observed blind Chips and accumulated round Chips. Compare a conservative hand estimate with the remaining hands.
2. Identify which cards score and which remain held. Include forced selection and any card-count requirement.
3. Verify that extra played cards do not change Pair into a higher hand. Pair plus three unrelated cards satisfies The Psychic only if five cards are legal and the intended classification survives.
4. Check what keeping a Blue Seal, Gold card, or Steel card contributes. A Blue Seal requires remaining held through round-end and consumable capacity for its Planet.
5. If seeking Mercury, make the final played hand Pair. A previous Pair does not determine the seal reward when the final hand is different.
6. Check growth conditions: Green Joker loses Mult on discards; Ride the Bus resets on scoring a face card; Square Joker needs exactly four played cards; Supernova depends on that hand's play count.
7. Resolve relevant card order, independent Joker order, and copier targets. Issue a full `rearrange` permutation when order must change, then use its returned indices and revision.
8. If held-value preservation threatens survival, use the necessary card or finish with another hand type.

A high-level Pair engine can be strong without a Chips Joker. Conversely, Blue Seals alone do not supply enough damage for every Boss. Recompute after upgrades, debuffs, replacements, and new targets.

## Choose a scoring engine

| Current support | Candidate plan | What to verify |
| --- | --- | --- |
| Repeatable small hands, scaling Mult, held rewards | Pair or High Card with safe growth | Current damage, Boss restrictions, and enough future scaling. |
| A different hand has strong observed levels | Continue that hand and use Blue Seals to grow it | Access frequency and switching cost; Pair is optional. |
| Straight support and useful deck control | Continue Straight | Discard budget, actual remaining ranks, and Boss constraints. |
| Checkered Deck or strong suit synergy | Flush or a related supported hand | Suit debuffs, deck improvements, and late damage. |
| Photograph, Hanging Chad, or other scoring-card synergy | Align the relevant scoring card and retriggers | Photograph targets the first scoring face card; Hanging Chad targets the first scoring card. The Plant can remove the face-card plan. |
| Steel, Baron, Mime, or other held-card synergy | Retain valuable cards and play a small compatible hand | Held-card debuffs, hand size, draw reliability, and The Hook's risk. |
| Plasma Deck | Improve the contribution with greatest effect after balancing | Final score uses balanced Chips and Mult; ordinary XMult priorities can change. |
| No established engine | Use the strongest legal current hand and buy flexible survival | Avoid paying for a speculative combo with no immediate bridge. |

## Boss preparation

| Boss | Failure to prevent | Preparation and execution |
| --- | --- | --- |
| The Eye | Spending hands on repeated types that cannot score | Track round-local hand history. Plan distinct types or a strong first-hand finish. |
| The Needle | Needing two scoring hands | Seek a single-hand finish with current tools, or an available Boss countermeasure. |
| The Mouth | First hand locks an unreliable type | Choose a type repeatable from actual deck support; retain that commitment. |
| The Psychic | Selecting fewer than five cards or unintentionally changing the hand | Add suitable cards while checking scoring, forced selections, and held-value loss. |
| The Plant / suit debuffs | Counting disabled card effects | Recalculate surviving contributions and alternatives before entering. |
| The Pillar | Relying on key cards already played this Ante | Conserve useful cards earlier when worthwhile; otherwise prepare damage independent of their effects. |
| The Arm | Using the pre-reduction base hand values | Include the reduction in the estimate and consume returned observed values. |
| The Ox | Unexpectedly losing cash needed for the next shop | Read the specified type; compare the cash loss with survival and available alternatives. |
| Violet Vessel | Testing only a normal Boss target | Budget against the actual target and conservative output. |
| Crimson Heart | Treating a core Joker as always active | Inspect the active debuff each hand; retain damage redundancy when practical. |
| Verdant Leaf | Entering without a viable sale when debuffed damage cannot win | Retain a sellable Joker and evaluate its loss. Sale is unnecessary if the debuffed engine already wins. |
| Amber Acorn | Applying the pre-shuffle identity map or assumed order | Treat face-down positions as unknown; use visible effects without fabricating identities. |
| Cerulean Bell | Leaving the forced card out of a required selection | Include it, then check legal card count and final hand classification. |
| The Hook | Assuming valuable held cards survive every play | Account for two random discards; avoid extra hands solely to farm held rewards. |
| The Flint | Overstating the base Chips and Mult | Apply the Boss reduction before evaluating the rest of the scoring sequence. |
| The Wall | Assuming an ordinary Boss target | Use observed target and remaining resources. |

## Estimate without a score-preview tool

Start with observed hand Chips and Mult. Identify the actual scoring subset, then apply known scoring-card contributions, held-card effects, independent Joker effects, and other relevant modifiers in game order. Plasma balances the final values. Add existing round Chips separately from this hand's score.

For a deterministic, ordinary example, base `40 Chips, 4 Mult`, then independent `+4 Mult`, then `X2 Mult` produces `40 * (4 + 4) * 2 = 640`. Reversing those independent effects produces `40 * (4 * 2 + 4) = 480`. This example omits card contributions and is not a prediction for a real hand.

Use a lower-bound or range when Lucky, Glass survival, random Joker targets, or hidden cards affect the calculation. Future hand counts are projections, not guarantees. After playing, compare the observed result with the estimate and revise the model rather than repeating an unsupported number.
