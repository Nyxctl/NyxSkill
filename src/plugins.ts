import { lstat, mkdir, readdir, readFile, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, parse, relative, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { loadRegistry, type SkillRecord } from './registry.js';
import { writeZip, type ZipEntry } from './zip.js';

const SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
const RECEIPT = 'nyxskill-plugin.json';
const MARKER = '.nyxskill-managed.json';
const slug = (id: string): string => id.replaceAll('.', '-');
const hash = (data: Buffer): string => createHash('sha256').update(data).digest('hex');
const json = (value: unknown): Buffer => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const namePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
interface Receipt { format: 1; packId: string; name: string; version: string; skills: string[]; conflicts: string[]; files: Record<string, string> }
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
export interface PluginReport { ok: boolean; issues: string[]; name: string; version: string; skills: string[] }
export interface PluginBuildOptions { packIds?: string[]; codexCompatibility?: boolean; claudeCompatibility?: boolean }

function safePath(name: string): void {
  if (!name || name.includes('\\') || name.includes(':') || name.split('/').some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)) || /[\x00-\x1f]/.test(name)) throw new Error(`Unsafe plugin path: ${name}`);
}
export async function noLinks(path: string): Promise<void> {
  const absolute = resolve(path); const root = parse(absolute).root;
  let current = root;
  for (const part of relative(root, absolute).split(/[\\/]/).filter(Boolean)) {
    current = join(current, part);
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error(`Symbolic links are not allowed: ${current}`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}
async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
export async function filesIn(root: string, options: { excludeProjectCache?: boolean } = {}): Promise<ZipEntry[]> {
  await noLinks(root);
  const rows: ZipEntry[] = [];
  async function visit(dir: string): Promise<void> {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      if (options.excludeProjectCache && entry.name.toLowerCase() === '.nyxskill') continue;
      const path = join(dir, entry.name); const name = relative(root, path).replaceAll('\\', '/'); safePath(name);
      if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not allowed: ${path}`);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) rows.push({ name, data: await readFile(path) });
      else throw new Error(`Unsupported file: ${path}`);
    }
  }
  await visit(root); return rows;
}
export function checkContent(entries: ZipEntry[]): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    safePath(entry.name); const key = entry.name.toLowerCase();
    if (seen.has(key)) throw new Error(`Case-insensitive package path conflict: ${entry.name}`); seen.add(key);
    if (/(^|\/)(\.env(?:\..*)?|id_rsa|id_ed25519|credentials(?:\..*)?)$|\.(pem|pfx|p12|key)$/i.test(entry.name)) throw new Error(`Sensitive file blocked: ${entry.name}`);
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}/.test(entry.data.toString('utf8'))) throw new Error(`Credential-like content blocked: ${entry.name}`);
  }
}
async function writeEntries(target: string, entries: ZipEntry[]): Promise<void> {
  await noLinks(target); await mkdir(target, { recursive: false });
  for (const entry of entries) { const path = join(target, ...entry.name.split('/')); await mkdir(dirname(path), { recursive: true }); await writeFile(path, entry.data, { flag: 'wx' }); }
}

/** Build one plugin per canonical pack; resolve skill dependencies inside each bundle. Never overwrite output. */
export async function buildPlugins(root: string, outDir: string, options: PluginBuildOptions = {}): Promise<{ output: string; plugins: string[]; marketplace: string }> {
  await noLinks(root);
  await noLinks(outDir); if (await exists(outDir)) throw new Error(`Plugin output already exists: ${outDir}`);
  const registry = await loadRegistry(root); const skills = new Map(registry.skills.map(s => [s.meta.id, s]));
  const packs = options.packIds ? options.packIds.map(id => { const pack = registry.packs.find(p => p.id === id); if (!pack) throw new Error(`Unknown pack: ${id}`); return pack; }) : registry.packs;
  const bundles: { name: string; entries: ZipEntry[] }[] = []; const names = new Set<string>();
  for (const pack of [...packs].sort((a, b) => a.id < b.id ? -1 : 1)) {
    const name = slug(pack.id); if (!namePattern.test(name) || names.has(name)) throw new Error(`Plugin namespace conflict: ${name}`); names.add(name);
    const selected = new Map<string, SkillRecord>(); const active = new Set<string>();
    function include(id: string): void {
      if (active.has(id)) throw new Error(`Cyclic skill dependency: ${id}`); if (selected.has(id)) return;
      const skill = skills.get(id); if (!skill) throw new Error(`Missing plugin skill dependency: ${id}`);
      active.add(id); for (const dependency of skill.meta.composition.requires) include(dependency); active.delete(id); selected.set(id, skill);
    }
    for (const id of pack.skills) include(id);
    for (const skill of selected.values()) for (const conflict of skill.meta.conflicts_with) if (selected.has(conflict)) throw new Error(`Plugin skill conflict: ${skill.meta.id} / ${conflict}`);
    const manifest = { $schema: SCHEMA, name, version: pack.version, description: pack.name, author: { name: 'NyxSkill contributors' }, license: 'MIT' };
    const entries: ZipEntry[] = [{ name: 'plugin.json', data: json(manifest) }];
    const legacy = { name, version: pack.version, description: pack.name, author: manifest.author, license: 'MIT', skills: './skills/' };
    if (options.codexCompatibility !== false) entries.push({ name: '.codex-plugin/plugin.json', data: json(legacy) });
    if (options.claudeCompatibility !== false) entries.push({ name: '.claude-plugin/plugin.json', data: json(legacy) });
    const skillNames = new Set<string>();
    for (const skill of [...selected.values()].sort((a, b) => a.meta.id < b.meta.id ? -1 : 1)) {
      const skillName = slug(skill.meta.id); if (!namePattern.test(skillName) || skillNames.has(skillName)) throw new Error(`Skill namespace conflict: ${skillName}`); skillNames.add(skillName);
      for (const entry of await filesIn(dirname(skill.document), { excludeProjectCache: true })) {
        // Host skill names must match their generated directory; canonical source remains untouched.
        const data = entry.name === 'SKILL.md' ? Buffer.from(entry.data.toString('utf8').replace(/^(---\r?\n)name:[^\r\n]*/m, `$1name: ${skillName}`)) : entry.data;
        entries.push({ name: `skills/${skillName}/${entry.name}`, data });
      }
    }
    for (const entry of await filesIn(join(root, 'licenses'), { excludeProjectCache: true })) entries.push({ name: `licenses/${entry.name}`, data: entry.data });
    await noLinks(join(root, 'LICENSE')); entries.push({ name: 'LICENSE', data: await readFile(join(root, 'LICENSE')) });
    for (const file of ['THIRD_PARTY_NOTICES.md']) if (await exists(join(root, file))) { await noLinks(join(root, file)); entries.push({ name: file, data: await readFile(join(root, file)) }); }
    checkContent(entries);
    const receipt: Receipt = { format: 1, packId: pack.id, name, version: pack.version, skills: [...selected.keys()].sort(), conflicts: [...new Set([...selected.values()].flatMap(s => s.meta.conflicts_with))].sort(), files: Object.fromEntries(entries.map(e => [e.name, hash(e.data)]).sort(([a], [b]) => a < b ? -1 : 1)) };
    entries.push({ name: RECEIPT, data: json(receipt) }); bundles.push({ name, entries });
  }
  await mkdir(dirname(resolve(outDir)), { recursive: true }); await mkdir(outDir);
  await mkdir(join(outDir, 'plugins')); await mkdir(join(outDir, 'archives'));
  for (const bundle of bundles) { await writeEntries(join(outDir, 'plugins', bundle.name), bundle.entries); await writeZip(join(outDir, 'archives', `${bundle.name}.zip`), bundle.entries); }
  const marketplace = join(outDir, '.agents', 'plugins', 'marketplace.json'); await mkdir(dirname(marketplace), { recursive: true });
  await writeFile(marketplace, json({ name: 'nyxskill-local', interface: { displayName: 'NyxSkill local packs' }, plugins: bundles.map(b => ({ name: b.name, source: { source: 'local', path: `./plugins/${b.name}` }, policy: { installation: 'AVAILABLE', authentication: 'ON_USE' }, category: 'Developer Tools' })) }));
  await mkdir(join(outDir, '.claude-plugin')); await writeFile(join(outDir, '.claude-plugin', 'marketplace.json'), json({ name: 'nyxskill-local', owner: { name: 'NyxSkill contributors' }, plugins: bundles.map(b => ({ name: b.name, source: `./plugins/${b.name}` })) }));
  return { output: outDir, plugins: bundles.map(b => b.name), marketplace };
}

async function verifiedEntries(path: string, installed = false): Promise<{ entries: ZipEntry[]; receipt: Receipt }> {
  const entries = await filesIn(path); checkContent(entries);
  const receipt = JSON.parse(entries.find(e => e.name === RECEIPT)?.data.toString('utf8') ?? 'null') as Receipt;
  if (!receipt || receipt.format !== 1 || typeof receipt.name !== 'string' || !namePattern.test(receipt.name) || typeof receipt.packId !== 'string' || slug(receipt.packId) !== receipt.name || typeof receipt.version !== 'string' || !versionPattern.test(receipt.version) || !Array.isArray(receipt.skills) || !Array.isArray(receipt.conflicts) || !receipt.conflicts.every(id => typeof id === 'string') || !receipt.files || typeof receipt.files !== 'object' || Array.isArray(receipt.files)) throw new Error('Invalid NyxSkill plugin receipt');
  const actual = new Map(entries.filter(e => e.name !== RECEIPT && !(installed && e.name === MARKER)).map(e => [e.name, e]));
  for (const [name, expected] of Object.entries(receipt.files)) {
    safePath(name); if (!/^(plugin\.json|LICENSE|THIRD_PARTY_NOTICES\.md|(?:\.codex-plugin|\.claude-plugin)\/plugin\.json|skills\/.+|licenses\/.+)$/.test(name)) throw new Error(`Unsupported package resource: ${name}`);
    if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected) || !actual.has(name) || hash(actual.get(name)!.data) !== expected) throw new Error(`Plugin integrity mismatch: ${name}`);
    actual.delete(name);
  }
  if (actual.size) throw new Error(`Unmanaged plugin files: ${[...actual.keys()].join(', ')}`);
  const manifest = JSON.parse(entries.find(e => e.name === 'plugin.json')?.data.toString('utf8') ?? 'null');
  if (!manifest || manifest.$schema !== SCHEMA || manifest.name !== receipt.name || manifest.version !== receipt.version) throw new Error('Plugin manifest identity/schema mismatch');
  const portableKeys = ['$schema', 'name', 'version', 'description', 'author', 'license'];
  if (Object.keys(manifest).some(key => !portableKeys.includes(key)) || typeof manifest.description !== 'string' || !manifest.description || typeof manifest.author?.name !== 'string' || manifest.license !== 'MIT') throw new Error('Unsupported or invalid portable manifest fields');
  if (!receipt.skills.length || !entries.some(e => /^skills\/[^/]+\/SKILL\.md$/.test(e.name))) throw new Error('Plugin has no skills');
  for (const id of receipt.skills) if (typeof id !== 'string' || !entries.some(e => e.name === `skills/${slug(id)}/SKILL.md`)) throw new Error(`Missing packaged skill: ${id}`);
  for (const name of ['.codex-plugin/plugin.json', '.claude-plugin/plugin.json']) {
    const entry = entries.find(e => e.name === name); if (!entry) continue;
    const overlay = JSON.parse(entry.data.toString('utf8')); if (overlay.name !== receipt.name || overlay.version !== receipt.version || overlay.skills !== './skills/' || Object.keys(overlay).some(key => !['name', 'version', 'description', 'author', 'license', 'skills'].includes(key))) throw new Error(`Invalid compatibility manifest: ${name}`);
  }
  return { entries, receipt };
}
export async function verifyPlugin(path: string): Promise<PluginReport> {
  try { const { receipt } = await verifiedEntries(path); return { ok: true, issues: [], name: receipt.name, version: receipt.version, skills: receipt.skills }; }
  catch (error) { return { ok: false, issues: [(error as Error).message], name: '', version: '', skills: [] }; }
}
async function verifyManaged(path: string): Promise<void> {
  const { receipt, entries } = await verifiedEntries(path, true);
  const marker = JSON.parse(entries.find(e => e.name === MARKER)?.data.toString('utf8') ?? 'null');
  if (!marker || marker.manager !== 'nyxskill' || marker.name !== receipt.name || marker.receiptHash !== hash(entries.find(e => e.name === RECEIPT)!.data)) throw new Error('Unmanaged plugin directory; refusing mutation');
}
/** Local staging only: this does not register a plugin with a native host or change global config. */
export async function installPlugin(sourceDir: string, store: string, options: { update?: boolean } = {}): Promise<{ name: string; path: string; backup?: string }> {
  const { entries, receipt } = await verifiedEntries(sourceDir); await noLinks(store); await mkdir(store, { recursive: true });
  const target = join(store, receipt.name); const present = await exists(target);
  if (present && !options.update) throw new Error(`Plugin already installed: ${receipt.name}; use explicit update`);
  if (!present && options.update) throw new Error(`Plugin is not installed: ${receipt.name}`);
  if (present) {
    await verifyManaged(target);
    const previous = (await verifiedEntries(target, true)).receipt;
    if (previous.packId !== receipt.packId || previous.version.split('.')[0] !== receipt.version.split('.')[0]) throw new Error('Incompatible plugin update identity or major version');
    const before = previous.version.split(/[.+-]/).slice(0, 3).map(Number); const after = receipt.version.split(/[.+-]/).slice(0, 3).map(Number);
    for (let index = 0; index < 3; index++) { if (after[index] < before[index]) throw new Error('Plugin downgrade is not allowed'); if (after[index] > before[index]) break; }
  }
  for (const other of await discoverPlugins(store)) {
    if (other.name === receipt.name) continue;
    if (!other.ok) throw new Error(`Invalid plugin in target store: ${other.name}`);
    const otherReceipt = (await verifiedEntries(join(store, other.name), true)).receipt;
    if (receipt.conflicts.some(id => otherReceipt.skills.includes(id)) || otherReceipt.conflicts.some(id => receipt.skills.includes(id))) throw new Error(`Installed plugin conflict: ${other.name}`);
  }
  const stage = join(store, `.nyxskill-stage-${randomUUID()}`); await writeEntries(stage, entries);
  await writeFile(join(stage, MARKER), json({ manager: 'nyxskill', name: receipt.name, receiptHash: hash(entries.find(e => e.name === RECEIPT)!.data) }), { flag: 'wx' });
  let backup: string | undefined;
  if (present) { backup = join(store, `.nyxskill-backup-${receipt.name}-${randomUUID()}`); await rename(target, backup); }
  try { await rename(stage, target); } catch (error) { if (backup) await rename(backup, target); throw error; }
  return { name: receipt.name, path: target, ...(backup ? { backup } : {}) };
}
export async function removePlugin(name: string, store: string): Promise<void> {
  if (!namePattern.test(name)) throw new Error('Unsafe plugin name'); const target = join(store, name); await noLinks(target); await verifyManaged(target);
  const entries = await filesIn(target); const dirs = new Set<string>();
  for (const entry of entries) { let dir = dirname(join(target, entry.name)); while (dir !== target) { dirs.add(dir); dir = dirname(dir); } }
  // Only individually verified files are removed; unknown or empty user directories are preserved.
  for (const entry of entries) await unlink(join(target, entry.name));
  for (const dir of [...dirs].sort((a, b) => b.length - a.length)) { try { await rmdir(dir); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOTEMPTY') throw error; } }
  try { await rmdir(target); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOTEMPTY') throw error; }
}
export async function discoverPlugins(store: string): Promise<PluginReport[]> {
  await noLinks(store); if (!await exists(store)) return [];
  const reports: PluginReport[] = [];
  for (const entry of (await readdir(store, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : 1)) {
    if (!namePattern.test(entry.name)) continue;
    try { await verifyManaged(join(store, entry.name)); const { receipt } = await verifiedEntries(join(store, entry.name), true); reports.push({ ok: true, issues: [], name: receipt.name, version: receipt.version, skills: receipt.skills }); }
    catch (error) { reports.push({ ok: false, issues: [(error as Error).message], name: entry.name, version: '', skills: [] }); }
  }
  return reports;
}
