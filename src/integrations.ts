import { open } from 'node:fs/promises';
import { get } from 'node:http';

export type IntegrationStatus = 'disabled' | 'missing' | 'invalid' | 'incompatible' | 'permission-required' | 'unavailable' | 'available';
export interface IntegrationResult {
  integration: 'graphify' | 'omniroute';
  status: IntegrationStatus;
  reason: string;
  capabilities: string[];
  version?: string;
  schemaVersion?: string;
  structure?: { nodes: number; edges: number };
}

function result(integration: IntegrationResult['integration'], status: IntegrationStatus, reason: string): IntegrationResult {
  return { integration, status, reason, capabilities: [] };
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Read only the explicit artifact, without running an installed tool or scanning configuration. */
async function readJson(file: string, limit: number): Promise<unknown> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 64 * 1024 * 1024) throw new Error('Invalid byte limit');
  const handle = await open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limit) throw new Error('Invalid artifact size or type');
    // Bound the actual read as well as stat, since another process may grow the file.
    const buffer = Buffer.alloc(Math.min(stat.size + 1, limit + 1));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > limit) throw new Error('Artifact exceeds byte limit');
    return JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'));
  } finally {
    await handle.close();
  }
}

export interface GraphifyOptions {
  enabled?: boolean;
  graphPath?: string;
  /** Fail closed unless the caller has verified compatibility with these upstream schemas. */
  supportedSchemaVersions?: string[];
  maxBytes?: number;
}

export async function inspectGraphify(options: GraphifyOptions = {}): Promise<IntegrationResult> {
  if (options.enabled !== true) return result('graphify', 'disabled', 'Explicit opt-in required');
  if (!options.graphPath) return result('graphify', 'missing', 'No local graph artifact supplied');
  let artifact: unknown;
  try { artifact = await readJson(options.graphPath, options.maxBytes ?? 8 * 1024 * 1024); }
  catch { return result('graphify', 'invalid', 'Local graph cannot be read as bounded JSON'); }
  if (!object(artifact) || !object(artifact.graph)) return result('graphify', 'invalid', 'Missing graph metadata');
  const schema = artifact.graph.schema_version;
  const version = artifact.graph.graphify_version;
  if ((typeof schema !== 'string' && typeof schema !== 'number') || typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(version)) {
    return result('graphify', 'invalid', 'Missing or malformed graph schema or producer version');
  }
  const metadata = { version, schemaVersion: String(schema) };
  if (!options.supportedSchemaVersions?.includes(String(schema))) {
    return { ...result('graphify', 'incompatible', 'Graph schema has not been explicitly approved for this caller'), ...metadata };
  }
  const edges = artifact.links ?? artifact.edges;
  if (!Array.isArray(artifact.nodes) || !Array.isArray(edges)) return result('graphify', 'invalid', 'Expected node-link graph arrays');
  return {
    ...result('graphify', 'available', 'Local node-link graph metadata inspected; no extraction or upload performed'),
    ...metadata,
    capabilities: ['codebase.graph.read'],
    structure: { nodes: artifact.nodes.length, edges: edges.length }
  };
}

export interface GraphifyQueryOptions extends GraphifyOptions {
  nodeIds: string[];
  direction?: 'incoming' | 'outgoing' | 'both';
  depth?: number;
  maxNodes?: number;
}

export interface GraphifyQueryResult extends IntegrationResult {
  nodes?: string[];
  edges?: { source: string; target: string }[];
  missing?: string[];
  truncated?: boolean;
}

