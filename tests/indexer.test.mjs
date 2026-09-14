import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildIndex, indexStatus } from '../dist/src/indexer.js';
import { syncCheck } from '../dist/src/sync.js';

const skill={id:'nyx.test.one',name:'One',version:'1.0.0',api_version:1,category:'test.one',type:'domain',profiles:['universal'],description:'One',routing:{priority:1,triggers:{keywords:['one'],intents:['review']}},composition:{requires:[],before:[],after:[]},conflicts_with:[],capabilities:{required:['filesystem.read'],optional:[]},risk:{level:'read-only',destructive:false,requires_confirmation:false},runtime:{supported:['inwjud','codex','claude-code','cursor','agents']},provenance:{origin:'nyx-native',license:'MIT'},compatibility:{nyxskill:'>=1.0.0 <2.0.0',api:'^1'}};
async function fixture(){const r=await mkdtemp(join(tmpdir(),'nyx-index-'));await mkdir(join(r,'skills','one'),{recursive:true});await mkdir(join(r,'profiles'));await mkdir(join(r,'packs'));await writeFile(join(r,'skills','one','skill.yaml'),JSON.stringify(skill));await writeFile(join(r,'skills','one','SKILL.md'),'# One\n');await writeFile(join(r,'profiles','universal.yaml'),JSON.stringify({id:'universal',name:'Universal',includes:[],triggers:{keywords:['universal']}}));return r;}

test('content index reports cache hits and invalidation',async()=>{const r=await fixture();try{const a=await buildIndex(r);assert.equal(a.rebuilt,1);const b=await buildIndex(r);assert.equal(b.reused,1);await writeFile(join(r,'skills','one','SKILL.md'),'# One changed\n');const c=await buildIndex(r);assert.equal(c.rebuilt,1);const s=await indexStatus(r);assert.equal(s.skills,1);}finally{await rm(r,{recursive:true,force:true});}});

test('sync check compares explicitly present locked archives without updating',async()=>{const r=await fixture();try{const source=Buffer.from('archive');await writeFile(join(r,'source.zip'),source);const sha=createHash('sha256').update(source).digest('hex');await writeFile(join(r,'nyxskill.lock'),JSON.stringify({lockfile_version:1,nyxskill_version:'1.0.0',sources:{demo:{archive:'source.zip',sha256:sha,license:'MIT'}},skills:{}},null,2));const rep=await syncCheck(r);assert.equal(rep.sources[0].status,'matched');assert.equal(rep.modified,false);}finally{await rm(r,{recursive:true,force:true});}});
