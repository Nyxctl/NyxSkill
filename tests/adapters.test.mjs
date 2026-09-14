import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, access, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { buildRuntime, buildAllRuntimes } from '../dist/src/adapters/index.js';
async function exists(p){ try{ await access(p); return true;}catch{return false;} }
async function hashTree(root){
  const rows=[];
  async function walk(dir,prefix=''){
    for(const e of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
      const p=join(dir,e.name), rel=join(prefix,e.name);
      if(e.isDirectory()) await walk(p,rel); else rows.push(rel+'\0'+createHash('sha256').update(await readFile(p)).digest('hex'));
    }
  }
  await walk(root); return createHash('sha256').update(rows.join('\n')).digest('hex');
}

test('builds every runtime layout with direct canonical skills', async()=>{
  const out=await mkdtemp(join(tmpdir(),'nyx-adapters-'));
  try{
    const result=await buildAllRuntimes(resolve('.'),out);
    assert.equal(result.length,5);
    assert.equal(await exists(join(out,'inwjud','skills','core','systematic-debugging','SKILL.md')),true);
    assert.equal(await exists(join(out,'codex','AGENTS.md')),true);
    assert.equal(await exists(join(out,'claude-code','.claude','skills','security','secure-auth','skill.yaml')),true);
    assert.equal(await exists(join(out,'cursor','.cursor','rules','nyxskill.mdc')),true);
    assert.equal(await exists(join(out,'agents','AGENTS.md')),true);
  }finally{ await rm(out,{recursive:true,force:true}); }
});

test('adapter build is deterministic across rebuilds', async()=>{
  const out=await mkdtemp(join(tmpdir(),'nyx-adapter-det-'));
  try{
    await buildRuntime(resolve('.'),'inwjud',out);
    const first=await hashTree(join(out,'inwjud'));
    await buildRuntime(resolve('.'),'inwjud',out);
    const second=await hashTree(join(out,'inwjud'));
    assert.equal(first,second);
  }finally{ await rm(out,{recursive:true,force:true}); }
});
