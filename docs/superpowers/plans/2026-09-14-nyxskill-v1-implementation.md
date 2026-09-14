# NyxSkill v1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and package a complete, local-first NyxSkill v1.0 universal skill ecosystem with deterministic routing, first-party packs, five runtime adapters, provenance, validation, and release artifacts.

**Architecture:** Canonical `SKILL.md` + `skill.yaml` files are scanned into a generated registry. A deterministic router filters by profile/runtime/capability, scores triggers and intents, resolves exclusive groups/dependencies/conflicts, then produces an ordered execution chain. Runtime adapters copy/translate the canonical set into runtime-specific layouts without changing workflow semantics.

**Tech Stack:** TypeScript 5.x and Node.js >=20 built-ins only (zero runtime dependencies); Node built-in test runner; local YAML-subset and ZIP utilities.

**Spec:** `docs/superpowers/specs/2026-09-14-nyxskill-v1-design.md`

## Global Constraints
- Node.js >=20.
- Zero runtime dependencies; the release must install and run fully offline.
- Local-first and zero telemetry by default.
- Canonical skills remain usable without CLI.
- Deterministic routing for identical registry/context/input.
- No silent runtime-config mutation.
- Strict provenance and MIT notices for adapted source packs.
- Risk levels: read-only, safe-write, privileged, destructive.
- Runtime adapters: Inwjud, Codex, Claude Code, Cursor, Agents.
- Full v1 release is the final deliverable; internal milestones are not final deliverables.

---

### Task 1: Project foundation and schemas
**Files:** create `package.json`, `tsconfig.json`, `src/schema.ts`, `src/types.ts`, `tests/schema.test.ts`.
**Interfaces:** produces parsed `SkillMeta`, `PackMeta`, `ProfileMeta`, `ProjectPolicy` schemas used by every later task.
- [ ] Write schema tests for valid metadata and invalid duplicate/enum/version cases.
- [ ] Run tests and verify RED due to missing schema module.
- [ ] Implement dependency-free validators and TypeScript exports.
- [ ] Run tests and typecheck to GREEN.
- [ ] Commit foundation.

### Task 2: Registry scanner and validation
**Files:** create `src/registry.ts`, `src/validation.ts`, `tests/registry.test.ts`.
**Interfaces:** `loadRegistry(root): Promise<Registry>` and `validateRegistry(registry): ValidationReport`.
- [ ] Write registry tests using fixture skills.
- [ ] Verify RED.
- [ ] Implement metadata discovery, YAML parsing, duplicate ID/dependency/conflict/profile checks, stable ordering.
- [ ] Verify GREEN and typecheck.
- [ ] Commit registry.

### Task 3: Profiles and deterministic router
**Files:** create `src/router.ts`, `src/profiles.ts`, `tests/router.test.ts`, `tests/fixtures/routing/*.yaml`.
**Interfaces:** `routeRequest(registry, request, options): RouteResult` with selected/rejected reasons and deterministic chain.
- [ ] Write routing fixtures for coding, browser+security, product/UI, research+academic, data-AI, documents, automation/devops, and negative/no-match.
- [ ] Verify RED.
- [ ] Implement profile inference, weighted scoring, exclusive-group resolution, dependencies/conflicts, capability/risk filter, deterministic topological ordering, finalizer placement.
- [ ] Verify GREEN repeatedly for determinism.
- [ ] Commit router.

### Task 4: CLI command surface
**Files:** create `src/cli.ts`, `src/commands/*.ts`, `tests/cli.test.ts`.
**Interfaces:** executable `nyxskill` supporting list/search/inspect/route/validate/conflicts/audit/doctor/test/profile/pack/build/install/provenance/licenses/sources/index/sync.
- [ ] Write CLI smoke tests for human and JSON output plus exit codes.
- [ ] Verify RED.
- [ ] Implement commands over registry/router/validation APIs.
- [ ] Verify GREEN and compile executable.
- [ ] Commit CLI.

### Task 5: First-party packs and canonical skills
**Files:** create `packs/*.yaml`, `profiles/*.yaml`, `skills/**/{skill.yaml,SKILL.md}`, `provenance/skills/*.yaml`, `provenance/sources.yaml`, `licenses/*`, `THIRD_PARTY_NOTICES.md`.
**Interfaces:** at least 50 curated first-party skills across core, engineering, product, browser, UI/UX, security, research, academic, data-AI, documents, automation, devops.
- [ ] Add contract tests requiring all skills to validate and all categories to have coverage.
- [ ] Verify RED before adding library.
- [ ] Add Nyx-native/adapted skill content with complete metadata/provenance and deduplicate overlapping upstream workflows.
- [ ] Copy required MIT notices and generate notices index.
- [ ] Verify validation/routing tests GREEN.
- [ ] Commit skill library.

### Task 6: Runtime adapters
**Files:** create `src/adapters/{inwjud,codex,claude-code,cursor,agents}.ts`, `src/adapters/index.ts`, `tests/adapters.test.ts`.
**Interfaces:** `buildRuntime(root, runtime, outDir): Promise<BuildResult>` and `buildAllRuntimes`.
- [ ] Write adapter contract tests for expected directory layouts and deterministic output.
- [ ] Verify RED.
- [ ] Implement five adapters with runtime bootstrap docs/rules and canonical skill copies.
- [ ] Verify GREEN including repeated-build hash equality.
- [ ] Commit adapters.

### Task 7: Trust, third-party packs, local install, provenance audit
**Files:** create `src/packs.ts`, `src/provenance.ts`, `tests/packs.test.ts`.
**Interfaces:** verify/install/remove local `.nyxpack`, trust classification, checksum, manifest/schema/capability/license audit.
- [ ] Write tests for valid community pack and blocked malformed/high-risk/unlicensed pack.
- [ ] Verify RED.
- [ ] Implement local pack verify/install/remove and provenance/license audit.
- [ ] Verify GREEN.
- [ ] Commit pack system.

### Task 8: Index/cache and controlled sync status
**Files:** create `src/indexer.ts`, `src/sync.ts`, `tests/indexer.test.ts`.
**Interfaces:** content-hash registry cache, rebuild/status, lockfile/source status; network sync remains explicit.
- [ ] Write tests for cache hit/invalidation and lockfile comparison.
- [ ] Verify RED.
- [ ] Implement local cache and `sync --check` source/lock reporting without silent updates.
- [ ] Verify GREEN.
- [ ] Commit index/sync.

### Task 9: Release packaging and portable distribution
**Files:** create `scripts/release.mjs`, `README.md`, `INSTALL.md`, `.gitignore`, `.github/workflows/ci.yml`, `tests/release.test.ts`.
**Interfaces:** `npm run release:local` creates npm tarball, portable ZIP, source ZIP, SHA256SUMS and all-runtime `dist/`.
- [ ] Write packaging smoke test asserting required files in portable artifact and direct `skills/` usability.
- [ ] Verify RED.
- [ ] Implement deterministic release script and documentation.
- [ ] Verify GREEN.
- [ ] Commit packaging.

### Task 10: Full verification and final release candidate
**Files:** update lockfile/notices/docs only if verification finds mismatches.
**Interfaces:** release candidate artifacts with recorded test/typecheck/validation/build results.
- [ ] Run clean install.
- [ ] Run full test suite.
- [ ] Run typecheck and build.
- [ ] Run `nyxskill validate --all`, `doctor`, routing regression tests, and build all adapters.
- [ ] Run local release packaging and inspect ZIP/tarball contents.
- [ ] Run installed CLI smoke test from packed npm tarball.
- [ ] Record final verification summary and commit release candidate.
