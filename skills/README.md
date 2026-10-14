# Gameplay skills

At startup `src/skills.ts` treats each direct subdirectory `skills/<name>/` that contains a `SKILL.md` as one skill. Frontmatter is YAML; `description` is required, and `name`, if given, must equal the directory name (lowercase letters, digits and single hyphens, at most 64 characters). An invalid skill, or one whose real path leaves this directory, is skipped and reported in the diagnostics instead of stopping the server. Other files here, such as `skills/core.md` (the decision protocol, published as `balatro://protocol` and as part of `balatro://context`), are not skills.

Put a skill in `skills/<name>/SKILL.md`:

```markdown
---
name: example-coach
description: Guide purchases when the current scoring engine is weak.
---

# Example coach

Compare immediate scoring improvements against interest and the next Boss.
Read references/shop.md when evaluating a shop.
```

Every file of a skill has the URI `skill://<name>/<path>`, for example `skill://example-coach/references/shop.md`. The URI does not depend on where the server is installed, and a relative link in a skill file resolves against the file's URI as on a web page, so write links relative to the file that contains them.

For ordinary play, read `balatro://protocol`, `balatro://guide` and the relevant skill once; read `balatro://analysis` before first analysis. `balatro://context` is the explicit full-reference alternative, not an additional prerequisite. Its skill catalog lists each skill's name, description and `skill://<name>/SKILL.md` location; bodies stay out of it. `balatro://skills` returns JSON with each skill's URI, whether the model may invoke it, every file with its first Markdown heading and size, and discovery diagnostics with paths relative to the project. The MCP resource list shows the `SKILL.md` of each model-invocable skill, and clients that support completion can complete skill names and file paths. A model reads a skill and its files with `resources/read`. Reads return the whole file and are limited to discovered skill directories, with real paths checked so junctions and links cannot escape them; hidden files are neither listed nor readable. The server has no file-writing tool; skill directories are read-only.

`balatro://objects/<name>` (optionally `?kind=joker`) searches the object catalog of `balatro-wiki-rules` by exact name, then by substring, and returns each match's `balatro://rules` row, catalog metadata, chapter URI and Wiki link. Prefer it to reading a whole catalog file during play.

Each skill is also an MCP prompt named `skill:<name>`. It removes frontmatter, includes the skill body and its `skill://<name>/` reference base, and appends the optional `instructions` argument. Set `disable-model-invocation: true` in frontmatter to keep a skill out of the catalog and resource list while leaving its prompt and files available.

Restart the MCP server to discover added, renamed or removed skills; skill bodies, file lists and references are read on each request.

Discovery is limited to this gameplay tree. Development skills in `.agents/skills/`, user skill directories, extensions and coding tools are outside this server. Skill guidance cannot override governing instructions or grant tools or file access.
