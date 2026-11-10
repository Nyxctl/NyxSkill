# NyxSkill

NyxSkill is a local-first, zero-telemetry, deterministic universal skill ecosystem for AI coding/research/product workflows. It ships 96 canonical first-party skills, 13 packs, profile-aware routing, risk/capability metadata, provenance, validated third-party `.nyxpack` support, and adapters for Inwjud, Codex, Claude Code, Cursor, and generic Agents.

## Quick start

Requires Node.js 20+ only; there are **zero runtime dependencies**.

```bash
npm run build
node dist/src/cli.js doctor
node dist/src/cli.js list
node dist/src/cli.js route "Chrome extension login broke after API update" --runtime inwjud --explain
node dist/src/cli.js build --all --out ./dist/runtimes
```

When installed from npm/tarball, use `nyxskill` instead of `node dist/src/cli.js`.

## Core commands

```text
nyxskill list
nyxskill search <query>
nyxskill inspect <skill-id>
nyxskill route <request> --explain
nyxskill validate --all
nyxskill conflicts
nyxskill audit
nyxskill doctor
nyxskill profile list
nyxskill pack list
nyxskill pack verify <file.nyxpack>
nyxskill pack add <file.nyxpack>
nyxskill build --all
nyxskill index rebuild
nyxskill sync --check
nyxskill provenance <skill-id>
nyxskill licenses
```

## Design

`skills/**/SKILL.md` defines behavior and `skills/**/skill.yaml` defines routing, capabilities, risk, runtimes, provenance, and compatibility. The CLI is optional: the skill folders remain directly consumable by compatible runtimes.

See `INSTALL.md` for runtime setup. Design/implementation specs are under `docs/superpowers/` in the source release.

## Hybrid ecosystem (1.1.0)

Portable skills remain the canonical core. Plugins are generated per pack, with a local development marketplace and managed staging store. No host settings or providers are changed automatically.

```bash
npm test
node dist/src/cli.js doctor
node dist/src/cli.js plugin build --out ./dist/plugins-1.1.0
node dist/src/cli.js plugin verify ./dist/plugins-1.1.0/plugins/nyx-reverse-engineering
node dist/src/cli.js plugin install ./dist/plugins-1.1.0/plugins/nyx-reverse-engineering --store ./dist/local-plugin-store
node dist/src/cli.js plugin list --store ./dist/local-plugin-store
node dist/src/cli.js route "inspect a .NET assembly" --profile reverse-engineering --explain
node skills/reverse-engineering/reverse-triage/scripts/inventory.mjs ./sample.dll
node dist/src/cli.js integration graphify
```

The default integration state is disabled. For explicitly reviewed local Graphify schemas or OmniRoute manifests see [optional integrations](docs/OPTIONAL-INTEGRATIONS.md). No automatic cloud extraction, provider replacement or credential handling is implemented.

See [architecture](docs/ARCHITECTURE.md), [plugin and marketplace guide](docs/PLUGINS.md), [migration](docs/MIGRATION.md), [skill catalog](docs/SKILLS-CATALOG.md), [packs](docs/PACKS-CATALOG.md), [security](docs/SECURITY.md), [source decisions](docs/INTEGRATION-DECISIONS.md), and [progress checkpoint](docs/EXPANSION-PROGRESS.md).

## Capability routing (1.2.0)

```bash
node dist/src/cli.js capability discover --out ./inventory.json
node dist/src/cli.js capability route "create a DOCX" --inventory ./inventory.json
node dist/src/cli.js route "test Windows installer in VM" --json
```

Discovery refreshes Codex install state only. For actual tool selection supply a current host-reviewed `--tools FILE` snapshot; installed plugins do not prove tool/auth availability. A skill-only artifact provider yields required-skill guidance. The canonical NyxSkill router loads the required provider skill and invokes the selected real tool through the host; CLI plans never execute MCP or VM lifecycle commands.

See [capability routing](docs/CAPABILITY-ROUTING.md), [observed plugin audit](docs/CODEX-PLUGIN-AUDIT.md).
