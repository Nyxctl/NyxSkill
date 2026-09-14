import {
  ORIGIN_TYPES,
  RISK_LEVELS,
  RUNTIMES,
  SKILL_TYPES,
  TRUST_LEVELS,
  type PackMeta,
  type ProfileMeta,
  type ProjectPolicy,
  type SkillMeta,
  type ValidationResult,
} from './types.js';

const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const ID_RE = /^[a-z0-9][a-z0-9._-]*$/;
const CAP_RE = /^[a-z][a-z0-9]*(?:[._-][a-z0-9*]+)*$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(obj: Record<string, unknown>, key: string, errors: string[], pattern?: RegExp): string | undefined {
  const value = obj[key];
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${key} must be a non-empty string`);
    return undefined;
  }
  if (pattern && !pattern.test(value)) errors.push(`${key} has invalid format`);
  return value;
}

function num(obj: Record<string, unknown>, key: string, errors: string[]): number | undefined {
  const value = obj[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(`${key} must be a number`);
    return undefined;
  }
  return value;
}

function bool(obj: Record<string, unknown>, key: string, errors: string[]): boolean | undefined {
  const value = obj[key];
  if (typeof value !== 'boolean') {
    errors.push(`${key} must be a boolean`);
    return undefined;
  }
  return value;
}

function stringArray(value: unknown, path: string, errors: string[], pattern?: RegExp): string[] {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return [];
  }
  const out: string[] = [];
  for (let i = 0; i < value.length; i += 1) {
    if (typeof value[i] !== 'string' || value[i].trim() === '') errors.push(`${path}[${i}] must be a non-empty string`);
    else {
      if (pattern && !pattern.test(value[i])) errors.push(`${path}[${i}] has invalid format`);
      out.push(value[i]);
    }
  }
  return out;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string, errors: string[]): T | undefined {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    errors.push(`${path} must be one of ${allowed.join(', ')}`);
    return undefined;
  }
  return value as T;
}

export function validateSkill(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) return { ok: false, errors: ['skill must be an object'] };
  str(value, 'id', errors, ID_RE);
  str(value, 'name', errors);
  str(value, 'version', errors, SEMVER_RE);
  const api = num(value, 'api_version', errors);
  if (api !== undefined && (!Number.isInteger(api) || api < 1)) errors.push('api_version must be a positive integer');
  str(value, 'category', errors, ID_RE);
  oneOf(value.type, SKILL_TYPES, 'type', errors);
  stringArray(value.profiles, 'profiles', errors, ID_RE);
  str(value, 'description', errors);

  if (!isObject(value.routing)) errors.push('routing must be an object');
  else {
    const priority = num(value.routing, 'priority', errors);
    if (priority !== undefined && (priority < 0 || priority > 1000)) errors.push('routing.priority must be between 0 and 1000');
    if (value.routing.exclusive_group !== undefined && typeof value.routing.exclusive_group !== 'string') errors.push('routing.exclusive_group must be a string');
    if (!isObject(value.routing.triggers)) errors.push('routing.triggers must be an object');
    else {
      stringArray(value.routing.triggers.keywords, 'routing.triggers.keywords', errors);
      stringArray(value.routing.triggers.intents, 'routing.triggers.intents', errors, ID_RE);
    }
  }

  if (!isObject(value.composition)) errors.push('composition must be an object');
  else {
    stringArray(value.composition.requires, 'composition.requires', errors, ID_RE);
    stringArray(value.composition.before, 'composition.before', errors, ID_RE);
    stringArray(value.composition.after, 'composition.after', errors, ID_RE);
  }
  stringArray(value.conflicts_with, 'conflicts_with', errors, ID_RE);

  if (!isObject(value.capabilities)) errors.push('capabilities must be an object');
  else {
    stringArray(value.capabilities.required, 'capabilities.required', errors, CAP_RE);
    stringArray(value.capabilities.optional, 'capabilities.optional', errors, CAP_RE);
  }

  if (!isObject(value.risk)) errors.push('risk must be an object');
  else {
    oneOf(value.risk.level, RISK_LEVELS, 'risk.level', errors);
    bool(value.risk, 'destructive', errors);
    bool(value.risk, 'requires_confirmation', errors);
  }

  if (!isObject(value.runtime)) errors.push('runtime must be an object');
  else {
    const supported = stringArray(value.runtime.supported, 'runtime.supported', errors);
    for (const runtime of supported) if (!RUNTIMES.includes(runtime as never)) errors.push(`runtime.supported contains unsupported runtime: ${runtime}`);
  }

  if (!isObject(value.provenance)) errors.push('provenance must be an object');
  else {
    oneOf(value.provenance.origin, ORIGIN_TYPES, 'provenance.origin', errors);
    if (value.provenance.source !== undefined && value.provenance.source !== null && typeof value.provenance.source !== 'string') errors.push('provenance.source must be a string or null');
    if (value.provenance.adapted_from !== undefined && value.provenance.adapted_from !== null && typeof value.provenance.adapted_from !== 'string') errors.push('provenance.adapted_from must be a string or null');
    str(value.provenance, 'license', errors);
  }

  if (!isObject(value.compatibility)) errors.push('compatibility must be an object');
  else {
    str(value.compatibility, 'nyxskill', errors);
    str(value.compatibility, 'api', errors);
  }
  return { ok: errors.length === 0, errors };
}

export function assertSkill(value: unknown): SkillMeta {
  const result = validateSkill(value);
  if (!result.ok) throw new Error(`Invalid skill metadata: ${result.errors.join('; ')}`);
  return value as SkillMeta;
}

export function validatePack(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) return { ok: false, errors: ['pack must be an object'] };
  str(value, 'id', errors, ID_RE);
  str(value, 'name', errors);
  str(value, 'version', errors, SEMVER_RE);
  const api = num(value, 'api_version', errors);
  if (api !== undefined && (!Number.isInteger(api) || api < 1)) errors.push('api_version must be a positive integer');
  str(value, 'namespace', errors, ID_RE);
  stringArray(value.profiles, 'profiles', errors, ID_RE);
  stringArray(value.skills, 'skills', errors, ID_RE);
  if (!isObject(value.compatibility)) errors.push('compatibility must be an object');
  else { str(value.compatibility, 'nyxskill', errors); str(value.compatibility, 'api', errors); }
  if (value.trust !== undefined) oneOf(value.trust, TRUST_LEVELS, 'trust', errors);
  return { ok: errors.length === 0, errors };
}

export function assertPack(value: unknown): PackMeta {
  const result = validatePack(value);
  if (!result.ok) throw new Error(`Invalid pack metadata: ${result.errors.join('; ')}`);
  return value as PackMeta;
}

export function validateProfile(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) return { ok: false, errors: ['profile must be an object'] };
  str(value, 'id', errors, ID_RE);
  str(value, 'name', errors);
  stringArray(value.includes, 'includes', errors, ID_RE);
  if (value.triggers !== undefined) {
    if (!isObject(value.triggers)) errors.push('triggers must be an object');
    else stringArray(value.triggers.keywords, 'triggers.keywords', errors);
  }
  if (value.categories !== undefined) stringArray(value.categories, 'categories', errors, ID_RE);
  if (value.preferred_skills !== undefined) stringArray(value.preferred_skills, 'preferred_skills', errors, ID_RE);
  return { ok: errors.length === 0, errors };
}

export function assertProfile(value: unknown): ProfileMeta {
  const result = validateProfile(value);
  if (!result.ok) throw new Error(`Invalid profile metadata: ${result.errors.join('; ')}`);
  return value as ProfileMeta;
}

export function validateProjectPolicy(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObject(value)) return { ok: false, errors: ['project policy must be an object'] };
  if (value.max_risk !== undefined) oneOf(value.max_risk, RISK_LEVELS, 'max_risk', errors);
  if (value.deny !== undefined) stringArray(value.deny, 'deny', errors, CAP_RE);
  if (value.allow !== undefined) stringArray(value.allow, 'allow', errors, CAP_RE);
  return { ok: errors.length === 0, errors };
}

export function assertProjectPolicy(value: unknown): ProjectPolicy {
  const result = validateProjectPolicy(value);
  if (!result.ok) throw new Error(`Invalid project policy: ${result.errors.join('; ')}`);
  return value as ProjectPolicy;
}
