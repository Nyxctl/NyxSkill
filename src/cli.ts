#!/usr/bin/env node
import { readFile, readdir, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { loadRegistry } from './registry.js';
import { routeRequest } from './router.js';
import { validateRegistry } from './validation.js';
import { readDataFile } from './data.js';
import type { Runtime } from './types.js';
import { buildRuntime, buildAllRuntimes } from './adapters/index.js';
import { buildIndex, indexStatus } from './indexer.js';
import { syncCheck } from './sync.js';
import { buildNyxPack, verifyNyxPack, installNyxPack, removeNyxPack } from './packs.js';

const args = process.argv.slice(2);

function takeFlag(name: string): boolean {
  const i = args.indexOf(name);
  if (i >= 0) { args.splice(i, 1); return true; }
  return false;
}
function takeOption(name: string): string | undefined {
  const i = args.indexOf(name);
  if (i >= 0) {
    const value = args[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
    args.splice(i, 2); return value;
  }
  return undefined;
}
function takeManyOption(name: string): string[] {
  const values: string[] = [];
  while (args.includes(name)) { const value = takeOption(name); if (value) values.push(...value.split(',').map(v => v.trim()).filter(Boolean)); }
  return values;
}
function printJson(value: unknown): void { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }
function humanList(title: string, rows: Array<{ id: string; name?: string; extra?: string }>): void {
  console.log(`${title} (${rows.length})`);
  for (const row of rows) console.log(`- ${row.id}${row.name ? ` — ${row.name}` : ''}${row.extra ? ` [${row.extra}]` : ''}`);
}
function usage(): void {
  console.log(`NyxSkill 1.0.0\n\nUsage: nyxskill [--root PATH] <command>\n\nDiscovery:\n  list [--json]\n  search <query> [--json]\n  inspect <skill-id> [--json]\n  route <request> [--profile p] [--use id] [--runtime name] [--explain] [--json]\n\nValidation:\n  validate [--all] [--json]\n  conflicts [--json]\n  audit [--json]\n  doctor [--json]\n  test [--json]\n\nCatalog:\n  profile list|inspect <id> [--json]\n  pack list|inspect <id> [--json]\n  provenance <skill-id> [--json]\n  sources [--json]\n  licenses [--json]\n\nRuntime & packs:\n  build --runtime <name>|--all [--out DIR]\n  install --runtime <name> [--out DIR]\n  index rebuild|status\n  sync --check\n  pack build <dir> <file.nyxpack>\n  pack verify <file.nyxpack>\n  pack add <file.nyxpack> [--store DIR]\n  pack remove <pack-id> [--store DIR]\n`);
}

async function fileExists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }

async function main(): Promise<void> {
  const rootOption = takeOption('--root');
  const json = takeFlag('--json');
  const explain = takeFlag('--explain');
  const root = resolve(rootOption ?? process.cwd());
  const command = args.shift();
  if (!command || command === 'help' || command === '--help' || command === '-h') { usage(); return; }
  if (command === '--version' || command === 'version') { console.log('1.0.0'); return; }

  const registry = await loadRegistry(root);

  if (command === 'list') {
    const skills = registry.skills.map(s => ({ id: s.meta.id, name: s.meta.name, type: s.meta.type, category: s.meta.category, profiles: s.meta.profiles }));
    if (json) printJson({ skills }); else humanList('Skills', skills.map(s => ({ id: s.id, name: s.name, extra: `${s.type}; ${s.profiles.join(',')}` })));
    return;
  }

  if (command === 'search') {
    const query = args.join(' ').trim().toLowerCase();
    if (!query) throw new Error('search requires a query');
    const skills = registry.skills.filter(s => {
      const hay = [s.meta.id, s.meta.name, s.meta.description, ...s.meta.routing.triggers.keywords, ...s.meta.routing.triggers.intents].join(' ').toLowerCase();
      return query.split(/\s+/).every(part => hay.includes(part));
    }).map(s => ({ id: s.meta.id, name: s.meta.name, description: s.meta.description }));
    if (json) printJson({ query, skills }); else humanList(`Search: ${query}`, skills);
    return;
  }

  if (command === 'inspect') {
    const id = args.shift(); if (!id) throw new Error('inspect requires a skill id');
    const skill = registry.skills.find(s => s.meta.id === id); if (!skill) throw new Error(`skill not found: ${id}`);
    const document = await readFile(skill.document, 'utf8');
    if (json) printJson({ meta: skill.meta, document, path: skill.relativePath });
    else { console.log(`${skill.meta.id} — ${skill.meta.name}\n${skill.meta.description}\n\nMetadata: ${skill.relativePath}\n\n${document}`); }
    return;
  }

  if (command === 'route') {
    const runtime = takeOption('--runtime') as Runtime | undefined;
    const profiles = takeManyOption('--profile');
    const use = takeManyOption('--use');
    const capabilities = takeManyOption('--cap');
    const request = args.join(' ').trim(); if (!request) throw new Error('route requires a request');
    const result = routeRequest(registry, request, { runtime, profiles: profiles.length ? profiles : undefined, use: use.length ? use : undefined, capabilities: capabilities.length ? capabilities : undefined });
    if (json) printJson(result);
    else {
      console.log(`Profiles: ${result.profiles.join(', ') || '(none)'}\nIntents: ${result.intents.join(', ') || '(none)'}`);
      console.log('Chain:'); for (const step of result.chain) console.log(`  ${step.id} (${step.type}, score=${step.score})`);
      if (explain) { console.log('Rejected:'); for (const r of result.rejected) console.log(`  ${r.id}: ${r.reason}`); }
    }
    return;
  }

  if (command === 'validate') {
    const report = validateRegistry(registry);
    if (json) printJson(report);
    else {
      if (report.ok) console.log(`NyxSkill registry valid: ${registry.skills.length} skills, ${registry.packs.length} packs, ${registry.profiles.length} profiles.`);
      for (const issue of report.issues) console.log(`${issue.severity.toUpperCase()} ${issue.code}${issue.subject ? ` [${issue.subject}]` : ''}: ${issue.message}`);
    }
    if (!report.ok) process.exitCode = 1;
    return;
  }

  if (command === 'conflicts') {
    const groups = new Map<string, string[]>();
    const declared: Array<{ skill: string; conflictsWith: string }> = [];
    for (const record of registry.skills) {
      const g = record.meta.routing.exclusive_group;
      if (g) { if (!groups.has(g)) groups.set(g, []); groups.get(g)!.push(record.meta.id); }
      for (const c of record.meta.conflicts_with) declared.push({ skill: record.meta.id, conflictsWith: c });
    }
    const result = { exclusiveGroups: [...groups.entries()].map(([group, skills]) => ({ group, skills: skills.sort() })).sort((a,b)=>a.group.localeCompare(b.group)), declared };
    if (json) printJson(result); else {
      console.log('Exclusive groups:'); for (const g of result.exclusiveGroups) console.log(`- ${g.group}: ${g.skills.join(', ')}`);
      console.log(`Declared conflicts: ${declared.length}`);
    }
    return;
  }

  if (command === 'audit' || command === 'test') {
    const report = validateRegistry(registry);
    const provenanceMissing = registry.skills.filter(s => !s.meta.provenance.license || (s.meta.provenance.origin === 'adapted' && !s.meta.provenance.source)).map(s => s.meta.id);
    const result = { ok: report.ok && provenanceMissing.length === 0, validation: report, provenanceMissing, counts: { skills: registry.skills.length, packs: registry.packs.length, profiles: registry.profiles.length } };
    if (json) printJson(result); else console.log(result.ok ? `PASS: ${registry.skills.length} skills validated and provenance-complete.` : `FAIL: ${report.issues.length} validation issues, ${provenanceMissing.length} provenance gaps.`);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (command === 'doctor') {
    const report = validateRegistry(registry);
    const lock = await fileExists(join(root, 'nyxskill.lock'));
    const notices = await fileExists(join(root, 'THIRD_PARTY_NOTICES.md'));
    const result = { ok: report.ok && lock && notices, node: process.version, root, skills: registry.skills.length, packs: registry.packs.length, profiles: registry.profiles.length, lockfile: lock, thirdPartyNotices: notices, validationIssues: report.issues.length };
    if (json) printJson(result); else {
      console.log(`NyxSkill doctor: ${result.ok ? 'OK' : 'ISSUES'}`);
      console.log(`Node ${result.node}; skills=${result.skills}; packs=${result.packs}; profiles=${result.profiles}`);
      console.log(`${lock ? '✓' : '✗'} nyxskill.lock\n${notices ? '✓' : '✗'} THIRD_PARTY_NOTICES.md\n${report.ok ? '✓' : '✗'} registry validation`);
    }
    if (!result.ok) process.exitCode = 1;
    return;
  }


  if (command === 'build' || command === 'install') {
    const runtime = takeOption('--runtime') as Runtime | undefined;
    const all = takeFlag('--all');
    const out = resolve(takeOption('--out') ?? join(root, 'dist', 'runtimes'));
    if (command === 'install' && !runtime) throw new Error('install requires --runtime');
    if (!all && !runtime) throw new Error('build requires --runtime <name> or --all');
    const results = all ? await buildAllRuntimes(root, out) : [await buildRuntime(root, runtime!, out)];
    if (json) printJson({ results });
    else {
      for (const r of results) console.log(`${r.runtime}: ${r.output}\n  skills: ${r.skillsPath}`);
      if (command === 'install') console.log('No runtime configuration was changed automatically. Point the runtime at the generated skills path.');
    }
    return;
  }

  if (command === 'index') {
    const sub = args.shift() ?? 'status';
    if (sub === 'rebuild') { const result = await buildIndex(root); if (json) printJson(result); else console.log(`Index rebuilt: skills=${result.skills}, rebuilt=${result.rebuilt}, reused=${result.reused}\n${result.path}`); return; }
    if (sub === 'status') { const result = await indexStatus(root); if (json) printJson(result); else console.log(result.exists ? `Index: ${result.skills} skills at ${result.path}` : `Index not built: ${result.path}`); return; }
    throw new Error(`unknown index command: ${sub}`);
  }

  if (command === 'sync') {
    const check = takeFlag('--check');
    if (!check) throw new Error('v1 controlled sync requires --check; it never updates silently');
    const result = await syncCheck(root);
    if (json) printJson(result); else {
      console.log('Controlled sync check (read-only):');
      for (const source of result.sources) console.log(`- ${source.id}: ${source.status}${source.archive ? ` (${source.archive})` : ''}`);
      console.log('No local files modified.');
    }
    return;
  }

  if (command === 'profile') {
    const sub = args.shift() ?? 'list';
    if (sub === 'list') { if (json) printJson({ profiles: registry.profiles }); else humanList('Profiles', registry.profiles); return; }
    if (sub === 'inspect') { const id=args.shift(); const p=registry.profiles.find(x=>x.id===id); if(!p) throw new Error(`profile not found: ${id}`); if(json) printJson(p); else console.log(JSON.stringify(p,null,2)); return; }
    throw new Error(`unknown profile command: ${sub}`);
  }

  if (command === 'pack') {
    const sub = args.shift() ?? 'list';
    if (sub === 'list') { if (json) printJson({ packs: registry.packs }); else humanList('Packs', registry.packs); return; }
    if (sub === 'inspect') { const id=args.shift(); const p=registry.packs.find(x=>x.id===id); if(!p) throw new Error(`pack not found: ${id}`); if(json) printJson(p); else console.log(JSON.stringify(p,null,2)); return; }
    if (sub === 'build') { const src=args.shift(), out=args.shift(); if(!src||!out) throw new Error('pack build requires <dir> <file.nyxpack>'); await buildNyxPack(resolve(src),resolve(out)); const report=await verifyNyxPack(resolve(out)); if(json) printJson(report); else console.log(`Built ${out}: ${report.pack.id}, ${report.skills.length} skills, sha256=${report.sha256}`); return; }
    if (sub === 'verify') { const file=args.shift(); if(!file) throw new Error('pack verify requires a .nyxpack file'); const report=await verifyNyxPack(resolve(file)); if(json) printJson(report); else { console.log(`${report.ok?'PASS':'FAIL'} ${report.pack.id} (${report.skills.length} skills)`); for(const issue of report.issues) console.log(`- ${issue}`); } if(!report.ok) process.exitCode=1; return; }
    if (sub === 'add') { const file=args.shift(); if(!file) throw new Error('pack add requires a .nyxpack file'); const store=resolve(takeOption('--store')??join(homedir(),'.nyxskill','packs')); const result=await installNyxPack(resolve(file),store); if(json) printJson(result); else console.log(`Installed ${result.packId} to ${result.path}`); return; }
    if (sub === 'remove') { const id=args.shift(); if(!id) throw new Error('pack remove requires a pack id'); const store=resolve(takeOption('--store')??join(homedir(),'.nyxskill','packs')); await removeNyxPack(id,store); if(json) printJson({removed:id,store}); else console.log(`Removed ${id} from ${store}`); return; }
    throw new Error(`unknown pack command: ${sub}`);
  }

  if (command === 'provenance') {
    const id = args.shift(); if (!id) throw new Error('provenance requires a skill id');
    const path = join(root, 'provenance', 'skills', `${id}.yaml`);
    const data = await readDataFile(path);
    if (json) printJson(data); else console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (command === 'sources') {
    const data = await readDataFile(join(root, 'provenance', 'sources.yaml'));
    if (json) printJson(data); else console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (command === 'licenses') {
    const dir = join(root, 'licenses');
    const files = (await readdir(dir)).sort();
    if (json) printJson({ licenses: files }); else humanList('Licenses', files.map(id => ({ id })));
    return;
  }

  throw new Error(`unknown command: ${command}`);
}

main().catch(error => {
  console.error(`NyxSkill error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
