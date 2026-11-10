import { readFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseYamlSubset } from './data.js';
import type { Registry } from './registry.js';
import type { ValidationIssue } from './validation.js';

/** Inspect document contracts without interpreting instructions or running scripts. */
export async function validateDocuments(registry:Registry):Promise<ValidationIssue[]> {
  const issues:ValidationIssue[]=[];
  for(const skill of registry.skills) {
    const text=await readFile(skill.document,'utf8');
    const add=(message:string)=>issues.push({severity:'error',code:'SKILL_DOCUMENT',subject:skill.meta.id,message});
    const match=text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if(!match) { add('Missing frontmatter'); continue; }
    try {
      const meta=parseYamlSubset(match[1]) as Record<string,unknown>;
      for(const key of ['name','description']) if(typeof meta[key]!=='string' || !(meta[key] as string).trim()) add(`Frontmatter requires ${key}`);
      if(meta.id!==undefined && meta.id!==skill.meta.id) add('Frontmatter id differs from canonical metadata');
      if(meta.version!==undefined && meta.version!==skill.meta.version) add('Frontmatter version differs from canonical metadata');
    } catch { add('Malformed frontmatter'); }
    for(const link of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const target=link[1].replace(/^<|>$/g,'').split('#')[0];
      if(!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('/')) continue;
      try { await access(resolve(dirname(skill.document),decodeURIComponent(target))); }
      catch { add(`Missing local reference: ${target}`); }
    }
  }
  return issues;
}
