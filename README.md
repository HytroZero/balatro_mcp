# Balatro MCP

Let your AI play Balatro.

Balatro MCP is a local [Model Context Protocol](https://modelcontextprotocol.io/)
server plus a small game mod. It lets an AI agent read the live game state and
take actions in the real game: play and discard cards, shop, open packs, use
consumables, and start new runs. Your agent client supplies the model, so there
are no API keys or model settings to configure here.


## Highlights

- 🏆 **GPT 6.1 Sol High + Codex + this MCP won
  Blue Deck runs on Gold Stake 
  with a random seed and no human intervention or decision-making.**
  Seed: `S7M5CNQW`.
- **A powerful `game_analyze` system** compares plays score, discard sampling, Joker order, and economy choices, significantly improving the model's decisions and gameplay performance.
- Observations are compact, indexed text with incremental deltas, so long runs fit in an agent's context.
- Rules and coaching are available as direct MCP resources. See [Gameplay resources](#gameplay-resources).

## What can it do?

- Read your hand, Jokers, consumables, shop, blinds, and remaining deck.
- Play and discard cards, buy and sell items, open packs, use consumables,
  reroll, and start new runs.
- Consult the bundled rules reference and strategy coach while playing.
- Score candidate plays, Joker orders and shop choices, and estimate how often
  a discard reaches a target hand (`game_analyze`).

Ask for advice or hand over a whole run:

> Look at my current hand and Jokers. What would you play, and why?

> Start a Red Deck run on White Stake. Finish ante 1, 2.

> Review this run and explain the useful lessons.


## Quick start

> **Tip:** Codex or Claude Code can do the whole setup for you. Open the
> project folder and ask: *"Install the Balatro MCP mod and connect the server."*

You'll need:

- **Balatro 1.0.1o**, installed through Steam on Windows or macOS.
- **[Node.js](https://nodejs.org/en/download/) 24.13 or newer**, with npm.
- An AI client that supports local MCP servers, tools, and resources, such as
  Codex or Claude Code.

### 1. Set up the server

Open a terminal in the project folder and run:

```sh
npm ci
npm run setup
```

This builds the server, stages the game mod, and writes `mcp.local.json` with
the correct paths for your computer.

### 2. Install the mod and open Balatro

Close the game before installing. The installer backs up your game profile and
installs any missing mod loaders (Lovely and Steamodded).

**Windows**

```powershell
npm run install:windows
```

Then start Balatro through Steam. You can also double-click
`scripts/install-mod.cmd` to install the mod. See the
[Windows guide](docs/windows.md) if you need help.

**macOS**

```sh
npm run install:macos
npm run launch:macos
```

Keep this terminal open while you play. Always start the game with
`launch:macos` so the mod loads. See the [macOS guide](docs/macos.md) for custom
install locations and other options.

Wait until the game reaches the main menu before continuing.

### 3. Connect your AI client

Open `mcp.local.json` and copy its `balatro` server entry into your client's
MCP configuration. Keep any servers you already have, then restart or reconnect
the client.

Try this first:

> Check the Balatro connection and describe the current game screen. Don't start
> a run yet.

Once that works, ask it to help with a hand or play a run.

## Need a hand?

**The client can't connect to the game**

With Balatro open, run this from the project folder in another terminal:

```sh
npm run doctor
```

Look for `ok: true` and `ready: true`. If the game isn't ready, wait for the
animation to finish or close any open dialogs. On macOS, make sure you started
Balatro with `npm run launch:macos`.

**An action timed out, but the game looks normal**

Do not repeat the action. Inspect `game_operation`: `timed_out` keeps tracking the
original action while mutations remain locked. Once the game is ready for two
consecutive updates, that operation becomes `completed`; use `game_observe` to
verify completion and obtain a fresh revision before continuing.

`game_health` reports the underlying game's `gameReady` separately from bridge
`ready`, with `mutationLock` identifying an unresolved action or handler failure.
Operation diagnostics preserve the original `timeoutReason` and current blocker.
A handler exception remains `failed` and requires restarting Balatro; normal
readiness alone cannot safely clear it.

For a lock created by an older mod, close Balatro, install the updated mod and
relaunch, then use Continue to resume the saved run. The fix does not retroactively
clear an old in-memory lock. Restart the MCP server after updating its code too.
See the [recovery protocol](resources/protocol.md).

**You moved the project or changed your Node installation**

Regenerate the configuration, then update it in your client:

```sh
npm run mcp:config -- --force
```

**You already have Lovely and Steamodded installed**

The installer only adds or replaces `Mods/balatro_mcp_mod` when the loaders
are already installed. It preserves other mods, including `strategy_forge`,
and keeps existing loaders unless you explicitly request a loader update.
You can also copy the entire
`build/balatro-mcp-mod/balatro_mcp_mod` folder into your game's `Mods` directory
and restart. Keep only one copy of the mod.

**Where are logs and backups stored?**

MCP call logs live in `data/traces/`. Installation backups live in
`build/mod-install-backups/`. Git ignores both folders and `mcp.local.json`.
Copy any backups you need before deleting the project.

## Scoring analysis

`game_analyze` runs the game's original scoring code in a separate LuaJIT
process. For example,
`{"revision":"<rev>","discards":[[0,1,3],[1,3]],"next":"straight"}` compares
two discards by how often the refilled hand can play a straight, returning
`{"rates":[0.375,0.5]}` (illustrative values). Fields, target names and errors
are in the [analysis reference](resources/analysis.md).

Analysis uses the full original sandbox in `env/sandbox/vendor` by default;
prepare it with `npm run sandbox:prepare`. To use the optional pruned engine,
set `BALATRO_SANDBOX_SOURCE=/path/to/project/env/pruned` and restart the MCP
server; remove the override to return to the full sandbox.

## Platform support

| Platform | Status |
| --- | --- |
| Windows | Installer provided; full run won on hardware (Blue Deck, Blue Stake) |
| macOS · Apple Silicon | Connection and read-only game access verified on hardware |
| macOS · Intel | Installer and launcher provided; hardware testing needed |
| Linux / Steam Deck | No automated installation yet |

The project is still early, and play quality depends heavily on your model. If
you run into trouble, open an issue with your platform, game version, and the
error message.

## Documentation

- [Windows setup and troubleshooting](docs/windows.md)
- [macOS setup and troubleshooting](docs/macos.md)
- [State and action field contract](resources/guide.md) (`balatro://guide`)
- [Analysis output reference](resources/analysis.md) (`balatro://analysis`)
- [Observation field design and staged implementation](docs/game-observation-design.md)
- [`game_analyze` design and staged implementation](docs/game-analyze-design.md)
- [Game rules and strategy context](docs/context.md)
- [Source attribution and validation](docs/upstream.md)
- [Offline scoring sandbox](env/sandbox/README.md)
- [Preparing a release](docs/releasing.md)

For server options, run `node dist/src/index.js --help`. A manual client
configuration template is in [`mcp.example.json`](mcp.example.json).

## Gameplay resources

All references are direct MCP resources listed by `resources/list`.
For normal gameplay, read `balatro://protocol`, `balatro://guide` and
`balatro://coach` once. Read `balatro://analysis` before first analysis.

- `balatro://rules`: small topic directory. Read one topic directly, such as
  `balatro://rules/jokers`, `balatro://rules/scoring` or `balatro://rules/blinds`.
- `balatro://objects/Blueprint`: one object’s rule, metadata, topic URI and Wiki
  link. Optional `?kind=` filters ambiguous names.
- `balatro://coach`: strategy for survival, economy, engine growth and Boss
  preparation toward an Ante 8 win. Difficult tradeoffs use `balatro://coach/decisions`.

Rules retain the 2026-10-02 Balatro Wiki snapshot for 1.0.1o-FULL, covering 366
objects including all 150 Jokers. Unused Wiki implementation and validation
chapters are omitted. [Sources and license](resources/rules/sources.md) are retained.

Add or edit documents under `resources/`; register new URIs in
[the resource manifest](src/resources.ts). See [resource documentation](docs/context.md).

## Contributing

Issues and pull requests are welcome. Installation feedback from macOS and
Linux users, rules and strategy improvements, and full-run reports (model, deck, stake, and
result) are especially useful. Please remove private paths and personal
information from logs before sharing them.

To check a change locally:

```sh
npm run check
npm test
```

## License

Code is licensed under [MIT](LICENSE). The Wiki-derived reference material in
`resources/rules/` and the object catalog keep their
[CC BY-NC-SA 3.0 license and attribution](resources/rules/sources.md).

Balatro is a separate game by LocalThunk and is not included in this project.
