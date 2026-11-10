import { date, digest, draftOf, hash, label, object, runIdentifier, string, strings, type Evidence, type RecordEntry, type Scope } from './records.js';

export function verifyEvidence(entry: RecordEntry, history: RecordEntry[], input: unknown, expectation: unknown): RecordEntry {
  if (entry.kind !== 'procedure' || entry.state === 'retired') throw new Error('Only a current procedure can be verified');
  const data = object(input, ['kind','runId','sourceFingerprint','procedureDigest','observedAt','checks','exitCode','report']);
  const expected = object(expectation, ['runId','sourceFingerprint','vmId','baselineId']);
  const runId = string(data.runId, runIdentifier);
  const sourceFingerprint = string(data.sourceFingerprint, digest);
  const procedureDigest = hash(draftOf(entry));
  const observedAt = date(data.observedAt);
  const checks = strings(data.checks, label, true).sort();
  if (data.kind !== entry.scope.evidenceLevel || data.procedureDigest !== procedureDigest ||
      runId !== expected.runId || sourceFingerprint !== expected.sourceFingerprint || data.exitCode !== 0 ||
      !entry.expectedChecks.every(check => checks.includes(check))) throw new Error('Evidence does not cover the current procedure and expected run');
  if (Date.parse(observedAt) > Date.now() + 60_000) throw new Error('Evidence time is in the future');
  if (data.kind === 'guest' || data.report !== undefined) throw new Error('Guest evidence verification is unavailable');

  const evidence: Evidence = { kind: entry.scope.evidenceLevel, runId, sourceFingerprint, procedureDigest,
    observedAt, checks, reportDigest: hash([runId, sourceFingerprint, observedAt, data.exitCode, data.report ?? null, checks]) };
  const previous = history.flatMap(item => item.evidence).find(item => item.runId === runId);
  if (previous && hash(previous) !== hash(evidence)) throw new Error('Evidence run ID conflict');
  if (previous && entry.evidence.some(item => item.runId === runId)) return entry;
  if (previous) throw new Error('A previously verified run cannot verify a revised procedure');
  return { ...entry, state: 'verified', evidence: [...entry.evidence, evidence] };
}

export interface RetrievalContext {
  skillIds: string[];
  tags: string[];
  platform: string;
  taskKind?: string;
  targetKind?: string;
  toolVersions?: Scope['toolVersions'];
  capabilities?: string[];
  evidenceLevel?: Scope['evidenceLevel'];
}

export function retrieve(records: RecordEntry[], context: RetrievalContext) {
  const diagnostics: string[] = [];
  const candidates: Array<{ record: RecordEntry; specificity: number; matchedTags: string[] }> = [];
  for (const record of records) {
    if (!context.skillIds.includes(record.skillId) || !['active','verified'].includes(record.state)) continue;
    const matchedTags = record.taskTags.filter(tag => context.tags.includes(tag));
    if (!matchedTags.length || record.scope.platform !== context.platform) continue;
    const scope = record.scope;
    if ((context.taskKind && scope.taskKind !== context.taskKind) || (context.targetKind && scope.targetKind && scope.targetKind !== context.targetKind)) continue;
    const tools = Object.entries(scope.toolVersions ?? {});
    const caps = scope.capabilities ?? [];
    if (tools.some(([name, version]) => context.toolVersions?.[name] !== undefined && context.toolVersions[name] !== version)) {
      if (record.kind === 'procedure') diagnostics.push('needs-recheck: ' + record.id);
      continue;
    }
    const missingContext = !context.taskKind || (scope.targetKind && !context.targetKind) ||
      tools.some(([name,version]) => context.toolVersions?.[name] !== version) ||
      caps.some(capability => !context.capabilities?.includes(capability)) ||
      (record.kind === 'procedure' && scope.evidenceLevel !== context.evidenceLevel);
    if (missingContext && record.kind === 'procedure') {
      diagnostics.push('needs-recheck: ' + record.id);
      continue;
    }
    candidates.push({ record, specificity: Number(Boolean(scope.targetKind && context.targetKind)) + tools.length + caps.length, matchedTags });
  }
  candidates.sort((a,b) => b.specificity - a.specificity || b.matchedTags.length - a.matchedTags.length ||
    b.record.updatedAt.localeCompare(a.record.updatedAt) || a.record.id.localeCompare(b.record.id));
  const procedure = candidates.find(item => item.record.kind === 'procedure');
  return { lesson: candidates.find(item => item.record.kind === 'lesson') ?? null,
    procedure: procedure ? { ...procedure, requiresCurrentVerification: true } : null, diagnostics };
}

export function canPropose(entry: RecordEntry): boolean {
  if (entry.kind !== 'procedure' || entry.state !== 'verified') return false;
  const procedureDigest = hash(draftOf(entry));
  const evidence = entry.evidence.filter(item => item.kind === entry.scope.evidenceLevel &&
    item.procedureDigest === procedureDigest && entry.expectedChecks.every(check => item.checks.includes(check)));
  return new Set(evidence.map(item => item.runId)).size >= 2 &&
    new Set(evidence.map(item => item.reportDigest)).size >= 2;
}
