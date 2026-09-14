# NyxSkill

**NyxSkill** is a local-first, zero-telemetry skill system for AI assistants.

It provides reusable workflows for coding, debugging, research, product development, security, browser extensions, documents, automation, and DevOps.

Instead of loading every skill at once, NyxSkill routes each request to the most relevant skills.

Supported runtimes:

- Inwjud
- Codex
- Claude Code
- Cursor
- Generic AI Agents

## What is included

NyxSkill v1.0 includes:

- **87 built-in skills**
- **12 skill packs**
- Profile-aware deterministic routing
- Skill dependency and conflict handling
- Capability and risk metadata
- Provenance and license tracking
- Third-party `.nyxpack` support
- Runtime adapters for multiple AI systems
- Zero runtime dependencies

## Requirements

```text
Node.js 20+
```

## Quick start

Install development dependencies and build:

```bash
npm install
npm run build
```

Check NyxSkill:

```bash
node dist/src/cli.js doctor
node dist/src/cli.js list
```

Try the router:

```bash
node dist/src/cli.js route "Chrome extension login broke after API update" --runtime codex --explain
```

Build runtime adapters:

```bash
node dist/src/cli.js build --all --out ./dist/runtimes
```

If installed from the npm package / `.tgz`, use `nyxskill` directly:

```bash
nyxskill doctor
nyxskill list
nyxskill route "Fix this API bug" --explain
```

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

## How NyxSkill works

Each canonical skill contains:

```text
skills/
└─ category/
   └─ skill-name/
      ├─ SKILL.md
      └─ skill.yaml
```

`SKILL.md` contains the workflow or instructions the AI follows.

`skill.yaml` contains routing and metadata such as:

- profile
- priority
- triggers
- dependencies
- conflicts
- capabilities
- risk
- supported runtimes
- provenance
- compatibility

In short:

```text
SKILL.md   = what the skill does
skill.yaml = when and how NyxSkill should use it
```

Example request:

```text
Chrome extension login broke after API update
```

NyxSkill may route it through:

```text
Systematic Debugging
        ↓
Browser Extension Development
        ↓
Secure Authentication
        ↓
Extension Testing
        ↓
Verification
```

## GitHub Releases

Releases are available at:

https://github.com/Nyxctl/NyxSkill/releases

### Which file should I download?

| File | Use |
|---|---|
| `NyxSkill-v1.0.0-portable.zip` | **Recommended for most users and Inwjud** |
| `nyxskill-1.0.0.tgz` | Install the `nyxskill` CLI with npm |
| `SHA256SUMS` | Verify downloaded release files |
| `Source code (zip)` | Read, modify, or build the tagged source |
| `Source code (tar.gz)` | Same source archive, mainly for Linux/macOS |

### Portable ZIP

Use this if you want NyxSkill without cloning the repository.

Typical use:

```text
Download ZIP
→ Extract
→ Add the skill folder to your AI runtime
```

For Inwjud, add the extracted NyxSkill skill directory as an **Extra Skill Folder**.

### npm package

Install:

```bash
npm install -g ./nyxskill-1.0.0.tgz
```

Then run:

```bash
nyxskill doctor
nyxskill list
nyxskill route "Fix this bug" --explain
```

### SHA256SUMS

Use this file to verify release integrity.

PowerShell:

```powershell
Get-FileHash .\NyxSkill-v1.0.0-portable.zip -Algorithm SHA256
```

Windows CMD:

```cmd
certutil -hashfile NyxSkill-v1.0.0-portable.zip SHA256
```

Compare the result with the hash in `SHA256SUMS`.

## Project structure

```text
NyxSkill/
├─ src/            # Core and CLI
├─ skills/         # Canonical skills
├─ packs/          # Skill pack definitions
├─ profiles/       # Routing profiles
├─ provenance/     # Source/license tracking
├─ tests/          # Automated tests
├─ docs/           # Design and implementation docs
├─ dist/           # Generated build output
├─ nyxskill.lock
├─ INSTALL.md
└─ README.md
```

For runtime-specific setup, see `INSTALL.md`.
