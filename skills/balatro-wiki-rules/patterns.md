# Implementation and Diagnosis Patterns

Apply these engineering methods to the Wiki rules. The methods are introduced by this skill.

## Specify mechanics as events

Use when adding a Joker, Boss, Seal, or other mechanic. Define target set, predicate, event, order, mutation, reset scope, capacity/destruction rules, source URL/revision, and a minimal case. Split multiple hooks rather than collapsing the object into a scoring function. This supports non-scoring mechanics such as DNA, Rental, Perkeo, and Pillar. See [ch05](chapters/ch05-jokers.md).

## Evaluate distinct hand sets

Use when classification is correct but score or Joker triggers differ. Emit canonical hand type, contains predicates, scoring IDs, played IDs, and held IDs. Invoke each ability only for its actual target set. Permit different Four Fingers subsets for Straight and Flush. Preserve identity/order to distinguish incidental scoring from accidental discard hooks. See [ch02](chapters/ch02-poker-hands.md).

## Commit capacity per generation event

Use for Blue/Purple Seal, High Priestess, Riff-Raff, Ankh, and similar entity creation. Define action legality first; check/reserve room for each spawn, commit successful creation, then process the next activation. Bind Negative capacity to entities. Starting capacity alone cannot validate the entire batch. See [ch04](chapters/ch04-card-modifiers.md) and [ch09](chapters/ch09-consumables.md).

## Scope state explicitly

Use when growth or history leaks across Blinds. State the reset scope in every field definition. Keep Eye/Mouth and first-action flags round-local; Pillar history Ante-local; hand counts, skips, and consumable history run-local; Joker growth entity-local. Reset only the applicable domain. See [ch01](chapters/ch01-run-lifecycle.md), [ch05](chapters/ch05-jokers.md), and [ch07](chapters/ch07-blinds-bosses.md).

## Recompute debuffs by cause

Use after changing suit/Enhancement, selling a Joker, or disabling a Boss. Retain Boss, Challenge, and Perishable causes. Recompute affected rules rather than clearing every cause with `debuffed=False`. Keep visibility and forced selection separate. See [ch04](chapters/ch04-card-modifiers.md) and [ch07](chapters/ch07-blinds-bosses.md).

## Reduce the first divergence

Use when the actual game or a second implementation disagrees. Fix pre-state and action; compare phase/source/target/trigger. Remove unrelated entities while preserving the first divergence. Record observed outcomes separately from derived intermediates, then add the minimal regression. See [ch03](chapters/ch03-scoring-sequence.md) and [ch12](chapters/ch12-validation.md).

## Version rules and replay state

Use for rule updates and long-term experiment reproduction. Record game version, source revisions, Deck/Stake/profile, seed, actions, and RNG state. Review a new Wiki revision as a rule diff before updating. Compare snapshot resume with uninterrupted execution. Distinguish simulator reproducibility from live-game RNG parity. See [ch11](chapters/ch11-rng-reproducibility.md).
