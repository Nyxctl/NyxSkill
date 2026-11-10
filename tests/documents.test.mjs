import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { validateDocuments } from '../dist/src/documents.js';
import { loadRegistry } from '../dist/src/registry.js';
test('shipped canonical skill frontmatter and local references validate',async()=>{
 assert.deepEqual(await validateDocuments(await loadRegistry(resolve('.'))),[]);
});
test('missing frontmatter, identity drift and broken references are rejected',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'nyx-doc-'));
 try {
  const document=join(dir,'SKILL.md');
  const registry={skills:[{document,meta:{id:'nyx.test.one',version:'1.0.0'}}]};
  await writeFile(document,'# Missing');
  assert.ok((await validateDocuments(registry)).some(i=>/frontmatter/i.test(i.message)));
  await writeFile(document,'---\nname: Test\ndescription: Test\nid: wrong\n---\n[ref](missing.md)');
  const issues=await validateDocuments(registry);
  assert.ok(issues.some(i=>/differs/.test(i.message)));
  assert.ok(issues.some(i=>/reference/.test(i.message)));
 } finally {await rm(dir,{recursive:true,force:true});}
});
