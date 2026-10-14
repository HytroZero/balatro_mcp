/** Served on demand as balatro://analysis. */
export const analysisGuide = `# Balatro analysis reference

Read once before using \`game_analyze\`. Execution legality and call cadence are governed by \`balatro://protocol\`. Analysis is read-only: it neither executes hypothetical actions nor issues a revision or updates the observation baseline.

Read \`notes\` and \`audit\` first. \`status\` is \`complete\`, \`partial\` or \`unavailable\`; a partial result or order-search deadline does not establish optimality. The tool needs LuaJIT and prepared original scoring source; if unavailable, the other game tools still work.

## Hand output

The tool scores selections with the original scoring code in a separate process. \`rev\`, \`phase\` and \`focus:"hand"\` identify the input.

| Field | Meaning |
| --- | --- |
| \`need\` | Missing chips, hands and discards |
| \`plays\` | Best listed selection per poker hand, plus held-reward or Joker-growth alternatives |
| \`use\` | A held Planet or targeted Tarot that improves the best scored play |
| \`order\` | A full hand/Joker permutation that improves the score |
| \`lines\` | Results for caller-supplied hypothetical lines |
| \`notes\` | Assumptions, omitted work and approximations |
| \`audit\` | Previous exact predictions compared with actual plays |

Rows read \`"0 2 4: Pair 500 exact; clears; …"\`. Facts can identify held/played seals, Gold rewards, Joker growth/reset or how many extra cards preserve the score. They do not identify which extra cards are harmless: check hand classification and the scoring subset.

- \`exact\` is deterministic scoring from visible state under the analyzed assumptions. \`clears\` means that score reaches the target; execution constraints still apply.
- \`conditional\` depends on a stated assumption, such as unknown held cards ignored, Hook discards ignored or exact labels suspended after an audit mismatch. It says \`reaches the target\` rather than promising a clear.
- \`expected\` substitutes random effects with their public-probability means in one evaluation. For example Misprint adds 11.5 by default, and a chance p of Xk becomes X(1+p*(k-1)). Fractional scores are retained until final rounding. A mean reaching the target is not a guaranteed clear.
- \`interaction approximation\` marks nonlinear/correlated effects such as Space Joker, Lucky Cat, Bootstraps or Plasma. It is not an exact outcome-distribution expectation. Missing expected-effect rules make analysis unavailable; obtain the rule rather than inventing a formula.

No run seed, RNG stream, hidden identity or draw order is used or returned. Expected rows never enter exact-play audits.

## Caller lines and order

\`lines\` accepts up to 4 lines of up to 3 steps: use a Planet, use a Tarot with \`cards\` targets, rearrange hand/Jokers, then optionally play. Each index names a card in the current observation, also after a rearrange inside that hypothetical line. A line without play reports the best play after its steps.

Example: \`{"revision":"<rev>","lines":[[{"method":"use","consumable":0,"cards":[1,3]},{"method":"play","cards":[0,2,4]}]]}\`. First verify the targets and subsequent selection are legal; a hypothetical calculation is not a live validation.

For real execution, send one action at a time and consume its returned state. An \`order\` row gives the positions to play after that real rearrange. If you propose an unlisted scoring/held-card order, price it with \`lines\`.

\`audit\` compares exact predictions with the chips actually gained by a play at the same revision. A mismatch downgrades later deterministic rows to conditional and names the discrepancy.

## Build output

In SHOP, PACK and BLIND_SELECT, \`focus:"build"\` samples 32 fixed shuffles of the public deck, never the run's draw order. Each independent hand chooses from hand size plus up to 5 drawn cards; Joker growth is frozen and random effects use their means. The clear figure is a pace proxy, not a chance-aware win probability. Compare changes on identical shuffles more than absolute levels.

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
