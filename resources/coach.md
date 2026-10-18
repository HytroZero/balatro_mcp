# Balatro Gold Stake Coach

Win the Ante 8 Boss with the current run. Prefer consistent scoring, sustainable cash flow, and useful growth over endless-mode scores. Pair, Blue Seals, scaling, and XMult are a useful starting plan; choose a different engine when the observed deck, Jokers, hand levels, or Boss support it. Continue an existing run at its actual stake. Do not restart to search for a favorable opening unless the user requests that policy.

Target PC Balatro **1.0.1o-FULL** as exposed by this server's game tools. Read the game's observed values and effects; do not substitute an older guide's numbers. Read this complete coach once before gameplay: it includes the decision tables, mechanics and sources, and state/review template. Read [the protocol](balatro://protocol) and [the state guide](balatro://guide) once as well; they govern execution, recovery and field interpretation. Read [the analysis reference](balatro://analysis) before first analysis. Do not reload content already available.

## Execute through the game tools

The game tools are `game_health`, `game_observe`, `deck_observe`, `game_start`, `game_action`, `game_operation`, and the read-only `game_analyze`. Read this document at `balatro://coach`. For one named Joker, consumable, Voucher, Tag or Boss, read `balatro://objects/<name>` and its linked rule topic. [The rules directory](balatro://rules) lists broader topics.

- Get gameplay state through tools. Do not wait for screenshots or ask the user to transcribe information that `game_observe` supplies.
- Use `game_start` only at a menu or completed-run screen when starting a run is part of the request. Supply the requested deck and stake (`stake: "GOLD"` for an explicit Gold run), preserve a requested seed, and respect profile unlocks (`profiles` in the menu snapshot). When unspecified, follow the protocol defaults RED/WHITE. Never replace an ongoing run or silently change the deck/stake after a lock error.
- Use `game_start` to start an authorized run and `game_action` for all other gameplay mutations, including when taking over an existing run. `game_analyze` evaluates public-state scoring and draw estimates outside the live game. Base decisions on public game observations and references; keep hidden state, seeds and RNG unknown.

### Maintain a usable observation

1. Start with `game_health` and `game_observe` on entry. Call `game_observe` after context loss or when you no longer hold a complete state. Every tool result is an envelope: `ok: true` contains `value`; `ok: false` contains `code`, `applied`, and `message`.
2. A snapshot holds `rev`, `phase`, `actions`, and a flat `state`. Inspect `ante`, `money`, `blind`, `blinds`, `hands`, the card areas, and the views of the current phase: `round` and `hand` while playing, `cashOut` after a round, `shop`, and `pack`.
3. Send one gameplay mutation at a time with the latest `rev` as `revision`. Consume its result before choosing another mutation. Actions can change positions, prices, slots, targets, and phase.
4. A `game_action` result holds `rev`, `phase`, `actions`, a one-sentence `result`, and only the changed `state` keys. `full: true` replaces the entire snapshot. Otherwise absent keys keep their values, arrays replace completely, and object members merge one level with `null` deleting a member. An index patch such as `{"2":"…"}` on `consumables` or `hand` updates only those elements. `jokers` always replaces the complete ordered array; never patch it by index. Drop phase views unused by the new phase as defined in the guide. A play can also return `effects`: these describe actual triggers, using pre-play indices, and are not persistent state.
5. After a successful action, use the merged state directly. Observe again only when you need a fresh full snapshot. On `stale_state`, call `game_observe` and reconsider the action.

Card and item lines read `"<i>: <Name> [tags]: <effect>"` with **zero-based** indices. Choose indices from the current area, never from remembered positions. A hidden card reads `"<i>: ?"`, with only `forced` or `selected` tags. Include `forced` cards in selections when required; `selected` alone does not establish an optimal play. `actions` lists phase candidates, not proof of eligibility. `use`, `sell`, and `rearrange` may be omitted; inspect the relevant area and check affordability, capacity, target requirements, sale eligibility, and Boss restrictions. Cerulean Bell can also force a card into discard and card-targeted consumable selections.

Call `deck_observe` when remaining composition could change a discard or deck-building decision. It gives `"<count>x <card>"` lines with no draw order or action indices. `previewCards` may include uncertain face-down held cards; `uncertainCards` does not identify them. Do not turn that preview into an exact draw probability when membership is uncertain. If its `rev` differs from your latest game result, call `game_observe` before acting.

### Handle pauses and failed actions

- Never mutate while `notReady`. Follow the protocol's bounded read-only recovery for transient animation, event or initialization waits. For dialogs, unknown or persistent blockers, report the reason and stop. Do not probe with actions, close dialogs, restart or switch backends.
- For an unapplied `invalid_arguments` or `illegal_action`, correct the arguments or choose another legal action. Reobserve if the failure makes your state uncertain. Do not repeat the same rejected request.
- After `uncertain_outcome`, `applied: "unknown"`, or a failure marked `applied: true`, inspect `game_operation` before readiness recovery or further mutations. Never resubmit the effect. `pending` or `timed_out` retains the lock; timeout does not mean rollback. After verified `completed`, obtain a fresh full `game_observe` snapshot to release the correlated client lock and obtain a usable revision. Inspection alone and a plausible-looking game never prove a retry is safe. A handler `failed` keeps a hard lock: report it and follow the protocol; never restart automatically.
- On an unavailable or incompatible backend or an unrecoverable failure, stop and report the error. Do not fall back to a test game.
- Stop when `outcome` is present and report it, even if `notReady` is also present. Starting another run requires a new user instruction. The current protocol stops at the terminal outcome; do not infer permission to continue from the coaching objective.

## Choose the next action

Before each consequential action, identify the immediate threat, the resources that can address it, and the principal cost. Explain the choice briefly, then call the tool. Continue through the next phase without waiting for user approval for ordinary authorized gameplay.

Prioritize:

1. **Survival:** can the current hand and remaining hands reach the displayed target? Can this engine beat the next blind and revealed Boss without an ideal draw or lucky proc?
2. **Upcoming failure:** inspect Perishable timers, Rental charges, Boss restrictions, missing capacity, and dependence on a single card or Joker.
3. **Reliable growth:** take extra scaling, held rewards, or seal value only when the remaining route to victory stays credible. Playing another hand costs potential unused-hand income and may trigger adverse effects.
4. **Economy:** preserve interest and future shop choices when scoring is sufficient. Spend below a savings threshold when it buys needed survival.
5. **Adaptation:** reinforce the strongest available engine. Do not force Pair, Blue Seals, a particular Joker, or a fixed five-slot layout.

Separate observed values, calculated estimates, and unknown outcomes. Read `hands` strings such as `"55x5 Lv4 played 6"` (Chips x Mult, level, plays this run) directly; absence of `Lv` means level 1. Never reconstruct upgraded Chips or Mult from level formulas. Evaluate scoring cards, held effects, independent Jokers, and order separately. Use conservative estimates when random effects or hidden cards matter; do not invent exact scores or win probabilities.

### Analysis and its limits

Use `game_analyze` for consequential uncertainty in survival, discards, order, Bosses or purchases. Refresh when the next decision depends on changed state, rather than after every transition or obvious upgrade. Read `status`, `notes` and `audit` first. Analysis does not issue an action revision or refresh the observation baseline.

- In a hand, compare `plays`, `use` and `order` with the remaining target and resources. `exact/clears` describes scoring under the stated assumptions; legality, forced selections and capacity still need checking. `conditional`, `expected` and interaction approximations are not guaranteed clears. A partial result or search timeout does not establish optimality. Reassess after a real rearrange, use, purchase or draw using the returned state.
- To compare discards, supply 1–4 candidate arrays in `discards` and one target hand in `next`. The returned `rates` estimate forming that exact hand after one discard over 64 public-deck samples. They do not estimate its score or the chance of finishing the blind; zero hits do not prove impossibility. Account for fallback hands, held value and spent resources before choosing the highest rate.
- Outside a blind, use `pace`, `offers`, `horizon`, `economy`, `rewards` and `skip` to compare visible choices. Use `focus:"boss"` for consequential uncertainty about next Ante's possible Bosses. Build clear figures are pace proxies with independent hands, frozen Joker growth and random effects replaced by means. Prefer changes on the same samples over absolute levels.
- `no direct score` is not no value, and an unpriced offer is not a bad offer. Evaluate income, generation, future growth and deck edits separately. A full-slot offer models replacement of one sellable Joker with the lowest current direct-score contribution; check the displaced economy, synergy, copier target and Boss countermeasure yourself.
- Project Perishable expiry, temporary decay, Rental cost and realistically funded growth over the rounds to the Boss. The current-build `horizon` is not a full lifecycle forecast. Use it to close the next Ante's gap early; do not assume a future shop supplies a rescue.

Call `game_analyze` with `revision`, optional `focus`, and the paired `discards`/`next` query when comparing discards. When an alternative is not priced, use observed mechanics and conservative estimates.

## Phase policy

| Phase | Next-action checks |
| --- | --- |
| `MENU` / completed run | Start only within the requested scope; use `game_start` rather than resetting an ongoing game. |
| `BLIND_SELECT` | Read the offered blind, target, skip Tag, and revealed Boss. Usually select: skipping loses a shop, growth opportunities, and income beyond the direct reward. Skip only for a concrete net benefit. Use `reroll_boss` only when available, affordable, and worth its opportunity cost; inspect the replacement before selecting. |
| `SELECTING_HAND` | Check restrictions and forced selections, identify the actual poker hand and scoring subset, estimate remaining damage, then play, discard, use a consumable, or rearrange. |
| `ROUND_EVAL` | Verify the round result and held rewards; use `cash_out` to reach the shop. Preserve the option to resolve usable consumables when it matters. |
| `SHOP` | Compare immediate scoring, growth, economy, sticker costs, and slots. Buy/use/sell deliberately. Reroll only with a defined need and spending reserve; reassess the new stock each time. Use `next_round` when further spending has less value than keeping cash. |
| `PACK` | Read `pack.items`, their targets, capacity, and remaining `pack.picks`. Choose a useful item or skip; inspect the returned state after each choice. An opened pack's price is already spent. |

## Hands, discards, and order

- Compare the best legal current play with the expected improvement from a discard. Account for remaining discards, draw supply, Green Joker's discard penalty, purple-seal value, and Boss effects. Do not discard solely to chase an ideal hand when the visible hand already offers reliable survival.
- Extra unscored cards can cycle weak cards without spending a discard, but do not automatically fill a play to five. Check played-card-count conditions (Half/Square Joker), per-card costs (The Tooth), growth/reset conditions and held rewards. Playing extra cards does not trigger active-discard effects. Pair plus extra cards can become Two Pair, Three of a Kind, or another higher hand. Check the actual classification before using it for Blue Seals, Supernova, The Mouth, or The Eye. For Square Joker, exactly four played cards matter; Ride the Bus checks scoring face cards.
- Keep Blue Seals, Gold cards, and Steel cards held when their value exceeds using them. Survival overrides held rewards. Holding a Blue Seal creates a Planet for the **last hand played that round**, subject to capacity; it need not be part of the Pair. Mime and Red Seals can add eligible held activations, with room required for each generated item.
- Use spare consumables when doing so provides value or frees needed round-end capacity. A Planet strengthens its hand and grows Constellation on **use**, not on acquisition. Compare using a held Planet with keeping it for Observatory when applicable.
- For independent Joker effects, generally place additive Mult before XMult. Card-scoring and held effects occur earlier; their optimal order can differ. Blueprint copies the adjacent Joker to its right; Brainstorm copies the leftmost Joker. Check compatibility, debuffs, and the target's current contribution.
- `rearrange` requires a full permutation of one area. Use it when actual positional order matters. The order of indices in a `play` or consumable target list is not a substitute for rearranging the area. For Death, the **left** selected card becomes a copy of the **right** selected card; arrange first, then take target indices from the returned state.

### Pair and held-value checklist

Before using Pair as the current play:

1. Compute the remaining target as `round.target - round.score`. Compare a conservative hand estimate with `round.hands` and `round.discards` from the latest state.
2. Identify which cards score and which remain held. Include forced selection and any card-count requirement.
3. Verify that extra played cards do not change Pair into a higher hand. Pair plus three unrelated cards satisfies The Psychic only if five cards are legal and the intended classification survives.
4. Check what keeping a Blue Seal, Gold card, or Steel card contributes. A Blue Seal requires remaining held through round-end and consumable capacity for its Planet.
5. If seeking Mercury, make the final played hand Pair. A previous Pair does not determine the seal reward when the final hand is different.
6. Check growth conditions: Green Joker loses Mult on discards; Ride the Bus resets on scoring a face card; Square Joker needs exactly four played cards; Supernova depends on that hand's play count.
7. Resolve relevant card order, independent Joker order, and copier targets. Issue a full `rearrange` permutation when order must change, then use its returned indices and rev.
8. If held-value preservation threatens survival, use the necessary card or finish with another hand type.

A high-level Pair engine can be strong without a Chips Joker. Conversely, Blue Seals alone do not supply enough damage for every Boss. Recompute after upgrades, debuffs, replacements, and new targets.

## Shops, stickers, and cash flow

- Buy immediate scoring when the next required blind is unsafe; do not save for interest at the cost of a likely loss. Otherwise compare the cash spent with lost interest, slot occupancy, and remaining rounds of benefit.
- Normal interest is $1 per $5 held, up to $5 without modifiers. Green Deck has no interest. Use actual deck, Voucher, and Joker effects rather than treating $25 as a mandatory reserve. Rental charges occur before interest and can reduce its payout; later settlement rewards do not all enter the interest balance.
- Eternal Jokers cannot be sold or destroyed. Check long-term slot value and Boss consequences before buying. Perishable Jokers debuff after five completed rounds; use the observed remaining timer, including when replacing one late in a run. Skipping does not consume a round of lifetime.
- Rental normally costs $1 up front and $3 each completed round, including while debuffed, and can stack with Eternal or Perishable. Estimate its total carrying cost. An Eternal Rental can become a permanent cash drain.
- Read current prices, sale values (`sell $N`; `eternal` means no sale), capacities, and target ranges. Use `buy_and_use` only when the item is immediately usable in the current phase, its targets are legal, and immediate use is preferable to storing. Do not assume a pack choice or Negative edition consumes capacity in the ordinary way.
- Use observable pack choices for deck improvements. Death can copy an existing Blue Seal; it does not create a seal from nothing or add a new physical card. Weigh new cards against dilution and future draw access.

### Shop priorities

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

## Build toward Ante 8

**Antes 1–2:** use whichever hand clears efficiently, including Flush or Straight. Obtain enough immediate scoring to reach more shops, then establish cash flow. Evaluate the first Buffoon pack against visible shop stock and its cost. Temporary Jokers can bridge a weak opening; do not make a permanent Eternal purchase merely because it is cheap.

**Antes 3–5:** develop Chips, additive Mult, XMult, and value generation in proportions suited to the engine. Pair levels can supply both base Chips and Mult. Blue Seals plus repeated Pair finishes can support Mercury and Constellation; alternative upgraded hands are equally usable when better supported. Grow Jokers through safe plays, not through a plan that requires an unknown rescue draw.

**Antes 6–8:** compare the next required targets with conservative output. Replace obsolete economy or temporary scoring when the benefit warrants it and sale is legal. Inspect remaining Perishable lifetime and reserve a Boss countermeasure when needed. Use actual Joker capacity: Black, Painted, Negative editions, and Vouchers can change the layout. Do not treat clearing a Small Blind as evidence that the showdown is safe.

Gold uses cumulative stake penalties. Its normal Ante 1–8 base targets are `300, 1000, 3200, 9000, 25000, 60000, 110000, 200000`; these are references before Blind and Deck factors. Use the displayed target for every decision. Plasma changes both targets and final scoring; Green changes settlement economics. Gold's current rules do not impose the old extra hand-size penalty, and Orange does not impose the old rising pack prices.

## Boss checks that change execution

Recheck the active Boss and whether it is disabled before selecting cards or spending for a countermeasure. A costly reroll, Luchador sale, or Chicot effect must actually be available and useful; never assume a counter appears later. Track round-local hand history from `round.played` and the dynamic Boss restriction for The Eye and The Mouth. The `hands` entries contain cumulative run-wide `played` counts, not round history; when taking over mid-round, do not invent missing earlier plays. Before entering, identify a compatible scoring line, conservative damage and an available countermeasure if the core effect is restricted. Recheck any Boss limitation named as unmodelled in analysis.

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
| Amber Acorn | Applying the pre-shuffle identity map or assumed order | Treat face-down positions as unknown; observed effects can support labelled hypotheses, not an invented exact identity map. |
| Cerulean Bell | Leaving the forced card out of a required selection | Include it in plays, discards and card-targeted consumable selections when required; check card count, target limits and final hand classification. |
| The Hook | Assuming valuable held cards survive every play | Account for two random discards; avoid extra hands solely to farm held rewards. |
| The Flint | Overstating the base Chips and Mult | Apply the Boss reduction before evaluating the rest of the scoring sequence. |
| The Wall | Assuming an ordinary Boss target | Use observed target and remaining resources. |
| The Tooth | Spending cash on unnecessary played cards | Include the $1-per-played-card cost; prefer fewer cards or stronger finishes when they preserve survival and the next shop budget. |

For other Bosses, use the supplied game context and observed restrictions. No action is justified by the generic policy if the active restriction prevents it.

## Estimate when analysis is unavailable or incomplete

Start with observed hand Chips and Mult. Identify the actual scoring subset, then apply known scoring-card contributions, held-card effects, independent Joker effects, and other relevant modifiers in game order. Plasma balances the final values. Add existing round Chips separately from this hand's score.

For a deterministic, ordinary example, base `40 Chips, 4 Mult`, then independent `+4 Mult`, then `X2 Mult` produces `40 * (4 + 4) * 2 = 640`. Reversing those independent effects produces `40 * (4 * 2 + 4) = 480`. This example omits card contributions and is not a prediction for a real hand.

Use a lower-bound or range when Lucky, Glass survival, random Joker targets, or hidden cards affect the calculation. Future hand counts are projections, not guarantees. After playing, compare the observed result with the estimate and revise the model rather than repeating an unsupported number.

## Explain and finish

Before an action, a short statement such as “Play the Queens; this keeps the Blue Seal held and has enough conservative damage to finish” is sufficient. Then send the actual tool call with current indices and rev. Do not present a recommendation as an executed action. Report execution only from its result.

Include useful lessons with concrete evidence in the run review. Keep an inferred cause separate from the observed loss.

On completion or pause, state the observed outcome, furthest observed Ante, main scoring engine, decisive constraint, and any infrastructure failure. Distinguish a completed Ante 8 win from partial progress. Do not claim a measured Gold Stake win rate from a single run or from this coaching policy.

## State and decision note template

Use this optional outline to structure a decision or a run review in your response. Populate it from tool observations. Do not ask the user to fill it out during tool-controlled play, and do not substitute a note for a fresh observation after context loss or stale state.

```text
Provenance: setup (deck, stake; seed only if supplied by the user or revealed after outcome)
Baseline: latest rev, phase, Ante, current blind, notReady, outcome
Threat: remaining target, hands/discards, active Boss restriction
Engine: actual hand Chips/Mult, ordered visible Jokers, growth and debuffs
Resources: cash, credit, observed slots, consumables, held-value cards
Upcoming risk: revealed Boss, Perishable timers, Rental cost, required sale
Unknowns: hidden identities, draw order, random effects, unseen stock
Decision: one current legal action with current area indices
Reason: conservative survival benefit and main opportunity cost
Result: the result sentence, new rev, changed resources
Next check: condition that would change the plan
```

Keep useful notes in the response. Do not retell unchanged inventory before every action.

### Exact tool-call shapes

These are syntax examples, not a plan to run unchanged. Replace every index and `<rev>` with values from the latest result. Complete each mutation and consume its returned state before constructing the next call.

Observe with `game_observe`:

```json
{}
```

Start a requested Blue Deck Gold Stake run from an eligible menu/result screen with `game_start`:

```json
{"deck":"BLUE","stake":"GOLD"}
```

Play current hand indices 1 and 4 with `game_action`:

```json
{"revision":"<rev>","action":{"method":"play","cards":[1,4]}}
```

Reorder an area containing exactly three Jokers, putting the old index 2 first:

```json
{"revision":"<rev>","action":{"method":"rearrange","jokers":[2,0,1]}}
```

Buy the current shop card at index 0:

```json
{"revision":"<rev>","action":{"method":"buy","card":0}}
```

Use the current consumable at index 0 on hand indices 2 and 5:

```json
{"revision":"<rev>","action":{"method":"use","consumable":0,"cards":[2,5]}}
```

Choose current pack item 1 and target hand index 3 when that item requires one target:

```json
{"revision":"<rev>","action":{"method":"pack","card":1,"targets":[3]}}
```

Skip the current pack when none of its remaining options is worth taking:

```json
{"revision":"<rev>","action":{"method":"skip"}}
```

For target-dependent actions, read the item's requirements first. Death requires two targets in the intended physical left/right order; reorder the hand first if necessary. Target selection does not reveal hidden identities or bypass forced-selection rules.

Analyse the current hand or build with `game_analyze`:

```json
{"revision":"<rev>"}
```

Request next Ante Boss comparisons outside a blind with `game_analyze`:

```json
{"revision":"<rev>","focus":"boss"}
```

Compare two independent single-discard strategies for forming Pair with `game_analyze`:

```json
{"revision":"<rev>","discards":[[0,1,3],[1,3]],"next":"pair"}
```

Use the returned `rates` only as draw estimates; execute a chosen discard separately with current indices and revision:

```json
{"revision":"<rev>","action":{"method":"discard","cards":[1,3]}}
```

### Useful decision checks

- With $14 and a Rental Constellation versus a normal Blue Joker, compare current Chips/Mult, expected Planet **use**, next target, slots, and rental carrying cost before buying either.
- With high-level Pair, two held Blue Seals, and Card Sharp against The Eye, plan distinct hand types or a first-hand finish; do not repeat Pair to seek Mercury.
- At Ante 7, inspect actual hand values, Joker order, revealed Boss, sale options, and Perishable timers before replacing an economy slot.

## Mechanics, version, and sources

This coaching policy targets **PC Balatro 1.0.1o-FULL** and the server's public game tools. Its recommendations are conditional heuristics, not a measured Gold Stake performance evaluation.

### Authority and availability

During play, current observations, tool schemas, [the protocol](balatro://protocol), [the state guide](balatro://guide), [analysis](balatro://analysis), and the object/topic references determine action indices, legality, prices, hand values, debuffs and available effects. A guide cannot override the backend or expose hidden information. This server exposes public game tools and direct resources; coach content is all in this document.

The following repository paths identify evidence for maintainers, not additional runtime reads or tools for the gameplay agent:

| Current source | Evidence to inspect |
| --- | --- |
| `env/contract.ts`, `tools/index.ts`, `src/server.ts` | Seven-tool loadout, exact action shapes, indices, envelopes and operation recovery. |
| `env/compact.ts`, `resources/guide.md` | Observation v3, changed-key results, complete Joker replacement, hand values and deck previews. |
| `play/mod/game.lua`, `play/mod/decision.lua`, `play/mod/score_snapshot.lua` | Visible state, full permutations, targets, forced selection and hidden-information filtering. |
| `env/analysis/`, `resources/analysis.md` | Public-state scoring, discard estimates, build sampling, supported effects and limitations. |
| `resources/rules/`, `resources/objects.json` | Versioned rule topics and named-object metadata. |
| `src/context.ts`, `src/resources.ts` | Short bootstrap, explicit direct-resource registration and on-demand Markdown reads. |

For implementation evidence, the local scoring sandbox uses the original 1.0.1o scoring code when prepared. The original `game.lua`, `card.lua`, `blind.lua`, `functions/state_events.lua` and `functions/misc_functions.lua` establish Deck/Stake definitions, hand increments, Joker effects, seal generation, sticker timing, consumables, Bosses, scoring phases, settlement and targets. Availability in an exported package is separate from gameplay access: never inspect private live state or game RNG to choose an action.

### Mechanics that affect this policy

- Gold includes lower-stake penalties: no direct Small Blind reward, faster target scaling, fewer discards, and eligible Joker stickers. It does not remove all Small Blind income or automatically forbid playing it.
- Base Gold targets for Antes 1–8 are `300, 1000, 3200, 9000, 25000, 60000, 110000, 200000`. Blind and Deck factors can change them; current observed targets govern.
- Eternal prevents sale/destruction. Perishable and Eternal are mutually exclusive in ordinary sticker generation; Rental can stack with either. Creation and copying channels have their own rules.
- Perishable normally starts with five completed rounds of lifetime. Use its observed remaining tally; at zero its abilities are debuffed. The round-end timer step precedes some settlement payouts, so five rounds of lifetime does not guarantee five payments from a settlement-income Joker.
- Rental normally costs $1 to buy and charges $3 each completed round, even while debuffed. The charge can create debt and reduces the balance available for interest.
- Blue Seals held at round-end create the Planet for the last hand played that round, subject to consumable space and pending reservations. Mime and Red Seals can repeat eligible held effects. A Blue Seal can support any suitable hand type.
- Mercury raises Pair by one level. Its ordinary increment is +15 base Chips and +1 base Mult, but the agent must use observed `hands` values for decisions instead of deriving them from level.
- Playing, scoring, holding, and actively discarding are different events. Extra unscored cards in a play do not become discarded cards.
- Joker order matters within the relevant activation phase. Card effects, held effects, independent Joker effects, Observatory, and Plasma are distinct steps; a blanket “all +Mult before all XMult” rule is insufficient.
- The displayed consumable capacity, Joker capacity, prices, sticker tally, and debuff status take precedence over ordinary defaults.

### Historical patch evidence

The official [1.0.1f patch notes](https://store.steampowered.com/news/posts/?enddate=1714581521&feed=steam_community_announcements) document the May 2024 changes: Orange switched from increasing pack costs to Perishable Jokers; Gold switched from reduced hand size to Rental Jokers; Blue Seals switched to the final played hand's Planet. They also changed several Joker values and compatibility rules. The original source notes record that this page was checked during the earlier rewrite; it was not revalidated during this integration. The local 1.0.1o implementation remains the target.

Do not import the pre-patch Orange/Gold penalties or old Joker values from March 2024 guides. For another game version or gameplay mod, use its actual observed effects and report a compatibility limitation when the contract no longer suffices.

### Strategy provenance

The following community guides inform heuristics about economy, small-hand engines, held value, and adaptation. They are attribution references, not runtime instructions or evidence of this agent's win rate. Their links have not been revalidated for this version of the policy.

1. [Guide to hand type strategies in Balatro](https://www.reddit.com/r/balatro/comments/1dk6klk/guide_to_hand_type_strategies_in_balatro/) — comparison of hand types and supporting engines.
2. [Balatro Beginner Bguide](https://steamcommunity.com/sharedfiles/filedetails/?id=3197193231) — economy, stickers, shops, and deck-building guidance.
3. [How to Win Chips and Influence Mult](https://www.reddit.com/r/balatro/comments/1bbh75a/how_to_win_chips_and_influence_mult_a_thorough/) — early scoring framework; predates 1.0.1f.
4. [Guide to Gold Stakes Balatro](https://www.reddit.com/r/balatro/comments/1bbx9vb/guide_to_gold_stakes_balatro/) — early build framework; its historical stake rules require correction.
5. [Blue deck Gold stake](https://www.reddit.com/r/balatro/comments/1pur830/blue_deck_gold_stake/) — discussion of small hands, economy, and seals.
6. [I don't think Blue Seals should be nerfed](https://www.reddit.com/r/balatro/comments/1slz60a/i_dont_think_blue_seals_should_be_nerfed/) — Blue Seal strategy discussion.
7. [How hard is it to beat game on Gold Stake?](https://www.reddit.com/r/balatro/comments/1wa50l9/how_hard_is_it_to_beat_game_on_gold_stake/) — differing views on adaptation and preferred engines.
8. [Any tips for higher stake gameplay](https://www.reddit.com/r/balatro/comments/1v2pkpw/any_tips_for_higher_stake_gameplay_general_good/) — higher-stake economy and sticker discussion.

These are attribution links, not required runtime reads. The coaching guidance is independently phrased and tied to that game version and the current tool contract.
