import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { loadRegistry } from '../dist/src/registry.js';
import { validateRegistry } from '../dist/src/validation.js';

const root = resolve('.');

test('first-party library is broad, valid, and covers all declared packs', async () => {
  const registry = await loadRegistry(root);
  const report = validateRegistry(registry);
  assert.equal(report.ok, true, report.issues.map(i => `${i.code}: ${i.message}`).join('\n'));
  assert.ok(registry.skills.length >= 70, `expected >=70 skills, got ${registry.skills.length}`);
  const prefixes = ['nyx.core.', 'nyx.engineering.', 'nyx.product.', 'nyx.browser.', 'nyx.uiux.', 'nyx.security.', 'nyx.research.', 'nyx.academic.', 'nyx.data-ai.', 'nyx.documents.', 'nyx.automation.', 'nyx.devops.'];
  for (const prefix of prefixes) assert.ok(registry.skills.some(s => s.meta.id.startsWith(prefix)), `missing ${prefix}`);
  assert.ok(registry.packs.length >= 12);
  assert.ok(registry.profiles.some(p => p.id === 'universal'));
});