/** Cross-references over a caller-approved node-link artifact; never executes or extracts code. */
export async function queryGraphify(options: GraphifyQueryOptions): Promise<GraphifyQueryResult> {
  if (options.enabled !== true) return result('graphify', 'disabled', 'Explicit opt-in required');
  const depth = options.depth ?? 1;
  const maxNodes = options.maxNodes ?? 50;
  const direction = options.direction ?? 'incoming';
  if (!Array.isArray(options.nodeIds) || options.nodeIds.length < 1 || options.nodeIds.length > 100 ||
      options.nodeIds.some(id => typeof id !== 'string' || id.length < 1 || id.length > 512) ||
      !Number.isSafeInteger(depth) || depth < 0 || depth > 5 ||
      !Number.isSafeInteger(maxNodes) || maxNodes < 1 || maxNodes > 1000 ||
      !['incoming', 'outgoing', 'both'].includes(direction)) {
    return result('graphify', 'invalid', 'Query requires bounded node IDs, depth 0..5 and maxNodes 1..1000');
  }
  const inspection = await inspectGraphify(options);
  if (inspection.status !== 'available') return inspection;
  let artifact: unknown;
  try { artifact = await readJson(options.graphPath!, options.maxBytes ?? 8 * 1024 * 1024); }
  catch { return result('graphify', 'invalid', 'Graph changed or became unreadable during query'); }
  // Recheck the snapshot rather than trusting a previous filesystem read.
  if (!object(artifact) || !object(artifact.graph) ||
      (typeof artifact.graph.schema_version !== 'string' && typeof artifact.graph.schema_version !== 'number') ||
      !options.supportedSchemaVersions?.includes(String(artifact.graph.schema_version)) ||
      artifact.graph.graphify_version !== inspection.version || !Array.isArray(artifact.nodes)) {
    return result('graphify', 'invalid', 'Graph metadata changed during query');
  }
  const rawEdges = artifact.links ?? artifact.edges;
  if (!Array.isArray(rawEdges)) return result('graphify', 'invalid', 'Expected node-link graph arrays');
  const validId = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && id.length <= 512;
  const ids = new Set<string>();
  for (const node of artifact.nodes) {
    if (!object(node) || !validId(node.id) || ids.has(node.id)) return result('graphify', 'invalid', 'Expected unique bounded string node IDs');
    ids.add(node.id);
  }
  const edges: { source: string; target: string }[] = [];
  const adjacency = new Map<string, Set<string>>();
  const link = (from: string, to: string): void => {
    const neighbors = adjacency.get(from) ?? new Set<string>();
    neighbors.add(to); adjacency.set(from, neighbors);
  };
  for (const edge of rawEdges) {
    if (!object(edge) || !validId(edge.source) || !validId(edge.target) || !ids.has(edge.source) || !ids.has(edge.target)) {
      return result('graphify', 'invalid', 'Edge endpoints must reference declared bounded string node IDs');
    }
    edges.push({ source: edge.source, target: edge.target });
    if (direction !== 'incoming') link(edge.source, edge.target);
    if (direction !== 'outgoing') link(edge.target, edge.source);
  }
  const seeds = [...new Set(options.nodeIds)].sort();
  const found = new Set<string>();
  let truncated = false;
  let frontier: string[] = [];
  for (const id of seeds.filter(id => ids.has(id))) {
    if (found.size === maxNodes) { truncated = true; break; }
    found.add(id); frontier.push(id);
  }
  for (let level = 0; level < depth && frontier.length; level++) {
    const candidates = [...new Set(frontier.flatMap(id => [...(adjacency.get(id) ?? [])]))].sort();
    frontier = [];
    for (const id of candidates) {
      if (found.has(id)) continue;
      if (found.size === maxNodes) { truncated = true; continue; }
      found.add(id); frontier.push(id);
    }
  }
  // Bound edges separately: a dense graph can have far more edges than returned nodes.
  const matched = edges.filter(edge => found.has(edge.source) && found.has(edge.target))
    .sort((a, b) => a.source < b.source ? -1 : a.source > b.source ? 1 : a.target < b.target ? -1 : a.target > b.target ? 1 : 0);
  const edgeLimit = maxNodes * 10;
  return {
    ...inspection,
    structure: { nodes: artifact.nodes.length, edges: rawEdges.length },
    reason: 'Bounded cross-reference candidates; validate relationship semantics before inferring change impact',
    nodes: [...found].sort(),
    edges: matched.slice(0, edgeLimit),
    missing: seeds.filter(id => !ids.has(id)),
    truncated: truncated || matched.length > edgeLimit
  };
}

