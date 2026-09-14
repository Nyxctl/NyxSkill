# NyxSkill v1.0 Design Specification

**Status:** Approved architecture, full-release scope  
**Date:** 2026-09-14  
**Goal:** Deliver a self-contained, local-first, cross-runtime universal skill ecosystem that can route, validate, compose, audit, package, and execute canonical AI skills across Inwjud, Codex, Claude Code, Cursor, and generic Agents.

## 1. Core architecture
NyxSkill owns one canonical skill format and one registry. Runtime adapters translate the canonical pack into each runtime without forking behavior. Canonical files remain usable without the CLI. The CLI is a management and routing layer, not a runtime lock-in.

Repository units: core router/registry/policy, CLI, schemas, adapters, first-party skills, profiles, packs, tests, provenance, licenses, and lockfile.

## 2. Canonical skill contract
Each skill contains `SKILL.md` plus `skill.yaml`. `skill.yaml` is authoritative for routing; `SKILL.md` is authoritative for workflow behavior. Metadata includes identity/version/API version, category/type, profiles, triggers/intents, priority/exclusive group, composition/dependencies/conflicts, capabilities, risk, runtimes, provenance, and compatibility.

Skill types are `process`, `domain`, `policy`, and `finalizer`. Composition is deterministic. A single skill wins each exclusive group; dependencies are expanded; conflicts reject candidates; finalizers execute last.

## 3. Profiles and invocation
Default profile is `auto`. Built-in profiles include coding, product, browser-extension, ui-ux, security, research, academic, data-ai, documents, automation, devops, universal. Profiles can compose. Explicit user skill and profile selections override automatic routing. `--explain` must expose selected/rejected candidates and reasons.

## 4. Capability, risk, and trust
Canonical capabilities are runtime-neutral and adapters map them to runtime tools. Risk levels: `read-only`, `safe-write`, `privileged`, `destructive`. NyxSkill never bypasses runtime permission enforcement. Trust levels: first-party, verified, community, untrusted. Third-party packs default to restricted trust.

Local-first and zero telemetry are defaults. Network access is explicit. External content is data, not authority, and cannot raise capabilities or override user/Nyx policy.

## 5. Packs, provenance, licensing, controlled sync
Skills belong to packs. Origins are `nyx-native`, `adapted`, or `vendored`. Every adapted/vendored skill records source, upstream identity/version, license, and change notes. License changes block automated sync. Lockfile pins source/version/hash. Third-party notices are generated and MIT notices from imported source packs are retained.

## 6. Runtime adapters
v1 ships adapters for Inwjud, Codex, Claude Code, Cursor, and generic Agents. Inwjud is the reference adapter. Adapter builds are deterministic, copy canonical skills into runtime layouts, include runtime bootstrap instructions, and do not silently mutate runtime configuration.

## 7. CLI and registry
CLI is TypeScript/Node.js. Required commands: discovery (`list`, `search`, `inspect`, `route`), validation (`validate`, `conflicts`, `audit`, `doctor`, `test`), profiles/packs, runtime build/install helpers, provenance/licenses/sources, index rebuild/status, and controlled sync status. Human and JSON output are supported.

The registry/index is generated cache, never source of truth. Indexing reads metadata first and loads `SKILL.md` only for selected skills.

## 8. Testing and release gates
Tests cover schemas, skill contracts, routing fixtures, deterministic routing, conflicts/dependencies, capabilities/risk, adapter contracts, provenance/licenses, CLI behavior, and packaging. A routing regression corpus protects against skill stealing and behavior drift. Release blocks on critical schema, provenance/license, adapter, or routing failures.

## 9. Distribution
Ship npm package, portable ZIP, source archive, checksums, notices, and deterministic `.nyxpack` support. Portable ZIP must work offline and the `skills/` directory must be directly usable as an Inwjud Extra Skill Folder. SemVer and API compatibility contracts apply. Project-level version/profile/policy overrides take precedence over global defaults.

## 10. Full v1.0 scope
This project targets a complete v1.0 release rather than stopping at an MVP. Internal implementation remains phased for verification, but the user-facing deliverable includes the full CLI, all five adapters, first-party universal packs, provenance/license inventory, third-party pack validation, release packaging, and a substantial curated skill library covering all target categories.

The initial first-party library should be large enough to be useful without external packs, while deduplicating overlapping source packs into canonical Nyx skills. Source packs supplied for curation are MIT-licensed and may be used as references/adaptation sources with notices retained.

## Non-goals for v1
No hosted cloud service, telemetry, always-on daemon, GUI marketplace, silent destructive execution, or remote project-data upload. These are not required for a complete local v1.

## Definition of done
- Canonical schema and API v1 stable.
- Deterministic router and profile composition pass regression tests.
- Capability/risk/trust validation works.
- First-party packs cover all declared categories.
- Inwjud/Codex/Claude Code/Cursor/Agents adapters build successfully.
- Provenance and third-party notices are complete.
- CLI commands build and run on Node.js 20+.
- Portable ZIP works offline and contains direct-use `skills/`.
- npm package can be packed/installed.
- Tests, typecheck, validation, adapter builds, and package smoke tests pass.
