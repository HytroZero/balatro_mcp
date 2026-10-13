# Balatro MCP

Let your AI play Balatro.

Balatro MCP is a local [Model Context Protocol](https://modelcontextprotocol.io/)
server plus a small game mod. It lets an AI agent read the live game state and
take actions in the real game: play and discard cards, shop, open packs, use
consumables, and start new runs. Your agent client supplies the model, so there
are no API keys or model settings to configure here.


## Highlights

- 🏆 **Codex with GPT 6.1 SOL (High reasoning) beat Blue Deck on Blue Stake**,
  playing a full run end to end through this MCP server on Windows.
- Two gameplay skills ship with the server. See
  [Included skills](#included-skills).
- Observations are compact, indexed text with incremental deltas, so long runs
  fit in an agent's context.

## What can it do?

- Read your hand, Jokers, consumables, shop, blinds, and remaining deck.
- Play and discard cards, buy and sell items, open packs, use consumables,
  reroll, and start new runs.
- Consult the bundled rules reference and strategy skills while playing.

Ask for advice or hand over a whole run:

> Look at my current hand and Jokers. What would you play, and why?

> Start a Red Deck run on White Stake. Read the rules and available strategy
> skills first, then play through the run.

> Review this run and explain the useful lessons.

## Included skills

The server publishes its gameplay skills as MCP resources and as `skill:<name>`
prompts, so any MCP client can load them on demand. `balatro://skills` lists each
skill and its files as `skill://<name>/<path>` URIs that do not depend on where
the server is installed, and `balatro://objects/<name>` looks up one Joker,
consumable, Voucher, Tag or Boss.
`skills/core.md` is the decision protocol, published as `balatro://protocol` and
as part of `balatro://context`. The two skills below are additional
contributions that agents load when a decision calls for them.

### `balatro-gold-stake-coach`

A strategy coach for complete runs aimed at Gold Stake. It covers blind
selection and skipping, hand and discard choices, shops and cash flow, packs and
consumables, Joker ordering, and Boss Blind preparation, with the goal of a
reliable Ante 8 win rather than a high endless score. It works from observed
game values instead of numbers remembered from older guides, and it ends each
run with an evidence-based review.

- Entry point: [`skills/balatro-gold-stake-coach/SKILL.md`](skills/balatro-gold-stake-coach/SKILL.md)
- References: decision tables, plus notes on mechanics and their sources

### `balatro-wiki-rules`

A versioned rules knowledge base built from a [Balatro Wiki](https://balatrowiki.org/)
snapshot (2026-10-02, game version 1.0.1o-FULL). It has 12 chapters, from the
run lifecycle and the scoring sequence to Boss Blinds, the shop economy, RNG,
and validation. The object catalog covers 366 objects, including all 150 Jokers,
and any of them can be found by name, through MCP as `balatro://objects/Blueprint`
or from a shell with the lookup script:

```sh
python skills/balatro-wiki-rules/scripts/lookup.py Blueprint
```

Agents use it to resolve mechanics questions during play. It also serves as the
reference when implementing or testing a simulator.

- Entry point: [`skills/balatro-wiki-rules/SKILL.md`](skills/balatro-wiki-rules/SKILL.md)
- Sources and license: [`references/sources.md`](skills/balatro-wiki-rules/references/sources.md)

See [`skills/README.md`](skills/README.md) to add your own skill.

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
- [Tools and gameplay workflow](tools/guide.ts) (served as `balatro://guide`)
- [Observation field design and staged implementation](docs/game-observation-design.md)
- [Game rules and strategy context](docs/context.md)
- [Gameplay skills](skills/README.md)
- [Source attribution and validation](docs/upstream.md)
- [Offline scoring sandbox](env/sandbox/README.md)
- [Preparing a release](docs/releasing.md)

For server options, run `node dist/src/index.js --help`. A manual client
configuration template is in [`mcp.example.json`](mcp.example.json).

## Contributing

Issues and pull requests are welcome. Installation feedback from macOS and
Linux users, new gameplay skills, and full-run reports (model, deck, stake, and
result) are especially useful. Please remove private paths and personal
information from logs before sharing them.

To check a change locally:

```sh
npm run check
npm test
```

## License

Code is licensed under [MIT](LICENSE). The Wiki-derived reference material in
`skills/balatro-wiki-rules` keeps its
[CC BY-NC-SA 3.0 license and attribution](skills/balatro-wiki-rules/references/sources.md).

Balatro is a separate game by LocalThunk and is not included in this project.
