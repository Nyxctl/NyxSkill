import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildNyxPack, installNyxPack, removeNyxPack } from '../dist/src/packs.js';
import { readZip, writeZip } from '../dist/src/zip.js';
async function fixture(fn) { const dir=await mkdtemp(join(tmpdir(),'nyx-pack-security-')); try { await fn(dir); } finally { await rm(dir,{recursive:true,force:true}); } }
async function makePack(dir) {
  const src=join(dir,'src'); await mkdir(join(src,'skills/hello'),{recursive:true});
  const skill=JSON.parse(await readFile('skills/engineering/api-design/skill.yaml','utf8'));
  skill.id='nyx.test.hello'; skill.risk={level:'safe-write',destructive:false,requires_confirmation:false};
  const pack={id:'nyx.test',name:'Test',version:'1.0.0',api_version:1,namespace:'nyx.test',profiles:['universal'],skills:[skill.id],compatibility:{nyxskill:'>=1.0.0 <2.0.0',api:'^1'},trust:'community'};
  await writeFile(join(src,'pack.yaml'),JSON.stringify(pack)); await writeFile(join(src,'LICENSE'),'MIT');
  await writeFile(join(src,'skills/hello/skill.yaml'),JSON.stringify(skill)); await writeFile(join(src,'skills/hello/SKILL.md'),'# Hello');
  const archive=join(dir,'test.nyxpack'); await buildNyxPack(src,archive); return archive;
}
async function forgedZip(file,name) {
  const placeholder='z'.repeat(Buffer.byteLength(name)); await writeZip(file,[{name:placeholder,data:Buffer.from('payload')}]);
  const raw=await readFile(file); let position=raw.indexOf(placeholder);
  while(position>=0) { raw.write(name,position); position=raw.indexOf(placeholder,position+name.length); }
  await writeFile(file,raw);
}
test('pack install preserves an occupied unmanaged target',async()=>fixture(async dir=>{
  const archive=await makePack(dir); const store=join(dir,'store'); await mkdir(join(store,'nyx.test'),{recursive:true}); await writeFile(join(store,'nyx.test/user.txt'),'keep');
  await assert.rejects(installNyxPack(archive,store),/exist|managed|occupied/i);
  assert.equal(await readFile(join(store,'nyx.test/user.txt'),'utf8'),'keep');
}));
test('pack removal rejects traversal and preserves files outside store',async()=>fixture(async dir=>{
  const store=join(dir,'store'); await mkdir(store); await mkdir(join(dir,'victim')); await writeFile(join(dir,'victim/keep'),'keep');
  await assert.rejects(removeNyxPack('../victim',store),/unsafe|invalid/i);
  assert.equal(await readFile(join(dir,'victim/keep'),'utf8'),'keep');
}));
test('managed removal rejects added and modified files, then removes only intact owned files',async()=>fixture(async dir=>{
  const archive=await makePack(dir); const store=join(dir,'store'); const installed=await installNyxPack(archive,store);
  await writeFile(join(installed.path,'user.txt'),'keep'); await assert.rejects(removeNyxPack('nyx.test',store),/unknown|unmanaged|inventory/i);
  await rm(join(installed.path,'user.txt')); await writeFile(join(installed.path,'LICENSE'),'changed');
  await assert.rejects(removeNyxPack('nyx.test',store),/integrity|modified|inventory/i);
  await writeFile(join(installed.path,'LICENSE'),'MIT'); await removeNyxPack('nyx.test',store);
  await assert.rejects(readFile(join(installed.path,'pack.yaml')),/ENOENT/);
}));
test('ZIP reader rejects portable filesystem escapes and reserved aliases',async()=>fixture(async dir=>{
  const file=join(dir,'bad.zip');
  for(const name of ['C:/escape','a\\escape','../escape','CON/file','a/file.','a//file','/absolute']) { await forgedZip(file,name); await assert.rejects(readZip(file),/unsafe|invalid/i,name); }
}));
test('ZIP reader enforces CRC and declared output budgets',async()=>fixture(async dir=>{
  const file=join(dir,'bad.zip'); await writeZip(file,[{name:'file',data:Buffer.from('payload')}]);
  const raw=await readFile(file); raw[34]^=1; await writeFile(file,raw); await assert.rejects(readZip(file),/CRC|checksum/i);
  await writeZip(file,[{name:'file',data:Buffer.from('payload')}]); const big=await readFile(file); const central=big.indexOf(Buffer.from([0x50,0x4b,0x01,0x02])); big.writeUInt32LE(0x7fffffff,central+24); await writeFile(file,big);
  await assert.rejects(readZip(file),/limit|budget|size/i);
}));
test('ZIP reader rejects case collisions, symlink entries and local/header mismatch',async()=>fixture(async dir=>{
  const file=join(dir,'bad.zip'); await writeZip(file,[{name:'file',data:Buffer.from('a')},{name:'FILE',data:Buffer.from('b')}]); await assert.rejects(readZip(file),/collision|duplicate/i);
  await writeZip(file,[{name:'file',data:Buffer.from('a')}]); const raw=await readFile(file); const central=raw.indexOf(Buffer.from([0x50,0x4b,0x01,0x02])); raw.writeUInt32LE((0o120777 << 16) >>> 0,central+38); await writeFile(file,raw); await assert.rejects(readZip(file),/symlink|symbolic|unsupported/i);
  await writeZip(file,[{name:'file',data:Buffer.from('a')}]); const mismatch=await readFile(file); mismatch.write('evil',30); await writeFile(file,mismatch); await assert.rejects(readZip(file),/mismatch|header/i);
}));

test('self-declared trust cannot grant privileged imported pack permissions',async()=>fixture(async dir=>{
  const archive=await makePack(dir); const entries=await readZip(archive); const skillEntry=entries.find(e=>e.name.endsWith('/skill.yaml')); const skill=JSON.parse(skillEntry.data); skill.risk={level:'privileged',destructive:false,requires_confirmation:true}; skillEntry.data=Buffer.from(JSON.stringify(skill));
  const packEntry=entries.find(e=>e.name==='pack.yaml'); const pack=JSON.parse(packEntry.data); pack.trust='first-party'; packEntry.data=Buffer.from(JSON.stringify(pack));
  await writeZip(archive,entries); await assert.rejects(installNyxPack(archive,join(dir,'store')),/risk blocked/);
}));
test('pack output overwrite is refused and old ownership markers do not authorize removal',async()=>fixture(async dir=>{
  const archive=await makePack(dir); const before=await readFile(archive);
  await assert.rejects(buildNyxPack(join(dir,'src'),archive),/already exists/); assert.deepEqual(await readFile(archive),before);
  const store=join(dir,'store'); const target=join(store,'nyx.test'); await mkdir(target,{recursive:true}); await writeFile(join(target,'.nyxpack-install.json'),JSON.stringify({packId:'nyx.test',sha256:'legacy'})); await writeFile(join(target,'keep'),'user');
  await assert.rejects(removeNyxPack('nyx.test',store),/Unmanaged/); assert.equal(await readFile(join(target,'keep'),'utf8'),'user');
}));
