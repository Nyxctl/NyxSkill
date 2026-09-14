import type { Registry, SkillRecord } from './registry.js';
import { inferIntents, resolveProfiles } from './profiles.js';
import type { ProjectPolicy, RiskLevel, Runtime, SkillMeta } from './types.js';

export interface RouteOptions {
  profiles?: string[];
  use?: string[];
  runtime?: Runtime;
  capabilities?: string[];
  policy?: ProjectPolicy;
  allowDestructive?: boolean;
  intents?: string[];
}
export interface RouteStep { id: string; score: number; type: SkillMeta['type']; reason: string[] }
export interface RejectedStep { id: string; reason: string }
export interface RouteResult { profiles: string[]; intents: string[]; chain: RouteStep[]; rejected: RejectedStep[] }

type Candidate = { record: SkillRecord; score: number; reasons: string[]; explicit: boolean };
const RISK_RANK: Record<RiskLevel, number> = { 'read-only': 0, 'safe-write': 1, privileged: 2, destructive: 3 };
const TYPE_RANK: Record<SkillMeta['type'], number> = { process: 0, domain: 1, policy: 2, finalizer: 3 };

function keywordMatch(text: string, keyword: string): boolean {
  const k = keyword.toLowerCase().trim();
  if (!k) return false;
  return text.includes(k);
}
function capMatches(pattern: string, cap: string): boolean {
  if (pattern === cap) return true;
  if (pattern.endsWith('.*')) return cap === pattern.slice(0, -2) || cap.startsWith(pattern.slice(0, -1));
  return false;
}
function policyBlock(skill: SkillMeta, options: RouteOptions): string | null {
  if (skill.risk.level === 'destructive' && !options.allowDestructive) return 'destructive action requires explicit permission';
  const max = options.policy?.max_risk;
  if (max && RISK_RANK[skill.risk.level] > RISK_RANK[max]) return `risk ${skill.risk.level} exceeds policy max ${max}`;
  for (const required of skill.capabilities.required) {
    if ((options.policy?.deny ?? []).some(pattern => capMatches(pattern, required))) return `required capability denied by policy: ${required}`;
    if (options.capabilities && !options.capabilities.includes(required)) return `required capability unavailable: ${required}`;
  }
  return null;
}

function orderSelected(selected: Candidate[]): Candidate[] {
  const byId = new Map(selected.map(c => [c.record.meta.id, c]));
  const edges = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();
  for (const id of byId.keys()) { edges.set(id, new Set()); indegree.set(id, 0); }
  function edge(a: string, b: string): void {
    if (!byId.has(a) || !byId.has(b) || a === b || edges.get(a)?.has(b)) return;
    edges.get(a)?.add(b); indegree.set(b, (indegree.get(b) ?? 0) + 1);
  }
  for (const candidate of selected) {
    const skill = candidate.record.meta;
    for (const dep of skill.composition.requires) edge(dep, skill.id);
    for (const before of skill.composition.before) edge(skill.id, before);
    for (const after of skill.composition.after) edge(after, skill.id);
  }
  const finalizers = selected.filter(c => c.record.meta.type === 'finalizer');
  for (const f of finalizers) for (const c of selected) if (c !== f && c.record.meta.type !== 'finalizer') edge(c.record.meta.id, f.record.meta.id);
  const compare = (a: string, b: string): number => {
    const ca = byId.get(a)!; const cb = byId.get(b)!;
    return TYPE_RANK[ca.record.meta.type] - TYPE_RANK[cb.record.meta.type] || cb.score - ca.score || a.localeCompare(b);
  };
  const ready = [...indegree.entries()].filter(([, d]) => d === 0).map(([id]) => id).sort(compare);
  const result: Candidate[] = [];
  while (ready.length) {
    const id = ready.shift()!; result.push(byId.get(id)!);
    for (const next of [...(edges.get(id) ?? [])].sort()) {
      indegree.set(next, indegree.get(next)! - 1);
      if (indegree.get(next) === 0) { ready.push(next); ready.sort(compare); }
    }
  }
  if (result.length !== selected.length) return [...selected].sort((a, b) => compare(a.record.meta.id, b.record.meta.id));
  return result;
}

