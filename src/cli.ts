#!/usr/bin/env node
import { inspectGraphify, inspectOmniRoute, probeOmniRouteHealth } from './integrations.js';
import { validateDocuments } from './documents.js';
import { parseCapabilityInventory, planCapabilities } from './capability-router.js';
import { discoverCodexPlugins } from './codex-discovery.js';
import { writeFile } from 'node:fs/promises';
import { VERSION } from './version.js';
import { buildPlugins, verifyPlugin, installPlugin, removePlugin, discoverPlugins } from './plugins.js';
import { readFile, readdir, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { loadRegistry } from './registry.js';
import { routeRequest } from './router.js';
import { validateRegistry } from './validation.js';
import { assertProjectPolicy } from './schema.js';
import { readDataFile } from './data.js';
import type { Runtime } from './types.js';
import { buildRuntime, buildAllRuntimes } from './adapters/index.js';
import { buildIndex, indexStatus } from './indexer.js';
import { syncCheck } from './sync.js';
import { LearningStore } from './learning/store.js';
import { draftOf, hash, label, object, parseDraft, parseScope, readJson, string } from './learning/records.js';
import { retrieve, verifyEvidence } from './learning/workflow.js';
import { propose } from './learning/proposal.js';
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
  console.log(`NyxSkill ${VERSION}\n\nUsage: nyxskill [--root PATH] <command>\n\nDiscovery:\n  capability discover [--tools FILE] [--out NEW_FILE]\n  capability inspect --inventory FILE\n  capability route REQUEST --inventory FILE [--provider NAME]\n  list [--json]\n  search <query> [--json]\n  inspect <skill-id> [--json]\n  route <request> [--profile p] [--use id] [--runtime name] [--explain] [--json]\n\nLearning:\n  learn record --from FILE [--project PATH]\n  learn list|show|verify|revise|retire|propose|recover\n  route REQUEST --learning --project PATH [--learning-scope FILE] [--learning-tag TAG]\n\nValidation:\n  validate [--all] [--json]\n  conflicts [--json]\n  audit [--json]\n  doctor [--json]\n  test [--json]\n\nCatalog:\n  profile list|inspect <id> [--json]\n  pack list|inspect <id> [--json]\n  provenance <skill-id> [--json]\n  sources [--json]\n  licenses [--json]\n\nRuntime & packs:\n  integration graphify --enable --graph FILE --schema VERSION\n  integration omniroute --enable --manifest FILE\n  integration omniroute-health --enable --allow-network --url http://127.0.0.1:PORT\n  plugin build --out DIR [--pack ID]\n  plugin verify DIR\n  plugin install DIR --store DIR [--update]\n  plugin list|remove NAME --store DIR\n  build --runtime <name>|--all [--out DIR]\n  install --runtime <name> [--out DIR]\n  index rebuild|status\n  sync --check\n  pack build <dir> <file.nyxpack>\n  pack verify <file.nyxpack>\n  pack add <file.nyxpack> [--store DIR]\n  pack remove <pack-id> [--store DIR]\n`);
}

async function fileExists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }

