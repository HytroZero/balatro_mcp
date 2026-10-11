# Balatro MCP

Let your AI play Balatro.

Connect your favorite LLM agent to the game, talk through a tricky hand, or let
it take the controls for a run. Balatro MCP reads the game state and performs
actions through a local mod. Your agent client provides the AI, so there are no model
settings or API keys to configure here.

## What can it do?

- Read your hand, Jokers, shop, and blinds to help with decisions.
- Play and discard cards, buy items, use consumables, and start new runs.
- Consult included game rules and strategy guides while playing.
- Save gameplay notes locally and look them up in later sessions.

You can ask for advice or hand over a run. For example:

> Look at my current hand and Jokers. What would you play, and why?

> Start a Red Deck run on White Stake. Read the rules and available strategy
> guides first, then play through the run.

> Review this run and save the useful lessons for next time.

## Quick start

**Recommended: Ask Codex or Claude Code to install the mod and MCP**

You'll need:

- **Balatro 1.0.1o** installed through Steam on macOS or Windows.
- **[Node.js](https://nodejs.org/en/download/) 24.13 or newer**, with npm.
- An AI client that supports local MCP servers, tools, and resources.

### 1. Set up the server


Open a terminal in the project folder and run:

```sh
npm ci
npm run setup
```

This prepares the server and game mod, then creates `mcp.local.json` with the
correct paths for your computer.

### 2. Install the mod and open Balatro

Close the game before installing. The installer backs up your game profile and
installs missing mod loaders for you.

**macOS**

```sh
npm run install:macos
npm run launch:macos
```

Keep this terminal open while playing. Use `launch:macos` to start the game with
the mod loaded. See the [macOS guide](docs/macos.md) for custom install locations
and other options.

**Windows**

```powershell
npm run install:windows
```

Then start Balatro through Steam. You can also double-click
`scripts/install-mod.cmd` to install the mod. See the
[Windows guide](docs/windows.md) if you need help.

Wait until the game reaches the main menu before continuing.

### 3. Connect your AI client

Open `mcp.local.json` and add its `balatro` server entry to your client's MCP
configuration. Keep any other servers you already have, then restart or reconnect
the client. The generated configuration includes the paths you need.

Try this first:

> Check the Balatro connection and describe the current game screen. Don't start
> a run yet.

Once connected, ask it to help with a hand or play a run.

## Need a hand?

**The client can't connect to the game**

With Balatro open, run this in another terminal from the project folder:

```sh
npm run doctor
```

Look for `ok: true` and `ready: true`. If the game isn't ready yet, wait for the
animation to finish or close any open dialogs. On macOS, make sure you started
Balatro with `npm run launch:macos`.

**You moved the project or changed your Node installation**

Regenerate the configuration, then update it in your client:

```sh
npm run mcp:config -- --force
```

**You already have Lovely and Steamodded installed**

The installer keeps existing loaders. You can also copy the entire
`build/balatro-mcp-mod/balatro_mcp_mod` folder into your game's `Mods` directory
and restart. Keep only one copy of this mod.

**Where are notes and backups stored?**

Gameplay notes and logs live in `data/`. Installation backups live in
`build/mod-install-backups/`. Both folders, along with `mcp.local.json`, are
excluded from Git. Keep backups you need before deleting the project.

## Platform support

| Platform | Status |
| --- | --- |
| macOS · Apple Silicon | Connection and read-only game access verified on hardware |
| macOS · Intel | Installer and launcher provided; hardware testing needed |
| Windows | Installer provided |
| Linux / Steam Deck | No automated installation yet |

The project is still early. AI play quality depends on your model, and full-run
gameplay hasn't been validated on hardware. If you run into trouble, an issue
with your platform, game version, and error message helps us investigate.

## Documentation

- [macOS setup and troubleshooting](docs/macos.md)
- [Windows setup and troubleshooting](docs/windows.md)
- [Tools and gameplay workflow](docs/tool-guide.md)
- [Game rules and strategy context](docs/context.md)
- [Source attribution and validation](docs/upstream.md)
- [Preparing a release](docs/releasing.md)

For server options, run `node dist/src/index.js --help`. A manual client
configuration template is available in [`mcp.example.json`](mcp.example.json).

## Contributing

Issues and pull requests are welcome, especially installation feedback from
Windows and Intel Mac users. Please remove private paths and personal information
from logs before sharing them.

To check a change locally:

```sh
npm run check
npm test
```

## License

Code is licensed under [MIT](LICENSE). Included Wiki-derived reference material
retains its [CC BY-NC-SA 3.0 license and attribution](skills/balatro-wiki-rules/references/sources.md).

Balatro is a separate game and is not included in this project.
