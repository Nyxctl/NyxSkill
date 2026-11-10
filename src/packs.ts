import { lstat, mkdir, readFile, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parseData } from './data.js';
import { validatePack, validateSkill } from './schema.js';
import type { PackMeta, SkillMeta } from './types.js';
import { assertArchivePath, readZip, writeZip, ZIP_LIMITS, type ZipEntry } from './zip.js';
import { checkContent, filesIn, noLinks } from './plugins.js';

const MARKER = '.nyxpack-install.json';
const digest = (data: Buffer): string => createHash('sha256').update(data).digest('hex');
function safePackId(id: string): void {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(id)) throw new Error('Unsafe pack ID');
  assertArchivePath(id);
}
async function exists(path: string): Promise<boolean> { try { await lstat(path); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; } }

export async function buildNyxPack(sourceDir: string, outFile: string): Promise<void> {
  await noLinks(outFile); if (await exists(outFile)) throw new Error('Pack output already exists');
  const entries = await filesIn(sourceDir, { excludeProjectCache: true }); checkContent(entries);
  if (!entries.some(e => e.name === 'pack.yaml' || e.name === 'pack.yml')) throw new Error('pack.yaml is required');
  if (!entries.some(e => /^LICENSE(?:\.|$)/i.test(e.name))) throw new Error('LICENSE is required');
  if (entries.some(e => e.name === MARKER)) throw new Error('Managed ownership marker cannot be packaged');
  await mkdir(dirname(outFile), { recursive: true }); await writeZip(outFile, entries, true);
}

export interface PackVerifyReport { ok: boolean; pack: PackMeta; skills: SkillMeta[]; issues: string[]; sha256: string }
function verifyEntries(entries: ZipEntry[], sha256: string): PackVerifyReport {
  checkContent(entries);
  const byName = new Map(entries.map(e => [e.name, e])); const issues: string[] = [];
  if (byName.has(MARKER)) issues.push('pack contains reserved ownership marker');
  const packEntry = byName.get('pack.yaml') ?? byName.get('pack.yml');
  if (!packEntry) throw new Error('pack.yaml missing');
  const packValue = parseData(packEntry.data.toString('utf8')); const pv = validatePack(packValue);
  if (!pv.ok) throw new Error(`Invalid pack metadata: ${pv.errors.join('; ')}`);
  const pack = packValue as PackMeta; safePackId(pack.id);
  if (!entries.some(e => /^LICENSE(?:\.|$)/i.test(e.name))) issues.push('pack: LICENSE missing');
  const skills: SkillMeta[] = []; const seen = new Set<string>();
  for (const entry of entries.filter(e => /(^|\/)skill\.ya?ml$/.test(e.name))) {
    const value = parseData(entry.data.toString('utf8')); const vr = validateSkill(value);
    if (!vr.ok) { issues.push(...vr.errors.map(x => `${entry.name}: ${x}`)); continue; }
    const skill = value as SkillMeta;
    if (seen.has(skill.id)) issues.push(`duplicate skill ID: ${skill.id}`); seen.add(skill.id); skills.push(skill);
    const parent = entry.name.slice(0, entry.name.lastIndexOf('/') + 1);
    if (!byName.has(`${parent}SKILL.md`)) issues.push(`missing SKILL.md: ${skill.id}`);
  }
  for (const id of pack.skills) if (!seen.has(id)) issues.push(`pack references missing skill: ${id}`);
  for (const skill of skills) {
    if (!pack.skills.includes(skill.id)) issues.push(`skill not declared by pack: ${skill.id}`);
    // Trust labels inside imported archives are self-declared, not a trust grant.
    if (['privileged', 'destructive'].includes(skill.risk.level)) issues.push(`risk blocked for imported pack: ${skill.id} requests ${skill.risk.level}`);
    for (const id of skill.composition.requires) if (!seen.has(id)) issues.push(`missing skill dependency: ${id}`);
    for (const id of skill.conflicts_with) if (seen.has(id)) issues.push(`conflicting skill: ${skill.id} / ${id}`);
  }
  return { ok: issues.length === 0, pack, skills: skills.sort((a, b) => a.id.localeCompare(b.id)), issues, sha256 };
}
async function readPack(file: string): Promise<{ entries: ZipEntry[]; report: PackVerifyReport }> {
  await noLinks(file);
  if ((await lstat(file)).size > ZIP_LIMITS.archiveBytes) throw new Error('Pack archive size limit exceeded');
  const raw = await readFile(file); const entries = await readZip(raw); return { entries, report: verifyEntries(entries, digest(raw)) };
}
export async function verifyNyxPack(file: string): Promise<PackVerifyReport> { return (await readPack(file)).report; }

