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

## Shadow scoring review fixes — 2026-10-13

Card restoration now includes the fields of `card.config`, preserving the original
shared center reference and center key after Vampire/Midas Mask enhancement changes.
Card creation is rejected at `copy_card`, `create_card`, `create_playing_card`,
`Card.init` and `SMODS.add_card` before constructing or registering new objects.
`G.playing_card` is restored because DNA increments it before calling `copy_card`.
Any attempted creation discards all advice and returns `unavailable`, including
when a mod catches the rejection. Active The Tooth returns `unavailable` because
its pre-scoring money loss is not simulated; disabled The Tooth still permits
scoring. Ordinary game actions continue to use the original handlers. The guide
and scoring design document describe these limits.

Executed checks:

- Lua scoring tests — 63 checks passed (42 new), covering successful and failing
  enhancement replacement, shared-reference preservation, all five creation
  entry points, swallowed creation errors, constructor restoration, unchanged
  registries/capacity/identifier, active and disabled The Tooth. Observation
  (88) and decision (38) checks also passed. These ran through an isolated Python
  ctypes harness using the installed LuaJIT shared library; no `luajit` command
  is available on this host.
- Original 1.0.1o headless integration in the adjacent `strategy_forge` checkout,
  RED/WHITE seed SCORE1 — Vampire and Midas Mask leave an enhanced card's center
  and ability unchanged and bridge observations remain ready; DNA leaves deck
  count, capacity and identifier at 52 and returns only `unavailable`; active
  The Tooth + Bull returns `unavailable`, while an ordinary two-card play still
  scores 80 and spends $2. Disabling The Tooth permits scoring again.
- `npm run check` — passed. `npm test` — 73 passed, 2 platform skips, one failure
  caused by the existing local `docs/.DS_Store` in the distribution audit.
  Temporarily moving that file aside made both distribution tests and
  `npm run release:check` pass; the file was then restored.
- `npm run stage-mod` and `git -c core.whitespace=cr-at-eol diff --check` — passed.

All gameplay checks were offline. The mod was staged, not installed; Balatro was
not restarted or controlled, and live Steamodded behavior remains unverified.

## Offline scoring sandbox — 2026-10-13

Added `env/sandbox` with a validated TypeScript `scoreHand` interface, JSON CLI,
isolated LuaJIT workers, an example and usage documentation. Each query initializes
original 1.0.1o-FULL prototypes and invokes original `evaluate_play`, card/Joker,
hand-recognition, Blind and Back logic. The adapter supplies non-rendering card
objects, suppresses presentation/profile/queued post-hand events, handles The Tooth
pre-scoring money loss and The Ox instant money reset, and reports active The Hook,
direct card creation and hidden cards explicitly. Original Card update/passive hooks
hydrate deck tallies, Joker Stencil, probabilities and sell-value effects.

`sandbox:prepare` copies nine necessary original modules unchanged into ignored
local `env/sandbox/vendor`. Public distributions explicitly exclude both that
directory and `env/balatro`, and omit Finder metadata. The distribution regression
checks these exclusions. Original game source is a local dependency, not newly
published source.

Executed checks:

- `npm run sandbox:prepare` — nine original modules copied; byte-for-byte comparison
  against local `env/balatro` passed for every file.
- `npm run sandbox:test` with the locally built LuaJIT 2.1 executable — all six test
  groups passed. Scenarios cover all 12 poker hands, scoring subsets, Splash/Stone,
  Joker order/Blueprint/growth/Acrobat, seals and held Steel/Baron effects, editions,
  hand upgrades, Boss restrictions/debuffs/Flint/Arm/Ox/Tooth/Chicot, Plasma, draw and
  discard tallies, Swashbuckler, Observatory, fixed and seeded randomness, disabled
  passive effects, repeatability, unchanged inputs, failures, timeouts and cancellation.
- One-off all-Joker smoke check against the copied vanilla source — all 150 Jokers
  returned `ok` for an ordinary five-card Straight. This checks execution coverage,
  not every Joker interaction or lifecycle effect.
- One-off comparison script in local `build/sandbox-validation`, using the adjacent
  original full-game headless runtime — six Joker configurations, four hands each,
  seeds SANDBOX1 through SANDBOX6; sandbox scores matched actual full-event-loop
  chip gains in all 24 hands. Configurations included growth/final-hand/held effects,
  Blueprint/Photograph/retriggers, deck tallies/Stencil, money effects,
  Vampire/Midas/Hiker, and Bloodstone/Space/Lucky Cat/Misprint. Explicit remaining
  deck, discard, hand values, history and RNG stream data were passed into each trial.
- `npm run check` and `npm test` with `LUAJIT` set — passed; 80 tests passed and two
  Windows-only tests skipped. The final sandbox passive-effect adjustment was also
  verified with the focused sandbox suite and the 24-hand comparison again.
- Existing Lua suites — observation 88, decision 38 and shadow scoring 63 checks
  passed. `npm run release:check` and whitespace checks passed.
- Source and compiled CLI examples passed; compiled CLI was also launched from
  outside the repository. The bundled example reports Pair, 30 chips, 14.125 Mult,
  and 423 points.

All checks were offline. No mod installation, game restart, live gameplay, or
Steamodded scoring validation was performed. The sandbox scores one hand and does
not return a persistent next-game state.

## Persistent scoring worker and million-trial throughput — 2026-10-13

Replaced the per-calculation process architecture for search workloads with
`ScoringSandbox`: one persistent LuaJIT VM, source/prototype initialization once,
position construction on `load`, and a precompiled restoration plan reused after
every trial. Newline-delimited requests are serialized and correlated by ID.
`scoreBatch` returns complete results; `scores` evaluates up to 2048 selections
inside Lua per request and returns scalar scores/failures without constructing
traces or full scoring results. No result cache is used. The one-shot CLI helper
is now explicitly named `scoreHandOnce`.

State restoration preserves original table/prototype identities and removes newly
introduced fields, including Joker growth, enhancement replacement, Boss history,
hand counts, dollars, pseudorandom streams, destroyed-card flags and the playing
card identifier. Failed scoring also restores the position. Failed loads invalidate
the prior position; transport failures, timeout and cancellation invalidate the
worker without automatic retries. The public API includes explicit `close`, process
identity and diagnostic counters. Pure Lua callers can reuse `new/load/score`
directly without host IPC.

Executed checks:

- Old one-shot baseline on this host: 100 fixed Pair evaluations, eight hand cards
  and Joker/Green Joker/Baron/Acrobat — 1225.87 ms. This was measured before changing
  the implementation.
- `sandbox:bench` with LuaJIT 2.1: eight hand cards and the same four Jokers, cycling
  all 218 legal selections, batches of 2048. After 2048 warm-up trials, **1,000,000
  timed evaluations took 131,260.30 ms (7618.45/s)**, including Node/Lua IPC and
  restoration. The worker reported one source load, one position load and 1,002,048
  actual calculations including warm-up, with approximately 4794 KiB Lua heap at
  the final sample. Every result was checked against its warm-up counterpart.
  The old and new timings use different selection mixes; they are not a controlled
  speedup ratio or a guarantee for other Joker configurations.
- `npm run check` and `npm test` with `LUAJIT` set — passed: 82 tests passed, two
  Windows-only skips. Eight sandbox groups passed, including persistent process
  identity/counters, thousands of alternating trials, repeated position loads,
  independent seeded randomness, growth/Vampire/Midas/Hiker/Arm/Tooth/Eye state,
  trace construction before score globals exist, queued requests, failure recovery,
  invalid-load invalidation, forced selection, timeout and cancellation.
- Original full-event-loop comparison was rerun against the refactored scorer:
  all 24 hand scores matched actual chip gains. The persistent API was additionally
  checked against independent one-shot evaluations across six configurations.
- `npm run release:check`, whitespace checks and the compiled CLI launched outside
  the repository passed. The example remains Pair, 30 chips, 14.125 Mult, 423 points.

All checks were offline; no live mod installation, restart or Steamodded validation
was performed. Throughput remains dependent on Joker effects and retrigger counts.

## Shadow scoring: face-down omission, The Tooth/Ox money, DNA ignored — 2026-10-13

`plays` is now absent (instead of an `unavailable` line) while any hand or Joker
card is face-down. Instant `ease_dollars` is applied during trials, so The Ox's
reset reaches Bull/Bootstraps; queued money changes are still dropped (money earned
while scoring is visible through `dollar_buffer`). Active The Tooth subtracts the
played card count before evaluation, matching the order of `press_play` and the
queued `evaluate_play` in 1.0.1o, and no longer makes `plays` unavailable.
`Card.calculate_joker` returns nil for DNA during trials, so DNA and copies of DNA
through Blueprint/Brainstorm have no effect; other card creation still makes every
candidate unavailable. `tools/guide.ts` and `docs/hand-scoring-design.md` describe
the new behavior, including that DNA first-hand single-card scores can differ.

Executed checks:

- Lua scoring tests — 71 checks passed: face-down hand/Joker returns nil; DNA by
  name and by `j_dna` center key, called directly and through a copying Joker,
  leaves every line equal to the no-DNA baseline and restores `calculate_joker`;
  The Tooth by name and key charges $1 per played card in each trial (Bull reads
  the reduced balance) and nothing when disabled; The Ox zeroes money only for the
  most played hand. Disabling each of the three changes made its check fail.
  Observation (88) and decision (38) checks passed. Run with a locally built LuaJIT
  2.1 binary; no `luajit` is on PATH on this host.
- `npm run check` — passed. `npm test` with `LUAJIT` set — 82 passed, 2
  Windows-only skips.
- `npm run stage-mod`, `npm run release:check` and
  `git -c core.whitespace=cr-at-eol diff --check` — passed.

All checks were offline against mocks. The mod was staged, not installed; Balatro
was not restarted or controlled, and live Steamodded behavior remains unverified.

## Sandbox source default: vendor only — 2026-10-13

Removed the automatic `env/balatro` fallback from the sandbox runtime and tests.
The default source is now `env/sandbox/vendor`; explicit `sourceDir` and
`BALATRO_SANDBOX_SOURCE` overrides remain supported. Updated the sandbox README
to require preparation when the default source is missing.

Executed checks:

