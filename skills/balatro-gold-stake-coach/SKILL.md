---
name: balatro-gold-stake-coach
description: Play complete Balatro Gold Stake runs with this server's game tools. Use for selecting or skipping blinds, choosing plays and discards, shops, packs, consumables, Joker order, Boss preparation, and reviewing a run from its evidence. Aims for reliable Ante 8 wins and adapts the scoring engine to the observed deck and resources.
---

# Balatro Gold Stake Coach

Win the Ante 8 Boss with the current run. Prefer consistent scoring, sustainable cash flow, and useful growth over endless-mode scores. Pair, Blue Seals, scaling, and XMult are a useful starting plan; choose a different engine when the observed deck, Jokers, hand levels, or Boss support it. Continue an existing run at its actual stake. Do not restart to search for a favorable opening unless the user requests that policy.

Target PC Balatro **1.0.1o-FULL** as exposed by this server's game tools. Read the game's observed values and effects; do not substitute an older guide's numbers. Apply the governing decision protocol and tool schemas throughout play.

## Execute through the game tools

The game tools are `game_health`, `game_observe`, `deck_observe`, `game_start`, `game_action`, and `game_operation`. Read skill files through MCP resources: this skill's references resolve against its URI, so `references/decision-tables.md` is `skill://balatro-gold-stake-coach/references/decision-tables.md`. Read only the reference relevant to the decision. For one named Joker, consumable, Voucher, Tag or Boss, read `balatro://objects/<name>` instead of a catalog file.

- Get gameplay state through tools. Do not wait for screenshots or ask the user to transcribe information that `game_observe` supplies.
- Use `game_start` only at a menu or completed-run screen when starting a run is part of the request. Supply the requested deck and `stake: "GOLD"` for a new Gold run; preserve any requested seed and respect profile unlocks (`profiles` in the menu snapshot). If no deck was requested, choose an unlocked deck deliberately. Never replace an ongoing run or silently lower the stake after a lock error.
- Use `game_action` for every gameplay mutation. There is no score-preview, simulator, shell, browser, file-writing, or reset tool.

### Maintain a usable observation

1. Call `game_observe` on entry, after context loss, or when you no longer hold a complete state. Every tool result is an envelope: `ok: true` contains `value`; `ok: false` contains `code`, `applied`, and `message`.
2. A snapshot holds `rev`, `phase`, `actions`, and a flat `state`. Inspect `ante`, `money`, `blind`, `blinds`, `hands`, the card areas, and the views of the current phase: `round` and `hand` while playing, `cashOut` after a round, `shop`, and `pack`.
3. Send one gameplay mutation at a time with the latest `rev` as `revision`. Consume its result before choosing another mutation. Actions can change positions, prices, slots, targets, and phase.
4. A `game_action` result holds `rev`, `phase`, `actions`, a one-sentence `result`, and only the changed `state` keys. A result with `full: true` replaces your state. Otherwise a present key replaces the old value and an absent key keeps it, except that an object on an object key (such as `hands` or `blinds`) updates only the listed members, with `null` deleting one, and an object such as `{"2":"…"}` on `jokers`, `consumables`, or `hand` replaces only those elements. Phase views the new phase does not use are dropped.
5. After a successful action, use the merged state directly. Observe again only when you need a fresh full snapshot. On `stale_state`, call `game_observe` and reconsider the action.

Card and item lines read `"<i>: <Name> [tags]: <effect>"` with **zero-based** indices. Choose indices from the current area, never from remembered positions. A hidden card reads `"<i>: ?"`, with only `forced` or `selected` tags. Include `forced` cards in selections when required; `selected` alone does not establish an optimal play. `actions` lists phase candidates, and `use`, `sell`, and `rearrange` are omitted but available whenever their area is non-empty, so still check affordability, capacity, target requirements, sale eligibility, and Boss restrictions.

Call `deck_observe` when remaining composition could change a discard or deck-building decision. It gives `"<count>x <card>"` lines with no draw order or action indices. `previewCards` may include uncertain face-down held cards; `uncertainCards` does not identify them. Do not turn that preview into an exact draw probability when membership is uncertain. If its `rev` differs from your latest game result, call `game_observe` before acting.

### Handle pauses and failed actions

- If `notReady` is present, leave the game untouched. Do not probe readiness with repeated calls or try actions, restarts, or another backend. Report the `notReady` reason and wait for the user.
- For an unapplied `invalid_arguments` or `illegal_action`, correct the arguments or choose another legal action. Reobserve if the failure makes your state uncertain. Do not repeat the same rejected request.
- After `uncertain_outcome`, `applied: "unknown"`, or a failure marked `applied: true`, stop automatic mutations and later writes. Never resubmit the effect. Inspect it with `game_operation`; a plausible-looking observation does not prove that retrying is safe or clear the mutation lock.
- On an unavailable or incompatible backend or an unrecoverable failure, stop and report the error. Do not fall back to a test game.
- Stop when `outcome` is present and report it. Start another run or continue endless mode only if already requested by the user.

