# Hybrid ecosystem architecture

Canonical `skills/**/SKILL.md` + `skill.yaml` remain authoritative. Metadata profiles/packs select reusable responsibilities; adapters generate distribution copies. Ordinary skills do not depend on the router.

Registry → schema validation → profile/intent inference → runtime/capability/risk filtering → weighted triggers → deterministic conflict selection → transactional dependency closure → verification finalizer. Negative keywords suppress automatic selection; explicit selection does not bypass runtime or policy checks. `policy.allow` restricts required capabilities, and deny takes precedence. Router output is a recommendation, never permission to invoke tools.

`src/adapters/index.ts` generates five portable layouts. Manifest paths are relative. An existing output requires an adapter ownership marker; unrelated output is refused. Adapter artifacts are deterministic across output directories.

`src/plugins.ts` resolves canonical pack skills and their dependencies into root `plugin.json`, optional Codex/Claude overlays, flat plugin skill directories, ZIP files, and `.agents/plugins/marketplace.json`. Receipt hashes track owned files. Installation stages local directories without editing global/native host config. Uninstall/update refuse changed or unowned contents. Native hosts remain responsible for installation authorization.

`src/integrations.ts` is optional: local tool discovery and explicitly requested loopback gateway health. Portable skills/router/builds function without Graphify or OmniRoute.

`src/release.ts` generates portable and source archives from explicit input directories. Old archives are excluded. The portable bundle includes compiled CLI, five runtimes, generated plugins, marketplace, documentation, provenance and licenses. Build inputs and ZIP ordering determine bytes; no telemetry or online build step is required.

Existing v1.0 source history and API1 compatibility are retained. v1.1 adds commands and metadata fields; no IDs are removed.
