import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { inspectGraphify, queryGraphify, inspectOmniRoute, probeOmniRouteHealth } from '../dist/src/integrations.js';

async function fixture(t, name, data) {
  const dir = await mkdtemp(path.join(tmpdir(), 'nyx-integration-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, name);
  await writeFile(file, JSON.stringify(data));
  return file;
}

test('optional integrations stay disabled without explicit opt-in', async () => {
  assert.equal((await inspectGraphify()).status, 'disabled');
  assert.equal((await inspectOmniRoute()).status, 'disabled');
  assert.equal((await probeOmniRouteHealth()).status, 'disabled');
});

test('Graphify missing, malformed and unknown schema artifacts degrade gracefully', async t => {
  assert.equal((await inspectGraphify({ enabled: true })).status, 'missing');
  const graphPath = await fixture(t, 'graph.json', { graph: { schema_version: 99, graphify_version: '0.9.102' }, nodes: [], links: [] });
  const result = await inspectGraphify({ enabled: true, graphPath });
  assert.equal(result.status, 'incompatible');
  assert.equal(result.version, '0.9.102');
  await writeFile(graphPath, 'not json');
  assert.equal((await inspectGraphify({ enabled: true, graphPath })).status, 'invalid');
  assert.equal((await inspectGraphify({ enabled: true, graphPath: path.dirname(graphPath) })).status, 'invalid');
});

test('Graphify accepts only explicitly supported schema and reports bounded structural facts', async t => {
  const graphPath = await fixture(t, 'graph.json', { graph: { schema_version: 'fixture-v1', graphify_version: '0.9.102' }, nodes: [{ id: 'A' }, { id: 'B' }], links: [{ source: 'A', target: 'B' }] });
  const result = await inspectGraphify({ enabled: true, graphPath, supportedSchemaVersions: ['fixture-v1'] });
  assert.equal(result.status, 'available');
  assert.deepEqual(result.structure, { nodes: 2, edges: 1 });
  assert.deepEqual(result.capabilities, ['codebase.graph.read']);
  assert.equal((await inspectGraphify({ enabled: true, graphPath, maxBytes: 10 })).status, 'invalid');
});

test('Graphify finds deterministic incoming change-impact candidates with bounded traversal', async t => {
  const graphPath = await fixture(t, 'graph.json', {
    graph: { schema_version: 'fixture-v1', graphify_version: '0.9.102' },
    nodes: ['A', 'B', 'C', 'D'].map(id => ({ id })),
    links: [{ source: 'C', target: 'B' }, { source: 'B', target: 'A' }, { source: 'A', target: 'D' }]
  });
  const options = { enabled: true, graphPath, supportedSchemaVersions: ['fixture-v1'], nodeIds: ['A', 'missing'], depth: 2 };
  const query = await queryGraphify(options);
  assert.deepEqual(query.nodes, ['A', 'B', 'C']);
  assert.deepEqual(query.missing, ['missing']);
  assert.deepEqual(query.edges, [{ source: 'B', target: 'A' }, { source: 'C', target: 'B' }]);
  assert.equal(query.truncated, false);
  assert.deepEqual(await queryGraphify(options), query);
  assert.deepEqual((await queryGraphify({ ...options, direction: 'outgoing' })).nodes, ['A', 'D']);
  assert.equal((await queryGraphify({ ...options, maxNodes: 1 })).truncated, true);
  assert.equal((await queryGraphify({ ...options, depth: 6 })).status, 'invalid');
  assert.equal((await queryGraphify({ ...options, supportedSchemaVersions: [] })).status, 'incompatible');
});

test('Graphify rejects dangling references and bounds dense edge output', async t => {
  const graphPath = await fixture(t, 'graph.json', {
    graph: { schema_version: 'fixture-v1', graphify_version: '0.9.102' },
    nodes: [{ id: 'A' }], links: Array.from({ length: 20 }, () => ({ source: 'A', target: 'A' }))
  });
  const options = { enabled: true, graphPath, supportedSchemaVersions: ['fixture-v1'], nodeIds: ['A'], maxNodes: 1 };
  assert.equal((await queryGraphify(options)).edges.length, 10);
  assert.equal((await queryGraphify(options)).truncated, true);
  await writeFile(graphPath, JSON.stringify({ graph: { schema_version: 'fixture-v1', graphify_version: '0.9.102' }, nodes: [{ id: 'A' }], links: [{ source: 'A', target: 'unknown' }] }));
  assert.equal((await queryGraphify(options)).status, 'invalid');
});

test('OmniRoute detects only declared package manifests and reviewed version line', async t => {
  assert.equal((await inspectOmniRoute({ enabled: true })).status, 'missing');
  const manifestPath = await fixture(t, 'package.json', { name: 'omniroute', version: '3.8.53', apiKey: 'must-not-escape' });
  const available = await inspectOmniRoute({ enabled: true, manifestPath });
  assert.equal(available.status, 'available');
  assert.equal(JSON.stringify(available).includes('must-not-escape'), false);
  await writeFile(manifestPath, JSON.stringify({ name: 'other', version: '3.8.53' }));
  assert.equal((await inspectOmniRoute({ enabled: true, manifestPath })).status, 'invalid');
  await writeFile(manifestPath, JSON.stringify({ name: 'omniroute', version: '4.0.0' }));
  assert.equal((await inspectOmniRoute({ enabled: true, manifestPath })).status, 'incompatible');
});

test('OmniRoute refuses remote, credential-bearing and ambiguous endpoints before requests', async () => {
  assert.equal((await probeOmniRouteHealth({ enabled: true })).status, 'permission-required');
  for (const baseUrl of ['https://example.com', 'http://localhost:20128', 'http://127.0.0.1.example.com', 'http://user:secret@127.0.0.1:20128', 'http://127.0.0.1:20128/?token=secret', 'http://127.0.0.1:20128/other']) {
    const result = await probeOmniRouteHealth({ enabled: true, networkApproved: true, baseUrl });
    assert.equal(result.status, 'invalid', baseUrl);
    assert.equal(JSON.stringify(result).includes('secret'), false);
  }
});

async function server(t, handler) {
  const service = http.createServer(handler);
  await new Promise(resolve => service.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { service.closeAllConnections(); service.close(resolve); }));
  return `http://127.0.0.1:${service.address().port}`;
}

test('OmniRoute sends one unauthenticated local GET and accepts canonical health', async t => {
  let calls = 0;
  const baseUrl = await server(t, (req, res) => {
    calls++;
    assert.equal(req.method, 'GET');
    assert.equal(req.url, '/api/health');
    assert.equal(req.headers.authorization, undefined);
    res.end(JSON.stringify({ status: 'ok', timestamp: 'fixture' }));
  });
  const result = await probeOmniRouteHealth({ enabled: true, networkApproved: true, baseUrl });
  assert.equal(result.status, 'available');
  assert.equal(calls, 1);
});

test('OmniRoute does not follow redirects or echo gateway errors', async t => {
  const baseUrl = await server(t, (_req, res) => { res.writeHead(302, { location: 'https://example.com' }); res.end('secret'); });
  const result = await probeOmniRouteHealth({ enabled: true, networkApproved: true, baseUrl });
  assert.equal(result.status, 'unavailable');
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('OmniRoute handles malformed, oversized and slow responses', async t => {
  for (const body of ['bad json', '{"status":"down"}', 'x'.repeat(20000)]) {
    const baseUrl = await server(t, (_req, res) => res.end(body));
    assert.equal((await probeOmniRouteHealth({ enabled: true, networkApproved: true, baseUrl })).status, 'unavailable');
  }
  const baseUrl = await server(t, () => {});
  assert.equal((await probeOmniRouteHealth({ enabled: true, networkApproved: true, baseUrl, timeoutMs: 100 })).status, 'unavailable');
});