## Choose the next action

Before each consequential action, identify the immediate threat, the resources that can address it, and the principal cost. Explain the choice briefly, then call the tool. Continue through the next phase without waiting for user approval for ordinary authorized gameplay.

Prioritize:

1. **Survival:** can the current hand and remaining hands reach the displayed target? Can this engine beat the next blind and revealed Boss without an ideal draw or lucky proc?
2. **Upcoming failure:** inspect Perishable timers, Rental charges, Boss restrictions, missing capacity, and dependence on a single card or Joker.
3. **Reliable growth:** take extra scaling, held rewards, or seal value only when the remaining route to victory stays credible. Playing another hand costs potential unused-hand income and may trigger adverse effects.
4. **Economy:** preserve interest and future shop choices when scoring is sufficient. Spend below a savings threshold when it buys needed survival.
5. **Adaptation:** reinforce the strongest available engine. Do not force Pair, Blue Seals, a particular Joker, or a fixed five-slot layout.

Separate observed values, calculated estimates, and unknown outcomes. Read `hands` strings such as `"55x5 Lv4 played 6"` (Chips x Mult, level, plays this run) directly; absence of `Lv` means level 1. Never reconstruct upgraded Chips or Mult from level formulas. Evaluate scoring cards, held effects, independent Jokers, and order separately. Use conservative estimates when random effects or hidden cards matter; do not invent exact scores or win probabilities.

## Phase policy

| Phase | Next-action checks |
| --- | --- |
| `MENU` / completed run | Start only within the requested scope; use `game_start` rather than resetting an ongoing game. |
| `BLIND_SELECT` | Read the offered blind, target, skip Tag, and revealed Boss. Usually select: skipping loses a shop, growth opportunities, and income beyond the direct reward. Skip only for a concrete net benefit. Use `reroll_boss` only when available, affordable, and worth its opportunity cost; inspect the replacement before selecting. |
| `SELECTING_HAND` | Check restrictions and forced selections, identify the actual poker hand and scoring subset, estimate remaining damage, then play, discard, use a consumable, or rearrange. |
| `ROUND_EVAL` | Verify the round result and held rewards; use `cash_out` to reach the shop. Preserve the option to resolve usable consumables when it matters. |
| `SHOP` | Compare immediate scoring, growth, economy, sticker costs, and slots. Buy/use/sell deliberately. Reroll only with a defined need and spending reserve; reassess the new stock each time. Use `next_round` when further spending has less value than keeping cash. |
| `PACK` | Read `pack.items`, their targets, capacity, and remaining `pack.picks`. Choose a useful item or skip; inspect the returned state after each choice. An opened pack's price is already spent. |

### Hands, discards, and order

- Compare the best legal current play with the expected improvement from a discard. Account for remaining discards, draw supply, Green Joker's discard penalty, purple-seal value, and Boss effects. Do not discard solely to chase an ideal hand when the visible hand already offers reliable survival.
- Pair plus extra cards can become Two Pair, Three of a Kind, or another higher hand. Check the actual classification before using it for Blue Seals, Supernova, The Mouth, or The Eye. For Square Joker, exactly four played cards matter; Ride the Bus checks scoring face cards.
- Keep Blue Seals, Gold cards, and Steel cards held when their value exceeds using them. Survival overrides held rewards. Holding a Blue Seal creates a Planet for the **last hand played that round**, subject to capacity; it need not be part of the Pair. Mime and Red Seals can add eligible held activations, with room required for each generated item.
- Use spare consumables when doing so provides value or frees needed round-end capacity. A Planet strengthens its hand and grows Constellation on **use**, not on acquisition. Compare using a held Planet with keeping it for Observatory when applicable.
- For independent Joker effects, generally place additive Mult before XMult. Card-scoring and held effects occur earlier; their optimal order can differ. Blueprint copies the adjacent Joker to its right; Brainstorm copies the leftmost Joker. Check compatibility, debuffs, and the target's current contribution.
- `rearrange` requires a full permutation of one area. Use it when actual positional order matters. The order of indices in a `play` or consumable target list is not a substitute for rearranging the area. For Death, the **left** selected card becomes a copy of the **right** selected card; arrange first, then take target indices from the returned state.

### Shops, stickers, and cash flow

- Buy immediate scoring when the next required blind is unsafe; do not save for interest at the cost of a likely loss. Otherwise compare the cash spent with lost interest, slot occupancy, and remaining rounds of benefit.
- Normal interest is $1 per $5 held, up to $5 without modifiers. Green Deck has no interest. Use actual deck, Voucher, and Joker effects rather than treating $25 as a mandatory reserve. Rental charges occur before interest and can reduce its payout; later settlement rewards do not all enter the interest balance.
- Eternal Jokers cannot be sold or destroyed. Check long-term slot value and Boss consequences before buying. Perishable Jokers debuff after five completed rounds; use the observed remaining timer, including when replacing one late in a run. Skipping does not consume a round of lifetime.
- Rental normally costs $1 up front and $3 each completed round, including while debuffed, and can stack with Eternal or Perishable. Estimate its total carrying cost. An Eternal Rental can become a permanent cash drain.
- Read current prices, sale values (`sell $N`; `eternal` means no sale), capacities, and target ranges. Use `buy_and_use` when legal and preferable to storing. Do not assume a pack choice or Negative edition consumes capacity in the ordinary way.
- Use observable pack choices for deck improvements. Death can copy an existing Blue Seal; it does not create a seal from nothing or add a new physical card. Weigh new cards against dilution and future draw access.

