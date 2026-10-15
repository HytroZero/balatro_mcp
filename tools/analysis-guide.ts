/** Served on demand as balatro://analysis. */
export const analysisGuide = `# Balatro analysis reference

Read once before using \`game_analyze\`. Execution legality and call cadence are governed by \`balatro://protocol\`. Analysis is read-only: it neither executes hypothetical actions nor issues a revision or updates the observation baseline.

Hand and build briefs carry \`status\` (\`complete\`, \`partial\` or \`unavailable\`); read their \`notes\` and \`audit\` first. A partial result or order-search deadline does not establish optimality. Discard queries return only \`rates\` (see below). The tool needs LuaJIT and its configured scoring engine; if unavailable, the other game tools still work.

## Hand output

The tool scores selections with the original scoring code in a separate process. \`rev\`, \`phase\` and \`focus:"hand"\` identify the input.

| Field | Meaning |
| --- | --- |
| \`need\` | Missing chips, hands and discards |
| \`plays\` | Best listed selection per poker hand, plus held-reward or Joker-growth alternatives |
| \`use\` | A held Planet or targeted Tarot that improves the best scored play |
| \`order\` | A full hand/Joker permutation that improves the score |
| \`notes\` | Assumptions, omitted work and approximations |
| \`audit\` | Previous exact predictions compared with actual plays |

Rows read \`"0 2 4: Pair 500 exact; clears; …"\`. Facts can identify held/played seals, Gold rewards, Joker growth/reset or how many extra cards preserve the score. They do not identify which extra cards are harmless: check hand classification and the scoring subset.

- \`exact\` is deterministic scoring from visible state under the analyzed assumptions. \`clears\` means that score reaches the target; execution constraints still apply.
- \`conditional\` depends on a stated assumption, such as unknown held cards ignored, Hook discards ignored or exact labels suspended after an audit mismatch. It says \`reaches the target\` rather than promising a clear.
- \`expected\` substitutes random effects with their public-probability means in one evaluation. For example Misprint adds 11.5 by default, and a chance p of Xk becomes X(1+p*(k-1)). Fractional scores are retained until final rounding. A mean reaching the target is not a guaranteed clear.
- \`interaction approximation\` marks nonlinear/correlated effects such as Space Joker, Lucky Cat, Bootstraps or Plasma. It is not an exact outcome-distribution expectation. Missing expected-effect rules make analysis unavailable; obtain the rule rather than inventing a formula.

No run seed, RNG stream, hidden identity or draw order is used or returned. Expected rows never enter exact-play audits.

## Order and audit

For real execution, send one action at a time and consume its returned state. An \`order\` row gives the positions to play after that real rearrange.

\`audit\` compares exact predictions with chips actually gained by a play at the same revision. A mismatch downgrades later deterministic rows to conditional. Discard queries publish no predictions.

## Discard hit rates

While selecting a hand, supply \`discards\` and \`next\` together: 1-4 arrays of 1-5 unique hand indices from the current observation, each an independent single-discard strategy, and one target poker hand shared by all of them.

Example: \`{"revision":"<rev>","discards":[[0,1,3],[1,3]],"next":"straight"}\` returns \`{"rates":[0.375,0.5]}\` (illustrative): hits / 64 for each strategy, in input order.

Each strategy removes its cards, keeps the rest and refills by hand size and draw rules (Serpent included) from the public remaining deck, never the real draw order. A sample hits when any legal selection from the refilled hand is classified as the target; it need not be the best play. Matching is by exact hand name, so a hand that only forms a stronger hand containing the target may not count: a straight flush alone is not a straight. Four Fingers, Shortcut, Smeared, Wild/Stone cards and Boss hand restrictions apply. Rates are 64-sample estimates; zero hits do not prove zero probability.

Targets: \`high_card\`, \`pair\`, \`two_pair\`, \`three_of_a_kind\`, \`straight\`, \`flush\`, \`full_house\`, \`four_of_a_kind\`, \`straight_flush\`, \`five_of_a_kind\`, \`flush_house\`, \`flush_five\`.

An error replaces all rates: \`invalid_arguments\` for a malformed query (missing card, too many cards, \`discards\` without \`next\`); \`illegal_action\` when no discard decision is available (other phase, not ready, no discards or hands left); \`backend_failure\` for an unsupported position (face-down held cards, Cerulean Bell, Crimson Heart with Four Fingers/Shortcut/Smeared) or an engine failure, named in the message; \`stale_state\` when the game changed during analysis.

## Build output

In SHOP, PACK and BLIND_SELECT, the default analysis samples 32 fixed shuffles of the public deck, never the run's draw order. Each independent hand chooses from hand size plus up to 5 drawn cards; Joker growth is frozen and random effects use their means. The clear figure is a pace proxy, not a chance-aware win probability. Compare changes on identical shuffles more than absolute levels.

| Field | Meaning |
| --- | --- |
| \`pace\` | Target, hands, required score per hand, median/p75, clear proxy and modeled Boss restriction |
| \`jokers\` | Score loss when a Joker is removed, stickers or no direct score |
| \`offers\` | Priced shop/pack/held-Planet changes, per-hand impact, displaced Joker and interest change |
| \`horizon\` | Next Ante's targets and growth required |
| \`economy\` | Interest breakpoints and spending reserve |
| \`rewards\` / \`skip\` | Blind income and skip tradeoffs |
| \`bosses\` | With \`focus:"boss"\`, next Ante's possible Bosses, weakest first |

\`notes\` lists unpriced offers, including deck-targeted Tarots, Spectrals, added cards and other unsupported effects. Boss sampling and broader searches can take several seconds. Recompute only when the decision depends on changed state.
`;
