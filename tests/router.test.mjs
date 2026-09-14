import test from 'node:test';
import assert from 'node:assert/strict';
import { routeRequest } from '../dist/src/router.js';

const runtimes = ['inwjud', 'codex', 'claude-code', 'cursor', 'agents'];
function meta(id, type, profiles, keywords, intents, extra = {}) {
  return {
    id, name: id, version: '1.0.0', api_version: 1, category: id.split('.').slice(0,2).join('.'), type, profiles,
    description: id,
    routing: { priority: 50, triggers: { keywords, intents }, ...(extra.routing ?? {}) },
    composition: { requires: [], before: [], after: [], ...(extra.composition ?? {}) },
    conflicts_with: extra.conflicts_with ?? [],
    capabilities: extra.capabilities ?? { required: ['filesystem.read'], optional: [] },
    risk: extra.risk ?? { level: 'read-only', destructive: false, requires_confirmation: false },
    runtime: { supported: runtimes }, provenance: { origin: 'nyx-native', license: 'MIT' },
    compatibility: { nyxskill: '>=1.0.0 <2.0.0', api: '^1' }
  };
}
function rec(m) { return { meta: m, metadata: '', document: '', relativePath: '' }; }
const registry = {
  root: '.',
  profiles: [
    { id: 'coding', name: 'Coding', includes: [], triggers: { keywords: ['code', 'bug', 'crash', 'api'] } },
    { id: 'product', name: 'Product', includes: ['coding'], triggers: { keywords: ['feature', 'product'] } },
    { id: 'browser-extension', name: 'Browser Extension', includes: ['coding'], triggers: { keywords: ['extension', 'manifest', 'chrome'] } },
    { id: 'security', name: 'Security', includes: [], triggers: { keywords: ['auth', 'security', 'oauth', 'login'] } },
    { id: 'mobile', name: 'Mobile', includes: ['coding'], triggers: { keywords: ['android', 'ios'] } }
  ],
  packs: [],
  skills: [
    rec(meta('nyx.core.systematic-debugging', 'process', ['coding','browser-extension'], ['bug','crash','broke','broken','regression'], ['debug'], { routing: { priority: 95, exclusive_group: 'debugging-process' } })),
    rec(meta('nyx.mobile.debugging', 'process', ['mobile'], ['android','ios'], ['debug'], { routing: { priority: 80, exclusive_group: 'debugging-process' } })),
    rec(meta('nyx.browser.extension-dev', 'domain', ['browser-extension'], ['extension','chrome','manifest'], ['develop-extension'], { routing: { priority: 80 } })),
    rec(meta('nyx.security.secure-auth', 'policy', ['security','browser-extension'], ['auth','login','oauth'], ['secure-auth'], { routing: { priority: 88 }, capabilities: { required: ['filesystem.read','network.http'], optional: [] } })),
    rec(meta('nyx.core.verification', 'finalizer', ['coding','browser-extension','security'], ['verify'], ['verify'], { routing: { priority: 100 } }))
  ]
};

test('routes extension auth regression to deterministic composed chain', () => {
  const result = routeRequest(registry, 'Chrome extension login broke after API update', { runtime: 'inwjud' });
  assert.ok(result.profiles.includes('browser-extension'));
  assert.ok(result.profiles.includes('security'));
  assert.deepEqual(result.chain.map(x => x.id), [
    'nyx.core.systematic-debugging',
    'nyx.browser.extension-dev',
    'nyx.security.secure-auth',
    'nyx.core.verification'
  ]);
  assert.ok(result.rejected.some(x => x.id === 'nyx.mobile.debugging'));
});

test('capability policy blocks a matched skill and records why', () => {
  const result = routeRequest(registry, 'extension oauth login security', {
    runtime: 'inwjud', capabilities: ['filesystem.read'], policy: { max_risk: 'safe-write', deny: ['network.*'] }
  });
  assert.equal(result.chain.some(x => x.id === 'nyx.security.secure-auth'), false);
  assert.ok(result.rejected.some(x => x.id === 'nyx.security.secure-auth' && /capability/i.test(x.reason)));
});

test('explicit skill override can select a skill without trigger match', () => {
  const result = routeRequest(registry, 'inspect this', { use: ['nyx.browser.extension-dev'], runtime: 'codex' });
  assert.ok(result.chain.some(x => x.id === 'nyx.browser.extension-dev'));
});

test('routing is deterministic across repeated runs', () => {
  const baseline = JSON.stringify(routeRequest(registry, 'Chrome extension login broke after API update', { runtime: 'inwjud' }));
  for (let i = 0; i < 25; i++) assert.equal(JSON.stringify(routeRequest(registry, 'Chrome extension login broke after API update', { runtime: 'inwjud' })), baseline);
});
