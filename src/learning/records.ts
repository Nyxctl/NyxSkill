import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';

export type Level = 'host' | 'guest' | 'interactive';
export interface Scope {
  platform: string;
  taskKind: string;
  targetKind?: string;
  toolVersions?: Record<string, string>;
  capabilities?: string[];
  evidenceLevel: Level;
}
export interface Evidence {
  kind: Level;
  runId: string;
  sourceFingerprint: string;
  procedureDigest: string;
  observedAt: string;
  checks: string[];
  reportDigest: string;
}
interface Common {
  skillId: string;
  taskTags: string[];
  scope: Scope;
}
export interface Lesson extends Common {
  kind: 'lesson';
  observation: string;
  attempt: string;
  outcome: string;
  hypothesis?: string;
  nextCheck: string;
  sourceRef?: string;
}
export interface Procedure extends Common {
  kind: 'procedure';
  title: string;
  preconditions: string[];
  steps: string[];
  expectedChecks: string[];
  lessonIds: string[];
}
export type Draft = Lesson | Procedure;
export type RecordEntry = Draft & {
  schemaVersion: 1;
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  state: 'active' | 'draft' | 'verified' | 'retired';
  evidence: Evidence[];
  retireReason?: string;
};
export const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
export const label = /^[a-z0-9][a-z0-9._-]{0,79}$/;
export const runIdentifier = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
export const digest = /^[0-9a-f]{64}$/;
const levels = ['host', 'guest', 'interactive'];
const secret = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:gh[pousr]_[a-z0-9]{20,}|sk-(?:proj-)?[a-z0-9_-]{24,}|AKIA[A-Z0-9]{16})\b|(?:password|api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*\S{8,}/i;

export function object(value: unknown, fields?: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected JSON object');
  if (fields && Object.keys(value).some(key => !fields.includes(key))) throw new Error('Unexpected learning field');
  return value as Record<string, unknown>;
}

export function string(value: unknown, pattern?: RegExp): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048 || secret.test(value) || (pattern && !pattern.test(value))) {
    throw new Error('Invalid or sensitive learning value');
  }
  return value;
}

export function strings(value: unknown, pattern?: RegExp, required = false): string[] {
  if (!Array.isArray(value) || value.length > 32 || (required && value.length === 0)) throw new Error('Invalid learning list');
  const items = value.map(item => string(item, pattern));
  if (new Set(items).size !== items.length) throw new Error('Duplicate learning list entry');
  return items;
}

export function date(value: unknown): string {
  const iso = string(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?Z$/.test(iso) || !Number.isFinite(Date.parse(iso))) {
    throw new Error('Expected ISO UTC timestamp');
  }
  const normalized = new Date(iso).toISOString();
  if (normalized.slice(0,19) !== iso.slice(0,19)) throw new Error('Invalid calendar date');
  return normalized;
}

export function parseScope(value: unknown): Scope {
  const s = object(value, ['platform', 'taskKind', 'targetKind', 'toolVersions', 'capabilities', 'evidenceLevel']);
  if (typeof s.evidenceLevel !== 'string' || !levels.includes(s.evidenceLevel)) throw new Error('Invalid evidence level');
  const versions = Object.entries(s.toolVersions === undefined ? {} : object(s.toolVersions));
  if (versions.length > 16) throw new Error('Too many tool versions');
  return {
    platform: string(s.platform, label),
    taskKind: string(s.taskKind, label),
    ...(s.targetKind === undefined ? {} : { targetKind: string(s.targetKind, label) }),
    toolVersions: Object.fromEntries(versions.map(([k,v]) => [string(k, label), string(v)]).sort(([a],[b]) => a.localeCompare(b))),
    capabilities: strings(s.capabilities ?? [], label).sort(),
    evidenceLevel: s.evidenceLevel as Level,
  };
}

const commonKeys = ['kind', 'skillId', 'taskTags', 'scope'];
const lessonKeys = ['observation', 'attempt', 'outcome', 'hypothesis', 'nextCheck', 'sourceRef'];
const procedureKeys = ['title', 'preconditions', 'steps', 'expectedChecks', 'lessonIds'];
const systemKeys = ['schemaVersion', 'id', 'revision', 'createdAt', 'updatedAt', 'state', 'evidence', 'retireReason'];