- `npm run check` — passed.
- `npm run sandbox:test` — all eight tests passed, with no skips.
- `npm run sandbox:score -- env/sandbox/example.json` — passed using the default
  vendor source: Pair, 30 chips, 14.125 Mult, 423 points.
- `git diff --check` — passed.

All checks were offline; no live game was exercised.

## Windows installer CI: short temporary paths — 2026-10-13

The Windows CI job failed both reinstall tests because the temporary directory
used an 8.3 alias while PowerShell recorded its expanded path. Canonicalized the
test fixture root with `realpath` before deriving paths, keeping the exact
replacement-target assertion and installer behavior unchanged.

Executed checks:

- Reproduced both assertion failures using a temporary directory's 8.3 alias as
  `TEMP` and `TMP`; both tests passed under the same setup after the fix.
- `npm run check` — passed.
- `npm test` — 82 passed, 2 macOS-only skips, 0 failures.

All checks were offline against temporary installation fixtures; no live game
installation or gameplay was performed.

## Automatic plays in the independent scoring sandbox — 2026-10-13

Replaced the in-game shadow scorer with a read-only scoring snapshot and a
server-side batch search in the independent LuaJIT worker. Snapshot inputs
participate in the bridge revision, preserve already-applied passive effects,
and exclude draw order and the live RNG stream. Internal inputs are filtered
from observations and operation inspections. Advice uses revision caching and
a final read-only version check; advice failures never invalidate a confirmed
action completion. Updated both installer file lists, the guide and CI Lua tests.

Executed checks:

- `npm run check` — passed.
- `npm test` — 92 passed, 2 macOS-only skips, 0 failures, including sandbox tests
  with local original source and LuaJIT, plus an HTTP-to-worker integration check.
- `luajit tests/observation.test.lua` — 88 checks passed.
- `luajit tests/decision.test.lua` — 38 checks passed.
- `luajit tests/score-snapshot.test.lua` — 13 checks passed.
- Original headless state -> snapshot -> independent worker comparisons passed
  for 10 configurations, including Green Joker, Oops! All 6s, Joker Stencil,
  Chicot, Observatory, Steel/Red Seal/Baron, Plasma, Stone Joker, The Eye,
  The Mouth, and The Tooth/The Ox money effects.
- `npm run stage-mod` — passed; staged only the read-only snapshot module,
  with the old in-game scorer absent.
- `npm run release:check` and `git diff --check` — passed.

All checks were offline. No real game installation, restart, or Steamodded/live
score comparison was performed. Search still enumerates selections in the
current hand order, without card-order permutations. Custom mod scoring rules,
DNA card creation and The Hook pre-scoring discards remain unsupported.

## Complete plays enumeration and top 15 selections — 2026-10-13

Every SELECTING_HAND observation now scores all selections allowed by the current
selection limit and forced cards before returning the global top 15 combinations
(all combinations when fewer than 15 exist). Multiple selections of the same poker
hand remain eligible. Ties prefer fewer cards, then ascending index order. The
search keeps only 15 candidates in memory while visiting every combination.

Removed the one-second scoring cutoff, the independent 2.5-second search timeout,
revision caching and partial `truncated` recommendations. Enumeration shares the
overall request deadline and cancellation signal; incomplete batches, scoring
failures, timeout or cancellation never return partial candidates. The final live
revision check and confirmed-action failure containment remain in place.

Executed checks:

- `npm run check` — passed.
- `npm test` — 95 passed, 2 macOS-only skips, 0 failures. Coverage includes all
  1,585 selections of a 12-card hand, a highest-scoring final selection, 15
  candidates of the same hand type, enumeration beyond the former one-second
  cutoff, missing batch results, cancellation cleanup, repeated observations,
  original LuaJIT scoring and HTTP-to-worker integration.
- `npm run release:check` and `git diff --check` — passed.

All checks were offline. The server was rebuilt; no live game installation,
restart or gameplay was performed. The MCP process must restart to load the change.

## Steamodded voucher compatibility in scoring snapshots — 2026-10-13

The scoring exporter now projects only scoring-relevant `current_round` fields:
hand/discard counters, hand history, and Idol/Ancient Joker/Castle/Mail-In Rebate
targets. Shop and presentation-only fields are excluded. Steamodded's voucher
table combines numeric entries with a `spawn` member and is not a JSON array;
copying the whole round previously rejected it before starting the sandbox.
Strict rejection of unsupported tables in scoring inputs remains unchanged.

Executed checks:

- Added the mixed voucher table to the Lua snapshot fixture; before the fix,
  `luajit tests/score-snapshot.test.lua` failed with `Sparse or mixed scoring array`.
  After the fix, all 13 checks passed.
- `luajit tests/observation.test.lua` — 88 checks passed.
- `luajit tests/decision.test.lua` — 38 checks passed.
- `node --test tests/plays.test.ts tests/bridge.test.ts tests/sandbox.test.ts` —
  40 passed, no skips or failures. All 11 original-game round-trip configurations
  now include a mixed voucher table. The added configuration checks non-default
  Idol/Ancient Joker targets and last-hand/discard-dependent scoring.
- A temporary offline smoke scenario combined the current saved Steamodded
  `current_round` with a controlled three-card hand and original-game Jokers.
  Snapshot validation and complete enumeration succeeded, returning all seven
  plays; the leading recommendation was `0 1: Pair 808`.
- `npm run check`, `npm run stage-mod`, and `npm run release:check` — passed.

Verification was offline; the live game was not advanced, restarted, or reinstalled.
Temporary scripts and the decompressed save were removed. The updated mod is
staged; installation and a game restart are required to load it in the live game.

## Persistent score-only plays and minimal chance rewards — 2026-10-13

The backend now owns one lazily started `ScoringSandbox` across observations.
`plays(state, selectionLimit, options)` reloads a position, enumerates every legal
selection, scores and ranks the top 15, and formats its lines inside the Lua VM in
one atomic request. The former host-side generator, batch search and formatter
were removed. Normal completion keeps the worker; shutdown or an active request
failure releases it. Request deadlines include queue wait, and cancellation
listeners are removed after settlement so old signals cannot kill later searches.

`minimal` excludes chance rewards even with boosted probabilities and takes
Misprint's configured minimum. Unknown scoring randomness remains explicit rather
than silently sampling; rankless Stone cards use unique negative rank identities.
This is a no-chance-reward policy, not a mathematical minimum over every possible
game outcome. Score-only evaluation suppresses DNA and consumable creation before
constructors and stops after the original final deck modifier, before destruction
and after-hand lifecycle. Same-hand growth, enhancement order, retriggers, held
effects and relevant money changes remain active. Existing seeded/fixed APIs keep
their previous behavior; The Hook remains unsupported. Updated the guide, core
decision protocol and scoring documentation.

Executed checks:

- `node build/plays-smoke.ts` — passed using local original source and LuaJIT:
  one process, one source load, three position loads and 443 evaluations. An
  eight-card search visited all 218 selections and returned 15 lines; repeating
  its position returned identical advice. Aborting a completed search's signal
  left the next search usable. DNA/Misprint/Space were present; the leading
  recommendation was `0 1: Pair 210`. The temporary script was removed afterward.
- `npm run check` — passed.
- `npm test` — build passed; 101 tests passed, two macOS-only skips, zero failures.
  Includes real LuaJIT global-top15/forced-card search, public minimal scoring,
  boosted probabilities, lifecycle isolation, same-hand scoring order, atomic
  failures, queue/active cancellation and timeout, malformed protocol output,
  live-snapshot round trips and HTTP-to-persistent-worker integration.
- `npm run release:check` — passed (110 exported source files).

All verification was offline. No live game actions, mod installation or game
restart were performed. No Lua mod files changed; restart the MCP process to load
the rebuilt server and sandbox behavior.

## Mark actual minimal scoring branches in plays — 2026-10-13

Each candidate now records whether scoring invoked a supported minimal chance
reward or Misprint's lower bound, and appends `minimal` as the final token only
when it did. The flag resets before each trial. Deterministic candidates, blocked
hands that never reach chance scoring, constructor randomness, Stone rank
identities and suppressed lifecycle events do not acquire the marker. Updated
the response validator, scoring regressions and public scoring guide.

Executed checks:

- A one-off Node API smoke query using original source and LuaJIT returned
  `0: High Card 16 minimal` and `1: High Card 15` for a Lucky Ace and ordinary King
  in the same search. Misprint returned `0: High Card 16 minimal`.
- `node --test tests/plays.test.ts tests/sandbox.test.ts tests/bridge.test.ts` —
  46 passed, zero skips or failures, including per-candidate flag reset, blocked
  hands, debuffed chance effects, boosted probabilities and copied Misprint.
- `npm run check` and `npm run build` — passed.

- `node --test tests/guide.test.ts tests/compact.test.ts` — 25 passed, zero skips
  or failures. `npm run release:check` passed (110 exported source files).

All checks were offline; no live game actions or mod changes were made.
Restart the MCP process to load the rebuilt output contract.

## Steamodded blind Tag cycles in scoring snapshots — 2026-10-13

Selecting a Small or Big Blind under Steamodded retains the skip-reward Tag in
`G.GAME.round_resets.blind_tag`. Its Sprite points back to the Tag, so copying
the entire `round_resets` table failed with `Cyclic scoring value`. The live
exporter now projects only `ante`, `hands` and `discards`, the round-reset fields
needed by the independent scoring path. UI objects and blind prototypes are not
exported; cycle validation remains active for scoring values. No live objects
are modified. Updated the sandbox documentation and original-score round-trip
fixtures to include the cyclic Tag/Sprite relationship.

Executed checks:

- `luajit tests/score-snapshot.test.lua` — the new cyclic Tag regression failed
  before the source fix with `Cyclic scoring value`; after the fix, all 16 checks
  passed, including identical scoring input with and without the UI Tag and
  preservation of the live cycle.
- `luajit tests/observation.test.lua` and `luajit tests/decision.test.lua` —
  88 and 38 checks passed respectively.
- `node --test tests/plays.test.ts` — 10 passed, zero skips or failures. Original
  scoring round trips now include cyclic blind Tags, and HTTP observation still
  reaches the persistent worker.
