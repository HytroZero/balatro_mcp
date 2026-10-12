# Validation

## Health once per bridge instance, trace encoding, guide in code — 2026-10-12

`ForgeBridgeBackend` now runs `sf.health` once per bridge instance instead of
before every observe and deck read. A revision with another instance prefix
re-runs the identity check, so mod restarts still clear the client lock and
expire old revisions. `game_operation` keeps the full health check. A
`game_action` after the first call now sends `sf.observe` and `sf.act` rather
than `sf.health`, `sf.observe` and `sf.act`. `Trace.encode` returns redacted text,
and tool results and trace lines use it instead of sanitizing to an object and
stringifying it again.

`balatro://guide` moved from `docs/tool-guide.md`, which the server read at
runtime, into `tools/guide.ts`. The phase view table and the `game_observe`
phase view sentence are generated from `phaseViews`; row text stays in code.
Rendered against the old file, only two table rows changed: `shop` and
`runResult` now list the exact `phaseViews` phases, and their qualifiers
(PACK only when opened from the shop; also sent with a won terminal result)
moved to the content column. New `tests/guide.test.ts` checks that the rows
cover every phase view once, and that the guide and description name every
`StateSchema` key.

Executed checks:

- `npm run check` — passed.
- `node --test tests/*.test.ts` after `npm run build` — 68 passed, 2 skipped,
  zero failures (69 passed after the guide move). A new bridge test asserts the RPC sequence across two actions
  and an instance change. The stdio preflight cancellation test now holds
  `sf.observe`, and the shared-deadline test uses 100 ms because the action
  preflight no longer spends a health round trip.
- Mutation check: deleting the `pack` row from `phaseViewRows` failed two
  guide tests; the file was restored.
- `npm run release:check` — passed (94 source files).

These are offline Windows checks. No Lua changes; the running game and an MCP
client against it were not exercised. Restart the MCP process to load the change.

## CI: Windows job, Lua tests and GNU tar on Windows — 2026-10-12

Added `windows-latest` to the CI test matrix (with `fail-fast: false`) and a
separate Ubuntu job that runs both Lua test files under LuaJIT. Running the
suite from Git Bash on Windows showed the release archive test failing: GNU tar
read the `C:` prefix of the archive path as a remote host. GNU tar now gets
`--force-local`; bsdtar is unchanged.

Executed checks:

- `luajit tests/observation.test.lua` — 49 checks passed.
- `luajit tests/decision.test.lua` — 38 checks passed.
- `npm run check`, `npm run stage-mod`, `npm run release:check` (93 source
  files) — passed under PowerShell.
- `node --test tests/*.test.ts` — 65 passed, 2 skipped, zero failures under both
  PowerShell (System32 bsdtar) and Git Bash (GNU tar, after the fix; it failed
  before).

These are local Windows checks. The new workflow has not run on GitHub yet, and
the Ubuntu luajit package and GNU tar `--force-local` on Linux were not
exercised locally. No mod installation or game run was involved.

## Source distribution directory fix — 2026-10-11

Removed the unused `licenses/` directory from the distribution allowlist and
corrected its documentation references. Replaced a raw bridge-instance example
in the observation design document with placeholders so the source audit passes.

Executed checks:

- `npm run check` and `npm run build` — passed.
- `node --test tests/distribution.test.ts` — 2 passed, zero failures, including
  source copy, archive metadata and symlink rejection.
- `npm run release:check` — passed (91 source files).
- `npm run stage-mod` — passed; inspected staged mod files and provenance.
- `git -c core.whitespace=cr-at-eol diff --check` — passed.

These are focused Windows checks. GitHub's macOS/Ubuntu jobs were not rerun.

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

## Terminal-only seeds and complete Joker arrays — 2026-10-12

Ongoing snapshots now show only deck and stake in `setup`; terminal snapshots
append the seed. `game_operation` also removes `state.seed` from ongoing raw
snapshots, including responses from already installed mods. Whenever `jokers`
appears, it is the complete ordered array; unchanged Jokers remain in that array,
and an empty array clears the area. Unchanged lists may still be omitted.
Consumable and hand element patches keep their existing behavior. Schemas,
bootstrap instructions, tool descriptions, guide and examples were updated.

Executed checks:

- `npm run check` and `npm run build` — passed.
- `node --test tests/compact.test.ts tests/mcp.test.ts tests/context.test.ts tests/bridge.test.ts`
  — 53 passed, zero failures. Covers ongoing seeds in every phase and blocked
  states, full/start/action results, terminal wins/losses, complete Joker lists,
  omission/clearing, schema rejection of partial Jokers, and retained hand and
  consumable element patches.
- After adding stdio coverage for terminal seeds through observe and operation
  inspection, `npm run check` and `node --test tests/mcp.test.ts` passed again
  (8 tests, zero failures). Ongoing operation inspection omits the seed in both
  structured and text results; terminal inspection preserves it for both outcomes.
- `node --test tests/guide.test.ts` — 3 passed, zero failures.
- `git -c core.whitespace=cr-at-eol diff --check` — passed.

