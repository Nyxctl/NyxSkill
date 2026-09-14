# NyxSkill

NyxSkill is a local-first, zero-telemetry, deterministic universal skill ecosystem for AI coding/research/product workflows. It ships 87 canonical first-party skills, 12 packs, profile-aware routing, risk/capability metadata, provenance, validated third-party `.nyxpack` support, and adapters for Inwjud, Codex, Claude Code, Cursor, and generic Agents.

## Quick start

Requires Node.js 20+ only; there are **zero runtime dependencies**.

```bash
npm run build
node dist/src/cli.js doctor
node dist/src/cli.js list
node dist/src/cli.js route "Chrome extension login broke after API update" --runtime Codex --explain
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
