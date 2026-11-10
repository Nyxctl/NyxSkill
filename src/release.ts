import { VERSION } from './version.js';
import { buildPlugins } from './plugins.js';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, lstat, rm, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import { buildAllRuntimes } from './adapters/index.js';
import { writeZip, type ZipEntry } from './zip.js';

async function collect(root:string, base:string, prefix='', exclude=new Set<string>()):Promise<ZipEntry[]>{
  const entries:ZipEntry[]=[]; const start=join(root,base);
  async function walk(dir:string):Promise<void>{
    for(const e of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
      if(exclude.has(e.name) || e.name.toLowerCase() === '.nyxskill') continue;
      if (e.isSymbolicLink()) throw new Error(`Release symlink refused: ${e.name}`);
      if (/^(?:\.env(?:\..*)?|credentials(?:\..*)?)$|\.(?:pem|pfx|p12|key)$/i.test(e.name)) throw new Error(`Sensitive release path refused: ${e.name}`);
      const p=join(dir,e.name); if(e.isDirectory()) await walk(p); else entries.push({name:join(prefix,relative(start,p)).replaceAll('\\','/'),data:await readFile(p)});
    }
  }
  await walk(start);return entries;
}
async function sha(path:string){return createHash('sha256').update(await readFile(path)).digest('hex');}
export async function buildReleaseArtifacts(root:string,outDir:string,options:{includeSource?:boolean}={}):Promise<{portableZip:string;sourceZip?:string;checksums:string}>{
  for (const file of [`NyxSkill-v${VERSION}-portable.zip`, ...(options.includeSource ? [`NyxSkill-v${VERSION}-source.zip`] : []), 'SHA256SUMS']) {
    try { await lstat(join(outDir,file)); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    throw new Error(`Release artifact already exists: ${file}; choose a fresh output directory`);
  }
  await mkdir(outDir,{recursive:true}); const stage=await mkdtemp(join(outDir,'.nyxskill-release-stage-'));
  await buildAllRuntimes(root,join(stage,'runtimes'));
  await buildPlugins(root,join(stage,'plugin-ecosystem'));
  const entries:ZipEntry[]=[];
  entries.push(...await collect(stage,'plugin-ecosystem','plugin-ecosystem'));
  entries.push(...await collect(root,'dist/src','dist/src'));
  entries.push(...await collect(root,'docs','docs'));
  entries.push(...await collect(root,'scripts','scripts'));
  for(const dir of ['skills','profiles','packs','provenance','licenses']) entries.push(...await collect(root,dir,dir));
  entries.push(...await collect(stage,'runtimes','runtimes'));
  for(const file of ['nyxskill.lock','THIRD_PARTY_NOTICES.md','LICENSE','README.md','INSTALL.md','CHANGELOG.md','package.json']) entries.push({name:file,data:await readFile(join(root,file))});
  const portableZip=join(outDir,`NyxSkill-v${VERSION}-portable.zip`); await writeZip(portableZip,entries);
  let sourceZip:string|undefined;
  if(options.includeSource){
    const src:ZipEntry[]=[];
    for(const dir of ['src','skills','profiles','packs','provenance','licenses','docs','scripts','tests','.github']) src.push(...await collect(root,dir,dir));
    for(const file of ['package.json','package-lock.json','tsconfig.json','nyxskill.lock','README.md','INSTALL.md','LICENSE','THIRD_PARTY_NOTICES.md','CHANGELOG.md']) src.push({name:file,data:await readFile(join(root,file))});
    sourceZip=join(outDir,`NyxSkill-v${VERSION}-source.zip`); await writeZip(sourceZip,src);
  }
  const files=[portableZip,...(sourceZip?[sourceZip]:[])]; const lines=[] as string[];
  for(const file of files) lines.push(`${await sha(file)}  ${basename(file)}`);
  const checksums=join(outDir,'SHA256SUMS'); await writeFile(checksums,lines.join('\n')+'\n');
  await rm(stage,{recursive:true,force:true}); return{portableZip,sourceZip,checksums};
}
