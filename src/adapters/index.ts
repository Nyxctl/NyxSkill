import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Runtime } from '../types.js';

export interface BuildResult { runtime: Runtime; output: string; skillsPath: string }

const RUNTIMES: Runtime[] = ['inwjud','codex','claude-code','cursor','agents'];

async function copySkills(root:string,target:string):Promise<void>{
  await mkdir(target,{recursive:true});
  await cp(join(root,'skills'),target,{recursive:true,force:true});
}

function runtimeManifest(runtime:Runtime,skillsPath:string){
  return JSON.stringify({
    nyxskill_version:'1.0.0', api_version:1, runtime, skills_path:skillsPath.replaceAll('\\','/'),
    canonical_source:'skills/', generated:true, telemetry:false
  },null,2)+'\n';
}

export async function buildRuntime(root:string,runtime:Runtime,outDir:string):Promise<BuildResult>{
  if(!RUNTIMES.includes(runtime)) throw new Error(`Unsupported runtime: ${runtime}`);
  const base=join(outDir,runtime);
  await rm(base,{recursive:true,force:true});
  await mkdir(base,{recursive:true});
  let skillsPath:string;
  if(runtime==='inwjud'){
    skillsPath=join(base,'skills'); await copySkills(root,skillsPath);
    await writeFile(join(base,'INWJUD_SETUP.md'),`# NyxSkill for Inwjud\n\nAdd this folder to **Extra Skill Folders**:\n\n\`${skillsPath}\`\n\nCanonical skills remain self-contained. Inwjud runtime permissions remain authoritative.\n`);
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
  await writeFile(join(base,'nyxskill-runtime.json'),runtimeManifest(runtime,skillsPath));
  return {runtime,output:base,skillsPath};
}

export async function buildAllRuntimes(root:string,outDir:string):Promise<BuildResult[]>{
  const results:BuildResult[]=[];
  for(const runtime of RUNTIMES) results.push(await buildRuntime(root,runtime,outDir));
  return results;
}
