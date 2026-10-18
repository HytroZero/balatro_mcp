# Archived upstream bridge documentation

This is the Strategy Forge documentation at extraction time. Paths and npm commands
below refer to the upstream project, not this MCP package. Use `../README.md` and
`../resources/guide.md` (served as `balatro://guide`) for this package's setup and operation. The Lua mod and bridge
protocol are preserved unchanged.

Strategy Forge implements its own HTTP transport, JSON codec, observations, action bindings and asynchronous operation protocol. BalatroBot was reviewed as a design reference and is not a runtime dependency. Only `play/mod/` is staged.

## Loading and settings

Install our `strategy_forge` mod into an existing Steamodded/Lovely installation for PC Balatro 1.0.1o. The game runtime must supply LuaSocket. The mod binds loopback only, default `127.0.0.1:12347`, configurable through `STRATEGY_FORGE_PORT`. It wraps `love.update` using the original delta and closes sockets through `love.quit`. No timing, audio, graphics, RNG or original source patches are applied. Do not load the old companion mod alongside it.

On Windows, close Balatro and double-click [`../scripts/install-mod.cmd`](../scripts/install-mod.cmd) to install missing loaders and this mod. The installer backs up the profile and replaced files and retains existing loaders by default. See [installer documentation](WINDOWS.md) for explicit paths, offline ZIPs, preview mode and loader updates.

`npm run stage-mod` writes `build/strategy-forge-mod/strategy_forge` and a provenance file. No reference checkout is read, copied or required. Copy just this directory to the Mods directory. OS process ID and executable path are not inspected; the bridge reports a per-loaded-instance identifier and actual `G.VERSION`. Record other installed mods for evaluation.

## Protocol

JSON-RPC 2.0 uses `POST /`, `Content-Type: application/json` and a required `Content-Length`. Chunked requests, notifications and HTTP pipelining are unsupported. The transport incrementally receives and sends bounded chunks without blocking the game's thread. Limits: 8 clients, 8 KiB headers, 64 KiB request bodies, 2 MiB responses, and 5 seconds per connection. Loopback clients should coordinate access; the bridge has no remote authentication facility.

| Method | Parameters | Behavior |
| --- | --- | --- |
| `sf.health` | `{}` | Read bridge identity, protocol 1, version and readiness |
| `sf.observe` | `{}` | Read shared observation contract 1 and server revision |
| `sf.deck_observe` | `{}` | Read grouped remaining deck preview, multiplicities, modifiers and hidden-card uncertainty; no draw order or card IDs |
| `sf.act` | `instanceId`, `revision`, `actionId`, `action` | Atomically check freshness and legality, dispatch once, return pending operation |
| `sf.operation` | `instanceId`, `actionId` | Read pending/completed/failed operation |

`actionId` is a client-generated unique identifier, not the JSON-RPC request ID. Identical repeated submissions return the existing operation; reusing an identifier with different arguments fails. Completed results retain full observations for the last 128 operations; older results become tombstones that still prevent execution. At 10,000 operation identifiers the bridge refuses new actions.

Completion requires two updates in a ready state: supported stable phase, controller/use locks clear, no active drag, no open deck preview, no blocking base event, and an initialized phase. Readiness follows the original event manager's blocking contract: `blocking = false` callbacks do not hold the decision boundary; `blocking = true` callbacks do. This matters because some presentation callbacks renew themselves indefinitely. DNA's first-hand hint (`juice_card_until` with `hands_played == 0`) is requeued every 0.8 seconds until the first hand is played; waiting for it would deadlock because the bridge would need to play that hand to stop it. Readiness never executes queued callbacks. An active deck preview is a deliberate UI overlay and still blocks actions, as do dialogs, controller locks, drags and phase initialization. Observations expose `notReadyReason` when blocked. Terminal states have an explicit exit path because game-over can pause the event queue. No exact money/card-count equality is used. The Lua deadline defaults to 20 seconds (`STRATEGY_FORGE_ACTION_TIMEOUT`, seconds, 1–600); the client defaults to a 30-second overall action deadline (`actionTimeoutMs`). Increase both for long scoring animations. Modified background callbacks, tutorials and other mods require separate validation.