export interface OmniRouteOptions { enabled?: boolean; manifestPath?: string }

export async function inspectOmniRoute(options: OmniRouteOptions = {}): Promise<IntegrationResult> {
  if (options.enabled !== true) return result('omniroute', 'disabled', 'Explicit opt-in required');
  if (!options.manifestPath) return result('omniroute', 'missing', 'No local package manifest supplied');
  let manifest: unknown;
  try { manifest = await readJson(options.manifestPath, 256 * 1024); }
  catch { return result('omniroute', 'invalid', 'Local manifest cannot be read as bounded JSON'); }
  if (!object(manifest) || manifest.name !== 'omniroute' || typeof manifest.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    return result('omniroute', 'invalid', 'Expected an OmniRoute package manifest with a release version');
  }
  if (!/^3\.8\.\d+$/.test(manifest.version)) {
    return { ...result('omniroute', 'incompatible', 'Only the reviewed 3.8 release line is recognized'), version: manifest.version };
  }
  return {
    ...result('omniroute', 'available', 'Local manifest detected; service availability and provider access are unverified'),
    version: manifest.version,
    capabilities: ['gateway.manifest.read']
  };
}

export interface OmniRouteHealthOptions {
  enabled?: boolean;
  networkApproved?: boolean;
  /** Numeric loopback HTTP only, with no credentials, query, fragment or base path. */
  baseUrl?: string;
  timeoutMs?: number;
}

export async function probeOmniRouteHealth(options: OmniRouteHealthOptions = {}): Promise<IntegrationResult> {
  if (options.enabled !== true) return result('omniroute', 'disabled', 'Explicit opt-in required');
  if (options.networkApproved !== true) return result('omniroute', 'permission-required', 'Explicit approval required for a loopback health request');
  let endpoint: URL;
  try {
    endpoint = new URL(options.baseUrl ?? 'http://127.0.0.1:20128');
    if (endpoint.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(endpoint.hostname) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') throw new Error('Not a plain numeric loopback URL');
  } catch { return result('omniroute', 'invalid', 'Expected a numeric loopback HTTP base URL without credentials or extra URL components'); }
  const timeout = options.timeoutMs ?? 1500;
  if (!Number.isSafeInteger(timeout) || timeout < 100 || timeout > 10000) return result('omniroute', 'invalid', 'Timeout must be an integer between 100 and 10000 milliseconds');
  endpoint.pathname = '/api/health';
  return new Promise(resolve => {
    let complete = false;
    const finish = (healthy: boolean): void => {
      if (complete) return;
      complete = true;
      clearTimeout(deadline);
      resolve(healthy
        ? { ...result('omniroute', 'available', 'Loopback liveness endpoint returned status ok; providers and authentication remain unverified'), capabilities: ['gateway.health.read'] }
        : result('omniroute', 'unavailable', 'Loopback health unavailable or returned an unsupported response'));
    };
    // Built-in HTTP avoids proxy environment variables and never follows redirects.
    const request = get(endpoint, { agent: false, headers: { accept: 'application/json' } }, response => {
      if (response.statusCode !== 200) { response.resume(); finish(false); request.destroy(); return; }
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 16 * 1024) { finish(false); request.destroy(); return; }
        chunks.push(chunk);
      });
      response.on('end', () => {
        try { const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8')); finish(object(body) && body.status === 'ok'); }
        catch { finish(false); }
      });
      response.on('error', () => finish(false));
    });
    const deadline = setTimeout(() => { finish(false); request.destroy(); }, timeout);
    request.on('error', () => finish(false));
  });
}
