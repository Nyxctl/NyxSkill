import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import { buildAllRuntimes } from './adapters/index.js';
import { writeZip, type ZipEntry } from './zip.js';

async function collect(root:string, base:string, prefix='', exclude=new Set<string>()):Promise<ZipEntry[]>{
  const entries:ZipEntry[]=[]; const start=join(root,base);
  async function walk(dir:string):Promise<void>{
    for(const e of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
      if(exclude.has(e.name)) continue;
      const p=join(dir,e.name); if(e.isDirectory()) await walk(p); else entries.push({name:join(prefix,relative(start,p)).replaceAll('\\','/'),data:await readFile(p)});
    }
  }
  await walk(start);return entries;
}
async function sha(path:string){return createHash('sha256').update(await readFile(path)).digest('hex');}
export async function buildReleaseArtifacts(root:string,outDir:string,options:{includeSource?:boolean}={}):Promise<{portableZip:string;sourceZip?:string;checksums:string}>{
  await mkdir(outDir,{recursive:true}); const stage=join(outDir,'.nyxskill-release-stage'); await rm(stage,{recursive:true,force:true}); await mkdir(stage,{recursive:true});
  await buildAllRuntimes(root,join(stage,'runtimes'));
  const entries:ZipEntry[]=[];
  for(const dir of ['skills','profiles','packs','provenance','licenses']) entries.push(...await collect(root,dir,dir));
  entries.push(...await collect(stage,'runtimes','runtimes'));
  for(const file of ['nyxskill.lock','THIRD_PARTY_NOTICES.md','LICENSE','README.md','INSTALL.md','package.json']) entries.push({name:file,data:await readFile(join(root,file))});
  const portableZip=join(outDir,'NyxSkill-v1.0.0-portable.zip'); await writeZip(portableZip,entries);
  let sourceZip:string|undefined;
  if(options.includeSource){
    const exclude=new Set(['.git','node_modules','dist','release','.nyxskill','.nyxskill-release-stage']);
    const src=await collect(root,'.','',exclude); sourceZip=join(outDir,'NyxSkill-v1.0.0-source.zip'); await writeZip(sourceZip,src);
  }
  const files=[portableZip,...(sourceZip?[sourceZip]:[])]; const lines=[] as string[];
  for(const file of files) lines.push(`${await sha(file)}  ${basename(file)}`);
  const checksums=join(outDir,'SHA256SUMS'); await writeFile(checksums,lines.join('\n')+'\n');
  await rm(stage,{recursive:true,force:true}); return{portableZip,sourceZip,checksums};
}