- `node build/snapshot-tag-smoke.ts` — the temporary API smoke scenario exported
  a ready snapshot from original-game state with a cyclic UI Tag, then returned
  seven recommendations from one LuaJIT source load and one position load.
  The leading recommendation was `0 1: Pair 210`. Removed the script afterward.
- `npm run stage-mod` — staged the repaired standalone mod.
- `npm run release:check` — distribution audit passed (110 source files).

Verification was offline. No live game actions, mod installation or game restart
were performed. The installer requires Balatro to be closed; install the staged
mod and restart the game to load the repaired exporter. Restarting only the MCP
process does not reload this Lua code.

## Stop automatic plays advice — 2026-10-13

MCP observations, action results and operation inspections no longer return
`plays`. Removed the backend's automatic sandbox worker integration and its
post-scoring revision read. The mod no longer loads or builds scoring snapshots
or advertises `scoring_snapshot`. Independent offline sandbox scoring and the
snapshot exporter remain available. Updated the output schema, guide and current
documentation to match.

Executed checks:

- `npm run check` — passed.
- `node --test tests/bridge.test.ts tests/compact.test.ts` — 43 passed.
  Regressions cover legacy-field filtering, exact read/action RPC counts, and
  full/delta observations without plays.
- `npm test` — build passed; 98 tests passed, two skipped, zero failures.
- `luajit tests/observation.test.lua`, `luajit tests/decision.test.lua` and
  `luajit tests/score-snapshot.test.lua` — 88, 38 and 16 checks passed.
  A throwing snapshot reader confirms the bridge never invokes it.
- `npm run stage-mod` — staged the updated standalone mod.
- `npm run release:check` — distribution audit passed (110 source files).

Verification was offline. No live game actions, installation or restart were
performed. Restart MCP to load the server change; install the staged mod and
restart Balatro to stop the old mod from constructing scoring snapshots.

## Decision-oriented game_analyze redesign — 2026-10-13

Replaced `docs/game-analyze-design.md` with a proposal organized around situation,
baseline, candidate consequences, tradeoffs, coverage and unknowns. It preserves
on-demand read-only analysis and existing observation/action behavior. The design
prefers the independent sandbox over a new full TypeScript scorer, separates
exact/conditional/sampled results, allows caller-specified actions, and prioritizes
shop costs and Boss preparation before broader draw search. Future engine fuel
and partners remain explicit hypothetical scenarios, not current offer returns.

Executed checks:

- An in-memory Node/TypeScript check extracted both TypeScript blocks and the
  JSON example from the document. The draft contracts and example compiled with
  strict checking and zero diagnostics; example actions passed the existing
  ActionSchema, candidate references and work counts were consistent, and the
  documented eight-card selection count was confirmed as 218. No temporary
  source file was written.
- An offline ScoringSandbox API smoke loaded two ordinary Kings and a Blue Seal
  Ace. Both requested selections, `[0,1]` and `[0,1,2]`, returned Pair, score 60
  and scoringCards `[0,1]`, matching the document's arithmetic. This verified
  single-hand scores only; it did not execute round-end Planet generation.

Documentation only. No runtime code, tool schemas, gameplay skills or gameplay
behavior changed. No build, project test suite, mod staging, installation, game
actions or live deployment validation were performed. The proposed game_analyze
tool, budgets and strategy gains remain unimplemented and unmeasured.

## Shorten game_analyze proposal — 2026-10-13

Reduced the proposal from 477 to 120 lines, removing full result types, the large
JSON example, repeated explanations and speculative tuning details. Preserved
decision comparisons, input semantics, quality labels, public-information and
revision boundaries, module scope and delivery order. An in-memory strict
TypeScript check of the remaining input draft passed with zero diagnostics;
Markdown code fences were balanced. Documentation only; no runtime or game checks.

## Rewrite game_analyze proposal around balatro-ai's evidence — 2026-10-13

Rewrote `docs/game-analyze-design.md` as a numeric brief for the deciding model.
The design follows the adjacent balatro-ai experiment log and plan: the model keeps
every decision, shop-side numbers (build pace, offer deltas, economy, skip value,
next-ante horizon) carry the most value, and in-blind scores must be exact. It
adds original-engine scoring through `env/sandbox`, caller-supplied hypothetical
lines, a Boss vulnerability profile, in-round state commits and a prediction
audit against real play results. The snapshot boundary now allows whole `ability`
copies as internal sandbox input and puts the hidden-information check on model
output; staging starts with an unpublished foundation stage.

Executed checks:

- Read balatro-ai's README, architecture, strategy library, experiment log, plan,
  coach prompt and the analysis, pace, economy and survival modules for method
  only; no source was copied.
- Read this repository's sandbox README, `runtime.lua` structure, `worker.lua`,
  `score_snapshot.lua`, `play/client.ts`, `src/server.ts`, `tools/index.ts` and the
  bridge fingerprint to ground reuse and concurrency statements.
- A Node check found six balanced code fences and parsed both JSON examples
  (444 and 878 bytes). The hand example's arithmetic (Flush 560 and 520, Pair
  180, Flush 850 after Jupiter) was worked by hand from level-1 base values.

Documentation only. The build example's numbers are invented for format, and the
budget table is an estimate from the sandbox README's single benchmark. No
runtime code, tool schema, sandbox run, build, test suite, mod staging or game
action was executed.

## game_analyze stage 1: hand brief, economy and play audit — 2026-10-13

Implemented the first slice of `docs/game-analyze-design.md` (status table in its
section 11). The mod gains the on-demand read-only `sf.analysis_snapshot` RPC and
an `analysis_snapshot` capability; `score_snapshot.lua` exports the sandbox input
with face-down held cards as identity-free placeholders plus the money rules the
game shows. The server gains `env/analysis/` and the `game_analyze` tool: exact
scores for every legal selection through the original scoring code in
`env/sandbox`, one best play per poker hand, plays that keep a Blue Seal or Gold
card or avoid resetting a Joker, Planet use, Joker and hand order suggestions,
caller-supplied lines, and economy, reward and skip lines outside a hand. A play
made at an analysed revision is compared with its prediction; a mismatch
suspends `exact` labels for that run. The sandbox runtime gained ordered scoring
and per-trial Joker growth reporting. Ordinary observations and the revision
fingerprint are unchanged.

Executed checks:

- `npm run check` passed.
- `npm test` passed: 111 tests, 109 passed, 2 skipped (the existing macOS-only
  installer cases). New coverage: selection enumeration, economy arithmetic, the
  hand brief on positions exported from the headless original engine (Flush 560
  and 520, Pair 180 and Flush 850 after Jupiter, as in the design example),
  Joker-order and hand-order suggestions, lines, Joker growth facts, face-down
  cards, a forced card, The Hook, revision and stale-state handling, the audit,
  the client's capability gate and lock behaviour, the MCP schema, and one
  end-to-end path over the HTTP client and the scoring worker.
- `luajit tests/observation.test.lua` (88), `tests/decision.test.lua` (38) and
  `tests/score-snapshot.test.lua` (27) passed.
- `npm run stage-mod` and `npm run release:check` passed.
- Measured locally with 8 held cards and 5 Jokers: about 0.9 ms per position
  load and 31 ms to score all 218 selections with full results.
- Without LuaJIT, and without the prepared source, the tool returned
  `status: unavailable` with the reason and no path in the message.

All verification was offline. The staged mod was not installed, Balatro and the
MCP process were not restarted, and no live game action or analysis was run, so
agreement between predicted and actual scores under Steamodded is unverified.
Build pace, offer values, draw continuation, Tarot use, Boss and engine analysis
are not implemented.

## game_analyze stage 2 (part): build brief, Boss pool and Tarot use — 2026-10-13

