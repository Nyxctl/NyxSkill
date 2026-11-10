# NyxSkill Installation

## Portable / Inwjud

1. Extract `NyxSkill-v1.2.0-portable.zip`.
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
npm install -g ./nyxskill-1.2.0.tgz
nyxskill doctor --root /path/to/NyxSkill
```

No network is required after you have the package. NyxSkill does not silently alter runtime configuration and does not send telemetry.

## 1.1 hybrid installation examples

All commands run at the extracted source/portable root. Source installs need `npm ci` and `npm run build`; the portable ZIP already includes `dist/src` and needs only Node >=20.

- Standalone skill: copy one complete canonical skill directory (including references/scripts) into the host's configured skills location. Preserve the directory's supporting files. Use generated plugin skills for hosts requiring strict portable lowercase names.
- Complete pack: generate its plugin with `node dist/src/cli.js plugin build --pack nyx.reverse-engineering --out ./dist/reverse-plugin`, or copy each canonical skill listed in `packs/reverse-engineering.yaml` plus declared dependencies. Runtime adapters continue generating the entire canonical library.
- Codex plugin: follow [PLUGINS.md](docs/PLUGINS.md); native installation remains a separate explicit host operation. The Nyx-managed store is local staging.
- Marketplace: plugin build emits `.agents/plugins/marketplace.json` next to `plugins/`. Keep those relative locations together and point a supporting native host at that development marketplace. Do not publish it automatically.
- Routing validation: `node dist/src/cli.js validate --all` and `node dist/src/cli.js route "inspect a .NET assembly" --profile reverse-engineering --explain`.
- Graphify: `node dist/src/cli.js integration graphify --enable --graph ./local-graph.json --schema REVIEWED_VERSION`. Unsupported/unapproved schemas fail closed; do not enable cloud extraction.
- Reverse workflows: begin with `reverse-triage`, inspect a sample through the bundled inventory script, then select the relevant specialist. Unknown binaries are never run on the host.
- Long work: resume from `docs/EXPANSION-PROGRESS.md`, inspect `git status`, verify the recorded state and follow the existing executing-plans skill. Record the next executable step before leaving a session.

Generate distributable packages locally with `npm run release:local`. Do not run this over an old release you need to preserve: use the exported build API with a fresh output directory instead. No publishing occurs.

## Current host capability routing

`capability discover --out NEW_FILE` refreshes Codex installed/enabled metadata without changing settings. To select actual tools, supply `--tools FILE` with the current host-reviewed `{tools,builtins}` snapshot. Unannotated tools are ineligible; there is no automatic credential inspection. `capability route REQUEST --inventory FILE` returns exact host tool names or native skill workflow guidance. Load provider-specific prerequisites and recheck the live tool list before invocation. This command does not execute tools.


After updating installed native skills, start a new Codex chat/session to refresh discovery. Targeted native installation evidence and backup location are in the 1.2 artifact verification report; do not infer native invocation acceptance merely from copied files.
