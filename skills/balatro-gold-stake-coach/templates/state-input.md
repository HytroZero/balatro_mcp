# State and Decision Note Template

Use this optional outline for a compact session note or run review. Populate it from tool observations. Do not ask the user to fill it out during tool-controlled play, and do not substitute a note for a fresh observation after compaction or stale state.

```text
Provenance: gameVersion, backend, runId, deck, stake, seed when visible
Baseline: latest revision, phase, Ante, current blind, ready, terminal/outcome
Threat: remaining target, hands/discards, active Boss restriction
Engine: actual hand Chips/Mult, ordered visible Jokers, growth and debuffs
Resources: cash, credit, observed slots, consumables, held-value cards
Upcoming risk: revealed Boss, Perishable timers, Rental cost, required sale
Unknowns: hidden identities, draw order, random effects, unseen stock
Decision: one current legal action with current area indices
Reason: conservative survival benefit and main opportunity cost
Result: observed action summary, new revision, changed resources
Next check: condition that would change the plan
```

Record only useful notes. `file_write` affects this session's workspace; it does not update persistent gameplay memory. Use `memory_record` only when recording is enabled and the evidence warrants it.

## Exact tool-call shapes

These are syntax examples, not a plan to run unchanged. Replace every index and revision with values from the latest observation. Complete each mutation and consume its returned state before constructing the next call.

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
{"revision":"r-current","action":{"method":"play","cards":[1,4]}}
```

Reorder an area containing exactly three Jokers, putting the old index 2 first:

```json
{"revision":"r-current","action":{"method":"rearrange","jokers":[2,0,1]}}
```

Buy the current shop card at index 0:

```json
{"revision":"r-current","action":{"method":"buy","card":0}}
```

Use the current consumable at index 0 on hand indices 2 and 5:

```json
{"revision":"r-current","action":{"method":"use","consumable":0,"cards":[2,5]}}
```

Choose current pack item 1 and target hand index 3 when that item requires one target:

```json
{"revision":"r-current","action":{"method":"pack","card":1,"targets":[3]}}
```

Skip the current pack when none of its remaining options is worth taking:

```json
{"revision":"r-current","action":{"method":"pack","skip":true}}
```

For target-dependent actions, read the item's requirements first. Death requires two targets in the intended physical left/right order; reorder the hand first if necessary. Target selection does not reveal hidden identities or bypass forced-selection rules.

## Useful decision checks

- With $14 and a Rental Constellation versus a normal Blue Joker, compare current Chips/Mult, expected Planet **use**, next target, slots, and rental carrying cost before buying either.
- With high-level Pair, two held Blue Seals, and Card Sharp against The Eye, plan distinct hand types or a first-hand finish; do not repeat Pair to seek Mercury.
- At Ante 7, inspect actual hand values, Joker order, revealed Boss, sale options, and Perishable timers before replacing an economy slot.
