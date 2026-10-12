# Mechanics, Version, and Sources

Prepared on **2026-10-09** for **PC Balatro 1.0.1o-FULL** as exposed by the Balatro MCP game tools. This is a gameplay policy adaptation, not a Gold Stake performance evaluation.

## Authority and availability

During play, use current observations, the tool schemas, and the supplied game context (`balatro://rules`). They determine action indices, prices, current hand values, debuffs, and available effects. A guide cannot override backend legality or expose hidden information.

The gameplay agent has no shell, file-writing, or repository-reading tool. It reads skill files, including this one, as `skill://` MCP resources limited to the discovered gameplay skill directories. The source paths below are maintenance references outside those directories, not instructions to fetch them during a run.

| Local source | Evidence to inspect |
| --- | --- |
| [Action contract](../../../env/contract.ts), [game tools](../../../tools/index.ts) and [MCP server](../../../src/server.ts) | Tool loadout, exact action shapes, indices, result envelopes, and memory scope. |
| [Compact state](../../../env/compact.ts) | Full snapshots, changed-key results, hand values, and grouped deck preview. |
| [Game bindings](../../../play/mod/game.lua) | Visible state, full rearrangement permutations, targets, forced selection, and hidden-card filtering. |
| [Supplied game context](../../../model/context/balatro.md) | Source-backed rules already provided to the model. |

For mechanics, compare against the original 1.0.1o game Lua, which this package does not include: `game.lua` (Deck/Stake definitions, hand-level increments, Joker effects, sticker compatibility), `card.lua` (Blue Seal round-end generation, Mime, Rental charges, Perishable timers, consumables), `blind.lua` (Boss restrictions, debuffs, disabling), `functions/state_events.lua` (scoring phases, final hand type, round-end sequencing, settlement), and `functions/misc_functions.lua` (Purple/Gold Ante targets).

The [prompt loader](../../../model/prompt.ts) combines `model/context/balatro.md` and `skills/core.md`; the server publishes them as `balatro://rules`, `balatro://protocol`, and, with the skill catalog, `balatro://context`. [Skill discovery](../../../src/context.ts) runs Pi's loader on the gameplay skill tree only; ambient coding skills remain excluded.

## Mechanics that affect this policy

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

## Historical patch evidence

The official [1.0.1f patch notes](https://store.steampowered.com/news/posts/?enddate=1714581521&feed=steam_community_announcements) document the May 2024 changes: Orange switched from increasing pack costs to Perishable Jokers; Gold switched from reduced hand size to Rental Jokers; Blue Seals switched to the final played hand's Planet. They also changed several Joker values and compatibility rules. This page was checked during this rewrite; the local 1.0.1o source remains the target implementation.

Do not import the pre-patch Orange/Gold penalties or old Joker values from March 2024 guides. For another game version or gameplay mod, use its actual observed effects and report a compatibility limitation when the contract no longer suffices.

## Strategy provenance

The original coaching skill drew on the following community guides. Their recommendations motivate heuristics about economy, small-hand engines, held value, and adaptation; they do not establish that this agent wins at a measured rate. The first guide was opened during this rewrite. The remaining links are preserved as inherited reading references and were not revalidated here.

1. [Guide to hand type strategies in Balatro](https://www.reddit.com/r/balatro/comments/1dk6klk/guide_to_hand_type_strategies_in_balatro/) — comparison of hand types and supporting engines.
2. [Balatro Beginner Bguide](https://steamcommunity.com/sharedfiles/filedetails/?id=3197193231) — economy, stickers, shops, and deck-building guidance.
3. [How to Win Chips and Influence Mult](https://www.reddit.com/r/balatro/comments/1bbh75a/how_to_win_chips_and_influence_mult_a_thorough/) — early scoring framework; predates 1.0.1f.
4. [Guide to Gold Stakes Balatro](https://www.reddit.com/r/balatro/comments/1bbx9vb/guide_to_gold_stakes_balatro/) — early build framework; its historical stake rules require correction.
5. [Blue deck Gold stake](https://www.reddit.com/r/balatro/comments/1pur830/blue_deck_gold_stake/) — discussion of small hands, economy, and seals.
6. [I don't think Blue Seals should be nerfed](https://www.reddit.com/r/balatro/comments/1slz60a/i_dont_think_blue_seals_should_be_nerfed/) — Blue Seal strategy discussion.
7. [How hard is it to beat game on Gold Stake?](https://www.reddit.com/r/balatro/comments/1wa50l9/how_hard_is_it_to_beat_game_on_gold_stake/) — differing views on adaptation and preferred engines.
8. [Any tips for higher stake gameplay](https://www.reddit.com/r/balatro/comments/1v2pkpw/any_tips_for_higher_stake_gameplay_general_good/) — higher-stake economy and sticker discussion.

These are attribution links, not required runtime reads. The rewritten instructions are condensed, independently phrased decision guidance tied to that game version and tool contract.
