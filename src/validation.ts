import type { Registry } from './registry.js';

export interface ValidationIssue { severity: 'error' | 'warning'; code: string; message: string; subject?: string }
export interface ValidationReport { ok: boolean; issues: ValidationIssue[] }

function add(issues: ValidationIssue[], code: string, message: string, subject?: string, severity: 'error' | 'warning' = 'error'): void {
  issues.push({ severity, code, message, subject });
}

export function validateRegistry(registry: Registry): ValidationReport {
  const issues: ValidationIssue[] = [];
  const skillIds = new Set<string>();
  const profiles = new Set(registry.profiles.map(p => p.id));
  const profileIds = new Set<string>();
  const packIds = new Set<string>();

  for (const profile of registry.profiles) {
    if (profileIds.has(profile.id)) add(issues, 'DUPLICATE_PROFILE', `Duplicate profile ${profile.id}`, profile.id);
    profileIds.add(profile.id);
  }
  for (const pack of registry.packs) {
    if (packIds.has(pack.id)) add(issues, 'DUPLICATE_PACK', `Duplicate pack ${pack.id}`, pack.id);
    packIds.add(pack.id);
  }
  for (const record of registry.skills) {
    const skill = record.meta;
    if (skillIds.has(skill.id)) add(issues, 'DUPLICATE_SKILL', `Duplicate skill ${skill.id}`, skill.id);
    skillIds.add(skill.id);
  }

  for (const profile of registry.profiles) {
    for (const included of profile.includes) if (!profiles.has(included)) add(issues, 'UNKNOWN_PROFILE_INCLUDE', `${profile.id} includes missing profile ${included}`, profile.id);
  }
  for (const record of registry.skills) {
    const skill = record.meta;
    for (const profile of skill.profiles) if (!profiles.has(profile) && profile !== 'universal') add(issues, 'UNKNOWN_PROFILE', `${skill.id} references missing profile ${profile}`, skill.id);
    for (const dep of skill.composition.requires) if (!skillIds.has(dep)) add(issues, 'UNKNOWN_DEPENDENCY', `${skill.id} requires missing skill ${dep}`, skill.id);
    for (const target of [...skill.composition.before, ...skill.composition.after]) if (!skillIds.has(target)) add(issues, 'UNKNOWN_ORDER_TARGET', `${skill.id} references missing ordering target ${target}`, skill.id, 'warning');
    for (const conflict of skill.conflicts_with) if (!skillIds.has(conflict)) add(issues, 'UNKNOWN_CONFLICT', `${skill.id} conflicts with missing skill ${conflict}`, skill.id, 'warning');
    if (skill.risk.destructive && skill.risk.level !== 'destructive') add(issues, 'RISK_MISMATCH', `${skill.id} destructive=true but level=${skill.risk.level}`, skill.id);
  }
  for (const pack of registry.packs) {
    for (const skill of pack.skills) if (!skillIds.has(skill)) add(issues, 'PACK_UNKNOWN_SKILL', `${pack.id} references missing skill ${skill}`, pack.id);
    for (const profile of pack.profiles) if (!profiles.has(profile) && profile !== 'universal') add(issues, 'PACK_UNKNOWN_PROFILE', `${pack.id} references missing profile ${profile}`, pack.id);
  }

  // dependency cycle detection
  const graph = new Map(registry.skills.map(s => [s.meta.id, s.meta.composition.requires]));
  const visiting = new Set<string>(); const visited = new Set<string>();
  function dfs(id: string, path: string[]): void {
    if (visiting.has(id)) { add(issues, 'DEPENDENCY_CYCLE', `Dependency cycle: ${[...path, id].join(' -> ')}`, id); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of graph.get(id) ?? []) if (graph.has(next)) dfs(next, [...path, id]);
    visiting.delete(id); visited.add(id);
  }
  for (const id of graph.keys()) dfs(id, []);
  return { ok: !issues.some(i => i.severity === 'error'), issues: issues.sort((a, b) => `${a.code}:${a.subject ?? ''}`.localeCompare(`${b.code}:${b.subject ?? ''}`)) };
}