## Build toward Ante 8

**Antes 1–2:** use whichever hand clears efficiently, including Flush or Straight. Obtain enough immediate scoring to reach more shops, then establish cash flow. Evaluate the first Buffoon pack against visible shop stock and its cost. Temporary Jokers can bridge a weak opening; do not make a permanent Eternal purchase merely because it is cheap.

**Antes 3–5:** develop Chips, additive Mult, XMult, and value generation in proportions suited to the engine. Pair levels can supply both base Chips and Mult. Blue Seals plus repeated Pair finishes can support Mercury and Constellation; alternative upgraded hands are equally usable when better supported. Grow Jokers through safe plays, not through a plan that requires an unknown rescue draw.

**Antes 6–8:** compare the next required targets with conservative output. Replace obsolete economy or temporary scoring when the benefit warrants it and sale is legal. Inspect remaining Perishable lifetime and reserve a Boss countermeasure when needed. Use actual Joker capacity: Black, Painted, Negative editions, and Vouchers can change the layout. Do not treat clearing a Small Blind as evidence that the showdown is safe.

Gold uses cumulative stake penalties. Its normal Ante 1–8 base targets are `300, 1000, 3200, 9000, 25000, 60000, 110000, 200000`; these are references before Blind and Deck factors. Use the displayed target for every decision. Plasma changes both targets and final scoring; Green changes settlement economics. Gold's current rules do not impose the old extra hand-size penalty, and Orange does not impose the old rising pack prices.

## Boss checks that change execution

Recheck the active Boss and whether it is disabled before selecting cards or spending for a countermeasure. A costly reroll, Luchador sale, or Chicot effect must actually be available and useful; never assume a counter appears later. Track round-local hand history from tool results for The Eye and The Mouth. Cumulative `played` counts are not round history; when taking over mid-round, do not invent missing earlier plays.

| Boss | Execution adjustment |
| --- | --- |
| The Eye | Track hand types already played this round. Use distinct types; repeated-Pair and Card Sharp plans fail. |
| The Needle | Plan a single winning hand. Do not rely on building damage through several plays. |
| The Mouth | Commit to a repeatable first hand type; later plays must match it. |
| The Psychic | Play exactly five cards while preserving the intended classification. |
| The Plant / suit debuffs | Reassess affected scoring and held effects. An intact Joker does not restore debuffed card abilities. |
| The Pillar | Account for cards played earlier in this Ante; debuffed cards cannot supply their normal contributions. |
| The Arm | Account for the level reduction when the hand scores; inspect returned observed hand values before the next play. |
| The Ox | Identify the displayed triggering hand type. Compare losing cash with the survival cost of avoiding it. |
| Violet Vessel | Use its actual enlarged target, not a normal Boss multiplier. |
| Crimson Heart | Recompute from the currently debuffed Joker each hand; allow for another core being disabled next hand. |
| Verdant Leaf | Reserve a sellable Joker if lifting the debuff is necessary. An all-Eternal lineup cannot supply that sale; inspect the result after selling. |
| Amber Acorn | Jokers flip and shuffle. Use only visible evidence and subsequent effect information; do not retain an exact hidden identity-to-position map. |
| Cerulean Bell | Include the forced card in the required selection; verify hand classification with that card included. |
| The Hook / The Flint / The Wall | Allow for random held-card loss, reduced base hand values, or the increased target respectively. |

For other Bosses, use the supplied game context and observed restrictions. No action is justified by the generic policy if the active restriction prevents it.

## Explain and finish

Before an action, a short statement such as “Play the Queens; this keeps the Blue Seal held and has enough conservative damage to finish” is sufficient. Then send the actual tool call with current indices and rev. Do not present a recommendation as an executed action. Report execution only from its result.

Include useful lessons with concrete evidence in the run review. Keep an inferred cause separate from the observed loss.

On completion or pause, state the observed outcome, furthest observed Ante, main scoring engine, decisive constraint, and any infrastructure failure. Distinguish a completed Ante 8 win from partial progress. Do not claim a measured Gold Stake win rate from a single run or from this skill's strategy.

## Supporting material

- [Decision tables](references/decision-tables.md): read for a difficult shop, engine, or Boss tradeoff.
- [Mechanics and sources](references/mechanics-and-sources.md): read for version or provenance questions; its repository-source links are for maintainers and cannot be read during play.
- [State and decision template](templates/state-input.md): read when reviewing a run or checking tool-call shapes; no user transcription is required during tool-controlled play.
