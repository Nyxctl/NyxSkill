# NyxSkill

NyxSkill is a local-first skill system for AI assistants. It selects reusable workflows for each request so the assistant can load the skills it needs. The CLI has zero runtime dependencies and sends no telemetry.

This branch contains **96 canonical skills, 14 packs, and 14 routing profiles**. Workflows cover development, debugging, research, product design, security, browser extensions, documents, automation, DevOps, reverse engineering, and image work.

- [Skill catalog](docs/SKILLS-CATALOG.md)
- [Pack catalog](docs/PACKS-CATALOG.md)
- [Installation guide](INSTALL.md)
- [Changelog](CHANGELOG.md)

## Quick start

Use Node.js 20 or later.

```bash
npm ci
npm run build
node dist/src/cli.js doctor
node dist/src/cli.js validate --all
node dist/src/cli.js route "Chrome extension login broke after API update" --runtime codex --explain
```

To install from a downloaded npm tarball, substitute its actual filename:

```bash
npm install -g ./nyxskill-1.2.0.tgz
nyxskill doctor
nyxskill list
```

## Installation options

| Option | Use it for |
| --- | --- |
| Portable ZIP | Extract the bundle and point your runtime at its skill folder. In Inwjud, add `runtimes/inwjud/skills` under Extra Skill Folders. |
| npm tarball | Install the `nyxskill` command and use the bundled library. |
| Source checkout | Develop skills, run tests, or build adapters and packages. |
| Individual skill | Copy the entire skill folder, including its references and scripts, into a skill location supported by your host. |

See [GitHub Releases](https://github.com/Nyxctl/NyxSkill/releases) for published versions and available assets. For a downloaded package, compare its SHA-256 digest with the matching entry in `SHA256SUMS`. In PowerShell, use `Get-FileHash <downloaded-file> -Algorithm SHA256`.

Generate adapter layouts with `nyxskill build --all --out ./dist/runtimes`. NyxSkill provides adapters for **Inwjud, Codex, Claude Code, Cursor, and generic Agents**. Adapter output and host discovery are separate checks. Follow [INSTALL.md](INSTALL.md) for the host-specific folder layout and setup.

## How routing works

Each canonical skill lives under `skills/<category>/<skill-name>/`.

- `SKILL.md` contains the workflow the assistant follows.
- `skill.yaml` describes triggers, priority, profiles, dependencies, conflicts, required capabilities, risk, runtime compatibility, and provenance.
- Optional supporting files hold scripts, references, templates, or tests.

The router selects a deterministic chain from the request, active profiles, and any runtime or capability constraints you supply. Use `--explain` to see why candidates were selected or rejected. The host remains responsible for permission enforcement and tool execution.

| Task | Commands |
| --- | --- |
| Find and inspect skills | `nyxskill list`, `nyxskill search <query>`, `nyxskill inspect <skill-id>` |
| Route a request | `nyxskill route "<request>" --runtime codex --explain` |
| Browse profiles and packs | `nyxskill profile list`, `nyxskill pack list` |
| Validate the library | `nyxskill validate --all`, `nyxskill conflicts`, `nyxskill audit`, `nyxskill doctor` |
| Inspect sources and licenses | `nyxskill provenance <skill-id>`, `nyxskill sources`, `nyxskill licenses` |
| Maintain the local index and check sources | `nyxskill index rebuild`, `nyxskill sync --check` |
| Review third-party packs | `nyxskill pack verify <file.nyxpack>`, `nyxskill pack add <file.nyxpack>` |

## Featured workflows

### Universal Image Studio

The [Image & Media pack](packs/image-media.yaml) includes [Universal Image Studio](skills/image-media/universal-image-studio/README.md) for image analysis, reference management, generation, targeted edits, and QA. In Codex, invoke `$universal-image-studio` after installing the skill. In ChatGPT, use the supplied Project Instructions and attach the images the Project can access.

The offline tools use Python 3.11+ and Pillow to inventory references, composite an aligned edit through a grayscale mask, and verify that decoded RGBA values outside the mask match the source. RimWorld Menu Background is an optional profile. Native image generation and editing depend on the tools available in the current session. The workflow has no paid API fallback.

### Codex capability routing

```bash
nyxskill capability discover --out ./inventory.json
nyxskill capability route "create a DOCX" --inventory ./inventory.json
```

Discovery reports installed and enabled integrations. To plan actual tool use, supply a current, reviewed tool snapshot with `capability discover --tools <file>`. A capability plan distinguishes installation, tool availability, authentication, and authorization. The CLI returns guidance for the host to execute. See the [capability routing guide](docs/CAPABILITY-ROUTING.md).

### Reverse Engineering

The [Reverse Engineering pack](packs/reverse-engineering.yaml) provides eight static-first workflows. Start with triage to identify the artifact, then select the relevant specialist. For example:

```bash
nyxskill route "inspect a .NET assembly" --profile reverse-engineering --explain
```

### Learning Loop

The [Learning Loop](docs/LEARNING-LOOP.md) is opt-in. Record a lesson or procedure for a project, verify it with run evidence, and generate a reviewable skill diff once a procedure has two accepted runs. Add `--learning` to a route request to retrieve matching project records. This branch supports host and interactive evidence. Guest verification is deferred with NyxVMTest.

## Plugins and optional integrations

```bash
nyxskill plugin build --pack nyx.image-media --out ./dist/image-media-plugin
```

Plugin builds produce local artifacts and marketplace metadata. Use the [plugin guide](docs/PLUGINS.md) to verify the generated package, stage it in a local store, or install it in a compatible host. Graphify and OmniRoute are opt-in and disabled by default. See [optional integrations](docs/OPTIONAL-INTEGRATIONS.md) for local setup and supported inputs.

## Development and verification

```bash
npm run typecheck
npm test
python -B skills/image-media/universal-image-studio/tests/test_studio.py
```

The Python tests require Pillow. This branch was checked on Windows with 95 Node tests, 4 offline image tests, and registry validation. Host adapters and optional service behavior covered by fixture tests have separate live acceptance requirements.

The implementation is under `src/`, canonical workflows under `skills/`, routing metadata under `packs/` and `profiles/`, and source and license records under `provenance/`. See [Architecture](docs/ARCHITECTURE.md), [Compatibility](docs/COMPATIBILITY.md), [Security](docs/SECURITY.md), and [Third-party notices](THIRD_PARTY_NOTICES.md).

## License

[MIT](LICENSE).
