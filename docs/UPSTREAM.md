# Sources, attribution, and validation

This package contains independently runnable copies of components from
**Strategy Forge 0.2.0**. It does not import a sibling checkout at build or runtime.
[`PROVENANCE.json`](PROVENANCE.json) records source and packaged SHA-256 hashes,
with adapted and removed files identified. Internal Git references and local
machine paths are omitted from the public record.

## Reused components

- `play/mod/`: Lua game bindings, JSON codec, loopback HTTP transport, revision
  checks, and operation protocol. The distributed mod identity and environment
  variables are `balatro_mcp_mod` / `BALATRO_MCP_MOD_*`. Installers migrate the
  legacy `strategy_forge` mod to avoid duplicate loading.
- `play/client.ts`, `env/`: bridge client, action schemas, observation filtering,
  compact state, and uncertain-action handling. JSON-RPC method names remain
  `sf.*` for compatibility.
- `memory/store.ts`, `model/trace.ts`: memory snapshots, evidence attribution,
  persistence, and trace sanitization. No model provider integration is enabled.
- `model/prompt.ts`, `model/context/`, `skills/`: gameplay context, decision
  protocol, coaching skill, and attributed Wiki-derived reference material.
- `tools/index.ts`: game and memory tools. The upstream arbitrary file tools are
  excluded; eight game/memory/diagnostic tools are registered in this server.

The `src/` MCP layer, macOS installation and launch support, client configuration
generator, and distribution audit adapt these components for standalone use.
[`bridge-upstream.md`](bridge-upstream.md) is archived protocol background;
its old paths and CLI commands are not current installation instructions.
Use the root README for setup.

## Licenses

Project code is distributed under the root [MIT license](../LICENSE).
Pi packages are pinned to 1.0.4; their MIT notice is retained in
[`licenses/pi-MIT.txt`](../licenses/pi-MIT.txt). Pi's skill discovery and formatting
functions are reused without enabling an agent session, coding tools, or ambient
skill discovery. Other installed dependencies retain their own licenses.

Wiki-derived material under `skills/balatro-wiki-rules/` retains **CC BY-NC-SA 3.0**,
attributed to Balatro Wiki contributors. Its sources, revision records, license,
and adaptation notes are retained in
[`references/sources.md`](../skills/balatro-wiki-rules/references/sources.md).
This material is separately licensed from the MIT project code.

No original Balatro game source/assets, game saves, existing memories, provider
configuration, credentials, or BalatroBot implementation are distributed.
Lovely and Steamodded are downloaded separately by installers when needed.

## Validation scope

Automated tests cover real stdio MCP handshakes from a different working directory,
HTTP mock bridge behavior, strict schemas, revision safety, no automatic action
replay, memory policy, resource boundaries, macOS installation plans and rollback,
local configuration generation, and source distribution boundaries.

Historical read-only Apple Silicon validation on 2026-10-10 used Balatro
1.0.1o-FULL, Lovely 0.10.0, Steamodded 26.1002.0, and LuaJIT 2.1.1700008891.
`game_health`, `game_observe`, and `card_observe` succeeded at the main menu;
no new run or gameplay mutation was performed. The
[sanitized capture](MACOS-LIVE-VALIDATION.json) predates mod renaming and removal
of two file tools: its `strategy-forge` bridge identity and ten-tool count are
historical, while the current mod is `balatro_mcp_mod` with eight MCP tools.
Instance IDs, revisions, and run IDs in that capture are placeholders.

Intel has installation-plan tests; Windows installation and live gameplay actions
have not been validated on hardware. Mock tests do not establish full gameplay
compatibility. [`evaluation.xml`](evaluation.xml) holds read-only contract questions;
no model-provider evaluation is implied.

## Public source distribution

The release exporter preserves attribution while excluding local runtime files
and all original Git metadata. See [RELEASING.md](RELEASING.md). Source hashes are
updated for public adaptations; original hashes are retained for comparison.
