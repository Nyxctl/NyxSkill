import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { parseData } from './data.js';
import { validatePack, validateSkill } from './schema.js';
import type { PackMeta, SkillMeta } from './types.js';
import { readZip, writeZip, type ZipEntry } from './zip.js';

async function collectFiles(root:string):Promise<ZipEntry[]>{
  const out:ZipEntry[]=[];
  async function walk(dir:string):Promise<void>{
    const entries=(await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name));
    for(const e of entries){ const p=join(dir,e.name); if(e.isDirectory()) await walk(p); else out.push({name:relative(root,p).replaceAll('\\','/'),data:await readFile(p)}); }
  }
  await walk(root); return out;
}

export async function buildNyxPack(sourceDir:string,outFile:string):Promise<void>{
  const entries=await collectFiles(sourceDir);
  if(!entries.some(e=>e.name==='pack.yaml'||e.name==='pack.yml')) throw new Error('pack.yaml is required');
  if(!entries.some(e=>/^LICENSE(?:\.|$)/i.test(e.name))) throw new Error('LICENSE is required');
  await mkdir(dirname(outFile),{recursive:true}); await writeZip(outFile,entries);
}

export interface PackVerifyReport { ok:boolean; pack:PackMeta; skills:SkillMeta[]; issues:string[]; sha256:string }
export async function verifyNyxPack(file:string):Promise<PackVerifyReport>{
  const raw=await readFile(file); const sha256=createHash('sha256').update(raw).digest('hex');
  const entries=await readZip(file); const byName=new Map(entries.map(e=>[e.name,e])); const issues:string[]=[];
  const packEntry=byName.get('pack.yaml')??byName.get('pack.yml');
  if(!packEntry) throw new Error('pack.yaml missing');
  const packValue=parseData(packEntry.data.toString('utf8')); const pv=validatePack(packValue);
  if(!pv.ok) issues.push(...pv.errors.map(e=>`pack: ${e}`));
  const pack=packValue as PackMeta;
  if(!entries.some(e=>/^LICENSE(?:\.|$)/i.test(e.name))) issues.push('pack: LICENSE missing');
  const skills:SkillMeta[]=[];
  for(const e of entries.filter(e=>/(^|\/)skill\.ya?ml$/.test(e.name))){
    const value=parseData(e.data.toString('utf8')); const vr=validateSkill(value);
    if(!vr.ok) issues.push(...vr.errors.map(x=>`${e.name}: ${x}`)); else skills.push(value as SkillMeta);
  }
  const ids=new Set(skills.map(s=>s.id));
  for(const id of pack.skills??[]) if(!ids.has(id)) issues.push(`pack references missing skill: ${id}`);
  for(const s of skills) if(!pack.skills?.includes(s.id)) issues.push(`skill not declared by pack: ${s.id}`);
  const trust=pack.trust??'community';
  if(trust==='community'||trust==='untrusted') for(const s of skills) if(['privileged','destructive'].includes(s.risk.level)) issues.push(`risk blocked for ${trust} pack: ${s.id} requests ${s.risk.level}`);
  return {ok:issues.length===0,pack,skills:skills.sort((a,b)=>a.id.localeCompare(b.id)),issues,sha256};
}

export async function installNyxPack(file:string,store:string):Promise<{packId:string;path:string;sha256:string}>{
  const report=await verifyNyxPack(file); if(!report.ok) throw new Error(`Pack verification failed: ${report.issues.join('; ')}`);
  const target=join(store,report.pack.id); await rm(target,{recursive:true,force:true}); await mkdir(target,{recursive:true});
  for(const e of await readZip(file)){ if(e.name.endsWith('/')) continue; const p=join(target,...e.name.split('/')); await mkdir(dirname(p),{recursive:true}); await writeFile(p,e.data); }
  await writeFile(join(target,'.nyxpack-install.json'),JSON.stringify({packId:report.pack.id,sha256:report.sha256},null,2)+'\n');
  return {packId:report.pack.id,path:target,sha256:report.sha256};
}

export async function removeNyxPack(packId:string,store:string):Promise<void>{ await rm(join(store,packId),{recursive:true,force:true}); }
