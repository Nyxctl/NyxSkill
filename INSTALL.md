# NyxSkill Installation

## Portable / Inwjud

1. Extract `NyxSkill-v1.0.0-portable.zip`.
2. In Inwjud open MCP & Skills settings.
3. Add the extracted `skills` directory to **Extra Skill Folders**.
4. Restart/reload local skill discovery if required.
5. Optional CLI check: `nyxskill doctor --root <extracted-folder>`.

The portable package also contains prebuilt runtime layouts under `runtimes/`. `runtimes/inwjud/skills` is an equivalent Inwjud-ready folder.

## Codex

Use `runtimes/codex/`. It contains `AGENTS.md` plus canonical `skills/`.

## Claude Code

Use `runtimes/claude-code/`; skills are under `.claude/skills` and bootstrap guidance is in `CLAUDE.md`.

## Cursor

Use `runtimes/cursor/`; the generated `.cursor/rules/nyxskill.mdc` points Cursor at `.cursor/skills`.

## Generic Agents

Use `runtimes/agents/` with its `AGENTS.md` and `skills/` directory.

## CLI / npm tarball

```bash
npm install -g ./nyxskill-1.0.0.tgz
nyxskill doctor --root /path/to/NyxSkill
```

No network is required after you have the package. NyxSkill does not silently alter runtime configuration and does not send telemetry.
