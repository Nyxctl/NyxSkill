import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readDataFile } from './data.js';
async function exists(p:string){try{await access(p);return true;}catch{return false;}}
export interface SyncSourceStatus { id:string; archive?:string; lockedSha256?:string; actualSha256?:string; status:'matched'|'changed'|'not-present'|'unlocked' }
export async function syncCheck(root:string):Promise<{modified:false;sources:SyncSourceStatus[]}>{
  const lock=await readDataFile(join(root,'nyxskill.lock')) as any;const sources:SyncSourceStatus[]=[];
  for(const [id,raw] of Object.entries<any>(lock.sources??{})){
    const archive=raw.archive as string|undefined, locked=raw.sha256 as string|undefined;
    if(!archive||!locked){sources.push({id,archive,lockedSha256:locked,status:'unlocked'});continue;}
    const path=join(root,archive);if(!(await exists(path))){sources.push({id,archive,lockedSha256:locked,status:'not-present'});continue;}
    const actual=createHash('sha256').update(await readFile(path)).digest('hex');sources.push({id,archive,lockedSha256:locked,actualSha256:actual,status:actual===locked?'matched':'changed'});
  }
  return{modified:false,sources:sources.sort((a,b)=>a.id.localeCompare(b.id))};
}