Outside a hand, `sf.analysis_snapshot` now also exports `build`: every playing
card as one sorted pool (no order or area), Jokers, consumables, levels, the
whitelisted `G.GAME` fields, this Ante's blinds with targets from
`round_resets.ante`, base amounts for later Antes, shop / voucher / opened-pack
offers with index and price, and the Bosses `get_new_boss` can draw next by its
eligibility and least-used rule (omitted when Steamodded's weighted draw is on).
The analysis samples 32 fixed shuffles of that pool against each open blind and
returns `pace`, `jokers`, `offers` and `horizon`; `focus:"boss"` adds `bosses`.
In the hand brief, `use` and `lines` price held Tarots on target cards through
the original conversion code. The sandbox gained `applyBlind`, `jokerEdits`
(original `add_to_deck` / `remove_from_deck`), per-card `convert`, round
parameters on load and a `best` call that groups selections by poker hand and
scoring cards. Ordinary observations and the revision fingerprint are unchanged.

Executed checks:

- `npm run check` passed.
- `npm test` passed: 113 tests, 111 passed, 2 skipped (the existing macOS-only
  installer cases). New coverage: Strength and The Chariot on their best targets
  (Three of a Kind 180, Pair 90 with a held Steel card), Tarot lines and target
  count errors, the build brief on a headless shop (pace, shares, Cavendish
  +200%/hand, Grabber as a fifth hand, held Jupiter, horizon, unpriced Tarot and
  voucher), deck-order invariance, the replacement row with full Joker slots,
  Boss rows sorted weakest first, and the three-key schema change (`focus:"boss"`
  accepted, `engine` rejected).
- `luajit tests/score-snapshot.test.lua` (35), `tests/observation.test.lua` (88)
  and `tests/decision.test.lua` (38) passed.
- `npm run stage-mod` and `npm run release:check` passed.
- Measured locally: `best` over 32 samples of a 13-card pool took about 0.5 s
  (about 30 scorings per sample instead of 1,287). A first build brief took about
  2.6 s with 2 Jokers and 4 offers, about 5.3 s with 5 Jokers including Baron and
  Steel cards (every selection scored); a repeat call on the same build about
  3 ms from the per-connection cache; `focus:"boss"` added about 5–6 s.

All verification was offline against the vendored 1.0.1o source. The staged mod
was not installed and no live shop was analysed. The Steamodded dump was read
to confirm that `round_resets.ante` drives blind targets and that Boss counts sit
under `bosses_used.boss`; neither was exercised in the running game.

## Expected random scoring for game_analyze — 2026-10-14

Changed every game_analyze scoring path (hand, consumables, order, caller lines
and build comparisons) from minimal to expectation. The sandbox replays the
original scoring code over independent public chance outcomes, weighting final
rounded scores rather than substituting average multipliers. Lucky, Bloodstone,
Space Joker, Misprint, Business Card and Reserved Parking include public odds,
probability boosts, retriggers, copied effects and same-hand dependencies. Small
trees are enumerated; after 256 tree evaluations, an incomplete tree is discarded
and 256 deterministic Halton integration points estimate its mean. Large-tree
rows are explicitly labelled estimated expectation. Expected rows never claim a
guaranteed clear and never enter exact play audits. Build clear figures are
documented as proxies from expected hand scores, not chance-aware probabilities.

The expectation policy ignores supplied seeds and RNG streams and omits the seed
from its result, including deterministic alternatives. Model briefs still expose
only derived public numbers. Nonidentical branch growth is not reported as a
guaranteed Joker change; estimated means omit growth facts entirely. Unknown
scoring randomness remains unsupported. Existing offline seeded, fixed and
minimal APIs and score-only lifecycle boundaries remain available.

Executed checks:

- `npm run check` passed.
- `npm test` passed: 118 tests, 116 passed, 2 skipped (Windows-only installers).
  New checks cover analytical means, final flooring, nonlinear Plasma scoring,
  probability boosts including certainty and zero probability, Lucky Cat
  correlation, retriggers, Blueprint, random money crossing Bootstraps' threshold,
  search API agreement, restoration, explicit quadrature labels, expected hand
  and consumable lines, build offer changes, audit exclusion, and invariance under
  different supplied seeds and RNG streams with no seed in results.
- `luajit tests/observation.test.lua` (88), `tests/decision.test.lua` (38) and
  `tests/score-snapshot.test.lua` (35) passed.
- `npm run stage-mod`, `npm run release:check` and `git diff --check` passed.
- One offline 8-card hand with 5 Lucky cards, a held Steel card, Bloodstone and
  Lucky Cat: all 218 selections scored in about 459 ms, no failures; one
  selection needed the explicitly labelled quadrature fallback.

All verification was offline. No live game action or analysis was run, no staged
mod was installed, and the running MCP process was not restarted. Server restart
is required to load the new analysis code and scoring worker. Mod sources did
not change.

## Direct random-effect means without repeated scoring — 2026-10-14

Replaced the preceding branch enumeration and integration implementation with
the user's requested direct effect means. Each selection now runs the original
score pipeline once. Misprint uses its configured midpoint (11.5 by default),
chance-based additive effects use probability times payout, and a chance p of
Xk becomes X(1+p*(k-1)). Public probability boosts and original copy/retrigger
dispatch still apply. Fractional scores are retained before final rounding.
There is no enumeration, integration, or numerical sampling fallback for random
scoring effects; the 32 public-deck shuffles for build composition remain.

The user explicitly chose mean propagation with an interaction-approximation
label for nonlinear or correlated cases. Space Joker applies a mean fractional
level; Lucky Cat grows by the probability of at least one Lucky reward per
activation; money effects update mean dollar buffers. Space Joker, Lucky Cat
correlation, Bootstraps thresholds and Plasma balance identify their specific
approximations in metadata and model notes. Affected hand, pace and offer rows
are labelled. These final scores are not claimed to equal the exact expectation
of every original rounded outcome. Mean Joker growth is not reported as a
guaranteed growth fact. Reserved Parking uses the held-effect search path, since
its mean money can affect Bootstraps. Paired build comparisons retain and cache
approximation reasons.

Unknown random effects report a missing-rule error; the guide and protocol tell
the model to ask the user for a rule. Seeds and RNG streams remain ignored and
absent from expectation results. Exact-play audits still exclude expected rows.

Executed checks:

- `npm run check` passed.
- `npm test` passed: 118 tests, 116 passed, 2 skipped (Windows-only installers).
  Updated checks cover configured Misprint means and fractional scores, the
  user's 1/4 chance of X2 -> X1.25 example, probability boosts, independent
  multiplier retriggers/copies, mean money and fractional levels, explicit
  nonlinear labels on hand and paired shop offers, seed invariance, restoration,
  and exactly one engine calculation per scored selection.
- `luajit tests/observation.test.lua` (88), `tests/decision.test.lua` (38) and
  `tests/score-snapshot.test.lua` (35) passed.
- `npm run stage-mod`, `npm run release:check` and `git diff --check` passed.
- In three offline repeats, all 218 selections of an 8-card hand took about
  23–26 ms without random effects, 15–21 ms with one Lucky card, and 31–37 ms
  with five same-rank Lucky cards, held Steel, Bloodstone and Lucky Cat.
  Every run executed exactly 218 calculations with no failures. The corresponding
  minimal runs took about 21–25, 25–28 and 33–37 ms respectively; these are small
  local timing probes rather than general latency guarantees.

All checks and timing probes were offline. No live game action, installation or
MCP restart was performed; restart the MCP server to load the updated worker.

## Deterministic shared-deadline regression test — 2026-10-14

GitHub Actions run 38497832780 failed only in the Windows test job. The shared
caller-deadline test allowed 100 ms for an observation requiring two HTTP
responses delayed by 40 ms each. Runner overhead exhausted the deadline during
observation, before the action assertion could exercise the shared budget.

The test now mocks `performance.now()` and advances logical time by 4 seconds
per immediate HTTP response against a 10-second deadline. Initial observation
uses 8 seconds; action preflight crosses the same deadline at 12 seconds. It
asserts a timeout with `applied=false`, the exact three read requests and no
action identifier. An accidental action dispatch receives a valid success
response so it cannot pass the test as a timeout. Production code is unchanged.

Executed checks on Windows with Node 24.13.0:

- The targeted shared-deadline test passed.
- `npm run check` passed.
- `npm test` passed: 118 tests, 116 passed, 2 skipped (macOS-only cases).
- `npm run release:check` and `git diff --check` passed.

Verification was offline; the GitHub Actions run has not been rerun with this
local change. No live game action, installation or MCP restart was performed.

## Remove redundant test assertions — 2026-10-14

Removed assertions for the installed mod's display name and author, the exact
current gameplay skill list, arbitrary context-size ratios and fixture byte
counts, repeated calls to removed tools already excluded by the complete tool
list, and a redundant guide-generation no-throw assertion. Kept the 2,000-character
bootstrap limit, controlled discovery fixtures, guide coverage, mod identity,
entrypoint and coexistence checks. Reduced the repeated 2,048-selection sandbox
batch from three runs to one; restoration and process reuse assertions remain.

The overall-action preflight deadline test now advances a controlled clock and
asserts both health and observation requests occurred before timeout. Moved the
game_start budget regression from a child-process timing test to the registered
tool handler with the real HTTP backend and a controlled clock. It verifies the
initial observation and action preflight share the deadline and no action is
dispatched. Removed the unused delay mechanism from the stdio test harness.
Production code is unchanged.

Executed checks on Windows:

- `npm run check` passed.
- `npm test` passed: 118 tests, 116 passed, 2 skipped (macOS-only cases).
- `npm run release:check` and `git diff --check` passed.

All verification was offline. No live game action, installation or MCP restart
was performed.


## Align gameplay resources and tool instructions — 2026-10-14

Aligned bootstrap instructions, the decision protocol, the tool guide and
analysis description, and the Gold Stake Coach entrypoint and decision tables.
Transient animation/event/phase waits permit bounded host-controlled read-only
recovery (1, 2, 4 second waits; at most three observations within 15 seconds).
Terminal outcomes take precedence; dialogs, unknown blockers, backend failures
and unresolved mutations retain their stopping/recovery requirements. No
automatic mutation retries were added.

Analysis is now driven by consequential uncertainty rather than every phase,
purchase or pack. Relevant state changes invalidate old exact predictions.
Scoring labels do not establish execution legality: proposed Tarot targets and
caller lines must respect forced selections and other action constraints.
Cerulean Bell's discard and card-targeted use requirements are explicit.
Partial/order-budget-limited results may omit better arrangements.

Updated the seven-tool inventory, removed the obsolete absence-of-preview claim,
and aligned Joker deltas with the complete-array replacement contract. The guide
and protocol are the referenced field and execution contracts. Both existing
pre-action explanation requirements were checked against Git HEAD and preserved
verbatim, as requested. Changes are resource/prompt text and documentation;
scoring, mutation validation and bridge algorithms are unchanged.

Executed checks:

- npm run check passed.
- npm test passed: 118 tests, 116 passed, 2 skipped (Windows-only installers).
  Existing coverage includes MCP initialization/resource reads, skill expansion,
  generated guide fields, Joker delta replacement and the offline scoring bridge.
- Gold Stake Coach quick_validate.py passed under conda's torchx environment.
- Bootstrap instructions are 1,849 characters, below the existing 2,000-character
  test limit.
- npm run release:check passed (117 exported source files).
- git diff --check passed.

All verification was offline. No live game action, mod installation or MCP
restart was performed. npm test rebuilt dist; restart the MCP process to load
the updated initialization instructions, guide and tool descriptions.


## Deduplicate gameplay prompts and load analysis on demand — 2026-10-14

Moved execution/recovery/legality/analysis-cadence instructions into the protocol,
field and delta definitions into the guide, and score labels, caller lines,
audits and sampling limitations into the new balatro://analysis resource.
Coach and its decision tables now contain strategy rather than tool inventories,
state formats, duplicated mechanics or Boss encyclopedias. Installation and
maintenance guidance remains in the existing human-facing documentation.

The pre-action explanation paragraph from the previous Coach was preserved
verbatim in the protocol; its frequency and requirements were not reduced.
The full balatro://context/rules compatibility resources remain available, but
normal bootstrap guidance uses small resources and object/chapter lookup.
No scoring, bridge, mutation-validation or gameplay algorithm changed.

Measured character counts against the aligned prompts immediately before this
simplification (not token counts, and not total host context):

| Content | Before | After |
| --- | ---: | ---: |
| Bootstrap instructions | 1849 | 715 |
| Protocol | 5436 | 2334 |
| Field guide | 18057 | 4745 |
| Coach entrypoint | 19036 | 3243 |
| Decision comparisons | 9679 | 3136 |
| Five game-tool descriptions in tools/index.ts | 5666 | 929 |

The initial protocol + guide + Coach reads total 10322 characters instead of
42529, a 75.7% reduction. The separate analysis reference is 4745 characters
and is loaded before first analysis. Actual context depends on host tool-schema
presentation and which optional references are read.

Executed checks:

- npm run check and npm run build passed.
- Targeted context/guide/MCP tests passed: 17/17, including listing and reading
  the new resource through built stdio, full-reference compatibility and field
  coverage. Bootstrap budget is now 800 characters; game-tool descriptions have
  a 350-character budget instead of repeating the complete field guide.
- npm test passed: 118 tests, 116 passed, 2 skipped (Windows-only installers).
- Gold Stake Coach quick_validate.py passed under conda's torchx environment.
- Compared the explanation paragraph to the pre-simplification text and verified
  its verbatim presence in the protocol and removal from duplicate locations.
- npm run release:check passed (118 exported source files).
- git diff --check passed.

All checks were offline. No live game action, mod installation or MCP restart
was performed. The build is ready; restart the MCP process to load the shortened
initialization/tool descriptions and the new analysis resource.

## Final Boss defeat outcome precedence — 2026-10-14

The original 1.0.1o end_round sets G.GAME.won at the winning Ante's Boss
before branching on game_over. A failed final Boss can therefore have both
won=true and phase GAME_OVER. The bridge now resolves GAME_OVER as lost before
checking won, without changing the original run state or scoring logic.

The Lua regression covers a completed final play and a fresh observation at
214390/400000, ordinary game-over loss, and successful winning settlement.
The compact regression verifies outcome, runResult and the action's Run lost
text for the same score, including the +9922 delta. The Lua regression failed
at the loss assertion before the bridge fix and passed afterward.

Executed checks on Windows:

- npm run check passed.
- npm test passed: 119 tests, 117 passed, 2 skipped (macOS-only cases).
- LuaJIT decision, observation and score-snapshot suites passed: 50, 88 and
  35 checks respectively.
- npm run stage-mod passed; the corrected mod is staged for installation.
- npm run release:check and git diff --check passed.

Live read-only game_health and game_observe confirmed the existing run still
reports the faulty won outcome at GAME_OVER with 214390/400000 under the old
loaded mod. The corrected behavior was verified offline; no gameplay action,
mod installation or game restart was performed. Install the staged mod and
restart Balatro to load the correction.

## Refill scoring throughput benchmark — 2026-10-14

Measured the proposed one-step refill workload with the existing sandbox, without
implementing the next/line feature. The local reproduction script and raw timings
are saved in ignored build/bench-refill.ts and build/bench-refill-results.json.
Run with node build/bench-refill.ts from the repository root.

Environment: Apple M4, macOS arm64, Node v24.14.1, LuaJIT 2.1.1788856981.
Each timed run used one persistent worker, 64 different refill samples, an
8-card hand and all 218 legal 1-to-5-card selections per sample: 13952 engine
evaluations. The scenario discards the last three hand cards and draws three
from the 44-card draw pile without replacement; all 52 cards remain represented
across hand, draw pile and discard. Inputs are complete live-format snapshots
exported by tests/analysis-fixture.lua. Random scoring uses expectation mode.
Sample generation, fixture export, worker startup and warmup are outside timing;
all 64 state loads, scoring calls, validation and best-score reduction are inside.
No candidate grouping, score memoization or parallel workers were used.

Three repetitions per configuration and interface produced these elapsed times
(median, with min-max in parentheses):

| Five-Joker configuration | Structured scoreBatch | Scalar scores |
| --- | --- | --- |
| Joker, Green Joker, Blue Joker, Abstract Joker, Cavendish | 8.31 s (7.93-8.41) | 6.98 s (6.96-9.20) |
| Blueprint, Baron, Mime, Steel Joker, Cavendish; three Red Seal Steel Kings | 11.16 s (11.03-11.85) | 10.85 s (9.79-11.52) |
| Bloodstone, Oops! All 6s, Lucky Cat, Space Joker, Bootstraps; three Lucky Kings | 8.99 s (8.95-9.00) | 7.52 s (7.52-7.73) |

All 18 timed runs completed exactly 13952 finite scores. Ordered score digests
matched across all repetitions and both interfaces within each configuration;
the random configuration's structured rows all carried expectation and
interaction-approximation metadata. State loading accounted for 0.58-1.01 s per
run; score calls accounted for most elapsed time. Initial worker load was
36-38 ms. The scalar interface omits hand-type and approximation metadata, so
these scalar timings alone do not validate a complete next-analysis response.

The earlier estimate of roughly 2 s per 64-sample route does not hold for these
complete snapshots. Four sequential routes were not benchmarked, nor were
post-play growth/destruction/Boss state transitions, the live bridge, or win-rate
effects. All measurements were offline; no gameplay action, mod installation or
MCP restart was performed.

Follow-up profiling for a possible C implementation used the ordinary
configuration only. build/profile-core.lua ran the same 64 full snapshots and
13952 scalar evaluations directly in Lua, with four warmup samples and jit.p
profiling around the timed loop. Two runs consumed 3.34 and 3.28 CPU seconds;
the second complete process took 3.75 s wall time (including input decoding and
startup). The last statistical profile in build/refill-profile.txt attributed
about 40% of samples to interpreted Lua, 21% to GC, 20% to compiled Lua, 14% to
C and 6% to JIT compilation (rounded). Baseline restoration was about 9% of all
samples (45% within the compiled category); the first run put it at about 11%.
These are sampling observations, not exact phase timers.

A subsequent single ordinary scalar run through the Node worker API took
5.48 s, including 0.66 s loading and 4.82 s scoring calls. Its score digest
matched the earlier ordinary runs. Direct Lua and worker measurements are
separate harnesses and runs; their difference does not isolate IPC overhead or
establish a guaranteed speedup from C. No C scorer was implemented or measured.
The proposed C speedup ranges remain engineering estimates.

## On-demand refill analysis design — 2026-10-14

Updated game-analyze-design.md with the planned lines + next interface,
hand/reach/best queries, paired refill samples, state-transition boundaries,
shared time budgets, measured throughput and the optional C prototype path.
The implementation table continues to mark next and engine as unavailable.
Reviewed the changed sections for consistency, parsed the new JSON example,
and ran git diff --check. Documentation only; no runtime schema or gameplay
behavior changed, and no additional gameplay or performance test was run.

## Sandbox presentation-layer performance analysis — 2026-10-14

Performed isolated experiments in ignored build files; production runtime and
vendor source were not changed. build/sandbox-ui-analysis.md records methods,
limitations, raw timing links and recommendations. Each structured workload
scored 64 full snapshots with 218 selections in expectation mode. Three repeats
per scenario and variant gave 27 complete runs (376704 scores). Full structured
result digests matched between baseline, evaluate_play-only presentation
stripping, and evaluate_play plus calculate_joker stripping.

Median seconds, baseline / evaluate-only / both: ordinary 7.33 / 8.45 / 23.65;
held retriggers 16.81 / 19.01 / 12.41; random expectation 9.04 / 6.31 / 52.59.
Baseline and both-function stripping were interleaved; evaluate-only stripping
was measured later. Gains are scenario dependent; no variant was adopted.

Additional ordinary scalar core profiles took 3.34 and 1.78 CPU seconds for
baseline and both-function stripping. A separate full worker protocol profile
attributed about 67% and 91% of samples to JIT compilation respectively; these
are statistical samples, not exact timers. Increasing maxtrace/maxmcode to 8192
did not remove the regression: one complete baseline/stripped pair took 6.29 /
61.06 s with matching result digests. Remaining tuning runs were stopped. The
JIT failure/exit/cache mechanism was not isolated, and no universal speedup is
claimed. No full MCP latency, live gameplay, installation or restart was tested.

## Aggressive score-only engine pruning experiment — 2026-10-14

Generated isolated normal-JIT and interpreted-Joker-adapter variants under ignored
build/max-pruned and build/max-pruned-interpreted. build/max-prune.ts uses a local
luaparse install to slice unreachable functions and lifecycle branches, remove
presentation/event code, specialize Joker handlers and reduce initialization.
The nine engine modules shrink from 816400 to 217456 bytes (73.4%). Successful
score-only evaluation returns normally instead of using a completion exception.
Both variants reject seeded/fixed/trace inputs and remain experiments. Production
source and the default sandbox were not replaced.

Differential checks covered 181 positions, all 150 Jokers and 40001 structured
normal/ordered scores, matching original results. The normal-JIT engine passed
all 13 analysis tests with original-engine fixtures and no skips, including the
local HTTP bridge/worker path. The interpreted-adapter variant passed the two
random hand/build analysis tests. Generated modules passed LuaJIT compilation.

Three-repeat medians (seconds), original / pruned JIT / pruned interpreted
adapter: ordinary 13.76 / 1.74 / 2.74; held retriggers 10.96 / 3.76 / 16.33;
random expectation 13.56 / 34.43 / 5.29. Each run scored 13952 selections across
64 full states, including load/structured worker communication and validation.
All complete runs matched full-result digests. Original and pruned JIT were
interleaved; interpreted-adapter measurements followed separately. No automatic
mode selection or universal speedup is claimed. Failed driver/adaptive/mean
adapter probes were not adopted; interrupted runs remain clearly named partial
artifacts. See build/max-prune-report.md for reproducibility and scope. No live
gameplay, installation or MCP restart was performed.

## Pruned-engine JIT regression diagnosis — 2026-10-14

Added isolated diagnostics and confirmation harnesses under ignored build files.
On Apple M4 / macOS 26.6.2 arm64 / Homebrew LuaJIT 2.1.1788856981, one pruned
random-expectation diagnostic run recorded 338033 trace starts, 88067 aborts and
2112 machine-code allocation failures, each followed by a cache flush. Two
additional flushes came from profiler start/stop. Statistical profiling placed
about 87% of samples in the JIT compiler. Increasing only maxmcode to 8192 still
produced 1020 allocation failures. Removing the generated Joker dispatch tail
call did not resolve the regression. Increasing only sizemcode to 2048 removed
allocation failures in the diagnostic run; all full-result hashes matched.
An events-only follow-up, without the sampling profiler, recorded 1076 allocation
failures and 1076 flushes in 14.406 s; sizemcode=2048 recorded neither in 0.744 s,
with matching full-result digests. This excludes profiler start/stop as the source
of the sustained allocation/flush cycle.

An independent confirmation used the existing ScoringSandbox API, unchanged
worker and schema, with no diagnostic/profiler hooks. Three-repeat random-build
medians (seconds), original / pruned default JIT / same pruned source with only
-Osizemcode=2048: 3.180 / 20.121 / 0.800. Three-repeat control medians, pruned
default JIT / area2048: ordinary 2.424 / 0.742; held retriggers 16.744 / 0.857.
All 21 complete worker API runs matched their corresponding original full-result
digests; each run scored 13952 selections across 64 complete states after four
warmup states. These are a new batch, not a replacement for historical baseline
timings. The underlying mmap/kernel failure was not traced; conclusions concern
allocation/flush/recompilation behavior and the measured sizemcode workaround,
not a confirmed particular macOS defect or a cross-platform optimum.

See build/max-prune-jit-diagnosis.md and build/confirm-max-prune-area-results.json
plus build/confirm-max-prune-area-controls.json for scope and reproducibility.
Production source, the pruning generator, and default engine were not changed.
No full game_analyze latency, live gameplay, installation or restart was tested.

## Pruned-engine JIT allocation workaround applied — 2026-10-14

Updated build/max-prune.ts to prepend an early runtime JIT policy on macOS
arm64: sizemcode=2048 before source/prototype initialization. The normal variant
keeps all JIT enabled. Other platforms retain defaults. The policy lives in the
generated runtime, so direct runtime callers and the existing worker launcher
both receive it without additional command-line flags. Regenerated normal and
interpreted-adapter engines; manifests record jitPolicy and new runtime hashes.
Preserved the pre-fix engine separately under ignored build files.

Validation:

- 181 differential positions / all 150 Jokers / 40001 structured normal and
  ordered scores matched the original engine, including unsupported boundaries.
- Normal pruned analysis suite passed 13/13 with no skips; interpreted-adapter
  random hand/build analysis tests passed 2/2. These are offline tests, including
  the local HTTP bridge/worker integration, not live gameplay.
- A separate benchmark used the existing ScoringSandbox API and the generated
  launchers, with no diagnostic hooks or extra JIT options. Three-repeat random
  expectation medians were 21.185 s before / 0.804 s fixed (26.4x). Fixed ordinary
  and held-retrigger medians were 0.745 / 0.775 s. All 12 complete runs matched
  original full-result digests; each run scored 13952 selections over 64 states.
- Direct loading of the fixed runtime, without extra JIT startup options, recorded
  zero machine-code allocation failures and zero flushes in the events-only
  diagnostic; its full-result digest matched the original.
- Generated modules/runtime/worker passed LuaJIT bytecode compilation; manifest
  runtime hashes verified; git diff --check passed.

Implementation and evidence remain under build/max-prune.ts,
build/bench-max-prune-jit-fix-results.json and build/max-prune-report.md. The
production default engine, vendor source and live game/mod were not replaced.

## Independent pruned engine relocated beside vendor — 2026-10-14

Moved the final normal-JIT engine from build/max-pruned to env/sandbox/pruned.
The new directory contains all nine pruned engine modules, its own runtime,
worker and JSON codec. Removed the experimental shell wrapper that referenced
the old build path and routed fixture calls through vendor. The standalone worker
finds dependencies beside itself, accepts the existing projectRoot/source worker
arguments, and also runs without arguments from any cwd. The runtime retains the
macOS arm64 sizemcode=2048 policy. Only the adapter comment and missing-module
diagnostic changed; scoring logic and engine modules are preserved.

ScoringSandbox now selects a source directory's worker.lua when present and
otherwise uses the existing original-engine worker. Passing the pruned sourceDir
requires no custom Lua launcher, and the vendor default remains unchanged. The
local generation script targets the new directory and records hashes for all 12
executable files. Both original and derived game-source directories are excluded
from public distribution exports; the distribution regression test covers this.

Validation:

- New pruned-sandbox tests passed 3/3. An isolated copy in a temporary directory
  with spaces ran directly under LuaJIT without any project-root argument or
  project/vendor/build files. The TypeScript API also used that copied engine
  from a different cwd. Checks include seed-policy rejection, invalidation after
  rejected loads, repeated-position restoration, random expectation and ordered
  retrigger scoring against the original, plus executable manifest hashes.
- npm run check passed. npm test passed 120 tests, with only the two Windows
  installer tests skipped on macOS (122 total).
- The relocated engine passed the 181-position / 150-Joker / 40001-score
  differential harness. Its analysis integration suite passed 13/13 with no
  skips, including the local HTTP bridge/worker path.
- npm run release:check passed. Inspection of executable bundle files found
  only local source-directory loads and the built-in jit module; there is no
  runtime reference to vendor, play/mod or build. git diff --check passed.

Usage and supported scoring boundaries are in env/sandbox/pruned/README.md.
These checks were offline; no gameplay action, mod installation or restart ran.

## Build-directory cleanup readiness — 2026-10-14

Moved the remaining pruning maintenance workflow into tracked source:
scripts/prune-sandbox.ts, scripts/check-pruned.ts, scripts/bench-pruned.ts,
scripts/test-pruned-analysis.ts and tests/pruned-jokers.lua. The generator now
uses the root project's pinned luaparse@0.3.1 devDependency, project-relative
paths, the configured LuaJIT executable and the platform null device. Removed
its obsolete interpreted-mode shell wrapper and temporary-file writes. Commands
are exposed as sandbox:prune, sandbox:check-pruned, sandbox:bench-pruned and
sandbox:test-pruned-analysis. The analysis tests separate original fixture
constructors from the selected scoring engine, avoiding the old copied suite.

Consolidated key timing rows, result hashes and JIT event summaries into
docs/performance/pruned-engine-results.json, with the maintained explanation
and reproduction commands in docs/performance/pruned-engine.md. Historical
build paths in earlier validation entries describe disposable experiment files;
the current workflow does not depend on them. Failed variants and duplicate
source trees need not be preserved.

Before cleanup, preserved existing user data by moving build/mod-install-backups
(about 58 MB) to data/mod-install-backups and build/releases (about 3.6 MB) to
data/release-archives. These private directories remain excluded from Git and
distribution. Future installer/release commands still create their normal build
outputs; this preservation concerns the already existing backups and releases.

Validation ran with the entire build directory temporarily absent:

- Regenerated the final engine from another cwd; all 12 executable hashes
  remained byte-identical to the previous manifest.
- npm run check passed; npm test passed 120/122 tests, with only two Windows
  installer tests skipped on macOS.
- sandbox:check-pruned passed 181 positions, all 150 Jokers and 40001 scores.
- sandbox:test-pruned-analysis passed 13/13 with no skips.
- sandbox:bench-pruned -- --samples 2 --repetitions 1 completed all three
  scenarios; each original/pruned pair matched complete structured hashes.
  This was a command smoke test, not a new performance claim.
- release:check and git diff --check passed. None of these commands recreated
  build. The disposable build directory was restored after checking for the
  user's planned deletion; preserved backups/releases stay under data.

No live gameplay, mod installation or MCP restart was performed.

## Pruned engine moved to a sibling of sandbox — 2026-10-14

Moved the complete engine bundle from env/sandbox/pruned to env/pruned. The
independent pruned implementation is now beside the original sandbox, while
the original raw game modules stay under env/sandbox/vendor. Updated generator,
differential checker, benchmark, analysis test runner, regression tests, export
exclusion and documentation to the new path. Historical validation entries keep
their original paths. No runtime or scoring code changed.

Validation:

- Regeneration from another cwd targeted env/pruned and retained all 12
  executable hashes; the former env/sandbox/pruned directory was not recreated.
- npm run check and npm run build passed.
- Independent bundle/API tests passed 3/3; the original/pruned differential
  checker passed 181 positions, all 150 Jokers and 40001 structured scores.
- Pruned analysis suite passed 13/13 and distribution tests passed 2/2, with
  no skips. release:check and git diff --check passed.

No live gameplay, installation or restart was performed.

## Pruned maintenance scripts consolidated in the engine directory — 2026-10-15

Moved the four pruning maintenance TypeScript entry points into env/pruned:
generate.ts, check.ts, bench.ts and test-analysis.ts. Moved the differential
check helper from tests/pruned-jokers.lua to env/pruned/list-jokers.lua. Updated
relative imports, npm scripts and current documentation; no pruning maintenance
files remain in scripts. Existing shared analysis fixtures and regression tests
remain in tests. Historical validation entries retain their original paths.

Public distribution explicitly allowlists these authored maintenance tools while
continuing to exclude the generated game modules, runtime and bundle metadata.
No scoring code changed and no new temporary build files were created.

Validation:

- The relocated generator ran from another cwd; all 12 engine hashes were unchanged.
- npm run check and npm run build passed.
- The relocated checker passed 181 positions, 150 Jokers and 40001 scores.
- The relocated analysis runner passed 13/13 tests with no skips.
- Independent bundle/API and distribution tests passed 5/5 with no skips.
- The relocated benchmark completed all three scenarios with one sample each;
  original/pruned structured result hashes matched. This was a command smoke test.
- release:check and git diff --check passed, and a reference scan found no active
  references to the former scripts paths or the former Lua helper path.

All checks were offline; no gameplay, installation or restart was performed.

## game_analyze defaults to the pruned engine — 2026-10-15

Analyzer now defaults to env/pruned, with explicit sourceDir and
BALATRO_SANDBOX_SOURCE retaining precedence. The standalone ScoringSandbox API
and CLI retain their original vendor default. Analysis tests keep original
constructors for fixtures and exercise the Analyzer default unless the dedicated
test-source override is supplied. Updated the current engine documentation.

Validation:

- node --test tests/analysis.test.ts passed 13/13 with no skips in 19.88 seconds,
  including shop/build comparisons, Boss analysis and the HTTP bridge path.
  Neither sandbox-source environment override was set.
- npm run check and npm run build passed.
- git diff --check passed.

All checks were offline; no gameplay, installation or MCP restart was performed.

## Caller lines and one-refill queries — 2026-10-15

Implemented `lines + next` for selecting-hand decisions: strict hand/reach/best
questions, terminal discard/play validation, sequential deterministic prefix
edits, original-observation card identities, per-route outcomes and remaining
resources/target. Current single-hand scoring and exact-play audit behavior are
preserved. Explicit next requests take priority over automatic use/order search.

The worker now materializes edits, exports an explicitly public successor state,
and searches all legal subsets for each refill. Hand queries only classify;
reach queries stop at the first qualifying choice; best queries accumulate a
maximum. State export preserves JSON arrays inside live card abilities. Changes
were made in the authored original adapter/worker and regenerated into the
independent pruned bundle and manifest.

Transitions use an explicit lifecycle support table. Supported scoring growth,
hand/Boss histories, Green/Burnt/Castle/Hit the Road discards and Ice Cream/Seltzer
decay/removal enter the next state. Unknown lifecycle/Boss rules, playing-card
destruction/creation, Purple Seal generation, Gold Seal play payouts and random
first-play outcomes are unavailable per route; expected first-play scores are
not used to select a blind-ending state. Next-hand random scoring still uses
expectation with approximation metadata. These are offline state adapters, not
a claim of live state-transition equivalence for every supported build.

Public draw pools retain copies and exclude hand/discard membership. Fixed
sample permutations are independent of game RNG, deck order and route order;
routes sharing a pool/rule use paired prefixes. A bounded connection cache
extends the same sequence from 64 to 128/256. Zero/one-card draws enumerate
actual copies and do not report synthetic sample hits. Four-outcome batches
rotate across routes; partial results only count completed outcomes.

Analysis now releases the game queue during computation. Opening/closing reads
remain serialized; mutations cancel active analysis and prevent stale results
or predictions from being published. Caller cancellation interrupts the worker;
failed/timed-out workers are discarded without replay.

Validation:

- `npm test` passed 133 tests; two Windows-only installer tests skipped (135
  total). Includes existing hand/build/Boss/HTTP analysis, new tool integration,
  malformed schema checks and mutation-during-analysis cancellation.
- `tests/next.test.ts` covers copy-weighted enumeration, full-scoring reference
  comparisons for all three queries, Boss legality/history, deterministic growth
  and after-hand decay, unsupported routes, sequential conversions, paired samples,
  route/deck reordering, cache reuse/extension, budgets and cancellation.
- `npm run sandbox:check-pruned` passed 181 positions, all 150 Jokers and 40001
  structured scores against the original engine.
- Independent-bundle tests include transition/refill requests from an isolated
  directory with no project/vendor files.
- `luajit tests/score-snapshot.test.lua` passed 35 checks.
- `npm run check`, `npm run build`, `npm run release:check` and `git diff --check`
  passed.

`npm run analysis:bench-next` measures four-route best queries, 64 refills per
route, with three independent first-request runs per configuration. On Apple M4,
Node v24.14.1, medians from a separate run without concurrent regression jobs:

| Scenario | Median | Completed outcomes per run |
| --- | ---: | ---: |
| Ordinary / deterministic growth | 3.800 s | 4 x 64 |
| Baron / Mime / Blueprint retriggers | 4.440 s | 4 x 64 |
| Random scoring effects by expectation | 4.185 s | 4 x 64 |

All nine runs completed all four routes. Ordinary/retrigger scenarios compare
two discard and two play routes; the random scenario compares four discard
routes because random first-play state transitions are unsupported. Timing
includes worker startup, snapshot validation, current-hand scoring, transitions,
refills/search and summaries; excludes real HTTP reads and gameplay. No warm
cache is reused between repetitions. Larger samples can be reproduced with
`npm run analysis:bench-next -- --samples 128 --repetitions 3` (or 256); those
larger workloads were not measured in this validation.

All checks were offline; no gameplay, installation or MCP restart was performed.

## Discard-only hit rates — 2026-10-15

Supersedes the public caller-lines/one-refill interface recorded above.

Replaced public `lines` with `discards` (1–4 arrays of 1–5 current hand
indices) and reduced `next` to a snake_case target hand. Each independent
strategy completes exactly 256 samples, even for zero/one-card refills. Success
returns only `{rates:[...]}` inside the existing tool envelope, in input order.
No hand-score brief, strategy echo, status, audit or score distribution is added.

Analyzer dispatches this path before hand scoring. Worker `discard_hits`
removes selected cards and classifies legal subsets, retaining Four Fingers,
Shortcut, Smeared, Wild/Stone and relevant Boss restrictions/history. Scoring
Joker lifecycles, payouts and Purple Seal consumable generation do not block
classification. Hook pre-scoring effects are irrelevant to the chosen hand's
classification. Unknown held cards and unmodelled Cerulean Bell selection or
Crimson Heart changes to classification Jokers still return a single error.
Failed, cancelled or incomplete work never publishes partial rates. Snapshot
consistency checks and mutation cancellation remain in place.

Public pools preserve actual copies and paired draw prefixes without using game
RNG or hidden draw order. The connection cache remains bounded to 64 queries.
The old public multi-step route implementation was removed; the independent
offline sandbox transition/refill APIs remain. Authored Lua changes were
regenerated into the pruned runtime, worker and executable-hash manifest.

Updated README, served `balatro://analysis`, gameplay protocol, design, engine
references and CLAUDE.md. The benchmark is now `analysis:bench-discards`.

Validation:

- `npm run check` passed.
- `npm test` passed 130 tests, with two Windows-only tests skipped (132 total);
  the initial run found a remaining old request in the MCP test, corrected before
  the successful full rerun. Coverage includes strict schema rejection, exactly
  256 samples, paired draws, cache/order invariance, failures/cancellation, no
  scoring, Boss legality/history, Joker classification rules, compact tool
  results, unchanged observation baseline and the isolated pruned worker.
- `npm run sandbox:check-pruned` passed 181 positions, all 150 Jokers and 40001
  structured scores against the original engine.
- `npm run analysis:bench-discards` completed all nine independent runs across
  ordinary, held-retrigger and random-scoring builds; each evaluated four
  strategies at 256 samples and produced identical rates across repetitions.
  Timing overlapped regression work, so no performance comparison is claimed.
- `npm run release:check` and `git diff --check` passed.

All checks were offline; no gameplay, mod installation or MCP restart was
performed. Restart the MCP server to load the changed public tool schema.

## Full sandbox default with optional pruned engine — 2026-10-15

Changed Analyzer's default source from `env/pruned` to the complete original
`env/sandbox/vendor`, matching the standalone ScoringSandbox API and CLI.
Explicit `sourceDir` still takes priority over `BALATRO_SANDBOX_SOURCE`; either
can select the pruned engine. No automatic fallback or engine rule changes were
introduced. The discard-only interface still uses 256 samples and returns rates.

Updated README, CLAUDE.md, analysis design and both engine references with the
default and opt-in paths. Discard tests now use the full engine by default and
honor the analysis-test override. The existing pruned-analysis entry now runs
both analysis and discard suites, retaining a verified optional-engine path.

Validation:

- Full original source was already prepared locally; no source preparation or
  installation was needed, and no sandbox source environment override was set.
- `npm run check` passed.
- `npm test` (including build) passed 130 tests; two Windows-only tests skipped
  (132 total). Hand/build/HTTP analysis and discard classification ran against
  the full sandbox default.
- `npm run sandbox:test-pruned-analysis` passed all 23 hand/build/HTTP analysis
  and discard tests with the explicit pruned override.
- `npm run release:check` and `git diff --check` passed.

All checks were offline. No live gameplay, mod installation or MCP restart was
performed; restart the MCP server to use the new default in an existing session.

## Reduce discard samples to 64 — 2026-10-15

Changed the fixed discard sampling count from 256 to 64 per strategy. Rates now
use hits / 64; the paired public-deck sequence, full sandbox default, optional
pruned engine and rates-only response are unchanged. Updated the timeout message,
benchmark count, tests, served analysis guide, gameplay protocol and current
documentation. Earlier entries above describe the sample counts used at the time.

Validation:

- `npm run check` and `npm run build` passed.
- `node --test tests/discards.test.ts` passed all 8 tests with the full engine.
- The same 8 tests passed with the explicit pruned analysis-test override.
- The targeted `game_analyze returns only discard rates` integration test passed.
- `node --test tests/mcp.test.ts` passed all 7 tests against the rebuilt server.
- `git diff --check` passed.

All checks were offline. Restart the MCP server to apply the 64-sample setting
in an existing session; no gameplay or MCP restart was performed here.

## Remove legacy route simulation implementation — 2026-10-15

Corrects the earlier decision to retain unused route APIs after simplifying the
public tool. Removed TypeScript `materialize`, `transition` and `refill`
methods, successor-state/refill schemas and result types, Lua worker dispatch,
public successor-state export, Joker/Boss transition support tables, simulated
play/discard lifecycle logic, and hand/reach/best refill branches.

`discard_hits` now directly constructs each discard/refill sample and checks
legal target-hand subsets, returning boolean hit flags only. It does not call a
general refill or transition API. Existing one-hand scoring/search remains
available independently. The public interface still uses 64 samples per strategy
and returns only rates. Full sandbox remains the default with pruned opt-in.

Regenerated the pruned runtime/worker and hash manifest. Updated current engine
and analysis documentation; earlier validation entries remain historical.
Removed stale generated `dist/env/analysis/lines.js`, `next.js` and
`bench-next.js` outputs whose source files had already been deleted.

Validation:

- Source and rebuilt-output searches found no route export, transition support
  tables, route API implementations/types, or general refill query branches.
- `npm run check` passed.
- `npm test` (including build) passed 130 tests; two Windows-only tests skipped
  (132 total). Includes full-engine discard checks against legal scored subsets.
- `npm run sandbox:test-pruned-analysis` passed all 23 tests.
- Isolated pruned worker tests confirm removed route method names return an
  unknown-method error, while discard hit detection and normal scoring work.
- `npm run release:check` and `git diff --check` passed.

All checks were offline. No gameplay, mod installation or MCP restart was
performed; restart the MCP server to use the rebuilt implementation.

## One worker request and one load per discard strategy — 2026-10-15

Discard sampling previously sent 16 worker requests of four samples per
strategy, each re-serializing the full position (about 34–38 KiB), and Lua
reloaded the whole position for every sample. `discardRates` now sends one
`discard_hits` request per strategy carrying all 64 paired draws (draw orders
are computed once and shared across strategies); the cache stores only complete
64-sample results. The request budget is the remaining tool deadline instead of
a 10 s per-batch cap. Worker `discard_hits` loads the kept hand and full public
pool once, then classifies each sample from the kept Cards plus the drawn deck
Cards. Blind debuffs are applied to every playing card at load and
classification reads only the picked cards, so results are unchanged. The
sandbox accepts up to 64 draws per request. Sample count, paired draws, rates-only
response and engine selection are unchanged. Regenerated the pruned runtime and
manifest.

Validation:

- A local LuaJIT differential run compared the previous per-sample-load
  `discardHits` with the new one on a live-format fixture: 10 Boss/Joker variants
  (Psychic, Eye, Mouth, Plant, Goad, Pillar; Four Fingers, Shortcut, Smeared,
  Pareidolia, Chicot; Wild/Stone deck cards), random 1–5 card discards, nine
  target hands. 8640 samples, 0 differences.
- `npm run check` passed.
- `npm test` passed 130 tests, two Windows-only tests skipped (132 total). The
  batching test now asserts one 64-draw request per strategy; the pairing test's
  mock no longer depends on batch size.
- `npm run sandbox:test-pruned-analysis` passed all 23 tests.
- `npm run sandbox:check-pruned` passed 181 positions, 150 Jokers, 40001 scores.
- `npm run release:check` and `git diff --check` passed.
- Local timing on a warm worker, four strategies, 8-card hand: hit-heavy target
  (`three_of_a_kind`) dropped from about 0.94–1.25 s to about 0.21 s;
  miss-heavy target (`straight_flush`) from about 1.15–1.6 s to about 0.27–0.30 s.
  `analysis:bench-discards` (new Analyzer per run, includes worker startup)
  produced identical rates across all nine runs. Its timings are noisy
  (0.23–0.87 s versus 0.54–1.04 s before).

All checks were offline. No gameplay, mod installation or MCP restart was
performed; restart the MCP server to load the change.

## Review follow-ups for discard queries and the pruned engine — 2026-10-15

Code:

- `Analyzer.withSandbox` now owns cancellation (one abort listener instead of
  three copies) and discards the worker only when it is broken, cancelled or
  failed with an unexpected error. Argument errors (`BackendError`) and clean
  worker refusals (`status: 'unsupported'`, now `SandboxRefusal`, e.g. Cerulean
  Bell) keep the warm LuaJIT VM. Previously any discard input error closed it.
- Discard error codes: `focus:"boss"` with `discards` is `invalid_arguments`;
  a phase other than `SELECTING_HAND` is `illegal_action`, like not ready or no
  discards left. A snapshot without `handSize` is an error instead of assuming 8.
- `tools/index.ts` registers each tool with a kind (`read`, `mutation`,
  `analysis`) instead of branching on tool names for queueing and aborts.
- Removed the unused `HandOptions.signal` and the duplicated engine-path
  default in `Analyzer` (`ScoringSandbox` resolves `sourceDir`, then
  `BALATRO_SANDBOX_SOURCE`, then vendor). Deck canonical keys are computed once
  before sorting.

Docs: `balatro://analysis` discard section shortened to model-relevant rules
and now lists error codes; `skills/core.md` only points to `discards`/`next`;
README moves the example out of the Documentation link list into a Scoring
analysis section; the design doc drops the deleted per-sample scoring
benchmark and C estimates from §7 (kept here in earlier entries), and fixes the
§6 label table and §7 not-ready wording. `env/pruned/README.md` is now exported
so the link from `env/sandbox/README.md` resolves. CLAUDE.md pruned entry and
command list updated.

Validation:

- New test: invalid indices, a Cerulean Bell refusal and a wrong phase keep the
  same worker process; a cancelled query replaces it.
- `npm run check` passed.
- `npm test` (including build) passed 131 tests; two Windows-only tests skipped
  (133 total).
- `npm run sandbox:test-pruned-analysis` passed 24 tests;
  `npm run sandbox:test-pruned` passed 3 tests.
- `npm run release:check` and `git diff --check` passed.

`env/sandbox/runtime.lua` and the pruned engine were not changed, so
`sandbox:prune` / `sandbox:check-pruned` were not rerun. All checks were
offline; no gameplay, mod installation or MCP restart was performed.

## Show held consumables in every PACK response — 2026-10-15

PACK action responses now always include the complete `state.consumables`
array, including unchanged contents and an empty `[]`. This applies when
opening a pack from the shop or a skip Tag, and while staying in a multi-pick
pack. Full snapshots already included held consumables. Other phases keep
their existing delta behavior. Updated the model guide and v3 merge docs.

Validation:

- `npm run check` passed.
- `node --test tests/compact.test.ts` passed all 24 tests, including PACK
  entry, subsequent picks, item changes, consuming the final item, and exit.
- `npm run build` passed.
- `git diff --check` passed.

All checks were offline; no gameplay or MCP restart was performed. Restart
the MCP server to load the change; the Lua mod is unchanged.

## Blue Deck engine priority and play-as-discard in the coach skill — 2026-10-15

`skills/balatro-gold-stake-coach/SKILL.md` gains a Blue Deck engine priority:
Pair (standard or held Blue Seal) > Two Pair > Flush > High Card / Four of a
Kind > others, with Straight-conditioned Jokers avoided and Eternal ones never
bought. The intro and Antes 1–2 guidance no longer contradict it on Blue Deck.
The hand comparison now states that a play can discard dead unscored cards
when discards are scarce, after checking the poker hand and held rewards.

Validation:

- `node --test tests/context.test.ts` passed.
- `npm run release:check` passed.

Text-only change; no gameplay was run. The skill is read from disk as a
`skill://` resource, so a running MCP server serves it without a restart.

## Return actual play effect prompts — 2026-10-15

`play` results now include an action-only `effects` string, joining the game's
actual status prompts in trigger order. Repeated triggers remain separate.
Card indices and public names are frozen before dispatch, so played/held cards
keep their original references and face-down names remain `?` after movement or
reveal. No effects are evaluated to produce the log. Recording stops on
completion, handler failure or timeout; operation inspection retains the frozen
log, including partial logs on failure. Every successful play requires the
string; a missing field is a protocol error.

Updated the guide, tool schema/description and v3 merge contract. The decision
protocol now permits hypotheses about face-down cards based on observed effects,
while keeping those hypotheses distinct from observed facts.

Validation:

- `npm run check` and the build within `npm test` passed.
- Bridge and compact regression suites passed all 49 tests; the MCP stdio
  suite passed all 8 tests, including text/structured effects and inspection.
- Lua checks passed: effects (34), observation (88), decision (50), and score
  snapshot (35). The effects suite is included in the Lua CI job.
- The final broad TypeScript run, excluding the existing manifest hash test,
  reported 133 passed, 1 failed, 2 skipped (136 total). The unchanged
  `tests/pruned-sandbox.test.ts` isolated-copy case fails on Windows because its
  child program imports a drive-letter path directly, producing
  `ERR_UNSUPPORTED_ESM_URL_SCHEME`. No unrelated sandbox changes were made.
- `npm run stage-mod`, `npm run release:check` (132 source files), and
  `git diff --check` passed.

All checks were offline. The mod is staged at
`build/balatro-mcp-mod/balatro_mcp_mod`; it was not installed or live-tested.
Install the staged mod, restart Balatro and restart the MCP server to use the
new output.

Follow-up: removed the optional recorder bypass and old-mod missing-field
fallback. A completed play without string `effects` is rejected as an invalid
contract after dispatch. Updated the existing fixtures and replaced old-mod
acceptance with missing-field rejection. Type checking, build, all 49 bridge/
compact tests, all 8 MCP tests, the three effects/decision/snapshot Lua suites,
mod staging, release audit and diff checks passed again offline.

## Keep play effects in English — 2026-10-15

The recorder copied `extra.message`, which is already localized to the game's
UI language. It now shares the observation module's English data and reads
prompt text by the original localization key and variables. During a play, the
localization hook associates its unchanged UI result with that English text;
the status hook records the English text. Literal game messages remain intact.
There is no localized-text search or unknown-effect placeholder. The game's
prompt arguments, localization return values, language setting and localization
tables are unchanged.

Validation:

- Lua effects checks passed all 42 assertions, including Chinese chips/mult,
  edition, retrigger and upgrade prompts, unchanged UI data, and preservation
  of localization return values.
- Lua observation (88), decision (50) and score snapshot (35) checks passed.
- Type checking, build, all 33 compact/MCP tests, mod staging, release audit and
  `git diff --check` passed.

All checks were offline. The updated mod is staged, not installed or live-tested;
install it and restart Balatro to load the Lua fix.

## Shorten model-facing effect guidance — 2026-10-15

The tool description and model guide now explain only what `effects` tells the
agent and how to read its card references. Removed localization, recording and
operation-lifecycle implementation details from this guidance.

Validation: build and all 15 context/MCP tests passed; `git diff --check` passed.
Text-only change; no gameplay or mod installation was performed.

## Remove obsolete compatibility — 2026-10-16

Required current bridge capabilities and phase inputs; removed permissive control
defaults, the old scoring export, optional analysis backend and raw voucher fallback.
Validation: check/build; 134 TypeScript passes, 2 platform skips, SHA256 test excluded;
Lua checks 88/50/42/34; staging, release audit and diff check passed. Fixed the isolated
worker test's Windows import with a file URL. All checks offline; mod not installed.

## Normalize the unset Mouth hand lock — 2026-10-16

The original game sets `blind.only_hand=false` before the Mouth's first play.
The live score schema accepts an optional string, so exporting that sentinel
caused an incompatible-backend error. The Lua snapshot now omits the unset
lock while preserving a chosen hand type and leaving live blind state unchanged.

Validation:

- `luajit tests/score-snapshot.test.lua`: all 38 checks passed, including
  unset/chosen Mouth locks and preservation of both live values.
- A read-only live `sf.analysis_snapshot` returned `bl_mouth` with
  `only_hand=false` and failed the TypeScript schema. Applying the Lua
  normalization to that returned blind in a separate process made the complete
  snapshot pass `AnalysisSnapshotSchema`.

The running mod was not reloaded, staged or installed. No gameplay mutation
was performed; the fix still needs installation and a Balatro restart to take
effect in game.