export function routeRequest(registry: Registry, request: string, options: RouteOptions = {}): RouteResult {
  const explicitIds = new Set(options.use ?? []);
  const text = request.toLowerCase();
  const directProfiles = new Set<string>();
  if (options.profiles?.length) {
    for (const raw of options.profiles) for (const id of raw.split('+').map(x => x.trim()).filter(Boolean)) directProfiles.add(id);
  } else {
    for (const profile of registry.profiles) if (profile.id !== 'auto' && (profile.triggers?.keywords ?? []).some(k => keywordMatch(text, k))) directProfiles.add(profile.id);
  }
  const profiles = resolveProfiles(registry.profiles, request, options.profiles);
  const activeProfiles = new Set(profiles);
  const intents = [...new Set([...(options.intents ?? []), ...inferIntents(request)])].sort();
  const rejected: RejectedStep[] = [];
  const candidates: Candidate[] = [];
  const genericFallbacks: Candidate[] = [];
  const genericProfileKeywords = new Set<string>();
  for (const profile of registry.profiles) {
    if (profile.id === 'auto' || !activeProfiles.has(profile.id)) continue;
    for (const keyword of profile.triggers?.keywords ?? []) if (keywordMatch(text, keyword)) genericProfileKeywords.add(keyword.toLowerCase());
  }
  const broadIntents = new Set(['review','research','author','document','data-ai','automation','release','ui-design','security-review']);
  const fallbackProfileByPack = new Map<string,string>([
    ['browser','browser-extension'], ['uiux','ui-ux'], ['security','security'], ['research','research'],
    ['academic','academic'], ['data-ai','data-ai'], ['documents','documents'], ['automation','automation'],
    ['devops','devops'], ['product','product'], ['engineering','coding']
  ]);

  for (const record of registry.skills) {
    const skill = record.meta;
    const explicit = explicitIds.has(skill.id);
    if (options.runtime && !skill.runtime.supported.includes(options.runtime)) { rejected.push({ id: skill.id, reason: `unsupported runtime: ${options.runtime}` }); continue; }
    const blocked = policyBlock(skill, options);
    if (blocked) { rejected.push({ id: skill.id, reason: blocked }); continue; }
    const profileMatches = skill.profiles.includes('universal') || skill.profiles.some(p => activeProfiles.has(p));
    if (!explicit && !profileMatches) { rejected.push({ id: skill.id, reason: 'profile mismatch' }); continue; }

    const matchedKeywords = skill.routing.triggers.keywords.filter(k => keywordMatch(text, k));
    const specificKeywords = matchedKeywords.filter(k => !genericProfileKeywords.has(k.toLowerCase()));
    const matchedIntents = skill.routing.triggers.intents.filter(i => intents.includes(i));
    const specificIntents = matchedIntents.filter(i => !broadIntents.has(i));
    const broadMatchedIntents = matchedIntents.filter(i => broadIntents.has(i));
    if (!explicit && skill.type === 'finalizer') continue;
    if (!explicit && matchedKeywords.length === 0 && matchedIntents.length === 0) { rejected.push({ id: skill.id, reason: 'no trigger match' }); continue; }
    let score = skill.routing.priority;
    const reasons: string[] = [`priority:${skill.routing.priority}`];
    if (explicit) { score += 1000; reasons.push('explicit:+1000'); }
    if (profileMatches) { score += 40; reasons.push('profile:+40'); }
    if (specificIntents.length) { score += specificIntents.length * 100; reasons.push(`specific-intent:+${specificIntents.length * 100}`); }
    if (broadMatchedIntents.length) { score += broadMatchedIntents.length * 20; reasons.push(`broad-intent:+${broadMatchedIntents.length * 20}`); }
    if (specificKeywords.length) { score += specificKeywords.length * 15; reasons.push(`specific-keywords:+${specificKeywords.length * 15}`); }
    else if (matchedKeywords.length) { score += 2; reasons.push('profile-keyword:+2'); }
    const candidate = { record, score, reasons, explicit };
    const pack = skill.id.split('.')[1] ?? '';
    const strongMatch = specificIntents.length > 0 || specificKeywords.length > 0;
    if (!explicit && !strongMatch) {
      const directProfile = fallbackProfileByPack.get(pack);
      if (directProfile && directProfiles.has(directProfile) && (skill.type === 'domain' || skill.type === 'policy')) genericFallbacks.push(candidate);
      else rejected.push({ id: skill.id, reason: 'broad intent or generic profile keyword only' });
      continue;
    }
    candidates.push(candidate);
  }

  // A broad intent/profile keyword may identify the domain but must not load the whole pack.
  // If a strong candidate already exists for that pack/type, no generic fallback is added.
  const strongBuckets = new Set(candidates.map(c => `${c.record.meta.type}:${c.record.meta.id.split('.')[1] ?? ''}`));
  const fallbackByBucket = new Map<string, Candidate[]>();
  for (const c of genericFallbacks) {
    const pack = c.record.meta.id.split('.')[1] ?? '';
    const key = `${c.record.meta.type}:${pack}`;
    if (strongBuckets.has(key)) { rejected.push({ id: c.record.meta.id, reason: `strong ${key} candidate already selected` }); continue; }
    if (!fallbackByBucket.has(key)) fallbackByBucket.set(key, []);
    fallbackByBucket.get(key)!.push(c);
  }
  for (const [key,list] of fallbackByBucket) {
    list.sort((a,b)=>b.score-a.score || a.record.meta.id.localeCompare(b.record.meta.id));
    if (list[0]) candidates.push(list[0]);
    for (const extra of list.slice(1)) rejected.push({ id: extra.record.meta.id, reason: `generic fallback for ${key} won by ${list[0].record.meta.id}` });
  }

  // Cap non-explicit composition within the same pack/type to keep routing focused.
  const bucketed = new Map<string, Candidate[]>();
  for (const c of candidates) {
    if (c.explicit) continue;
    const pack = c.record.meta.id.split('.')[1] ?? '';
    const key = `${c.record.meta.type}:${pack}`;
    if (!bucketed.has(key)) bucketed.set(key, []);
    bucketed.get(key)!.push(c);
  }
  const pruned = new Set<Candidate>();
  for (const [key,list] of bucketed) {
    const type = key.split(':')[0];
    const limit = type === 'policy' ? 3 : type === 'domain' ? 3 : 99;
    list.sort((a,b)=>b.score-a.score || a.record.meta.id.localeCompare(b.record.meta.id));
    for (const c of list.slice(limit)) { pruned.add(c); rejected.push({id:c.record.meta.id,reason:`composition limit for ${key}`}); }
  }
  for (let i=candidates.length-1;i>=0;i--) if(pruned.has(candidates[i])) candidates.splice(i,1);

  // Resolve exclusive groups deterministically.
  const byGroup = new Map<string, Candidate[]>();
  const ungrouped: Candidate[] = [];
  for (const c of candidates) {
    const g = c.record.meta.routing.exclusive_group;
    if (!g) ungrouped.push(c);
    else { if (!byGroup.has(g)) byGroup.set(g, []); byGroup.get(g)!.push(c); }
  }
  const selected: Candidate[] = [...ungrouped];
  for (const [group, groupCandidates] of [...byGroup.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    groupCandidates.sort((a, b) => Number(b.explicit) - Number(a.explicit) || b.score - a.score || a.record.meta.id.localeCompare(b.record.meta.id));
    selected.push(groupCandidates[0]);
    for (const loser of groupCandidates.slice(1)) rejected.push({ id: loser.record.meta.id, reason: `exclusive group ${group} won by ${groupCandidates[0].record.meta.id}` });
  }

  // Remove pairwise conflicts; higher-scored candidate wins.
  selected.sort((a, b) => Number(b.explicit) - Number(a.explicit) || b.score - a.score || a.record.meta.id.localeCompare(b.record.meta.id));
  const kept: Candidate[] = [];
  for (const c of selected) {
    const conflict = kept.find(k => c.record.meta.conflicts_with.includes(k.record.meta.id) || k.record.meta.conflicts_with.includes(c.record.meta.id));
    if (conflict) rejected.push({ id: c.record.meta.id, reason: `conflicts with ${conflict.record.meta.id}` });
    else kept.push(c);
  }

  // Expand hard dependencies if available and policy-compatible.
  const byId = new Map(registry.skills.map(s => [s.meta.id, s]));
  const selectedMap = new Map(kept.map(c => [c.record.meta.id, c]));
  const stack = [...kept];
  while (stack.length) {
    const c = stack.pop()!;
    for (const depId of c.record.meta.composition.requires) {
      if (selectedMap.has(depId)) continue;
      const dep = byId.get(depId);
      if (!dep) { rejected.push({ id: depId, reason: `required by ${c.record.meta.id} but missing` }); continue; }
      const blocked = policyBlock(dep.meta, options);
      if (blocked) { rejected.push({ id: depId, reason: `required by ${c.record.meta.id}: ${blocked}` }); continue; }
      const depCandidate: Candidate = { record: dep, score: dep.meta.routing.priority + 5, reasons: [`dependency:${c.record.meta.id}`, 'dependency:+5'], explicit: false };
      selectedMap.set(depId, depCandidate); stack.push(depCandidate);
    }
  }

  // Add standard verification finalizer when work is selected.
  if (selectedMap.size > 0 && !selectedMap.has('nyx.core.verification')) {
    const finalizer = byId.get('nyx.core.verification');
    if (finalizer) {
      const blocked = policyBlock(finalizer.meta, options);
      if (!blocked && (!options.runtime || finalizer.meta.runtime.supported.includes(options.runtime))) {
        selectedMap.set(finalizer.meta.id, { record: finalizer, score: finalizer.meta.routing.priority, reasons: ['automatic finalizer'], explicit: false });
      }
    }
  }

  const ordered = orderSelected([...selectedMap.values()]);
  const selectedIds = new Set(ordered.map(c => c.record.meta.id));
  return {
    profiles,
    intents,
    chain: ordered.map(c => ({ id: c.record.meta.id, score: c.score, type: c.record.meta.type, reason: c.reasons })),
    rejected: rejected.filter((r, i, arr) => !selectedIds.has(r.id) && arr.findIndex(x => x.id === r.id && x.reason === r.reason) === i).sort((a, b) => a.id.localeCompare(b.id) || a.reason.localeCompare(b.reason)),
  };
}
