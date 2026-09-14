import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRegistry } from '../dist/src/registry.js';
import { validateRegistry } from '../dist/src/validation.js';

function skill(id, extra = {}) {
  return {
    id, name: id, version: '1.0.0', api_version: 1, category: 'core.test', type: 'domain',
    profiles: ['coding'], description: `Skill ${id}`,
    routing: { priority: 50, triggers: { keywords: ['test'], intents: ['test'] } },
    composition: { requires: [], before: [], after: [] }, conflicts_with: [],
    capabilities: { required: ['filesystem.read'], optional: [] },
    risk: { level: 'read-only', destructive: false, requires_confirmation: false },
    runtime: { supported: ['inwjud', 'codex', 'claude-code', 'cursor', 'agents'] },
    provenance: { origin: 'nyx-native', license: 'MIT' }, compatibility: { nyxskill: '>=1.0.0 <2.0.0', api: '^1' },
    ...extra
  };
}

async function writeJson(path, value) { await writeFile(path, JSON.stringify(value, null, 2)); }

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'nyx-reg-'));
  await mkdir(join(root, 'skills', 'a'), { recursive: true });
  await mkdir(join(root, 'skills', 'b'), { recursive: true });
  await mkdir(join(root, 'profiles'), { recursive: true });
  await mkdir(join(root, 'packs'), { recursive: true });
  await writeJson(join(root, 'skills', 'a', 'skill.yaml'), skill('nyx.core.a'));
  await writeFile(join(root, 'skills', 'a', 'SKILL.md'), '# A\n');
  await writeJson(join(root, 'skills', 'b', 'skill.yaml'), skill('nyx.core.b', { composition: { requires: ['nyx.core.a'], before: [], after: [] } }));
  await writeFile(join(root, 'skills', 'b', 'SKILL.md'), '# B\n');
  await writeJson(join(root, 'profiles', 'coding.yaml'), { id: 'coding', name: 'Coding', includes: [], triggers: { keywords: ['code'] } });
  await writeJson(join(root, 'packs', 'core.yaml'), { id: 'nyx.core', name: 'Core', version: '1.0.0', api_version: 1, namespace: 'nyx.core', profiles: ['coding'], skills: ['nyx.core.a', 'nyx.core.b'], compatibility: { nyxskill: '>=1.0.0 <2.0.0', api: '^1' } });
  return root;
}

test('registry loads skills profiles and packs in stable order', async () => {
  const root = await fixture();
  try {
    const registry = await loadRegistry(root);
    assert.deepEqual(registry.skills.map(s => s.meta.id), ['nyx.core.a', 'nyx.core.b']);
    assert.deepEqual(registry.profiles.map(p => p.id), ['coding']);
    assert.deepEqual(registry.packs.map(p => p.id), ['nyx.core']);
    assert.equal(registry.skills[0].document.endsWith('SKILL.md'), true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('registry validation catches unknown dependency and profile', async () => {
  const root = await fixture();
  try {
    await writeJson(join(root, 'skills', 'b', 'skill.yaml'), skill('nyx.core.b', {
      profiles: ['missing-profile'], composition: { requires: ['nyx.core.missing'], before: [], after: [] }
    }));
    const report = validateRegistry(await loadRegistry(root));
    assert.equal(report.ok, false);
    assert.ok(report.issues.some(i => i.code === 'UNKNOWN_DEPENDENCY'));
    assert.ok(report.issues.some(i => i.code === 'UNKNOWN_PROFILE'));
  } finally { await rm(root, { recursive: true, force: true }); }
});
