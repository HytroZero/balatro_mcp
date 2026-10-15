# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Balatro MCP is a local stdio MCP server (TypeScript, Node ≥ 24.13) plus a standalone Steamodded Lua mod that runs inside Balatro 1.0.1o. The parent directory's `AGENTS.md` (loaded via `../CLAUDE.md`) covers the wider Balatro RL project; this subproject is the live-game bridge.

## Commands

```sh
npm ci
npm run check            # tsc --noEmit over src, env, play, tools, model, scripts, tests
npm test                 # builds dist/ first, then node --test tests/*.test.ts
node --test tests/compact.test.ts   # single test file (run `npm run build` first if it spawns dist/, e.g. mcp.test.ts)
luajit tests/observation.test.lua   # Lua mod tests (Lua 5.1 compatible); run from repo root
luajit tests/decision.test.lua
luajit tests/effects.test.lua  # play status prompts and operation lifecycle
luajit tests/score-snapshot.test.lua
node --test tests/analysis.test.ts   # game_analyze; engine-backed cases need LuaJIT and `npm run sandbox:prepare`, and skip without them
npm run dev              # run server from source (node strips TS types directly)
npm run doctor           # with the game open: check bridge health/readiness
npm run stage-mod        # copy play/mod -> build/balatro-mcp-mod/balatro_mcp_mod
npm run setup            # build + stage-mod + write mcp.local.json
npm run install:windows  # install mod (+ Lovely/Steamodded if missing) into the game profile
npm run release:check    # source allowlist + sensitive-content audit
npm run sandbox:prune                 # regenerate env/pruned from the original vendor; needs LuaJIT
npm run sandbox:check-pruned          # differential scores, pruned vs original
npm run sandbox:test-pruned           # isolated pruned worker and API regressions
npm run sandbox:test-pruned-analysis  # analysis + discard suites on the pruned engine
npm run sandbox:bench-pruned          # structured throughput, pruned vs original
npm run analysis:bench-discards       # discard query timing, new worker per run
```

CI (`.github/workflows/ci.yml`, Ubuntu + macOS + Windows) runs `check`, `test`, `stage-mod`, `release:check`; a separate Ubuntu job runs the Lua tests under LuaJIT. Lua tests are not in `npm test`.

Source `.ts` files run directly under Node's type stripping and import each other with `.ts` extensions; `tsconfig.build.json` rewrites them to `.js` in `dist/`. Keep to erasable TypeScript syntax (no enums/namespaces/parameter properties).

## Architecture

Request path: MCP client → `src/index.ts` (stdio) → `src/server.ts` → `tools/index.ts` → `play/client.ts` (`ForgeBridgeBackend`, HTTP JSON-RPC to `127.0.0.1:12347`) → Lua mod in the game → back.

