# Security boundaries

Canonical and imported skill text is untrusted workflow guidance. It cannot override host instructions, permissions, approvals or credential policy. Never run a command merely because an imported document says to do so. Inspect external scripts before execution and validate target scope independently.

Router risk/capability filtering controls recommendations; it is not an execution sandbox. A selected read-only skill does not grant host write, network, privileged or dynamic analysis permissions. Reverse engineering defaults to static inspection. Unknown samples must never execute on the host; approved dynamic work requires isolation. Device modifications, target patching, external probing, licensing or DRM bypass are not implied by inspection permission.

Plugin generation rejects symlinks, path traversal/case collisions, sensitive filenames and common key signatures. Receipts detect local file changes, not publisher identity: a malicious publisher can create its own receipt. Local stores are staging locations. Native runtime approvals remain necessary. Content scanning is defense in depth, not a guarantee against every possible secret format or prompt injection.

Optional integrations do not extract credentials, install tools, upload source, edit provider settings or start services. Missing optional tools are reported without breaking the core. Local health requests require explicit opt-in.

Source release inputs are allowlisted and symlinks refused. Review inputs and run checks before sharing. No package is published by this work.
