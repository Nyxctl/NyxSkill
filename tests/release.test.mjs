import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildReleaseArtifacts } from '../dist/src/release.js';
import { readZip } from '../dist/src/zip.js';

test('portable release contains direct skills, all runtimes, notices, and checksums', async()=>{
  const out=await mkdtemp(join(tmpdir(),'nyx-release-'));
  try{
    const result=await buildReleaseArtifacts(resolve('.'),out,{includeSource:true});
    const portable=await readZip(result.portableZip);
    const names=new Set(portable.map(e=>e.name));
    assert.ok(names.has('skills/core/systematic-debugging/SKILL.md'));
    assert.ok(names.has('runtimes/inwjud/skills/core/systematic-debugging/skill.yaml'));
    assert.ok(names.has('runtimes/codex/AGENTS.md'));
    assert.ok(names.has('THIRD_PARTY_NOTICES.md'));
    assert.ok(names.has('dist/src/cli.js'));
    assert.ok(names.has('plugin-ecosystem/.agents/plugins/marketplace.json'));
    const source=await readZip(result.sourceZip);
    assert.equal(source.some(e=>e.name.endsWith('.zip') || e.name.includes('node_modules/')),false);
    assert.ok(result.sourceZip);
    const sums=await readFile(result.checksums,'utf8');
    assert.match(sums,/NyxSkill-v1\.2\.0-portable\.zip/);
    const again=await buildReleaseArtifacts(resolve('.'),join(out,'again'),{includeSource:true});
    assert.deepEqual(await readFile(result.portableZip),await readFile(again.portableZip));
    assert.deepEqual(await readFile(result.sourceZip),await readFile(again.sourceZip));
  }finally{await rm(out,{recursive:true,force:true});}
});