All checks were offline. No live game actions or mod installation were performed.
Restart the MCP process to load the rebuilt server; no Lua mod update is required.

## Explicit skip action for every booster pack — 2026-10-12

PACK now advertises `pack` and `skip` as separate actions. `{"method":"skip"}`
invokes the original `can_skip_booster` / `skip_booster` handlers in all native
pack phases and Steamodded boosters. The former `{"method":"pack","skip":true}`
interface has been removed from both the schema and Lua handler. `pack` only
chooses cards. Pack skip availability uses `controls.packSkip`, independently
of blind skip availability; Boss Blinds remain unskippable while packs opened
at a Boss can still be skipped. Tool descriptions, guide and examples were updated.

Executed checks:

- `npm run check` and `npm run build` — passed.
- `node --test tests/compact.test.ts tests/guide.test.ts` — 24 passed, zero
  failures. Covers all five pack families in ordinary/Jumbo/Mega sizes, skip
  availability, non-ready states, pack closing and removal of the old schema.
- `node --test tests/mcp.test.ts` — 8 passed, zero failures, including rejection
  of the removed interface without dispatching a mutation.
- `luajit tests/observation.test.lua` — 88 checks passed. Includes all six pack
  phases, one original skip handler invocation per action, validation without
  mutation, rejection of the legacy interface and targets, unavailable skip,
  Boss Blind rejection and preserved Small Blind skipping.
- `luajit tests/decision.test.lua` — 38 checks passed.
- `npm run stage-mod` and `git -c core.whitespace=cr-at-eol diff --check` — passed.

All checks were offline. The server is rebuilt and the mod staged, but the mod
was not installed and the running game was not restarted or controlled. Install
the updated staged mod, restart Balatro and reconnect MCP to load this change.

## Experimental shadow scoring of hand selections (`plays`) — 2026-10-13

New `play/mod/scoring.lua` runs the game's own `G.FUNCS.evaluate_play` on every
1–5 card selection of the visible hand (forced cards included), with presentation,
profile, money and RNG functions stubbed, and restores every touched value after
each selection: `G.GAME` data, the Blind and Back objects, hand/Joker/consumable
cards (top-level fields plus `ability`, `base`, `edition`), scoring globals and
Steamodded scoring state. `hands_left` is spent first and `SMODS.last_hand` is
cleared so the last real hand is untouched. Random checks all fail and the line
is marked `random`; Boss-rejected hands show `0 not allowed`; any face-down hand
card or Joker gives `unavailable: face-down cards`; a 100 ms budget marks
`truncated`. The bridge attaches `plays` after the fingerprint (no revision
change), caches it per fingerprint, and poisons itself if the fingerprint changes
across scoring. `plays` is a SELECTING_HAND phase view (best line per poker hand,
at most 5). Installers copy `scoring.lua`; guide and `skills/core.md` describe it.

Executed checks:

- `luajit tests/scoring.test.lua` — 21 checks passed (mock evaluate_play with
  scaling Joker, final-hand Joker, held-card Mult, random card, Boss rejection,
  forced card, face-down guards, failure containment, budget truncation, bridge
  caching and leak poisoning).
- `luajit tests/observation.test.lua` (88) and `tests/decision.test.lua` (38) — passed.
- `npm run check` and `npm test` — 74 passed, 2 skipped (platform), zero failures;
  includes the new `plays` projection/delta test.
- One-off script (not committed) in the `strategy_forge` headless original
  1.0.1o Lua (vanilla, no Steamodded): RED/WHITE seed SCORE1 with Joker, Green
  Joker, Acrobat, Baron, Lusty Joker and Scary Face added; target raised so four
  hands were played. Each time the top `plays` line was played: predicted score
  equalled the actual chip gain 4 of 4 (including Green Joker growth and Acrobat
  on the final hand); the state, deck and `G.GAME.pseudorandom` fingerprint was
  identical before and after scoring; about 26 ms per 8-card hand.
- `npm run stage-mod`, `npm run release:check` and
  `git -c core.whitespace=cr-at-eol diff --check` — passed.

The live Steamodded game was not exercised: the mod was staged but not
installed, and Balatro was not restarted. Steamodded's rewritten evaluate_play
path, its timing and the fingerprint check remain to be verified in the live game.

## game_analyze design proposal — 2026-10-13

Added `docs/game-analyze-design.md` as an independent proposal for an on-demand,
read-only analysis tool. It specifies the MCP contract, revision and observation
baseline boundaries, public snapshots, score quality, staged play/draw/build
analysis, budgets, cancellation, integration points and implementation acceptance
criteria. No gameplay implementation was changed for this proposal.

Executed documentation checks:

- Reviewed the proposal against the current tool, backend and Lua bridge source.
- A standalone Node documentation check passed: section numbering, balanced code
  fences, the JSON example and absence of trailing whitespace.
- Manually checked the synthetic Pair example: `(10 + 2 + 2) * 2 = 28`.

No implementation tests, game actions, mod staging, installation or restarts were
performed for this documentation-only change. Proposed performance budgets and
scoring capabilities have not been validated by this work.