The earlier bytecode comparison for the background-spin callback and hover-preview watcher is removed. It was fragile (LuaJIT prototype metadata changed across closure creation) and covered only two nonblocking callbacks. The generic blocking check covers both the persistent background spin and the inactive preview watcher; the active preview is checked directly through `G.deck_preview`. No bytecode, source filename or line number is inspected.

The agent runtime waits for readiness before model requests and tool execution. The CLI uses `actionTimeoutMs` for this bounded read-only wait. A timeout pauses the same session with its history and pending call retained. Close the game's dialog or resolve the reported block, then use `/continue` or `/step`. Resuming rechecks readiness; a still-blocked game pauses again after a fresh wait window. Actions retain their original revision, so a changed game rejects an old action before mutation and the model can observe again. A game ending during the pause prevents the pending action. No provider requests or game actions run while paused. Escape ends the wait while preserving the session and backend. An uncertain dispatched action ends the current batch; it keeps the session available while retaining mutation locks until the outcome is verified or the bridge restarts.

After a handler failure or deadline, Lua keeps a mutation lock and leaves game events running. Client failures likewise block automatic mutations. `ForgeBridgeBackend.inspectOperation()` remains read-only. A subsequent observation releases the client lock only when the correlated operation has a valid completed result. A compatible bridge restart reconnects the existing conversation and invalidates old revisions and action IDs. The agent has no automatic operation-resubmit path.

## Bindings and observations

Actions cover start, blind select/skip, Boss reroll, play/discard, cash-out, ordinary purchase, buy-and-use, shop reroll/leave, packs, use, sell and reorder. Actions invoke original functions including `buy_from_shop`, `use_card`, `reroll_boss`, and play/discard handlers. Original card methods and UI eligibility callbacks validate use/sell and forced selection. Negative capacity follows the original edition exception. Aura gets explicit targets even without `max_highlighted`. Use/sell is checked across blind selection, round evaluation and packs as well as hands/shops. Profile unlocks are preserved.

The agent-facing `game_start` tool observes a fresh revision and sends the `start` action with deck, stake and optional seed. It is available at the menu and after a win/loss; an ongoing run cannot be replaced. Result-screen starts use the original `setup_run` / `start_run` handlers and await the normal screen wipe before reporting completion. Sessions may attach to an existing run; changing `runId` does not invalidate the conversation. Bridge-instance changes and uncertain effects still block execution.

Ordinary observations omit deck composition and all face-down identity/modifiers. The separate `sf.deck_observe` exposes grouped remaining composition according to the original unplayed-deck UI: physical draw-pile cards plus `wheel_flipped` cards, with an uncertainty count and no membership mapping, IDs or draw order. It includes enhancements, editions, seals, bonus/permanent chips and debuffs. Stone cards have no effective rank/suit. Deck composition also participates in the internal revision fingerprint, so deck-only edits invalidate stale actions. Card queries do not mutate the game or clear uncertain-operation locks.

The visible-state extractor exposes position, bridge-local stable card ID, forced selection, visible tooltips, costs, slot limits, remaining resources, active and upcoming blinds, hand levels and seed. Tool formatting uses short English card strings and action-specific observations while retaining complete backend state in details. Creating tooltip text disposes generated UI objects. Reordering only touches the per-area sequence and positions, not shared card-center prototypes. Exact legal actions are not enumerated; phase candidates still require action-specific validation.

## Validation

`npm test` exercises the standalone TypeScript client through a real loopback HTTP test server. `tests/mod.lua` loads original Card/CardArea/UI rule methods unchanged, with stub engine services, and exercises game bindings, JSON, server revisions, duplicate protection, deadlines and fragmented HTTP/partial writes. `npm run test:lua` also exercises the TypeScript client and Pi tool loop against the actual Lua codec/transport/operation modules through a fixture relay. These are not live-game tests.

The local audit LuaJIT executable does not provide LuaSocket. HTTP transport tests use a socket stub; LuaSocket availability in the target game, Steamodded loading, actual rendering and full-run mechanics have not been verified. `npm run doctor` diagnoses an installed game bridge read-only. The original-Lua headless backend remains separate and incomplete.
