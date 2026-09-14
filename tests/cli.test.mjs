import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const cli = resolve('dist/src/cli.js');
const node = process.execPath;
function run(args) { return execFileSync(node, [cli, ...args], { cwd: resolve('.'), encoding: 'utf8' }); }

test('cli list emits canonical skills as JSON', () => {
  const data = JSON.parse(run(['list','--json']));
  assert.ok(data.skills.length >= 70);
  assert.ok(data.skills.some(s => s.id === 'nyx.core.systematic-debugging'));
});

test('cli route explains a browser auth regression', () => {
  const data = JSON.parse(run(['route','Chrome extension login broke after API update','--runtime','inwjud','--json']));
  const ids = data.chain.map(x => x.id);
  assert.ok(ids.includes('nyx.core.systematic-debugging'));
  assert.ok(ids.includes('nyx.browser.extension-dev'));
  assert.ok(ids.includes('nyx.security.secure-auth'));
  assert.equal(ids.at(-1), 'nyx.core.verification');
});

test('cli validate exits 0 for shipped registry', () => {
  const result = spawnSync(node, [cli,'validate','--all'], { cwd: resolve('.'), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /valid/i);
});

test('cli profile and pack discovery work', () => {
  const profiles = JSON.parse(run(['profile','list','--json']));
  const packs = JSON.parse(run(['pack','list','--json']));
  assert.ok(profiles.profiles.some(p => p.id === 'browser-extension'));
  assert.ok(packs.packs.some(p => p.id === 'nyx.browser'));
});

test('cli builds an Inwjud adapter and rebuilds local index', async () => {
  const { mkdtemp, rm, access } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const out = await mkdtemp(join(tmpdir(), 'nyx-cli-build-'));
  try {
    const built = JSON.parse(run(['build','--runtime','inwjud','--out',out,'--json']));
    assert.equal(built.results[0].runtime, 'inwjud');
    await access(join(out,'inwjud','skills','core','verification','SKILL.md'));
    const indexed = JSON.parse(run(['index','rebuild','--json']));
    assert.ok(indexed.skills >= 70);
  } finally { await rm(out,{recursive:true,force:true}); }
});

test('router does not load the whole browser pack for a narrow extension auth bug', () => {
  const data = JSON.parse(run(['route','Chrome extension login broke after API update','--runtime','inwjud','--json']));
  const ids = data.chain.map(x => x.id);
  assert.ok(ids.length <= 6, `over-routed ${ids.length} skills: ${ids.join(', ')}`);
  assert.equal(ids.includes('nyx.browser.extension-assets'), false);
  assert.equal(ids.includes('nyx.browser.extension-publish'), false);
});

test('explicit NyxSkill review routes to focused domain reviewers', () => {
  const data = JSON.parse(run(['route','@NyxSkill review extension security','--json']));
  const ids = data.chain.map(x => x.id);
  assert.ok(ids.includes('nyx.core.nyxskill-router'));
  assert.ok(ids.includes('nyx.browser.extension-review'));
  assert.ok(ids.includes('nyx.security.security-review'));
  assert.equal(ids.at(-1), 'nyx.core.verification');
  assert.ok(ids.length <= 6, `over-routed ${ids.length}: ${ids.join(', ')}`);
});