export async function installNyxPack(file: string, store: string): Promise<{ packId: string; path: string; sha256: string }> {
  const { entries, report } = await readPack(file); if (!report.ok) throw new Error(`Pack verification failed: ${report.issues.join('; ')}`);
  await noLinks(store); const target = join(store, report.pack.id); await noLinks(target);
  if (await exists(target)) throw new Error('Pack target already exists; existing data is preserved');
  await mkdir(store, { recursive: true }); const stage = join(store, `.nyxpack-stage-${randomUUID()}`); await mkdir(stage);
  for (const entry of entries) {
    if (entry.name.endsWith('/')) continue;
    const path = join(stage, ...entry.name.split('/')); await mkdir(dirname(path), { recursive: true }); await writeFile(path, entry.data, { flag: 'wx' });
  }
  const inventory = Object.fromEntries(entries.filter(e => !e.name.endsWith('/')).map(e => [e.name, digest(e.data)]));
  await writeFile(join(stage, MARKER), JSON.stringify({ format: 1, manager: 'nyxskill', packId: report.pack.id, sha256: report.sha256, files: inventory }, null, 2) + '\n', { flag: 'wx' });
  if (await exists(target)) throw new Error('Pack target became occupied; staging retained');
  await rename(stage, target);
  return { packId: report.pack.id, path: target, sha256: report.sha256 };
}

export async function removeNyxPack(packId: string, store: string): Promise<void> {
  safePackId(packId); const target = join(store, packId); await noLinks(target);
  const entries = await filesIn(target); const markerEntry = entries.find(e => e.name === MARKER);
  if (!markerEntry) throw new Error('Unmanaged pack; ownership marker missing');
  const marker = JSON.parse(markerEntry.data.toString('utf8')) as { format: number; manager: string; packId: string; files: Record<string, string> };
  if (marker.format !== 1 || marker.manager !== 'nyxskill' || marker.packId !== packId || !marker.files || typeof marker.files !== 'object' || Array.isArray(marker.files)) throw new Error('Unmanaged pack; invalid ownership inventory');
  const remaining = new Map(entries.filter(e => e.name !== MARKER).map(e => [e.name, e]));
  for (const [name, expected] of Object.entries(marker.files)) {
    assertArchivePath(name);
    if (!/^[a-f0-9]{64}$/.test(expected) || !remaining.has(name) || digest(remaining.get(name)!.data) !== expected) throw new Error(`Pack integrity mismatch: ${name}`);
    remaining.delete(name);
  }
  if (remaining.size) throw new Error('Unknown/unmanaged files in pack inventory; refusing removal');
  const dirs = new Set<string>();
  for (const entry of entries) { let dir = dirname(join(target, entry.name)); while (dir !== target) { dirs.add(dir); dir = dirname(dir); } }
  for (const entry of entries) await unlink(join(target, entry.name));
  for (const dir of [...dirs].sort((a, b) => b.length - a.length)) { try { await rmdir(dir); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOTEMPTY') throw error; } }
  try { await rmdir(target); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOTEMPTY') throw error; }
}
