# Validation

## Observation projection v3 — 2026-10-11

Implemented [game-observation-v3.md](game-observation-v3.md): flat state, line-text
items, phase views dropped by phase, per-member/per-element deltas, short revisions
and one-sentence action results. Lua fixes: `modifier.enhancement` only for playing
cards; shop stock stays visible in a pack opened from the shop; Jolly/Sly-type,
To Do List, Bull and Satellite description bindings read the correct fields.

Executed checks:

- `npm run check` — passed.
- `npm test` — 63 tests, 59 passed. The 2 failures are in files this change does not
  touch: `config.test.ts` expects a POSIX `/tmp` path on Windows, and
  `distribution.test.ts` requires a `licenses/` directory absent from this checkout.
  All compact (16), MCP stdio (8), bridge, context and ID tests passed.
- `luajit tests/observation.test.lua` (29 checks) and `tests/decision.test.lua`
  (38 checks) — passed.
- `node data/observation-delta-smoke.ts <seed>` — local ignored helper, now an
  interactive driver over Strategy Forge's headless original 1.0.1o-FULL with this
  repository's observers. Seeds DELTASMOKE, SMOKE2–SMOKE5: 266 actions in total
  covering start, select, play, discard, cash_out, buy (Joker/pack), sell, reroll,
  rearrange, use, pack pick/skip and next_round, through Boss settlement into Ante 4.
  After every action, applying the delta to the running reconstruction matched the
  full projection exactly. SMOKE3 averaged about 300 bytes per action result versus
  about 1150 bytes per v3 full snapshot.
- `git -c core.whitespace=cr-at-eol diff --check` — passed.

Not validated: the installed game was not touched and no live MCP session was run.
Restart the MCP process to load the rebuilt server; stage/install the mod and
restart Balatro to load the Lua fixes.

## Action observation deltas — 2026-10-11

Implemented contract 2 action deltas over the existing complete projection.
State updates include the action's minimum blocks, new phase decision data,
explicit clears and all actual normalized changes. Poker-hand values use
handValuesPatch. Full game_observe/game_start output and the original Lua wire
protocol remain intact. Structured action result facts remain deferred.

Executed checks:

- `npm run check` — passed.
- `npm run build` — passed.
- `node --test tests/compact.test.ts tests/ids.test.ts tests/mcp.test.ts tests/bridge.test.ts tests/context.test.ts`
  — 51 passed, zero failures. Covers all action parameter variants, reconstruction,
  phase transitions, multi-choice/consecutive/tag packs, hand patch deletion and
  level reset, changed item conditions/capacities/prices, reordered target indices,
  delivered-baseline isolation, stale recovery, complete raw trace details,
  sequential IDs, client restarts, cancellation and uncertain effects.
- `node data/observation-delta-smoke.ts` — local ignored verification helper.
  Loads Strategy Forge's unchanged PC Balatro 1.0.1o-FULL through its isolated
  headless services, with this repository's current game/decision observers and
  original action handlers. Seed DELTASMOKE, RED/WHITE: start, select, discard,
  four one-card plays. Every reconstructed state matched its complete projection;
  the intentional weak policy ended in a Small Blind loss. No provider request
  or action against the running Windows game was made.
- `git -c core.whitespace=cr-at-eol diff --check` and the corresponding
  `diff --cached --check` — passed.

The local Lua check measured JSON bytes, not provider tokens. The full discard
snapshot was 2544 bytes; the action delta including its summary was 855 bytes.
Three nonterminal plays produced 933–935 byte deltas versus 2564–2566 byte full
snapshots. Start and terminal results remained full snapshots. The local results
are in ignored `data/observation-delta-smoke-results.json`.

These are focused checks, not a full release suite or live executable validation.
This update changes the external projection and IDs; restart the MCP process to
load the rebuilt server. No mod installation or game restart was performed.
