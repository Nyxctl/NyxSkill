import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { hostname } from 'node:os';
import { link, lstat, mkdir, readdir, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { noLinks } from '../plugins.js';
import { draftOf, hash, object, parseDraft, parseEntry, readJson, string, uuid, type RecordEntry } from './records.js';

const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';
const occupied = (error: unknown) => (error as NodeJS.ErrnoException).code === 'EEXIST';
const maxRecords = 500;
const git = promisify(execFile);

async function names(path: string): Promise<string[]> {
  await noLinks(path);
  try { return (await readdir(path)).sort(); } catch (error) {
    if (missing(error)) return [];
    throw error;
  }
}

export class LearningStore {
  readonly path: string;
  private readonly project: string;

  constructor(project: string) {
    this.project = resolve(project);
    this.path = join(this.project, '.nyxskill', 'learning', 'v1');
  }

  async gitWarning(): Promise<string | undefined> {
    const options = { cwd: this.project, timeout: 2000, windowsHide: true };
    try { await git('git', ['rev-parse', '--show-toplevel'], options); } catch { return; }
    try { await git('git', ['check-ignore', '--no-index', '-q', '.nyxskill/learning/v1/'], options); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === '1' || Number((error as NodeJS.ErrnoException).code) === 1) {
        return 'Learning store is not ignored in this Git project. Add .nyxskill/learning/ to the project ignore rules.';
      }
    }
  }

  async history(id: string): Promise<RecordEntry[]> {
    const path = join(this.path, string(id, uuid));
    const files = (await names(path)).filter(name => /^[1-9]\d*\.json$/.test(name));
    if (files.length > 128) throw new Error('Learning history exceeds limit');
    const entries: RecordEntry[] = [];
    for (const file of files) {
      const source = join(path, file);
      await noLinks(source);
      const entry = parseEntry(await readJson(source));
      if (entry.id !== id || file !== entry.revision + '.json') throw new Error('Learning revision identity mismatch');
      entries.push(entry);
    }
    entries.sort((a,b) => a.revision - b.revision);
    if (entries.some((entry, index) => entry.revision !== index + 1 || entry.kind !== entries[0].kind || entry.createdAt !== entries[0].createdAt)) {
      throw new Error('Invalid learning history');
    }
    return entries;
  }

  async list(): Promise<{ records: RecordEntry[]; diagnostics: string[] }> {
    const records: RecordEntry[] = [];
    const diagnostics: string[] = [];
    const ids = (await names(this.path)).filter(id => uuid.test(id));
    if (ids.length > maxRecords) diagnostics.push('Learning record limit exceeded');
    for (const id of ids.slice(0,maxRecords)) {
      try {
        const dir = join(this.path, id);
        const revisions = (await names(dir)).filter(name => /^[1-9]\d*\.json$/.test(name));
        if (revisions.length > 128) throw new Error('Too many revisions');
        const latest = revisions.sort((a,b) => parseInt(b) - parseInt(a))[0];
        if (!latest) continue;
        const file = join(dir, latest);
        await noLinks(file);
        const entry = parseEntry(await readJson(file));
        if (entry.id !== id || latest !== entry.revision + '.json' || revisions.length !== entry.revision) {
          throw new Error('Invalid learning revision');
        }
        if (entry) records.push(entry);
      } catch { diagnostics.push('Unreadable learning record: ' + id); }
    }
    return { records, diagnostics };
  }

  private async publish(entry: RecordEntry): Promise<RecordEntry> {
    const checked = parseEntry(entry);
    const text = JSON.stringify(checked, null, 2) + '\n';
    if (Buffer.byteLength(text) > 64 * 1024) throw new Error('Learning record exceeds size limit');
    const dir = join(this.path, entry.id);
    await noLinks(dir);
    await mkdir(dir, { recursive: true });
    const temporary = join(dir, '.' + randomUUID() + '.tmp');
    const target = join(dir, entry.revision + '.json');
    await writeFile(temporary, text, { flag: 'wx' });
    try {
      // A hard link publishes complete bytes and fails if the revision already exists.
      await link(temporary, target);
    } finally { await unlink(temporary); }
    return checked;
  }

  private async locked<T>(action: () => Promise<T>): Promise<T> {
    await noLinks(this.path);
    if (!(await lstat(this.project)).isDirectory()) throw new Error('Learning project must be an existing directory');
    await mkdir(this.path, { recursive: true });
    const lock = join(this.path, '.lock');
    try { await mkdir(lock); } catch (error) {
      if (occupied(error)) throw new Error('Learning store busy; inspect the lock before recovery');
      throw error;
    }
    const owner = join(lock, 'owner.json');
    try {
      await writeFile(owner, JSON.stringify({ pid: process.pid, host: hostname(), token: randomUUID() }), { flag: 'wx' });
      return await action();
    } finally {
      try { await unlink(owner); } catch (error) { if (!missing(error)) throw error; }
      await rmdir(lock);
    }
  }

  async recover(token: string): Promise<void> {
    await noLinks(this.path);
    const recovery = join(this.path, '.recovery');
    await mkdir(recovery);
    try { await this.recoverLocked(token); } finally { await rmdir(recovery); }
  }

  private async recoverLocked(token: string): Promise<void> {
    const lock = join(this.path, '.lock');
    const owner = join(lock, 'owner.json');
    await noLinks(owner);
    const data = object(await readJson(owner));
    if (data.token !== string(token, uuid) || data.host !== hostname() || !Number.isSafeInteger(data.pid) || Number(data.pid) <= 0) {
      throw new Error('Lock ownership cannot be established');
    }
    try { process.kill(Number(data.pid), 0); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
      const quarantine = join(this.path, '.recovered-' + randomUUID());
      await rename(lock, quarantine);
      return;
    }
    throw new Error('Lock owner is still running');
  }

  async record(input: unknown): Promise<RecordEntry> {
    const draft = parseDraft(input);
    return this.locked(async () => {
      const existing = await this.list();
      const fingerprint = hash(draft);
      const duplicate = existing.records.find(entry => entry.state !== 'retired' && hash(draftOf(entry)) === fingerprint);
      if (duplicate) return duplicate;
      if ((await names(this.path)).filter(id => uuid.test(id)).length >= maxRecords) throw new Error('Learning store limit reached');
      const now = new Date().toISOString();
      return this.publish({ ...draft, schemaVersion: 1, id: randomUUID(), revision: 1, createdAt: now, updatedAt: now,
        state: draft.kind === 'lesson' ? 'active' : 'draft', evidence: [] });
    });
  }

  async change(id: string, expectedRevision: number, mutate: (entry: RecordEntry, history: RecordEntry[]) => RecordEntry): Promise<RecordEntry> {
    return this.locked(async () => {
      const history = await this.history(id);
      const current = history.at(-1);
      if (!current || current.revision !== expectedRevision) throw new Error('Learning revision conflict');
      const changed = mutate(current, history);
      if (changed === current) return current;
      if (current.revision >= 128) throw new Error('Learning revision limit reached');
      return this.publish({ ...changed, id, revision: current.revision + 1, createdAt: current.createdAt, updatedAt: new Date().toISOString() });
    });
  }
}
