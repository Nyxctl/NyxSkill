import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { LearningStore } from '../dist/src/learning/store.js';
import { draftOf, hash } from '../dist/src/learning/records.js';
import { retrieve, verifyEvidence } from '../dist/src/learning/workflow.js';
import { propose } from '../dist/src/learning/proposal.js';
import { loadRegistry } from '../dist/src/registry.js';

const cli = resolve('dist/src/cli.js');
const scope = { platform: 'win32', taskKind: 'installer', targetKind: 'msi',
  toolVersions: { pillow: 'fixture-1' }, evidenceLevel: 'host' };
const procedure = { kind: 'procedure', skillId: 'nyx.image-media.universal-image-studio', taskTags: ['installer'], scope,
  title: 'Check installer', preconditions: ['Use a local fixture'], steps: ['Run installer smoke checks'], expectedChecks: ['installer-smoke'] };
const lesson = { kind: 'lesson', skillId: procedure.skillId, taskTags: ['installer'], scope,
  observation: 'Local probe failed', attempt: 'Inspect fixture', outcome: 'Fixture metadata visible', nextCheck: 'Check local installer logs' };
const fixture = async () => new LearningStore(await mkdtemp(join(tmpdir(), 'nyx-learning-')));

function evidenceFor(entry, runId) {
  const observedAt = new Date().toISOString();
  const sourceFingerprint = 'a'.repeat(64);
  return {
    expected: { runId, sourceFingerprint },
    input: { kind: 'host', runId, sourceFingerprint, procedureDigest: hash(draftOf(entry)), observedAt,
      checks: ['installer-smoke'], exitCode: 0 },
  };
}

test('project store deduplicates, serializes revisions, and ignores damaged records', async () => {
  const store = await fixture();
  const a = await store.record(lesson);
  assert.equal((await store.record(lesson)).id, a.id);
  const b = await store.record(procedure);
  const results = await Promise.allSettled([
    store.change(a.id, 1, entry => ({ ...entry, nextCheck: 'Inspect output' })),
    store.change(a.id, 1, entry => ({ ...entry, nextCheck: 'Read plan' })),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await store.history(a.id)).length, 2);
  await writeFile(join(store.path,b.id,'1.json'), '{');
  const listed = await store.list();
  assert.deepEqual(listed.records.map(item => item.id), [a.id]);
  assert.equal(listed.diagnostics.length,1);
});

test('host proof binds digest, scope, run and coverage and remains idempotent', async () => {
  const store = await fixture();
  const draft = await store.record(procedure);
  const {input, expected} = evidenceFor(draft,'2026-10-24T11-05-36-051Z-bd1de0a9-be9d-4996-9756-3ac625108591');
  for (const rejected of [{...input,kind:'guest'}, {...input,checks:['other']},
    {...input,sourceFingerprint:'b'.repeat(64)}, {...input,procedureDigest:'0'.repeat(64)}]) {
    assert.throws(() => verifyEvidence(draft,[draft],rejected,expected));
  }
  const verified = await store.change(draft.id,1,(entry,history) => verifyEvidence(entry,history,input,expected));
  assert.equal(verified.state,'verified');
  assert.equal((await store.change(draft.id,2,(entry,history) => verifyEvidence(entry,history,input,expected))).revision,2);
  const context = { ...scope, skillIds:[procedure.skillId], tags:['installer'] };
  assert.equal(retrieve([verified],context).procedure.requiresCurrentVerification,true);
  assert.equal(retrieve([verified],{...context,toolVersions:{pillow:'other'}}).procedure,null);
  assert.equal(retrieve([verified],{...context,skillIds:[]}).procedure,null);
  assert.equal(retrieve([verified],{...context,tags:['documents']}).procedure,null);
  await assert.rejects(store.change(draft.id,2,(entry,history) => verifyEvidence(entry,history,{...input,checks:['installer-smoke','extra']},expected)),/conflict/);
});

test('CLI preserves the routing chain and prints a reviewable diff after two runs', async () => {
  const project = await mkdtemp(join(tmpdir(),'nyx-learning-cli-'));
  const run = (...args) => JSON.parse(execFileSync(process.execPath,[cli,...args],{encoding:'utf8'}));
  const json = async (name,value) => {
    const path = join(project,name);
    await writeFile(path,JSON.stringify(value));
    return path;
  };
  const from = await json('procedure.json',procedure);
  const draft = run('learn','record','--from',from,'--project',project);
  const scopeFile = await json('scope.json',scope);
  for (const id of ['run-1','run-2']) {
    const {input,expected} = evidenceFor(draft,id);
    run('learn','verify',draft.id,'--project',project,'--evidence',await json('run.json',input),'--expected',await json('expected.json',expected));
  }
  const command = ['route','targeted image edit','--json'];
  const normal = run(...command);
  const enriched = run(...command,'--learning','--project',project,'--learning-scope',scopeFile,'--learning-tag','installer');
  assert.deepEqual(enriched.chain,normal.chain);
  assert.deepEqual(enriched.rejected,normal.rejected);
  assert.equal(enriched.learning.procedure.record.id,draft.id);
  const proposal = run('learn','propose',draft.id,'--project',project);
  assert.match(proposal.diff,/diff --git a\/skills\/image-media\/universal-image-studio\/SKILL.md/);
  execFileSync('git',['apply','--check','-'],{input:proposal.diff});
  const revised = run('learn','revise',draft.id,'--project',project,'--from',await json('revised.json',{...procedure,steps:['Revised installer smoke steps']}));
  assert.equal(revised.state,'draft');
  assert.deepEqual(revised.evidence,[]);
  const retired = run('learn','retire',draft.id,'--project',project,'--reason','Workflow superseded');
  assert.equal(retired.state,'retired');
});

test('a new reusable workflow yields a standalone skill diff with matching metadata', async () => {
  const store = await fixture();
  let record = await store.record({...procedure,skillId:'local.workflow.installer-smoke'});
  for (const runId of ['run-a','run-b']) {
    const {input,expected} = evidenceFor(record,runId);
    record = await store.change(record.id,record.revision,(entry,history) => verifyEvidence(entry,history,input,expected));
  }
  const result = await propose(record,await loadRegistry('.'));
  assert.equal(result.kind,'new-skill');
  assert.match(result.diff,/\+id: local\.workflow\.installer-smoke/);
  assert.match(result.diff,/\+\s+"id": "local\.workflow\.installer-smoke"/);
  execFileSync('git',['apply','--check','-'],{input:result.diff});
});

test('store rejects linked project cache paths', async t => {
  const project = await mkdtemp(join(tmpdir(),'nyx-learning-link-'));
  const other = await mkdtemp(join(tmpdir(),'nyx-learning-outside-'));
  try { await symlink(other,join(project,'.nyxskill'),process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (['EPERM','EACCES'].includes(error.code)) return t.skip('Link privileges unavailable'); throw error; }
  await assert.rejects(new LearningStore(project).record(lesson),/Symbolic links/);
});
