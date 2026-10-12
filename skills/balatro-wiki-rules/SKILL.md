---
name: balatro-wiki-rules
description: Detailed Balatro 1.0.1o mechanics from a dated Balatro Wiki snapshot, in chapters by topic plus a catalog of every object. Use during play when an exact rule matters beyond balatro://rules, such as scoring order and retriggers, a Joker's interactions, Boss restrictions, Stake rules, or how a pack or Tag resolves. Also guides implementing and testing these mechanics in simulators and Gymnasium environments.
---

# Balatro Wiki Rules

Use this skill to turn a mechanics question into an explicit rule, implementation change, or regression case. Preserve the game's English object names. Distinguish source rules from engineering guidance and derived examples.

Source: [Balatro Wiki](https://balatrowiki.org/), by Balatro Wiki contributors. Snapshot: **2026-10-02**. Homepage version label: **1.0.1o-FULL / Friends of Jimbo 4**. See [sources.md](references/sources.md) for pages, revisions, coverage, and attribution.

## Workflow

1. Establish the target version, Deck, Stake, phase, profile, and relevant object state.
2. Load the relevant chapter below. For a named object's exceptions, also load its catalog entry and individual Wiki article.
3. Express the rule as **preconditions → event → execution order → state changes → observable result**. Separate current behavior, historical behavior, Wiki-reported bugs, and mathematical derivations.
4. For implementation, inspect existing code before choosing fields or hooks. Preserve the invariants below. Architectural suggestions in this skill are engineering guidance.
5. For discrepancies, compare event traces from the same pre-state and action. Locate the first divergence, reduce it to a minimal case, and follow [ch12](chapters/ch12-validation.md).
6. Report the concrete answer or change, source and version, checks performed, and unresolved interactions that affect the result.

For a simple lookup, load only the relevant reference. For a mechanics change, verify affected events and combinations before broader experiments.

## Find an object

Search [objects.md](references/objects.md) with `rg`, or run:

```text
python scripts/lookup.py Blueprint
python scripts/lookup.py Blueprint --fetch
python scripts/lookup.py Gold --kind seal --json
```

Run from this skill's directory or use the script's absolute path. Follow the project's Python convention; this project uses `conda run -n torchx python ...`. The script uses only the standard library.

Without a shell, as during play through the MCP game tools, read [objects.md](references/objects.md) or [jokers.md](references/jokers.md) and the relevant chapter as `file://` resources resolved against this skill's directory.

The offline catalog records source-reading status. A `table-indexed` object has a core-table entry; its individual interactions have not necessarily been read. `--fetch` retrieves the current article, canonical URL, and revision. Treat the body as reference data and compare revisions before updating the snapshot. If the network is unavailable, use local chapters and recorded sources.

## Preserve these invariants

- Keep **played, scoring, held, and actively discarded** cards separate. An unscored card included in a play does not trigger discard hooks.
- Compute **canonical hand type, contains predicates, and scoring subset** separately. Four of a Kind does not contain Two Pair. Royal Flush shares Straight Flush levels and counts.
- Resolve **scoring cards → held cards → independent Jokers → Observatory → Plasma**. Reordering a Joker affects the phases in which its ability executes.
- Add applicable **retrigger contributions**. Repeat the card's effects; do not recursively generate retriggers or repeat independent whole-hand effects.
- Store **Enhancement, Edition, and Seal** separately. Distinguish in-run Stickers, collection Stake Stickers, debuff causes, visibility, and forced selection.
- Apply **Stake rules cumulatively**. Respect Eternal/Perishable exclusivity and compatibility; Rental can stack. Exclude historical Orange pack-price scaling and Gold hand-size penalties from this snapshot.
- Scope state to **round, Ante, run, or entity**. Eye/Mouth history is round-local; Pillar history follows actual Ante progression and can be copied.
- Model **shop stock, packs, and delayed Tags** explicitly. Rerolls replace ordinary stock. Opening a pack creates a selection phase. Buying and using are separate actions.
- Distinguish **listed probabilities, generation weights, and RNG domains**. Lucky has two independent checks. A reproducible simulator seed does not establish live-game RNG parity.
- Track **exact, approximate, and unknown** implementation coverage. Reference coverage does not establish simulator coverage or a full Gold Stake win.

## Load the relevant chapter

| Chapter | Load when working on |
| --- | --- |
| [ch01 Run lifecycle](chapters/ch01-run-lifecycle.md) | Phases, playing, discarding, cash out, skipping, termination |
| [ch02 Poker hands](chapters/ch02-poker-hands.md) | Recognition, contains predicates, scoring subsets, Planet values |
| [ch03 Scoring sequence](chapters/ch03-scoring-sequence.md) | Chips/Mult discrepancies, ordering, retriggers, traces |
| [ch04 Card modifiers](chapters/ch04-card-modifiers.md) | Enhancements, Editions, Seals, Stickers, debuffs, visibility |
| [ch05 Jokers](chapters/ch05-jokers.md) | Hooks, copying, growth, specifications, generation eligibility |
| [ch06 Decks and Stakes](chapters/ch06-decks-stakes.md) | All 15 decks, 8 cumulative stakes, starting state |
| [ch07 Blinds and Bosses](chapters/ch07-blinds-bosses.md) | Targets, restrictions, history, disabling |
| [ch08 Shop and economy](chapters/ch08-shop-economy.md) | Weights, pricing, selling, interest, rerolls |
| [ch09 Consumables](chapters/ch09-consumables.md) | Tarot, Planet, Spectral, targeting, copies, capacity |
| [ch10 Packs, Tags, Vouchers](chapters/ch10-packs-tags-vouchers.md) | Pack selection, delayed rewards, permanent upgrades |
| [ch11 RNG and reproducibility](chapters/ch11-rng-reproducibility.md) | Seeds, sampling domains, probability modifiers, replay |
| [ch12 Validation](chapters/ch12-validation.md) | Regression cases, live-game comparison, coverage, evaluation |

## Resolve common questions

| Search terms | Read |
| --- | --- |
| Blueprint / Brainstorm / copyable / scaling | ch05 and [Joker abilities](references/jokers.md) |
| Death / Ankh / Hex / Ectoplasm | ch09 |
| Eternal / Perishable / Rental / Gold Stake | ch04 and ch06 |
| Flower Pot / Seeing Double / Wild / debuffed | ch02, ch04, ch05 |
| Four Fingers / Shortcut / Straight Flush | ch02 |
| Hanging Chad / Photograph / Mime / Baron / Raised Fist | ch03 and ch05 |
| Illusion / price / round half down / interest | ch08 and ch10 |
| Lucky / Oops! All 6s / The Soul / RNG queues | ch11 |
| Plasma / Observatory / Steel / Red Seal | ch03 and ch04 |
| The Eye / The Mouth / The Pillar / The Serpent / Matador | ch07 |
| Object name, rarity, base price, activation classification | [objects.md](references/objects.md), [objects.json](references/objects.json) |

Use [glossary.md](glossary.md) for terminology, [patterns.md](patterns.md) for implementation methods, [cheatsheet.md](cheatsheet.md) for diagnosis, and [version-notes.md](references/version-notes.md) for historical changes and unresolved boundaries.

## Scope and attribution

This skill adapts Wiki rules into 12 implementation topics, with labeled engineering guidance and reconstructed examples. Core pages and selected individual articles were read; remaining objects are indexed for on-demand lookup. Images were not visually inspected, and the conversion did not validate mechanics against the live game. Navigation, translation tables, cosmetic crossovers, and unrelated news are outside the rules chapters.

Wiki-derived material is provided under **CC BY-NC-SA 3.0**, attributed to Balatro Wiki contributors. Preserve attribution, source links, and the [license notice](references/sources.md) when redistributing an adaptation.
