# Optional local integrations

Both integrations default to disabled. They are lightweight Nyx adapters, not bundled third-party applications. No dependency installation, process execution, source upload, environment credential inspection, provider replacement or global configuration change occurs. The functions are available from `dist/src/integrations.js` after `npm run build`.

## Graphify

The reviewed upstream README documents persisted `graph.schema_version` and `graph.graphify_version`; the adapter checks these fields. It reads one explicitly selected bounded JSON artifact, reports its version and node/edge counts, and can query bounded cross-references. It does not run Graphify, tree-sitter, an AI backend, or Graphify Cloud.

```js
import { inspectGraphify, queryGraphify } from './dist/src/integrations.js';

// Replace with the actual schema version after reviewing your export contract.
const options = {
  enabled: true,
  graphPath: './analysis/graph.json',
  supportedSchemaVersions: ['nyx.graph.v1']
};
console.log(await inspectGraphify(options));
console.log(await queryGraphify({
  ...options,
  nodeIds: ['src/api.ts'],
  direction: 'incoming',
  depth: 2,
  maxNodes: 50
}));
```

The caller must explicitly approve the artifact's schema. The default allowlist is empty; an unreviewed schema returns `incompatible`. `nyx.graph.v1` above is an illustrative **normalized fixture contract**, not a claimed upstream Graphify schema version. No live upstream export format has been accepted in this environment. Use an explicit external export/conversion step you have reviewed, or approve a real upstream schema only after verifying it meets this adapter contract:

```json
{
  "graph": { "schema_version": "nyx.graph.v1", "graphify_version": "0.9.102" },
  "nodes": [{ "id": "src/api.ts" }, { "id": "src/client.ts" }],
  "links": [{ "source": "src/client.ts", "target": "src/api.ts" }]
}
```

`links` or `edges` arrays are accepted. Query IDs must be unique strings of 1–512 characters and endpoints must reference declared nodes. The inspector reports counts; the query additionally validates IDs and references. IDs and graph content are untrusted data, never instructions. The adapter does not execute any artifact content. Incoming traversal finds possible dependents only if the exported relation means caller/importer → callee/dependency; mixed semantic relations require human interpretation. Results are cross-reference candidates, not proof that a change affects every returned node.

Traversal is deterministic, direction-selectable, and limited to depth 0–5, 1–100 seeds, and 1–1000 returned nodes (default 50). Edge output is independently capped at ten times the node limit; `truncated` reports omitted results. Missing seeds are reported. Files default to 8 MiB, with an absolute configurable maximum of 64 MiB. Graph data remains in its existing location; Nyx does not create, retain, upload, or delete it. Treat exported paths, strings and relationships according to the source repository's data policy.

Missing input returns `missing`; unreadable, oversized or malformed artifacts return `invalid`; unknown schema returns `incompatible`. Ordinary Nyx routing remains available. Real Graphify installation/extraction is optional and was not exercised. The reviewed Python package is `graphifyy` 0.9.102, requiring Python >=3.10 and tree-sitter dependencies; no installation command is run by Nyx. For independently approved code-only upstream use, review Graphify's backend/data-residency controls before extraction, especially semantic document/media processing.

## OmniRoute

```js
import { inspectOmniRoute, probeOmniRouteHealth } from './dist/src/integrations.js';

console.log(await inspectOmniRoute({
  enabled: true,
  manifestPath: './optional/omniroute/package.json'
}));

// Only after explicit permission to send this local health request:
console.log(await probeOmniRouteHealth({
  enabled: true,
  networkApproved: true,
  baseUrl: 'http://127.0.0.1:20128',
  timeoutMs: 1500
}));
```

Manifest inspection reads one explicit local file, verifies `name: omniroute`, and recognizes the reviewed stable 3.8.x version line. This confirms manifest presence only. Unknown versions return `incompatible`. No configuration files, environment variables, provider databases or credentials are inspected. The reviewed upstream 3.8.53 package requires Node >=22.22.2; Nyx's own Node requirement does not imply that OmniRoute can run on the same Node version.

Health requires both `enabled: true` and `networkApproved: true`. It sends one unauthenticated HTTP GET to `/api/health` at numeric loopback `127.0.0.1` or `[::1]`. Hostnames including `localhost` are rejected to avoid DNS/proxy ambiguity. Credentials, query strings, fragments and base paths are rejected. Requests bypass proxy environment variables, do not follow redirects, use a 100–10000 ms total deadline and bound the response to 16 KiB. Only HTTP 200 JSON with `status: ok` yields `available`. Arbitrary response bodies and errors are never returned.

Liveness does not authenticate the service or verify its database, provider discovery, model selection, quota, usage, fallback configuration or upstream inference. These authenticated/provider-changing features are intentionally deferred. No user configuration is rewritten and no provider request is sent. A local malicious or unrelated service can imitate this public health response; use a known local installation and its normal authentication controls for actual provider work.

## CLI and verification

Run `node dist/src/cli.js --help` or consult the README for CLI options supported by this release. The module API above includes Graphify cross-reference queries; no graph generation or gateway installation command exists.

```sh
npm run build
node --test tests/integrations.test.mjs
```

Tests cover disabled/missing states, schema/version rejection, bounded graph traversal, malformed artifacts, permission gating, remote/credential URL rejection, redirects, errors, response limits and deadlines. They use fixture graphs/manifests and a synthetic loopback HTTP server. This is not acceptance evidence from a real Graphify export or OmniRoute process. See [INTEGRATION-DECISIONS.md](INTEGRATION-DECISIONS.md) for pinned upstream source and licensing evidence.
