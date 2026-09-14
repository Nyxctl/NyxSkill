export const RUNTIMES = ['inwjud', 'codex', 'claude-code', 'cursor', 'agents'] as const;
export type Runtime = typeof RUNTIMES[number];

export const SKILL_TYPES = ['process', 'domain', 'policy', 'finalizer'] as const;
export type SkillType = typeof SKILL_TYPES[number];

export const RISK_LEVELS = ['read-only', 'safe-write', 'privileged', 'destructive'] as const;
export type RiskLevel = typeof RISK_LEVELS[number];

export const TRUST_LEVELS = ['first-party', 'verified', 'community', 'untrusted'] as const;
export type TrustLevel = typeof TRUST_LEVELS[number];

export const ORIGIN_TYPES = ['nyx-native', 'adapted', 'vendored'] as const;
export type OriginType = typeof ORIGIN_TYPES[number];

export interface RoutingTriggers {
  keywords: string[];
  intents: string[];
}

export interface SkillMeta {
  id: string;
  name: string;
  version: string;
  api_version: number;
  category: string;
  type: SkillType;
  profiles: string[];
  description: string;
  routing: {
    priority: number;
    exclusive_group?: string;
    triggers: RoutingTriggers;
  };
  composition: {
    requires: string[];
    before: string[];
    after: string[];
  };
  conflicts_with: string[];
  capabilities: {
    required: string[];
    optional: string[];
  };
  risk: {
    level: RiskLevel;
    destructive: boolean;
    requires_confirmation: boolean;
  };
  runtime: {
    supported: Runtime[];
  };
  provenance: {
    origin: OriginType;
    source?: string | null;
    adapted_from?: string | null;
    license: string;
  };
  compatibility: {
    nyxskill: string;
    api: string;
  };
}

export interface PackMeta {
  id: string;
  name: string;
  version: string;
  api_version: number;
  namespace: string;
  profiles: string[];
  skills: string[];
  compatibility: { nyxskill: string; api: string };
  trust?: TrustLevel;
}

export interface ProfileMeta {
  id: string;
  name: string;
  includes: string[];
  triggers?: { keywords: string[] };
  categories?: string[];
  preferred_skills?: string[];
}

export interface ProjectPolicy {
  max_risk?: RiskLevel;
  deny?: string[];
  allow?: string[];
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}
