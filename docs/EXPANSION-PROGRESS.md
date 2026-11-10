# Ecosystem expansion checkpoint — 2026-11-04

## Baseline and protection
- Existing package 1.0.0; baseline npm test: 27/27 passed on Windows, Node built-in test runner.
- Initial user changes: scripts/release.mjs modified; NyxSkill-main.zip, SHA256SUMS, nyxskill.skill, nyxskill.zip untracked. Preserve them.
- Existing planning: docs/superpowers/plans/2026-09-14-nyxskill-v1-implementation.md and matching design. These describe the v1 baseline; no separate Master Expansion Plan found in tracked docs. Current pasted request is expansion authority.
- Existing registry: 87 canonical skills, 12 packs; five adapters. Counts will be verified after integration.

## Implementation inventory
| Area | Baseline | Expansion action |
| --- | --- | --- |
| Registry/schema/profiles/packs/discovery/provenance | Implemented | Preserve, extend negative triggers |
| Router capabilities/risk/dependencies/conflicts | Partial | Fail closed on dependency/runtime/conflict/cycle; allow list enforcement |
| Portable five runtime adapters | Implemented, absolute build paths | Remove machine-specific paths in generated manifests/docs |
| Codex/Claude plugins and marketplace | Missing | Canonical pack generator, manifests, verification, managed lifecycle |
| Reverse engineering | Missing | Eight native static-first skills and safe inventory tool |
| Engineering/frontend/security | Existing broad coverage | Reuse and merge overlaps; upstream source decision matrix |
| Long running recovery | Partial generic planning | Extend existing planning skills; keep one checkpoint mechanism |
| Graphify/OmniRoute | Missing | Optional detection/opt-in local health only |
| Native plugin discovery | Requires external runtime | Fixture coverage; live acceptance remains separate |
| Windows/Linux/WSL acceptance | Windows available | Never claim Linux/WSL/native runtime acceptance without execution |
| Deprecated/duplicated skills | No removals proposed | Preserve IDs; merge related workflows into existing skills |

## Active work
- Router RED: six meaningful regressions reproduced; GREEN: all ten router tests passed after dependency closure/negative-trigger/policy fixes.
- Plugin, reverse and source/integration work proceeding in independent file scopes.
- Next executable step: integrate new module CLI surfaces, run complete tests, generate fresh versioned artifacts, review diff and write compatibility/handoff evidence.

## Boundaries
No publish, push, branches, deployment, global configuration changes, credential access or unknown binary execution. Workflow instructions are advisory; host permission enforcement remains authoritative.

## Verified checkpoint
- Code frozen after integration and review fixes; project version 1.1.0, API1 unchanged.
- Final npm test: 72/72 PASS, zero skip (Node v22.23.1 Windows).
- Typecheck, doctor, validate and git diff --check PASS. Registry 95 skills / 13 packs / 14 profiles.
- Dependency, negative trigger, policy, plugin lifecycle, pack security, document references, optional fixture integration, and two-location whole-release deterministic tests passed.
- Complete local implementation and intentional upstream deferrals documented in HANDOFF-TH.md, COMPATIBILITY.md and INTEGRATION-DECISIONS.md.
- Source files changed: core router/schema/CLI/adapters/release; new plugins/integrations/documents/version modules; packs/zip hardening; seven existing canonical workflows; new reverse pack/profile/provenance; tests/docs/build helper scripts.
- No unresolved automated failure. Earlier fixture hardcoded pack version fixed; final downgrade test checks same-major numeric downgrade.
- Next executable step: inspect fresh release/1.1.0-20261104 artifacts/checksums, then perform separately scoped native host/service acceptance. Native/WSL/Linux/live external integration acceptance remains open; do not mark those verified.

- Read-only live inventory:45 installed/enabled plugins;35 scoped current MCP read tools reviewed, plus native web; raw/personal snapshot only in ignored .nyxskill.
- Current VM blockers: non-elevated Hyper-V management and conservative secret scan on deliberate integration test fixture. No exporter bypass, transfer, guest lifecycle, new VM or baseline operation.
- Source version1.2.0 /API1, registry96/13/14. New targeted tests pass; next run complete tests, refresh catalogs/lock, update targeted installed native skills with backup, package fresh artifacts and document final evidence.

## 1.2.0 verified checkpoint
- Full npm test95/95 PASS, zero skip; typecheck, doctor, validate and document contracts PASS. Source96/13/14. CLI capability discover read-only refresh observed45 installed/enabled.
- Resource-aware selection corrected after two RED tests: Thai ข้อมูลบนเว็บ read intent and PR/search tool fit. Email-read intent also remains read-only.
- Next: inspect fresh1.2 artifacts and then verify new-chat native discovery. Guest acceptance remains blocked by elevation/export review; do not recreate existing Hyper-V resources or bypass exporter.


- Universal Image Studio passed four offline tests. Registry validation found 97 skills, 14 packs and 14 profiles. Regenerated the skill and pack catalogs.
- A fresh local Codex app-server process returned enabled entries for the installed NyxSkill router and Universal Image Studio via skills/list with forceReload. This checks native discovery; it does not exercise model invocation from a new chat.
- Plugin generation, runtime packaging, routing, and optional service contracts were exercised by local tests. Live Graphify/OmniRoute and acceptance on other hosts remain unverified.
- No release publication, Git staging, or VM operations were performed in this checkpoint.
