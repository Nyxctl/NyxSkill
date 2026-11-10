import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildPlugins, verifyPlugin, installPlugin, removePlugin, discoverPlugins } from '../dist/src/plugins.js';

async function fixture(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'nyx-plugins-'));
  try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
const opts = { packIds: ['nyx.engineering'] };
test('pack plugins produce portable/native manifests, catalogs and byte-identical archives', async () => fixture(async dir => {
  const a = await buildPlugins(resolve('.'), join(dir, 'a'), opts);
  await buildPlugins(resolve('.'), join(dir, 'b'), opts);
  assert.deepEqual(await readFile(join(dir, 'a/archives/nyx-engineering.zip')), await readFile(join(dir, 'b/archives/nyx-engineering.zip')));
  const plugin = join(a.output, 'plugins/nyx-engineering');
  assert.equal((await verifyPlugin(plugin)).ok, true);
  assert.equal(JSON.parse(await readFile(join(plugin, 'plugin.json'), 'utf8')).$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
  for (const host of ['codex', 'claude']) assert.equal(JSON.parse(await readFile(join(plugin, `.${host}-plugin/plugin.json`), 'utf8')).skills, './skills/');
  const catalog = JSON.parse(await readFile(a.marketplace, 'utf8'));
  assert.equal(catalog.plugins[0].source.path, './plugins/nyx-engineering');
  const skill = await readFile(join(plugin, 'skills/nyx-engineering-api-design/SKILL.md'), 'utf8');
  assert.match(skill, /name: nyx-engineering-api-design/);
  await assert.rejects(buildPlugins(resolve('.'), a.output, opts), /already exists/);
  await assert.rejects(buildPlugins(resolve('.'), join(dir, 'unknown'), { packIds: ['missing'] }), /Unknown pack/);
}));
test('managed staging supports discovery, explicit update with retained backup, and uninstall', async () => fixture(async dir => {
  await buildPlugins(resolve('.'), join(dir, 'build'), opts);
  const source = join(dir, 'build/plugins/nyx-engineering'); const store = join(dir, 'store');
  const result = await installPlugin(source, store);
  assert.equal((await discoverPlugins(store))[0].name, 'nyx-engineering');
  await assert.rejects(installPlugin(source, store), /already installed/);
  const updated = await installPlugin(source, store, { update: true });
  assert.ok(updated.backup); assert.equal((await readFile(join(updated.backup, 'plugin.json'))).length > 0, true);
  await removePlugin('nyx-engineering', store);
  assert.deepEqual(await discoverPlugins(store), []);
  await assert.rejects(removePlugin('../outside', store), /Unsafe/);
  assert.equal(result.name, 'nyx-engineering');
}));
test('unknown or modified files block mutation without deleting user data', async () => fixture(async dir => {
  await buildPlugins(resolve('.'), join(dir, 'build'), opts);
  const source = join(dir, 'build/plugins/nyx-engineering'); const store = join(dir, 'store');
  const { path } = await installPlugin(source, store);
  await writeFile(join(path, 'notes.txt'), 'keep me');
  await assert.rejects(removePlugin('nyx-engineering', store), /Unmanaged/);
  await assert.rejects(installPlugin(source, store, { update: true }), /Unmanaged/);
  assert.equal(await readFile(join(path, 'notes.txt'), 'utf8'), 'keep me');
  await writeFile(join(source, 'plugin.json'), '{}');
  assert.equal((await verifyPlugin(source)).ok, false);
  await assert.rejects(installPlugin(source, join(dir, 'other')), /integrity/);
}));
test('sensitive unexpected resources and malformed receipts are rejected', async () => fixture(async dir => {
  await buildPlugins(resolve('.'), join(dir, 'build'), opts);
  const source = join(dir, 'build/plugins/nyx-engineering');
  await writeFile(join(source, '.env'), 'SECRET=value');
  assert.match((await verifyPlugin(source)).issues[0], /Sensitive file/);
  await rm(join(source, '.env'));
  const receipt = JSON.parse(await readFile(join(source, 'nyxskill-plugin.json'), 'utf8'));
  receipt.files['../outside'] = '0'.repeat(64);
  await writeFile(join(source, 'nyxskill-plugin.json'), JSON.stringify(receipt));
  assert.match((await verifyPlugin(source)).issues[0], /Unsafe/);
}));
test('symlink package paths are refused where symlink creation is available', async t => fixture(async dir => {
  const real = join(dir, 'real'); await mkdir(real);
  const link = join(dir, 'link');
  try { await symlink(real, link, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('Symlink privilege unavailable'); return; } throw error; }
  await assert.rejects(buildPlugins(resolve('.'), join(link, 'output'), opts), /Symbolic/);
}));

async function smallRegistry(dir, { cycle = false, conflict = false, secret = false } = {}) {
  const source = join(dir, 'canonical');
  for (const folder of ['skills/a', 'skills/b', 'packs', 'licenses']) await mkdir(join(source, folder), { recursive: true });
  const base = JSON.parse(await readFile(resolve('skills/engineering/api-design/skill.yaml'), 'utf8'));
  for (const key of ['a', 'b']) {
    const meta = structuredClone(base); meta.id = `nyx.test.${key}`;
    meta.composition.requires = key === 'a' ? ['nyx.test.b'] : cycle ? ['nyx.test.a'] : [];
    meta.conflicts_with = conflict && key === 'a' ? ['nyx.test.b'] : [];
    await writeFile(join(source, `skills/${key}/skill.yaml`), JSON.stringify(meta));
    await writeFile(join(source, `skills/${key}/SKILL.md`), `---\nname: Test\ndescription: Test\n---\n# Test\n`);
  }
  if (secret) await writeFile(join(source, 'skills/a/.env'), 'TOKEN=example');
  const pack = JSON.parse(await readFile(resolve('packs/engineering.yaml'), 'utf8'));
  pack.version = '1.1.0'; pack.id = 'nyx.test'; pack.namespace = 'nyx.test'; pack.skills = ['nyx.test.a'];
  await writeFile(join(source, 'packs/test.yaml'), JSON.stringify(pack));
  await writeFile(join(source, 'LICENSE'), 'MIT');
  return source;
}
test('dependency closure is bundled; cycles, conflicts and sensitive canonical files fail before output', async () => fixture(async dir => {
  const source = await smallRegistry(dir);
  await buildPlugins(source, join(dir, 'out'));
  assert.deepEqual((await verifyPlugin(join(dir, 'out/plugins/nyx-test'))).skills, ['nyx.test.a', 'nyx.test.b']);
  const cycleDir = join(dir, 'cycle'); await mkdir(cycleDir);
  await assert.rejects(buildPlugins(await smallRegistry(cycleDir, { cycle: true }), join(dir, 'cycle-out')), /Cyclic/);
  const conflictDir = join(dir, 'conflict'); await mkdir(conflictDir);
  await assert.rejects(buildPlugins(await smallRegistry(conflictDir, { conflict: true }), join(dir, 'conflict-out')), /conflict/);
  const secretDir = join(dir, 'secret'); await mkdir(secretDir);
  await assert.rejects(buildPlugins(await smallRegistry(secretDir, { secret: true }), join(dir, 'secret-out')), /Sensitive/);
}));
async function rewriteManifest(plugin, change) {
  const { createHash } = await import('node:crypto');
  const file = join(plugin, 'plugin.json'); const manifest = JSON.parse(await readFile(file, 'utf8'));
  change(manifest); const data = Buffer.from(JSON.stringify(manifest)); await writeFile(file, data);
  const receiptFile = join(plugin, 'nyxskill-plugin.json'); const receipt = JSON.parse(await readFile(receiptFile, 'utf8'));
  receipt.files['plugin.json'] = createHash('sha256').update(data).digest('hex'); receipt.version = manifest.version;
  await writeFile(receiptFile, JSON.stringify(receipt));
}
test('unsupported executable manifest surfaces are rejected even with recomputed inventory', async () => fixture(async dir => {
  const source = await smallRegistry(dir); await buildPlugins(source, join(dir, 'out'), { codexCompatibility: false, claudeCompatibility: false });
  const plugin = join(dir, 'out/plugins/nyx-test');
  await rewriteManifest(plugin, manifest => { manifest.hooks = { command: 'unexpected' }; });
  assert.match((await verifyPlugin(plugin)).issues[0], /Unsupported/);
}));
test('major update and version downgrade are blocked while previous installation remains intact', async () => fixture(async dir => {
  const source = await smallRegistry(dir); await buildPlugins(source, join(dir, 'out'), { codexCompatibility: false, claudeCompatibility: false });
  const plugin = join(dir, 'out/plugins/nyx-test'); const store = join(dir, 'store'); await installPlugin(plugin, store);
  await rewriteManifest(plugin, manifest => { manifest.version = '2.0.0'; });
  await assert.rejects(installPlugin(plugin, store, { update: true }), /major version/);
  await rewriteManifest(plugin, manifest => { manifest.version = '1.0.0'; });
  await assert.rejects(installPlugin(plugin, store, { update: true }), /downgrade/);
  assert.equal((await discoverPlugins(store))[0].version, '1.1.0');
}));
