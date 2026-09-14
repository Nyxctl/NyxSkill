import type { ProfileMeta } from './types.js';

function containsKeyword(text: string, keyword: string): boolean {
  const k = keyword.toLowerCase().trim();
  if (!k) return false;
  if (/^[a-z0-9-]+$/.test(k)) return new RegExp(`(?:^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^a-z0-9])`, 'i').test(text);
  return text.includes(k);
}

export function resolveProfiles(profiles: ProfileMeta[], prompt: string, explicit?: string[]): string[] {
  const byId = new Map(profiles.map(p => [p.id, p]));
  const selected = new Set<string>();
  if (explicit?.length) for (const raw of explicit) for (const id of raw.split('+').map(x => x.trim()).filter(Boolean)) selected.add(id);
  else {
    const lower = prompt.toLowerCase();
    for (const profile of profiles) {
      if ((profile.triggers?.keywords ?? []).some(k => containsKeyword(lower, k))) selected.add(profile.id);
    }
  }

  const visiting = new Set<string>();
  function expand(id: string): void {
    if (visiting.has(id)) return;
    visiting.add(id);
    const profile = byId.get(id);
    for (const parent of profile?.includes ?? []) {
      if (!selected.has(parent)) selected.add(parent);
      expand(parent);
    }
    visiting.delete(id);
  }
  for (const id of [...selected]) expand(id);
  return [...selected].sort();
}

export function inferIntents(prompt: string): string[] {
  const text = prompt.toLowerCase();
  const intents = new Set<string>();
  const rules: Array<[RegExp, string[]]> = [
    [/\b(bug|crash|broken|broke|regression|failing|fails|error|debug|fix)\b/i, ['debug']],
    [/\b(auth|oauth|login|sign[ -]?in|credential|token)\b/i, ['secure-auth']],
    [/(?:\b(?:build|create|develop|implement|migrate|modify)\b.{0,24}\b(?:extension|manifest)\b|\b(?:extension|manifest)\b.{0,24}\b(?:build|create|develop|implement|migrate|modify)\b)/i, ['develop-extension']],
    [/\b(test|testing|spec|coverage)\b/i, ['test']],
    [/\b(review|audit|inspect|check)\b/i, ['review']],
    [/\b(research|literature|paper|study|survey)\b/i, ['research']],
    [/\b(write|draft|author)\b/i, ['author']],
    [/\b(plan|roadmap|implementation plan)\b/i, ['plan']],
    [/\b(deploy|release|ship|publish)\b/i, ['release']],
    [/\b(ci|pipeline|automation|workflow)\b/i, ['automation']],
    [/\b(data|dataset|machine learning|\bml\b|model|training)\b/i, ['data-ai']],
    [/\b(ui|ux|interface|design system|wireframe)\b/i, ['ui-design']],
    [/(?:\b(?:design|define|create|document|schema)\b.{0,24}\b(?:api|rest|openapi|endpoint)\b|\b(?:api|rest|openapi|endpoint)\b.{0,24}\b(?:design|schema|contract|spec)\b)/i, ['api-design']],
    [/\b(security|vulnerability|hardening|threat)\b/i, ['security-review']],
    [/\b(document|docx|pdf|documentation|docs)\b/i, ['document']],
  ];
  for (const [re, values] of rules) if (re.test(text)) for (const value of values) intents.add(value);
  return [...intents].sort();
}
