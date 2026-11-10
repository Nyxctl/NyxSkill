import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parseCapabilityInventory, type CapabilityInventory } from './capability-router.js';
const run=promisify(execFile);
const object=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);

/** Normalize only install identity/state. Installed and enabled never imply authentication. */
export function normalizeCodexInventory(value:unknown, tools:unknown[]=[]):CapabilityInventory {
  if(!object(value)||!Array.isArray(value.installed)||value.installed.length>1000) throw new Error('Expected bounded Codex plugin list JSON');
  const plugins=value.installed.map((entry:unknown)=>{
    if(!object(entry)||typeof entry.pluginId!=='string'||typeof entry.name!=='string'||typeof entry.installed!=='boolean'||typeof entry.enabled!=='boolean') throw new Error('Invalid Codex plugin state');
    return {id:entry.pluginId,name:entry.name,installed:entry.installed,enabled:entry.enabled,auth:'unknown'};
  });
  return parseCapabilityInventory({plugins,tools,capturedAt:new Date().toISOString()});
}
async function manifest(path:string):Promise<Record<string,unknown>|null>{
  try {
    const stat=await lstat(path);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>128*1024)return null;
    const data=JSON.parse(await readFile(path,'utf8'));return object(data)?data:null;
  } catch {return null;}
}
/** Optional read-only inventory refresh. Fixed argv; no plugin scripts, config or credentials read. */
export async function discoverCodexPlugins(tools:unknown[]=[]):Promise<CapabilityInventory>{
  let value:unknown;
  try {const {stdout}=await run(process.platform==='win32'?'codex.exe':'codex',['plugin','list','--json'],{timeout:30000,maxBuffer:2*1024*1024,windowsHide:true});value=JSON.parse(stdout);}
  catch {throw new Error('Codex plugin inventory unavailable; use an explicit saved snapshot');}
  const inventory=normalizeCodexInventory(value,tools);
  const rows=(value as {installed:Record<string,unknown>[]}).installed;
  const cache=join(homedir(),'.codex','plugins','cache');
  let markets:string[]=[];try{markets=(await readdir(cache)).slice(0,100);}catch{/* Optional local metadata absent. */}
  for(const plugin of inventory.plugins){
    const row=rows.find(p=>p.pluginId===plugin.id);const roots:string[]=[];
    if(object(row?.source)&&typeof row.source.path==='string')roots.push(row.source.path);
    if(/^[a-z0-9][a-z0-9_-]*$/i.test(plugin.name))for(const market of markets){
      const base=join(cache,market,plugin.name);
      try{for(const version of (await readdir(base)).slice(0,30))roots.push(join(base,version));}catch{/* Optional cached plugin. */}
    }
    for(const root of roots){
      const data=await manifest(join(root,'plugin.json'))??await manifest(join(root,'.codex-plugin','plugin.json'));
      if(!data)continue;
      const ui=object(data.interface)?data.interface:{};
      if(typeof ui.displayName==='string')plugin.displayName=ui.displayName.slice(0,150);
      if(typeof data.description==='string')plugin.description=data.description.slice(0,1000);
      break;
    }
  }
  return parseCapabilityInventory(inventory);
}
