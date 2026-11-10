# Migration from 1.0.x to 1.1.0

Keep existing standalone skills, pack IDs and API1 metadata. Build new distributions to a fresh output directory and review before selecting them in your host. Do not overwrite old release ZIPs. Router changes intentionally reject workflows with missing, cyclic, conflicting or unsupported hard dependencies. An optional `routing.triggers.negative_keywords` array suppresses automatic matches. Capability `policy.allow` is now enforced.

Native skill installation is still supported through the five runtime adapters. Plugin installation is an additional distribution option. Avoid enabling the same canonical responsibility through both standalone and plugin copies in one host. NyxSkill does not silently uninstall existing host skills.

Generated marketplace entries are local development sources. Do not publish this marketplace without separate review. Managed plugin updates retain backups and refuse modified contents; see PLUGINS.md.

## Managed output protection

Runtime rebuilds now require a current file/directory ownership inventory. Choose a fresh output directory for legacy generated layouts or modified trees; no legacy tree is automatically removed. Local `.nyxpack` installs refuse occupied targets. Imported trust labels are self-declared, so privileged/destructive packs cannot grant themselves first-party status. Legacy pre-inventory installs cannot be automatically uninstalled; retain them and migrate manually after review. These intentional safety errors replace earlier destructive overwrite/removal behavior.

ZIP import validation rejects path/drive/reserved-name collisions, symlinks, corrupt CRC/header data and oversized archives. Limits are documented in `src/zip.ts`: 128 MiB archive, 64 MiB per entry, 256 MiB expanded data and 10,000 entries.
