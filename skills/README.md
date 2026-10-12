# Gameplay skills

The MCP server uses Pi 1.0.4's `loadSkills` to discover gameplay skills in this directory when it starts. `skills/core.md` is the decision protocol, published as `balatro://protocol` and as part of `balatro://context`; it is not a skill. Discovery follows Pi's frontmatter, ignore-file, naming, duplicate and diagnostic rules. A Markdown file without a description is not a discoverable skill.

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

The skill catalog in `balatro://context` lists each skill's name, description and `skill://<name>/SKILL.md` location; bodies stay out of it. `balatro://skills` returns JSON with each skill's URI, whether the model may invoke it, every file with its first Markdown heading and size, and discovery diagnostics with paths relative to the project. The MCP resource list shows the `SKILL.md` of each model-invocable skill, and clients that support completion can complete skill names and file paths. A model reads a skill and its files with `resources/read`. Reads return the whole file and are limited to discovered skill directories, with real paths checked so junctions and links cannot escape them; hidden files are neither listed nor readable. The server has no file-writing tool; skill directories are read-only.

`balatro://objects/<name>` (optionally `?kind=joker`) searches the object catalog of `balatro-wiki-rules` by exact name, then by substring, and returns each match's `balatro://rules` row, catalog metadata, chapter URI and Wiki link. Prefer it to reading a whole catalog file during play.

Each skill is also an MCP prompt named `skill:<name>`. It applies Pi's explicit expansion: it removes frontmatter, includes the skill body and its `skill://<name>/` reference base, and appends the optional `instructions` argument. Set `disable-model-invocation: true` in frontmatter to keep a skill out of the catalog and resource list while leaving its prompt and files available.

Restart the MCP server to discover added, renamed or removed skills; skill bodies, file lists and references are read on each request.

Discovery is limited to this gameplay tree. Development skills in `.agents/skills/`, ambient Pi coding skills, extensions and coding tools are outside this server. Skill guidance cannot override governing instructions or grant tools or file access.
