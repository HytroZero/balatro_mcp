# Mechanics, Version, and Sources

Prepared on **2026-10-09** for **PC Balatro 1.0.1o-FULL** as exposed by the Balatro MCP game tools. This is a gameplay policy adaptation, not a Gold Stake performance evaluation.

## Authority and availability

During play, use current observations, the tool schemas, and the object/chapter references (or `balatro://rules` for broad review). They determine action indices, prices, current hand values, debuffs, and available effects. A guide cannot override backend legality or expose hidden information.

Read [protocol](balatro://protocol), [state guide](balatro://guide), and [coach](balatro://coach) once before gameplay; read [analysis](balatro://analysis) before first analysis. Rules are available by [topic](balatro://rules), and named objects through `balatro://objects/<name>`. These resources do not authorize gameplay or expose hidden information.

## Historical patch evidence

The official [1.0.1f patch notes](https://store.steampowered.com/news/posts/?enddate=1714581521&feed=steam_community_announcements) document the May 2024 changes: Orange switched from increasing pack costs to Perishable Jokers; Gold switched from reduced hand size to Rental Jokers; Blue Seals switched to the final played hand's Planet. They also changed several Joker values and compatibility rules. This page was checked during this rewrite; the local 1.0.1o source remains the target implementation.

Do not import the pre-patch Orange/Gold penalties or old Joker values from March 2024 guides. For another game version or gameplay mod, use its actual observed effects and report a compatibility limitation when the contract no longer suffices.

## Strategy provenance

The original coaching policy drew on the following community guides. Their recommendations motivate heuristics about economy, small-hand engines, held value, and adaptation; they do not establish that this agent wins at a measured rate. The first guide was opened during this rewrite. The remaining links are preserved as inherited reading references and were not revalidated here.

1. [Guide to hand type strategies in Balatro](https://www.reddit.com/r/balatro/comments/1dk6klk/guide_to_hand_type_strategies_in_balatro/) — comparison of hand types and supporting engines.
2. [Balatro Beginner Bguide](https://steamcommunity.com/sharedfiles/filedetails/?id=3197193231) — economy, stickers, shops, and deck-building guidance.
3. [How to Win Chips and Influence Mult](https://www.reddit.com/r/balatro/comments/1bbh75a/how_to_win_chips_and_influence_mult_a_thorough/) — early scoring framework; predates 1.0.1f.
4. [Guide to Gold Stakes Balatro](https://www.reddit.com/r/balatro/comments/1bbx9vb/guide_to_gold_stakes_balatro/) — early build framework; its historical stake rules require correction.
5. [Blue deck Gold stake](https://www.reddit.com/r/balatro/comments/1pur830/blue_deck_gold_stake/) — discussion of small hands, economy, and seals.
6. [I don't think Blue Seals should be nerfed](https://www.reddit.com/r/balatro/comments/1slz60a/i_dont_think_blue_seals_should_be_nerfed/) — Blue Seal strategy discussion.
7. [How hard is it to beat game on Gold Stake?](https://www.reddit.com/r/balatro/comments/1wa50l9/how_hard_is_it_to_beat_game_on_gold_stake/) — differing views on adaptation and preferred engines.
8. [Any tips for higher stake gameplay](https://www.reddit.com/r/balatro/comments/1v2pkpw/any_tips_for_higher_stake_gameplay_general_good/) — higher-stake economy and sticker discussion.

These are attribution links, not required runtime reads. The rewritten instructions are condensed, independently phrased decision guidance tied to that game version and tool contract.
