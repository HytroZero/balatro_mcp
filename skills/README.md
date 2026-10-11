# Gameplay skills

The CLI uses Pi 1.0.4's `loadSkills` through `DefaultResourceLoader` to discover gameplay skills in this directory. `skills/core.md` remains the always-loaded decision protocol. Discovery follows Pi's frontmatter, ignore-file, naming, duplicate and diagnostic rules. A Markdown file without a description is not a discoverable skill.

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

Pi's available-skill catalog adds the name, description and absolute location to the system context. The body stays out of that catalog. The agent loads matching skills and their references on demand with Pi's read implementation exposed as `file_read`; resolve relative references against the directory containing `SKILL.md`. Large files use Pi's output truncation and one-based `offset` / `limit` pagination, without the former 32 KiB file-size cap. Skill directories are read-only; `file_write({path, content})` uses Pi's write implementation for session workspace notes. Real paths must remain in a discovered skill directory, including when junctions or links are involved.

`/skills` shows discovery results and diagnostics without running inference. Tab completes `/skill:<name>`. Submitting `/skill:<name> [instructions]` uses Pi's native expansion: it removes frontmatter, includes the skill body and reference directory, and appends the supplied instructions. The same expansion applies to guidance queued during play and input after `/resume`. Set `disable-model-invocation: true` in frontmatter to hide a skill from automatic model selection while keeping explicit invocation available.

Restart the terminal or create a new conversation with `/new` to discover changed skills. Reopened conversations use the current gameplay catalog and their retained Pi history; skill reads and expansions remain inspectable in requests and traces. Pi's message converter preserves compaction summaries in provider requests.

Discovery is limited to this gameplay tree. Development skills in `.agents/skills/`, ambient Pi coding skills, extensions and coding tools are outside this runtime. Skill guidance cannot override governing instructions or grant tools or file access. Programmatic callers can pass an explicit `skillDirectory` in `RuntimeOptions`; callers omitting it do not discover skills.
