import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSkill, validatePack, validateProfile, validateProjectPolicy } from '../dist/src/schema.js';

const validSkill = {
  id: 'nyx.core.systematic-debugging', name: 'Systematic Debugging', version: '1.0.0', api_version: 1,
  category: 'core.debugging', type: 'process', profiles: ['coding'], description: 'Find root cause before changing code.',
  routing: { priority: 95, exclusive_group: 'debugging-process', triggers: { keywords: ['bug', 'crash'], intents: ['debug'] } },
  composition: { requires: [], before: [], after: ['nyx.core.verification'] }, conflicts_with: [],
  capabilities: { required: ['filesystem.read'], optional: ['filesystem.write', 'shell'] },
  risk: { level: 'safe-write', destructive: false, requires_confirmation: false },
  runtime: { supported: ['inwjud', 'codex', 'claude-code', 'cursor', 'agents'] },
  provenance: { origin: 'adapted', source: 'superpowers', adapted_from: 'systematic-debugging', license: 'MIT' },
  compatibility: { nyxskill: '>=1.0.0 <2.0.0', api: '^1' }
};

test('skill validator accepts canonical skill', () => assert.equal(validateSkill(validSkill).ok, true));
test('skill validator rejects bad semver and risk', () => {
  const result = validateSkill({ ...validSkill, version: 'v1', risk: { ...validSkill.risk, level: 'danger' } });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /version|risk/);
});
test('pack validator accepts pack manifest', () => assert.equal(validatePack({
  id: 'nyx.core', name: 'Nyx Core', version: '1.0.0', api_version: 1, namespace: 'nyx.core',
  profiles: ['coding'], skills: ['nyx.core.systematic-debugging'], compatibility: { nyxskill: '>=1.0.0 <2.0.0', api: '^1' }
}).ok, true));
test('profile validator accepts inheritance and triggers', () => assert.equal(validateProfile({
  id: 'browser-extension', name: 'Browser Extension', includes: ['coding'], triggers: { keywords: ['extension', 'manifest'] }
}).ok, true));
test('project policy validator accepts ceilings', () => assert.equal(validateProjectPolicy({
  max_risk: 'safe-write', deny: ['network.*'], allow: ['filesystem.read']
}).ok, true));
