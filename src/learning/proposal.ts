import { readFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { noLinks } from '../plugins.js';
import type { Registry } from '../registry.js';
import { assertSkill } from '../schema.js';
import { RUNTIMES } from '../types.js';
import type { RecordEntry } from './records.js';
import { canPropose } from './workflow.js';

function lines(value: string): string[] {
  return value ? value.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n') : [];
}

function patch(path: string, before: string, after: string, isNew = false): string {
  if (!/^[a-zA-Z0-9_./-]+$/.test(path) || !path.startsWith('skills/') || path.split('/').includes('..')) {
    throw new Error('Invalid proposal target');
  }
  const oldLines = lines(before);
  const newLines = lines(after);
  const oldBlock = oldLines.map(line => '-' + line);
  if (before && !before.endsWith('\n')) oldBlock.push('\\ No newline at end of file');
  return [`diff --git a/${path} b/${path}`, ...(isNew ? ['new file mode 100644'] : []),
    isNew ? '--- /dev/null' : '--- a/' + path, '+++ b/' + path,
    `@@ -${oldLines.length ? '1,' + oldLines.length : '0,0'} +1,${newLines.length} @@`,
    ...oldBlock, ...newLines.map(line => '+' + line), ''].join('\n');
}

export async function propose(entry: RecordEntry, registry: Registry) {
  if (entry.kind !== 'procedure' || !canPropose(entry)) throw new Error('Proposal requires two independent passing runs for this procedure');
  const found = registry.skills.find(skill => skill.meta.id === entry.skillId);
  const marker = '<!-- nyx-learning:' + entry.id + ' -->';
  const bullets = (values: string[]) => values.map(value => '- ' + value.replace(/\r?\n/g, '\n  ')).join('\n');
  const body = [
    marker, '## Reusable workflow', '',
    'Use when the task matches ' + entry.taskTags.map(tag => '`' + tag + '`').join(', ') +
      ' and the current environment meets the recorded scope. Skip when prerequisites or authorization are missing.',
    '', '### Scope', '',
    ...Object.entries(entry.scope).map(([key,value]) => '- ' + key + ' ' + JSON.stringify(value)),
    '', '### Preconditions', '', bullets(entry.preconditions), '',
    '### Procedure', '', bullets(entry.steps), '',
    '### Verify', '', bullets(entry.expectedChecks),
    '', 'Check the current run at the required evidence level. Record any blocked or failed checks.', '',
  ].join('\n');
  let diff: string;
  if (found) {
    const declared = new Set([...found.meta.capabilities.required, ...found.meta.capabilities.optional]);
    if (entry.scope.capabilities?.some(capability => !declared.has(capability))) {
      throw new Error('Procedure needs capabilities outside the target skill; review its metadata before proposing a revision');
    }
    await noLinks(found.document);
    const original = await readFile(found.document, 'utf8');
    if (original.includes(marker)) throw new Error('This procedure is already present in the skill');
    const path = relative(registry.root, found.document).replaceAll('\\','/');
    diff = patch(path, original, original.trimEnd() + '\n\n' + body);
  } else {
    if (!/^local\.workflow\.[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.skillId)) throw new Error('New skill IDs must use local.workflow.<slug>');
    const slug = entry.skillId.split('.').at(-1)!;
    const path = 'skills/local/' + slug;
    const description = 'Apply the verified workflow for ' + entry.taskTags.join(', ') + ' within its prerequisites.';
    const meta = assertSkill({
      id: entry.skillId, name: slug, description, version: '1.0.0', api_version: 1, category: 'local.workflow', type: 'domain',
      profiles: ['universal'], routing: { priority: 50, triggers: { keywords: entry.taskTags, intents: [] } },
      composition: { requires: [], before: [], after: [] }, conflicts_with: [],
      capabilities: { required: [...new Set(['filesystem.read', ...(entry.scope.capabilities ?? [])])], optional: [] },
      risk: { level: 'privileged', destructive: false, requires_confirmation: true },
      runtime: { supported: RUNTIMES }, provenance: { origin: 'nyx-native', license: 'UNLICENSED' },
      compatibility: { nyxskill: '>=1.2.0 <2.0.0', api: '^1' },
    });
    const document = `---\nname: ${slug}\ndescription: ${JSON.stringify(description)}\nid: ${entry.skillId}\nversion: 1.0.0\n---\n# ${slug}\n\n` + body;
    diff = patch(path + '/SKILL.md', '', document, true) + patch(path + '/skill.yaml', '', JSON.stringify(meta,null,2) + '\n', true);
  }
  return { id: entry.id, revision: entry.revision, skillId: entry.skillId, kind: found ? 'revision' : 'new-skill',
    evidence: entry.evidence, diff, review: ['Check matching and excluded triggers, risk, permissions and licensing', 'Validate the proposed registry', 'Compare held-out task outcomes before activation'] };
}
