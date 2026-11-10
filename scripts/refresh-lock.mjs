import { readFile,writeFile,readdir } from 'node:fs/promises';
import { dirname,join,relative,resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { loadRegistry } from '../dist/src/registry.js';
const root=resolve('.'); const registry=await loadRegistry(root);
const lock=JSON.parse(await readFile('nyxskill.lock','utf8'));
for(const skill of registry.skills){
 const base=dirname(skill.metadata),hash=createHash('sha256');
 async function walk(dir){for(const e of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
  const path=join(dir,e.name); if(e.isSymbolicLink()) throw new Error('Symlink in canonical skill');
  if(e.isDirectory())await walk(path);else {hash.update(relative(base,path).replaceAll('\\','/'));hash.update('\0');hash.update(await readFile(path));hash.update('\0');}
 }}
 await walk(base);
 lock.skills[skill.meta.id]={...(lock.skills[skill.meta.id]??{origin:skill.meta.provenance.origin,source:null,upstream_skill:null}),content_sha256:hash.digest('hex')};
}
lock.content_hash_format='sha256(relative-path NUL bytes NUL), sorted recursive skill files';
await writeFile('nyxskill.lock',JSON.stringify(lock,null,2)+'\n');
