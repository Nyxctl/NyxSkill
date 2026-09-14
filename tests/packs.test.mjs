import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { buildNyxPack, verifyNyxPack, installNyxPack } from '../dist/src/packs.js';

function skill(level='safe-write') { return {
  id:'community.demo.hello', name:'Hello', version:'1.0.0', api_version:1, category:'demo.hello', type:'domain', profiles:['universal'], description:'Demo skill',
  routing:{priority:50,triggers:{keywords:['hello'],intents:['review']}}, composition:{requires:[],before:[],after:[]}, conflicts_with:[],
  capabilities:{required:['filesystem.read'],optional:[]}, risk:{level,destructive:level==='destructive',requires_confirmation:level!=='read-only'},
  runtime:{supported:['inwjud','codex','claude-code','cursor','agents']}, provenance:{origin:'nyx-native',license:'MIT'}, compatibility:{nyxskill:'>=1.0.0 <2.0.0',api:'^1'}
};}
async function makePack(root, risk='safe-write'){
  await mkdir(join(root,'skills','hello'),{recursive:true});
  await writeFile(join(root,'pack.yaml'), JSON.stringify({id:'community.demo',name:'Demo',version:'1.0.0',api_version:1,namespace:'community.demo',profiles:['universal'],skills:['community.demo.hello'],compatibility:{nyxskill:'>=1.0.0 <2.0.0',api:'^1'},trust:'community'},null,2));
  await writeFile(join(root,'skills','hello','skill.yaml'), JSON.stringify(skill(risk),null,2));
  await writeFile(join(root,'skills','hello','SKILL.md'),'# Hello\n');
  await writeFile(join(root,'LICENSE'),'MIT test license\n');
}

test('builds and verifies a safe community nyxpack', async()=>{
  const tmp=await mkdtemp(join(tmpdir(),'nyx-pack-'));
  try{
    const src=join(tmp,'src'); await makePack(src);
    const out=join(tmp,'demo.nyxpack'); await buildNyxPack(src,out);
    const report=await verifyNyxPack(out);
    assert.equal(report.ok,true,report.issues.join('\n'));
    assert.equal(report.pack.id,'community.demo');
    assert.equal(report.skills.length,1);
    assert.match(report.sha256,/^[a-f0-9]{64}$/);
  }finally{await rm(tmp,{recursive:true,force:true});}
});

test('blocks destructive community pack by default', async()=>{
  const tmp=await mkdtemp(join(tmpdir(),'nyx-pack-risk-'));
  try{
    const src=join(tmp,'src'); await makePack(src,'destructive');
    const out=join(tmp,'demo.nyxpack'); await buildNyxPack(src,out);
    const report=await verifyNyxPack(out);
    assert.equal(report.ok,false);
    assert.ok(report.issues.some(x=>/destructive|risk/i.test(x)));
  }finally{await rm(tmp,{recursive:true,force:true});}
});

test('installs a verified local pack to an explicit store', async()=>{
  const tmp=await mkdtemp(join(tmpdir(),'nyx-pack-install-'));
  try{
    const src=join(tmp,'src'); await makePack(src);
    const out=join(tmp,'demo.nyxpack'); await buildNyxPack(src,out);
    const store=join(tmp,'store'); const installed=await installNyxPack(out,store);
    assert.equal(installed.packId,'community.demo');
    await access(join(store,'community.demo','skills','hello','SKILL.md'));
  }finally{await rm(tmp,{recursive:true,force:true});}
});
