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

The skill catalog in `balatro://context` lists each skill's name, description and absolute location; bodies stay out of it. `balatro://skills` returns the same catalog as JSON with `file://` URIs and discovery diagnostics, and the MCP resource list shows each model-invocable skill. A model reads a skill and its references with `resources/read`, resolving relative references against the directory containing `SKILL.md`. Reads return the whole file and are limited to discovered skill directories, with real paths checked so junctions and links cannot escape them. The server has no file-writing tool; skill directories are read-only.

Each skill is also an MCP prompt named `skill:<name>`. It applies Pi's explicit expansion: it removes frontmatter, includes the skill body and reference directory, and appends the optional `instructions` argument. Set `disable-model-invocation: true` in frontmatter to keep a skill out of the catalog and resource list while leaving its prompt available.

Restart the MCP server to discover added, renamed or removed skills; skill bodies and references are read on each request.

Discovery is limited to this gameplay tree. Development skills in `.agents/skills/`, ambient Pi coding skills, extensions and coding tools are outside this server. Skill guidance cannot override governing instructions or grant tools or file access.
