import { createHash } from 'node:crypto';
import { VERSION } from '../version.js';
import { cp, mkdir, rm, writeFile, lstat, readFile, realpath, readdir } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';
import type { Runtime } from '../types.js';

export interface BuildResult { runtime: Runtime; output: string; skillsPath: string }

const RUNTIMES: Runtime[] = ['inwjud','codex','claude-code','cursor','agents'];

async function ownedFiles(base:string):Promise<Record<string,string>> {
  const files:Record<string,string>={};
  async function walk(dir:string):Promise<void> {
    for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
      const path=join(dir,entry.name);
      if(entry.isSymbolicLink()) throw new Error('Refusing symlink in adapter output');
      if(entry.isDirectory()) { files[relative(base,path).replaceAll('\\','/')+'/']='directory'; await walk(path); }
      else if(entry.isFile() && path!==join(base,'nyxskill-runtime.json')) files[relative(base,path).replaceAll('\\','/')]=createHash('sha256').update(await readFile(path)).digest('hex');
    }
  }
  await walk(base); return files;
}

async function copySkills(root:string,target:string):Promise<void>{
  await mkdir(target,{recursive:true});
  await cp(join(root,'skills'),target,{recursive:true,force:true,filter:path => basename(path).toLowerCase() !== '.nyxskill'});
}

function runtimeManifest(runtime:Runtime,skillsPath:string,files:Record<string,string>){
  return JSON.stringify({
    nyxskill_version:VERSION, api_version:1, runtime, skills_path:skillsPath.replaceAll('\\','/'),
    canonical_source:'skills/', generated:true, telemetry:false, files
  },null,2)+'\n';
}

export async function buildRuntime(root:string,runtime:Runtime,outDir:string):Promise<BuildResult>{
  if(!RUNTIMES.includes(runtime)) throw new Error(`Unsupported runtime: ${runtime}`);
  const base=resolve(outDir,runtime);
  const source=await realpath(root);
  let existing;
  try { existing=await lstat(base); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (existing) {
    if (existing.isSymbolicLink()) throw new Error('Refusing symlink output');
    const target=await realpath(base);
    if (source === target || source.startsWith(target + sep)) throw new Error('Output would replace source');
    let owned;
    try { owned=JSON.parse(await readFile(join(base,'nyxskill-runtime.json'),'utf8')); } catch { throw new Error('Refusing unowned output directory'); }
    if (owned.generated !== true || owned.runtime !== runtime || !owned.files) throw new Error('Refusing unowned or legacy output directory; choose a fresh output');
    if (JSON.stringify(owned.files)!==JSON.stringify(await ownedFiles(base))) throw new Error('Refusing modified or unowned adapter files');
  }
  // Only this adapter-managed runtime directory may be replaced.
  await rm(base,{recursive:true,force:true});
  await mkdir(base,{recursive:true});
  let skillsPath:string;
  if(runtime==='inwjud'){
    skillsPath=join(base,'skills'); await copySkills(root,skillsPath);
    await writeFile(join(base,'INWJUD_SETUP.md'),`# NyxSkill for Inwjud\n\nAdd this folder to **Extra Skill Folders**:\n\n\`skills/\`\n\nCanonical skills remain self-contained. Inwjud runtime permissions remain authoritative.\n`);
  }else if(runtime==='codex'){
    skillsPath=join(base,'skills'); await copySkills(root,skillsPath);
    await writeFile(join(base,'AGENTS.md'),`# NyxSkill / Codex\n\nUse the skills in \`skills/\` as the canonical workflow library. Select only skills relevant to the current request, preserve Nyx capability/risk rules, and verify before completion.\n`);
  }else if(runtime==='claude-code'){
    skillsPath=join(base,'.claude','skills'); await copySkills(root,skillsPath);
    await writeFile(join(base,'CLAUDE.md'),`# NyxSkill / Claude Code\n\nLoad skills from \`.claude/skills/\` on demand. Respect canonical routing intent, risk declarations, and runtime permission controls.\n`);
  }else if(runtime==='cursor'){
    skillsPath=join(base,'.cursor','skills'); await copySkills(root,skillsPath);
    await mkdir(join(base,'.cursor','rules'),{recursive:true});
    await writeFile(join(base,'.cursor','rules','nyxskill.mdc'),`---\ndescription: NyxSkill canonical workflow routing\nalwaysApply: true\n---\nUse only relevant skills from .cursor/skills, follow their workflow and risk metadata, and verify changes before completion.\n`);
  }else{
    skillsPath=join(base,'skills'); await copySkills(root,skillsPath);
    await writeFile(join(base,'AGENTS.md'),`# NyxSkill / Generic Agents\n\nDiscover canonical skills under \`skills/\`. Compose them deterministically and keep runtime permissions authoritative.\n`);
  }
  await writeFile(join(base,'nyxskill-runtime.json'),runtimeManifest(runtime,relative(base,skillsPath),await ownedFiles(base)));
  return {runtime,output:base,skillsPath};
}

export async function buildAllRuntimes(root:string,outDir:string):Promise<BuildResult[]>{
  const results:BuildResult[]=[];
  for(const runtime of RUNTIMES) results.push(await buildRuntime(root,runtime,outDir));
  return results;
}
