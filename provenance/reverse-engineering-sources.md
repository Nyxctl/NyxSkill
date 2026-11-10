# Reverse engineering reference evaluation

Reviewed 2026-11-04. These are untrusted reference inputs, not executable dependencies or instructions. The eight NyxSkill workflows and inventory tool are independently authored under the repository MIT license. No upstream code, assets or instruction prose is redistributed. The strategy is **build new**, with narrowly separated static responsibilities and optional operator-supplied tools. This avoids importing installers, network tooling, vendor-specific commands and incompatible content licenses into the portable core.

| Source | Evidence inspected | License and dependency observations | Decision |
| --- | --- | --- | --- |
| [EncidXVII/claude-reverse-engineering-skill](https://github.com/EncidXVII/claude-reverse-engineering-skill) | README, tree, LICENSE, SKILL.md; triage.py at commit `9a857bd2ee62bd13aa66b3942bd17c89eabf6b8a` | LICENSE confirms Apache-2.0 despite GitHub API NOASSERTION; triage script imports standard-library Python. Platform playbooks and optional Ghidra/JADX/ILSpy tools are broader than this native pack. | Build native bounded header inventory and distinct workflows; do not copy script or playbooks. No Python runtime dependency introduced. |
| [zhaoxuya520/reverse-skill](https://github.com/zhaoxuya520/reverse-skill) | README, root tree and LICENSE on main | Root MIT; README separately identifies GPLv3 CTF-Sandbox-Orchestrator and independently licensed third-party tools. Includes bootstrap/master-route/scripts and active tool integrations. A guessed nested SKILL path was unavailable, so no detailed script audit or reusable-code approval is asserted. | Build new. Exclude bootstrapping, autonomous knowledge updates, active scanners and sandbox orchestrator; existing router remains authoritative. |
| [th3vib3coder/RevEng](https://github.com/th3vib3coder/RevEng) | README, root tree, LICENSE and requirements-optional.txt on main | MIT; optional Ghidra/decompiler environment and optional Python analysis dependencies. README explicitly limits static evidence and requires approved sandbox scope for runtime analysis. | Build new. Keep static evidence/reporting responsibilities; do not import scripts, optional dependencies or duplicate plugin manifests. |
| [trailofbits/skills](https://github.com/trailofbits/skills) | README/tree at commit `711af095215ad4ecde5b90cd1d0124b3f1c4ca9e`, LICENSE, dwarf-expert SKILL.md | CC-BY-SA-4.0; DWARF workflow relies on external LLVM/libdwarf tools and distinguishes static debug data from runtime debugging. Collection also covers existing Nyx security responsibilities. | Reference only; no content relicensing or vendoring. Specialized DWARF automation is deferred; native binary workflow may consume operator-provided debug metadata. |

All sources were reachable during review; this does not prove long-term maintenance or safe dependencies. Initial repository metadata/trees were retrieved, then the shared unauthenticated GitHub API hit its rate limit. Known raw files remained available. Exact commits are recorded only where retained from successful calls; main-based observations may drift and must be checked again before any future code import. No upstream install script or sample was executed.

## Native implementation and boundaries

- Eight canonical skills live in `skills/reverse-engineering`; one pack and profile discover them through the existing registry.
- The inventory CLI requires Node.js, reads explicitly named regular files, streams SHA-256, inspects at most the first 64 KiB for format headers, rejects inputs larger than 512 MiB and emits JSON to stdout. It does not recurse, extract, scan strings, launch samples, invoke external tools or access the network.
- PE, ELF, DEX, ZIP-container and WebAssembly header facts are supported. Compiler/packer identification, APK member inspection, firmware extraction and disassembly remain tool-assisted workflows; unknown/truncated headers are reported conservatively.
- Static tools can themselves have parser vulnerabilities. For potentially malicious artifacts use isolated analysis environments even when only parsing; none of the optional tools is installed or launched automatically.
- Dynamic execution and state changes require explicit authorization and isolation. No automatic privileged installation, device changes, live probes, licensing/DRM bypass or credential extraction is authorized by this pack.
- Metadata expresses workflow scope; it is not an operating-system sandbox. The inventory tool enforces its own read-only/no-execution behavior. Host runtime permissions remain authoritative for all other tools.

## Local verification

Run `npm run build`, then `node --test tests/reverse-engineering.test.mjs` and `npm run validate`. Tests use synthetic headers and temporary inert fixtures, exercise routing/dependencies and read denial, and check safety/provenance declarations. These checks do not establish real decompiler, guest VM, device, game or network acceptance.