async function main(): Promise<void> {
  const rootOption = takeOption('--root');
  const json = takeFlag('--json');
  const explain = takeFlag('--explain');
  const root = resolve(rootOption ?? process.cwd());
  const command = args.shift();
  if (!command || command === 'help' || command === '--help' || command === '-h') { usage(); return; }
  if (command === '--version' || command === 'version') { console.log(VERSION); return; }

  const registry = await loadRegistry(root);

  if (command === 'learn') {
    const sub = args.shift();
    const store = new LearningStore(takeOption('--project') ?? process.cwd());
    if (sub === 'list') { printJson(await store.list()); return; }
    if (sub === 'recover') {
      await store.recover(takeOption('--token') ?? '');
      printJson({ recovered: true });
      return;
    }
    const from = () => {
      const file = takeOption('--from');
      if (!file) throw new Error('--from FILE is required');
      return readJson(resolve(file));
    };
    if (sub === 'record') {
      const warning = await store.gitWarning();
      if (warning) console.error(warning);
      printJson(await store.record(await from()));
      return;
    }
    const id = args.shift();
    if (!id) throw new Error('Learning record ID is required');
    const history = await store.history(id);
    const current = history.at(-1);
    if (!current) throw new Error('Learning record not found');
    if (sub === 'show') { printJson({ record: current, procedureDigest: hash(draftOf(current)), history }); return; }
    if (sub === 'propose') { printJson(await propose(current, registry)); return; }
    const requested = takeOption('--revision');
    const revision = requested === undefined ? current.revision : Number(requested);
    if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('Invalid expected revision');
    if (sub === 'verify') {
      const file = takeOption('--evidence'), expected = takeOption('--expected');
      if (!file || !expected) throw new Error('learn verify requires --evidence FILE and --expected FILE');
      const evidence = await readJson(resolve(file), 2 * 1024 * 1024);
      const expectation = await readJson(resolve(expected));
      printJson(await store.change(id,revision,(entry, entries) => verifyEvidence(entry, entries, evidence, expectation)));
      return;
    }
    if (sub === 'revise') {
      const draft = parseDraft(await from());
      printJson(await store.change(id,revision,entry => {
        if (entry.state === 'retired' || draft.kind !== entry.kind || draft.skillId !== entry.skillId) throw new Error('Revision must preserve the active record identity');
        if (hash(draft) === hash(draftOf(entry))) return entry;
        return { ...draft, schemaVersion: 1, id: entry.id, revision: entry.revision, createdAt: entry.createdAt,
          updatedAt: entry.updatedAt, state: draft.kind === 'procedure' ? 'draft' : 'active', evidence: [] };
      }));
      return;
    }
    if (sub === 'retire') {
      const reason = string(takeOption('--reason'));
      printJson(await store.change(id,revision,entry => entry.state === 'retired' ? entry : { ...entry, state: 'retired', retireReason: reason }));
      return;
    }
    throw new Error('Use learn record, list, show, verify, revise, retire, propose or recover');
  }

  if (command === 'capability') {
    const sub=args.shift() ?? 'inspect';
    const inventoryPath=takeOption('--inventory');
    if(sub === 'discover') {
      const toolsPath=takeOption('--tools');
      const supplied=toolsPath ? JSON.parse(await readFile(resolve(toolsPath),'utf8')) : {};
      const inventory=await discoverCodexPlugins(supplied.tools ?? []);
      if(supplied.builtins) inventory.builtins=supplied.builtins;
      const checked=parseCapabilityInventory(inventory);
      const out=takeOption('--out'); if(out) await writeFile(resolve(out),JSON.stringify(checked,null,2)+'\n',{flag:'wx'});
      printJson(checked); return;
    }
    if(!inventoryPath) throw new Error('capability requires --inventory FILE; installed plugins alone do not prove tools/auth readiness');
    const inventory=parseCapabilityInventory(JSON.parse(await readFile(resolve(inventoryPath),'utf8')));
    if(sub === 'inspect') {printJson(inventory);return;}
    if(sub === 'route') {
      const explicitProvider=takeOption('--provider');
      const authorizedWrite=takeFlag('--authorized-write'),authorizedPublish=takeFlag('--authorized-publish'),authorizedMessaging=takeFlag('--authorized-messaging');
      const request=args.join(' ').trim();if(!request)throw new Error('capability route requires a request');
      printJson(planCapabilities(request,inventory,{explicitProvider,authorizedWrite,authorizedPublish,authorizedMessaging}));return;
    }
    throw new Error(`unknown capability command: ${sub}`);
  }

  if (command === 'integration') {
    const name=args.shift(); const enabled=takeFlag('--enable');
    if (name === 'graphify') {
      printJson(await inspectGraphify({ enabled, graphPath:takeOption('--graph'), supportedSchemaVersions:takeManyOption('--schema') })); return;
    }
    if (name === 'omniroute') {
      printJson(await inspectOmniRoute({ enabled, manifestPath:takeOption('--manifest') })); return;
    }
    if (name === 'omniroute-health') {
      printJson(await probeOmniRouteHealth({ enabled, networkApproved:takeFlag('--allow-network'), baseUrl:takeOption('--url') })); return;
    }
    throw new Error('integration requires graphify, omniroute or omniroute-health');
  }

  if (command === 'plugin') {
    const sub = args.shift() ?? 'list';
    if (sub === 'build') {
      const out = takeOption('--out'); if (!out) throw new Error('plugin build requires --out <new-directory>');
      const packIds = takeManyOption('--pack');
      printJson(await buildPlugins(root, resolve(out), { packIds: packIds.length ? packIds : undefined })); return;
    }
    if (sub === 'verify') {
      const path=args.shift(); if (!path) throw new Error('plugin verify requires a directory');
      const result=await verifyPlugin(resolve(path)); printJson(result); if (!result.ok) process.exitCode=1; return;
    }
    const store=takeOption('--store'); if (!store) throw new Error('plugin lifecycle requires --store <explicit-directory>');
    if (sub === 'list') { printJson(await discoverPlugins(resolve(store))); return; }
    if (sub === 'install') {
      const path=args.shift(); if (!path) throw new Error('plugin install requires a source directory');
      printJson(await installPlugin(resolve(path),resolve(store),{ update:takeFlag('--update') })); return;
    }
    if (sub === 'remove') {
      const name=args.shift(); if (!name) throw new Error('plugin remove requires a name');
      await removePlugin(name,resolve(store)); printJson({removed:name}); return;
    }
    throw new Error(`unknown plugin command: ${sub}`);
  }

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
    const learningEnabled = takeFlag('--learning');
    const projectPath = takeOption('--project');
    const learningScope = takeOption('--learning-scope');
    const learningTags = takeManyOption('--learning-tag').map(tag => string(tag, label));
    const project = resolve(projectPath ?? (learningEnabled ? process.cwd() : root));
    const inventoryPath=takeOption('--inventory');
    const runtime = takeOption('--runtime') as Runtime | undefined;
    const profiles = takeManyOption('--profile');
    const use = takeManyOption('--use');
    const capabilities = takeManyOption('--cap');
    const policyPath=takeOption('--policy');
    const policy=policyPath ? assertProjectPolicy(await readDataFile(resolve(policyPath))) : undefined;
    const request = args.join(' ').trim(); if (!request) throw new Error('route requires a request');
    const result = routeRequest(registry, request, { runtime, policy, profiles: profiles.length ? profiles : undefined, use: use.length ? use : undefined, capabilities: capabilities.length ? capabilities : undefined });
    const capabilityPlan=inventoryPath ? planCapabilities(request,parseCapabilityInventory(JSON.parse(await readFile(resolve(inventoryPath),'utf8')))) : undefined;
    let learning;
    if (learningEnabled) {
      const scope = learningScope ? parseScope(object(await readJson(resolve(learningScope)))) : undefined;
      try {
        const stored = await new LearningStore(project).list();
        const match = retrieve(stored.records, { ...scope, platform: scope?.platform ?? process.platform,
          skillIds: result.chain.map(step => step.id), tags: [...result.intents, ...learningTags], capabilities: scope?.capabilities ?? capabilities });
        learning = { ...match, diagnostics: [...stored.diagnostics, ...match.diagnostics] };
      } catch { learning = { lesson: null, procedure: null, diagnostics: ['Learning store unavailable'] }; }
    }
    if (json) printJson({...result,...(capabilityPlan?{capabilities:capabilityPlan}:{}),...(learning?{learning}:{})});
    else {
      if(capabilityPlan) printJson({capabilities:capabilityPlan});
      if(learning) printJson({learning});
      console.log(`Profiles: ${result.profiles.join(', ') || '(none)'}\nIntents: ${result.intents.join(', ') || '(none)'}`);
      console.log('Chain:'); for (const step of result.chain) console.log(`  ${step.id} (${step.type}, score=${step.score})`);
      if (explain) { console.log('Rejected:'); for (const r of result.rejected) console.log(`  ${r.id}: ${r.reason}`); }
    }
    return;
  }

  if (command === 'validate') {
    const report = validateRegistry(registry);
    report.issues.push(...await validateDocuments(registry));
    report.ok = !report.issues.some(i=>i.severity==='error');
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