export function parseDraft(value: unknown): Draft {
  const kind = object(value).kind;
  if (kind !== 'lesson' && kind !== 'procedure') throw new Error('Invalid learning kind');
  const r = object(value, [...commonKeys, ...(kind === 'lesson' ? lessonKeys : procedureKeys)]);
  const common = { skillId: string(r.skillId, label), taskTags: strings(r.taskTags, label, true).sort(), scope: parseScope(r.scope) };
  if (kind === 'lesson') {
    return { ...common, kind, observation: string(r.observation), attempt: string(r.attempt), outcome: string(r.outcome),
      ...(r.hypothesis === undefined ? {} : { hypothesis: string(r.hypothesis) }),
      nextCheck: string(r.nextCheck), ...(r.sourceRef === undefined ? {} : { sourceRef: string(r.sourceRef, label) }) };
  }
  return { ...common, kind, title: string(r.title), preconditions: strings(r.preconditions),
    steps: strings(r.steps, undefined, true), expectedChecks: strings(r.expectedChecks, label, true), lessonIds: strings(r.lessonIds ?? [], uuid) };
}

export function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function draftOf(entry: RecordEntry): Draft {
  return parseDraft(Object.fromEntries(Object.entries(entry).filter(([key]) => !systemKeys.includes(key))));
}

export function parseEntry(value: unknown): RecordEntry {
  const r = object(value);
  const draft = parseDraft(Object.fromEntries(Object.entries(r).filter(([key]) => !systemKeys.includes(key))));
  const allowed = draft.kind === 'lesson' ? ['active', 'retired'] : ['draft', 'verified', 'retired'];
  if (r.schemaVersion !== 1 || !Number.isSafeInteger(r.revision) || Number(r.revision) < 1 ||
      typeof r.state !== 'string' || !allowed.includes(r.state)) {
    throw new Error('Invalid learning revision or state');
  }
  if (!Array.isArray(r.evidence) || r.evidence.length > 32) throw new Error('Invalid evidence history');
  const evidence = r.evidence.map(value => {
    const e = object(value, ['kind','runId','sourceFingerprint','procedureDigest','observedAt','checks','reportDigest']);
    if (typeof e.kind !== 'string' || !levels.includes(e.kind)) throw new Error('Invalid evidence kind');
    return { kind: e.kind as Level, runId: string(e.runId, runIdentifier), sourceFingerprint: string(e.sourceFingerprint, digest),
      procedureDigest: string(e.procedureDigest, digest), observedAt: date(e.observedAt), checks: strings(e.checks, label, true), reportDigest: string(e.reportDigest, digest) };
  });
  if (draft.kind === 'lesson' && evidence.length) throw new Error('Lessons cannot carry verification evidence');
  if (r.state === 'verified' && draft.kind === 'procedure' && !evidence.some(e =>
    e.kind === draft.scope.evidenceLevel && e.procedureDigest === hash(draft) && draft.expectedChecks.every(check => e.checks.includes(check)))) {
    throw new Error('Verified procedure lacks matching evidence');
  }
  return { ...draft, schemaVersion: 1, id: string(r.id, uuid), revision: Number(r.revision), state: r.state as RecordEntry['state'],
    createdAt: date(r.createdAt), updatedAt: date(r.updatedAt), evidence,
    ...(r.retireReason === undefined ? {} : { retireReason: string(r.retireReason) }) };
}

export async function readJson(path: string, limit = 64 * 1024): Promise<unknown> {
  const handle = await open(path, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limit) throw new Error('Learning input exceeds limits');
    const buffer = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > limit) throw new Error('Learning input exceeds limits');
    try { return JSON.parse(buffer.subarray(0, length).toString('utf8').replace(/^\uFEFF/, '')); }
    catch { throw new Error('Invalid learning JSON'); }
  } finally { await handle.close(); }
}
