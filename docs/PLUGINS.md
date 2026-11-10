# Plugins and the local marketplace

NyxSkill builds one plugin per canonical pack, including its transitive skill requirements. `skills/`, `packs/`, and provenance records remain the editable source. Generated output is disposable distribution material. No plugin requires the global router to load an ordinary skill.

## Build and inspect

```sh
npm run build
node dist/src/cli.js plugin build --out artifacts/plugins-review
node dist/src/cli.js plugin build --pack nyx.engineering --out artifacts/engineering-review
node dist/src/cli.js plugin verify artifacts/engineering-review/plugins/nyx-engineering
```

The output directory must not exist. Builds never replace an existing output tree. Use a new directory to rebuild. A generated tree contains:

```text
plugins/<pack-name>/plugin.json
plugins/<pack-name>/.codex-plugin/plugin.json
plugins/<pack-name>/.claude-plugin/plugin.json
plugins/<pack-name>/skills/<canonical-id-with-hyphens>/SKILL.md
plugins/<pack-name>/licenses/
plugins/<pack-name>/nyxskill-plugin.json
archives/<pack-name>.zip
.agents/plugins/marketplace.json
.claude-plugin/marketplace.json
```

The root portable manifest declares the Agent Plugins 1.0.0 schema. Skills use fixed root `skills/` discovery. Codex and Claude compatibility manifests point to `./skills/`. Generated skill frontmatter names match their directory; source files are unchanged. Pack IDs become stable kebab-case plugin namespaces, and full skill IDs become directory names to avoid category collisions. Canonical metadata accompanies each skill. Dependency cycles, missing requirements, skill conflicts, case-insensitive file collisions, and plugin namespace collisions stop generation. Required skills are bundled, so there are no unresolved cross-plugin runtime dependencies.

Sorted entries, stable JSON, relative paths, stored ZIP entries, and fixed ZIP timestamps make repeated builds byte-identical for identical canonical input. The receipt records SHA-256 hashes for packaged files, pack identity/version, bundled skills, and declared conflicts. ZIP files are distribution artifacts; managed installation accepts a validated directory rather than extracting arbitrary archives.

Only skills and their adjacent resources, license records, and notices are included. Empty MCP configurations, hooks, provider configuration, and executable installers are not generated. Secret filenames and recognizable private-key/API-key content are rejected. These heuristics do not establish that arbitrary content contains no secrets; review source resources before distributing.

## Local host discovery

The generated Codex catalog uses local sources relative to the generated marketplace root, following the official examples. Nothing is published or registered globally by NyxSkill.

For a manual host acceptance test, add the generated marketplace root with the official CLI:

```sh
codex plugin marketplace add ./artifacts/plugins-review
codex plugin marketplace list
```

Then use the desktop Plugins Directory and a new chat to test discovery and activation. Follow the current host documentation if the local source requires an application restart. For Claude Code, a local acceptance test can use:

```sh
claude plugin validate ./artifacts/plugins-review/plugins/nyx-engineering
claude --plugin-dir ./artifacts/plugins-review/plugins/nyx-engineering
```

These host commands are examples, not evidence that a native installation or activation was accepted. NyxSkill automated checks verify generated files and local fixture behavior. Host version and surface availability can change.

## Managed local staging

```sh
node dist/src/cli.js plugin install artifacts/plugins-review/plugins/nyx-engineering --store artifacts/plugin-store
node dist/src/cli.js plugin list --store artifacts/plugin-store
node dist/src/cli.js plugin install artifacts/plugins-review/plugins/nyx-engineering --store artifacts/plugin-store --update
node dist/src/cli.js plugin remove nyx-engineering --store artifacts/plugin-store
```

The explicit store is a NyxSkill-owned staging directory. These commands do not install into Codex/Claude caches, register catalogs, change provider settings, or edit global host configuration.

Install validates the full package before writing, rejects an occupied target unless explicit update is requested, and stages a complete copy before renaming. Update requires an intact ownership marker and inventory, matching pack identity, the same major version, and no numeric version downgrade. A same-version reinstall is supported. Existing installations move to a retained `.nyxskill-backup-*` directory; returned JSON includes its location. The old directory is restored if the final rename fails. Retained backups are never removed automatically. Declared skill conflicts with other valid plugins in the same store block installation.

Uninstall removes only files whose current content matches the managed inventory. Changed files, unknown files, missing ownership, invalid packages, traversal, unsafe Windows names, and symbolic links/junctions block mutation. Empty user-created directories are preserved. No recursive removal is used by the plugin lifecycle. Existing unrelated directories block mutation instead of being adopted. Do not run concurrent lifecycle operations against the same store; there is no cross-process lock. Use a store whose parent directories cannot be replaced by an untrusted process.

The receipt is an integrity inventory, not a digital signature or an attestation of trust. Managed validation intentionally accepts the NyxSkill skills-only subset; it rejects unknown manifest execution surfaces even when a receipt was recomputed. It is not a general validator for arbitrary third-party Agent Plugins, hooks, or MCP packages. Skill instructions and bundled scripts remain untrusted content; the installer never executes them, and host permissions remain authoritative.

## Verified specifications

Reviewed 2026-11-04:

- [OpenAI packaging guide](https://developers.openai.com/plugins/build/plugins): root portable `plugin.json`, Agent Plugins schema, fixed `skills/`, optional compatibility overlay, and local catalogs.
- [OpenAI skills concepts](https://developers.openai.com/plugins/concepts/skills): independent skills and optional resources, without mandatory MCP.
- [OpenAI plugin repository](https://github.com/openai/plugins): compatibility manifests and `.agents/plugins/marketplace.json` examples. Current examples retain compatibility layouts; the newer packaging guide explicitly prefers portable manifests.
- [Claude manifest reference](https://code.claude.com/docs/en/plugins-reference): `.claude-plugin/plugin.json`, root skill directories, namespaces, relative component paths, and native validation commands.

The integration is tested on the current Windows Node environment. Native Codex/Claude discovery and execution, WSL/Linux, and other host versions require separate acceptance tests.
