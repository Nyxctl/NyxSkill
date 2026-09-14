import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { loadRegistry } from './registry.js';

interface IndexSkill { id:string; hash:string; category:string; type:string; profiles:string[]; keywords:string[]; intents:string[] }
interface IndexFile { version:1; skills:IndexSkill[] }
async function exists(p:string){try{await access(p);return true;}catch{return false;}}
async function hashFiles(paths:string[]):Promise<string>{const h=createHash('sha256');for(const p of paths){h.update(await readFile(p));h.update('\0');}return h.digest('hex');}
export async function buildIndex(root:string,cacheDir=join(root,'.nyxskill')):Promise<{skills:number;rebuilt:number;reused:number;path:string}>{
  const registry=await loadRegistry(root);await mkdir(cacheDir,{recursive:true});const path=join(cacheDir,'index.json');
  let prior:IndexFile={version:1,skills:[]};if(await exists(path)){try{prior=JSON.parse(await readFile(path,'utf8'));}catch{/* rebuild */}}
  const old=new Map(prior.skills.map(s=>[s.id,s]));const skills:IndexSkill[]=[];let rebuilt=0,reused=0;
  for(const r of registry.skills){const hash=await hashFiles([r.metadata,r.document]);const prev=old.get(r.meta.id);if(prev?.hash===hash) reused++;else rebuilt++;skills.push({id:r.meta.id,hash,category:r.meta.category,type:r.meta.type,profiles:r.meta.profiles,keywords:r.meta.routing.triggers.keywords,intents:r.meta.routing.triggers.intents});}
  const data:IndexFile={version:1,skills:skills.sort((a,b)=>a.id.localeCompare(b.id))};await writeFile(path,JSON.stringify(data,null,2)+'\n');return{skills:skills.length,rebuilt,reused,path};
}
export async function indexStatus(root:string,cacheDir=join(root,'.nyxskill')):Promise<{exists:boolean;skills:number;path:string}>{const path=join(cacheDir,'index.json');if(!(await exists(path)))return{exists:false,skills:0,path};try{const d=JSON.parse(await readFile(path,'utf8')) as IndexFile;return{exists:true,skills:d.skills?.length??0,path};}catch{return{exists:true,skills:0,path};}}