- **`env/contract.ts`** — backend-neutral contract: `ActionSchema` (TypeBox union of every action method), raw `Observation`, `BackendError` codes and the `applied: true|false|'unknown'` semantics.
- **`play/client.ts`** — the only backend. Validates every bridge response with TypeBox, enforces loopback-only endpoint, deadlines and cancellation. Pre-dispatch cancel/timeout means `applied=false`; anything after dispatch can become `uncertain_outcome`, which locks further mutations until inspected with `game_operation`. Never add automatic retries of actions.
- **`env/compact.ts`** — projects the raw Lua state into the model-facing "observation v3": flat state, one-line text items, short `rev`, per-phase views (`phaseViews`) that are dropped when the phase changes, and action deltas (object keys merge per member, `null` deletes, `{"i": ...}` replaces consumable/hand elements; `jokers` always replaces the complete array). Seeds appear only after a run ends, including in `game_operation` results. The design is in `docs/game-observation-v3.md`. `tools/guide.ts` is served to models as `balatro://guide`; its phase view table is generated from `phaseViews`, so update the prose there when the projection changes. Model-facing text lives in code, never read from `docs/` at runtime.
- **`tools/index.ts`** — registers `game_observe`, `game_action`, `game_start`, `deck_observe`, `game_analyze`. Tracks the last full revision issued to this connection and keeps the delta baseline; the model only sees short revisions. It also keeps the play audit: exact scores from the latest hand analysis are compared with the chips gained by a `play` at the same revision, and a mismatch downgrades later `exact` labels for that run. `src/server.ts` supplies the serial game queue and adds `game_health` / `game_operation`; analysis only holds this queue for its opening/closing reads, serializes worker use separately, and is aborted when a mutation arrives. Raw observations go to `data/traces/*.jsonl` (`model/trace.ts`), not to tool results.
- **`env/analysis/`** — the computation behind `game_analyze` (design and staging in `docs/game-analyze-design.md`). `snapshot.ts` validates the mod's analysis snapshot and removes face-down cards from the scored hand; `hand.ts` enumerates every legal selection, scores it in `env/sandbox` (original `evaluate_play` in a separate LuaJIT process, `random: 'expectation'`: direct effect means in one evaluation, with explicitly labelled nonlinear/correlated interaction approximations) and builds the hand brief, Planet/order suggestions; `economy.ts` is pure arithmetic over the money rules; `index.ts` (`Analyzer`) owns the lazily started worker. Analysis reads go through `backend.analysisSnapshot` (`sf.analysis_snapshot`), never `observe`, so they cannot release an action lock; the tool reads the snapshot again after computing and returns `stale_state` if the revision or the snapshot text changed. Hidden information (seed, RNG streams, draw order, face-down identities) must never reach the snapshot or the brief.
- **`env/pruned/`** — optional score-only engine beside `env/sandbox/`, generated from the original vendor by `generate.ts` and self-contained (its own engine modules, runtime, worker and JSON; no vendor or build at run time). `ScoringSandbox` uses a `worker.lua` found in its source directory. The full `env/sandbox/vendor` engine stays the default; select pruned with `sourceDir` or `BALATRO_SANDBOX_SOURCE` (that order of priority). Only `expectation`/`minimal` random modes. Generated files are derived game code and excluded from exports; only its README and maintenance tools are allowlisted in `src/distribution.ts`. JIT notes and benchmarks: `docs/pruned-engine.md`.
- **`env/analysis/discards.ts`** — discard-only `discards + next` queries: 1–4 arrays of current hand indices, one snake_case target poker hand, exactly 64 paired public-deck samples per strategy. Success returns only `rates` in input order. `Analyzer` dispatches these before hand scoring; worker `discard_hits` only classifies legal subsets, retaining relevant Joker/card/Boss rules without general lifecycle transitions. Errors, cancellation and incomplete sampling produce no partial rates. Public pools retain copies, exclude held/discarded cards and never use game RNG or hidden draw order; a bounded per-connection cache reuses sample results. Lua changes belong in `env/sandbox/runtime.lua` / `worker.lua`, then regenerate `env/pruned` and its manifest with `sandbox:prune`.
- **`src/context.ts`, `src/skills.ts`, `src/objects.ts`** — MCP resources and prompts: short init `instructions` (tests keep them at most 800 chars), `balatro://context` (= `model/prompt.ts` + `model/context/balatro.md` + `skills/core.md` + skill index), `balatro://rules`, `balatro://protocol`, `balatro://analysis` (from `tools/analysis-guide.ts`), `balatro://skills`, `skill://<name>/<path>`, `balatro://objects/<name>` (TS port of `skills/balatro-wiki-rules/scripts/lookup.py` over `objects.json`). Details in `docs/context.md` and `skills/README.md`.
- **`play/mod/`** — the Lua mod. `balatro_mcp_mod.lua` hooks `love.update`; `transport.lua` is a non-blocking LuaSocket HTTP server; `bridge.lua` owns JSON-RPC methods (`sf.*`), revisions (a serial bumped when the state fingerprint changes), the pending-operation lifecycle and the poisoned state; `game.lua` reads state and performs actions by invoking the game's own UI button handlers and CardArea methods (the game stays authoritative for legality and timing); `decision.lua` builds decision fields and resolves card descriptions from the game's tooltip logic. The independent `env/sandbox` scoring API remains available for offline use; ordinary MCP observations and action results do not compute or return `plays`, and `score_snapshot.lua` builds its sandbox input only for the on-demand `sf.analysis_snapshot` RPC, which stays outside the revision fingerprint. Never execute trial scoring in the live game. Observation must never create UI/tooltips (the Lua tests assert this). Port/timeout come from `BALATRO_MCP_MOD_PORT` / `BALATRO_MCP_MOD_ACTION_TIMEOUT`.
- **Installers** — `scripts/install-mod.ps1` (Windows) and `scripts/macos.ts` / `src/macos.ts` back up the profile to `build/mod-install-backups/`, install Lovely/Steamodded only if missing, and replace only `Mods/balatro_mcp_mod`, preserving other mods.
- **Release** — `src/distribution.ts` holds an explicit top-level allowlist; a new top-level file or directory must be added there or it is excluded from exports. The audit rejects home paths, email addresses, tokens and raw Lua `table: 0x...` identifiers in source, so keep those out of docs and fixtures.

## Conventions

- Lua changes take effect only after `npm run stage-mod`, reinstalling, and restarting Balatro; server changes need the MCP process restarted. Tests here are offline; say so when the live game was not exercised.
- `play/mod/effects.lua` wraps the original status-prompt function during a dispatched `play`. Logs belong to the operation and action output (`effects`), never state or revision fingerprints. Card references and public names are frozen before dispatch; face-down names stay `?`. Do not evaluate effects to produce logs.
- `docs/validation.md` is a dated log of what was actually executed for each change; append to it in the same style.
- Skills live in `skills/<name>/SKILL.md` (YAML frontmatter, `description` required, `name` must match the directory). `skills/core.md` is the decision protocol, not a skill.
