import { readdir, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { readDataFile } from './data.js';
import { assertPack, assertProfile, assertSkill } from './schema.js';
import type { PackMeta, ProfileMeta, SkillMeta } from './types.js';

export interface SkillRecord { meta: SkillMeta; metadata: string; document: string; relativePath: string }
export interface Registry { root: string; skills: SkillRecord[]; profiles: ProfileMeta[]; packs: PackMeta[] }

async function walk(root: string, predicate: (name: string) => boolean): Promise<string[]> {
  const out: string[] = [];
  async function visit(dir: string): Promise<void> {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (predicate(entry.name)) out.push(path);
    }
  }
  await visit(root);
  return out;
}

async function exists(path: string): Promise<boolean> { try { return (await stat(path)).isFile(); } catch { return false; } }

export async function loadRegistry(root: string): Promise<Registry> {
  const skillFiles = await walk(join(root, 'skills'), name => name === 'skill.yaml' || name === 'skill.yml');
  const skills: SkillRecord[] = [];
  for (const metadata of skillFiles) {
    const meta = assertSkill(await readDataFile(metadata));
    const document = join(dirname(metadata), 'SKILL.md');
    if (!(await exists(document))) throw new Error(`Missing SKILL.md for ${meta.id}: ${document}`);
    skills.push({ meta, metadata, document, relativePath: relative(root, metadata) });
  }
  skills.sort((a, b) => a.meta.id.localeCompare(b.meta.id));

  const profileFiles = await walk(join(root, 'profiles'), name => name.endsWith('.yaml') || name.endsWith('.yml'));
  const profiles = [] as ProfileMeta[];
  for (const path of profileFiles) profiles.push(assertProfile(await readDataFile(path)));
  profiles.sort((a, b) => a.id.localeCompare(b.id));

  const packFiles = await walk(join(root, 'packs'), name => name.endsWith('.yaml') || name.endsWith('.yml'));
  const packs = [] as PackMeta[];
  for (const path of packFiles) packs.push(assertPack(await readDataFile(path)));
  packs.sort((a, b) => a.id.localeCompare(b.id));
  return { root, skills, profiles, packs };
}
