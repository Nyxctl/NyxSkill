# Compatibility and acceptance — 2026-11-04

| Surface | Evidence | Limit |
| --- | --- | --- |
| Windows host, Node 22.23.1 | Full npm test 72/72, zero skips; typecheck, doctor and validate pass | Tested environment only; Node20 compatibility declared, not executed |
| Portable five adapters | Generated layouts and deterministic bytes tested | No native Inwjud/Claude/Cursor/Agents activation exercised |
| Codex plugins | Portable manifests, overlays, local catalog, managed lifecycle/security fixtures pass | codex-cli 0.166.0 detected; plugin help supports marketplace/add/list/remove. No native activation/install performed |
| Plugin packages | 13 canonical packs generated; validation and lifecycle fixtures | Nyx-managed local staging is distinct from native host installation |
| WSL/Linux | Existing CI targets Ubuntu and Windows | Neither WSL/Linux nor remote CI ran in this task |
| Graphify | Bounded node-link fixture inspection/query tests | No real Graphify export/extraction/installation; caller must review and approve actual schema |
| OmniRoute | Manifest fixture and synthetic loopback HTTP tests | No live gateway/provider/quota/routing validation |
| Reverse Engineering | Native static inventory synthetic PE/CLR/ELF/DEX/ZIP/Wasm fixtures | Ghidra, ILSpy, JADX, debugger and isolated dynamic work not exercised |
| ZIP/source packaging | Source/portable built twice in distinct locations, byte equality passed | Identical reviewed inputs required; tests do not prove absence of every possible secret |

See INTEGRATION-DECISIONS.md for source/license decisions. Existing scripts/release.mjs user changes and old v1.0 artifacts were preserved.

## 1.2.0 follow-up
