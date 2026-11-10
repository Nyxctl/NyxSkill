/** Pure planning only. Descriptions are inert data; the host owns invocation and consent. */
export interface CapabilityTool { name: string; provider?: string; description?: string; capabilities?: string[]; readOnly?: boolean }
export interface CapabilityPlugin {
  id: string; name: string; displayName?: string; description?: string;
  installed: boolean; enabled: boolean; capabilities?: string[]; toolPrefixes?: string[];
  auth?: 'unknown' | 'required' | 'ready';
}
export interface CapabilityInventory { plugins: CapabilityPlugin[]; tools: CapabilityTool[]; builtins?: CapabilityTool[]; capturedAt?: string }
export interface CapabilityContext { explicitProvider?: string; authorizedWrite?: boolean; authorizedPublish?: boolean; authorizedMessaging?: boolean }
export interface CapabilityChoice {
  tool: string; provider: string; why: string;
  status: 'available' | 'authentication-required' | 'authentication-unknown' | 'authorization-required';
  requiredSkill?: string; needsAuthorization: boolean;
}
export interface CapabilityPlan {
  intent: string; selected: CapabilityChoice[]; rejected: { tool: string; provider: string; why: string }[];
  workflow?: { provider: string; requiredSkill: string; needsAuthorization: boolean; status: 'skill-required' };
  fallback: string | null; execution: 'host-only';
}

const domains = ['local', 'web', 'image', 'browser', 'docx', 'pdf', 'xlsx', 'slides', 'research', 'github', 'figma', 'supabase', 'vercel', 'drive', 'messaging'] as const;
const operations = ['read', 'write', 'publish', 'send'] as const;
const skills: Record<string, string> = { docx: 'documents:documents', pdf: 'pdf:pdf', xlsx: 'spreadsheets:Spreadsheets', slides: 'presentations:Presentations', figma: 'figma:figma-spec', supabase: 'supabase:supabase' };
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}: expected object`);
  return value as Record<string, unknown>;
}
function fields(row: Record<string, unknown>, allowed: string[], label: string): void {
  if (Object.keys(row).some(key => !allowed.includes(key))) throw new Error(`Invalid ${label}: unknown field`);
}
function str(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 8192 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) throw new Error(`Invalid ${label}: expected nonempty string`);
  return value;
}
function strings(value: unknown, label: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 256) throw new Error(`Invalid ${label}: expected array`);
  const result = value.map(v => str(v, label));
  if (new Set(result).size !== result.length) throw new Error(`Invalid ${label}: duplicate value`);
  return result;
}
function capabilities(value: unknown): string[] | undefined {
  const result = strings(value, 'capabilities');
  if (result?.some(cap => !domains.some(domain => operations.some(operation => cap === `${domain}.${operation}`)))) throw new Error('Invalid capabilities: unsupported capability');
  return result;
}
function tool(value: unknown): CapabilityTool {
  const row = record(value, 'tool'); fields(row, ['name', 'provider', 'description', 'capabilities', 'readOnly'], 'tool');
  if (row.readOnly !== undefined && typeof row.readOnly !== 'boolean') throw new Error('Invalid tool readOnly');
  return { name: str(row.name, 'tool name'), ...(row.provider === undefined ? {} : { provider: str(row.provider, 'tool provider') }), ...(row.description === undefined ? {} : { description: str(row.description, 'description') }), capabilities: capabilities(row.capabilities), readOnly: row.readOnly as boolean | undefined };
}
/** Validate an explicitly normalized host snapshot; never inspect credentials or global config. */
export function parseCapabilityInventory(value: unknown): CapabilityInventory {
  const row = record(value, 'inventory'); fields(row, ['plugins', 'tools', 'builtins', 'capturedAt'], 'inventory');
  if (!Array.isArray(row.plugins) || !Array.isArray(row.tools) || row.plugins.length > 1024 || row.tools.length > 10000 || (row.builtins !== undefined && (!Array.isArray(row.builtins) || row.builtins.length > 10000))) throw new Error('Invalid inventory arrays');
  if (row.capturedAt !== undefined && (typeof row.capturedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(row.capturedAt) || !Number.isFinite(Date.parse(row.capturedAt)))) throw new Error('Invalid capturedAt');
  const plugins = row.plugins.map(value => {
    const p = record(value, 'plugin'); fields(p, ['id', 'name', 'displayName', 'description', 'installed', 'enabled', 'capabilities', 'toolPrefixes', 'auth'], 'plugin');
    if (typeof p.installed !== 'boolean' || typeof p.enabled !== 'boolean' || (p.auth !== undefined && (typeof p.auth !== 'string' || !['unknown', 'required', 'ready'].includes(p.auth)))) throw new Error('Invalid plugin state');
    const prefixes = strings(p.toolPrefixes, 'toolPrefixes');
    if (prefixes?.some(prefix => !/^mcp__[A-Za-z0-9_]+__$/.test(prefix))) throw new Error('Invalid tool prefix: expected scoped MCP namespace ending in __');
    return { id: str(p.id, 'plugin id'), name: str(p.name, 'plugin name'), ...(p.displayName === undefined ? {} : { displayName: str(p.displayName, 'displayName') }), ...(p.description === undefined ? {} : { description: str(p.description, 'description') }), installed: p.installed, enabled: p.enabled, capabilities: capabilities(p.capabilities), toolPrefixes: prefixes, auth: p.auth as CapabilityPlugin['auth'] };
  });
  const tools = row.tools.map(tool); const builtins = (row.builtins as unknown[] | undefined)?.map(tool);
  for (const [label, ids] of [['plugin', plugins.map(p => p.id)], ['tool', [...tools, ...(builtins ?? [])].map(t => t.name)]] as const) {
    if (new Set(ids).size !== ids.length) throw new Error(`Invalid inventory: duplicate ${label}`);
  }
  return { plugins, tools, ...(row.capturedAt === undefined ? {} : { capturedAt: row.capturedAt as string }), ...(builtins === undefined ? {} : { builtins }) };
}

function classify(request: string): { domain: string; operation: string } {
  const text = request.toLowerCase();
  const operation = /\b(publish|deploy)\b|เผยแพร่|ขึ้นโปรดักชัน|ขึ้น production/.test(text) ? 'publish'
    : /\b(send|message someone)\b|ส่งอีเมล|ส่งข้อความ/.test(text) ? 'send'
    : /\b(create|edit|update|delete|write|insert|modify|generate|build|draw)\b|สร้าง|วาดภาพ|แก้(?:ไข|ไฟล์|โค้ด|ข้อมูล)|เขียน|(?:ลบ|เพิ่ม)(?=\s|ไฟล์|ข้อมูล|รายการ|โค้ด|ตาราง|แถว|คอลัมน์|$)/.test(text) ? 'write' : 'read';
  const rules: [string, RegExp][] = [
    ['github', /\bgithub\b|pull request|\bpr #\d/], ['figma', /\bfigma\b/], ['supabase', /\bsupabase\b/], ['vercel', /\bvercel\b/],
    ['drive', /google drive|กูเกิลไดรฟ์/], ['docx', /\bdocx\b|word document|เอกสารเวิร์ด/], ['pdf', /\bpdf\b/], ['xlsx', /\bxlsx?\b|spreadsheet|excel|สเปรดชีต/],
    ['slides', /\bpptx?\b|\bslides?\b|powerpoint|สไลด์/], ['browser', /live browser|open tab|browser tab|หน้าเว็บที่เปิด|แท็บ|คลิก.*เว็บ/],
    ['research', /\bresearch\b|\bpapers?\b|literature|งานวิจัย|บทความวิชาการ/], ['image', /\bimage\b|\bportrait\b|รูปภาพ|วาดภาพ/],
    ['web', /\bweb\b|\bsearch online\b|\blatest\b|ค้นหา.*เว็บ|ล่าสุด|อินเทอร์เน็ต/], ['messaging', /\bslack\b|\bemail\b|อีเมล|ส่งข้อความ/],
  ];
  return { domain: rules.find(([, pattern]) => pattern.test(text))?.[0] ?? 'local', operation };
}
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
function mentioned(request: string, name: string): boolean {
  if (name.length < 3) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i').test(request);
}
function excluded(request: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Boolean(name) && new RegExp(`(?:without|do not use|don't use|avoid|ไม่ใช้|ไม่ต้องใช้|ห้ามใช้)\\s*${escaped}(?:$|[^a-z0-9])`, 'i').test(request);
}
/** Produce the smallest sufficient plan. Availability is evidence, never implicit authentication. */
export function planCapabilities(request: string, input: CapabilityInventory, context: CapabilityContext = {}): CapabilityPlan {
  str(request, 'request'); const inventory = parseCapabilityInventory(input);
  const orderedPlugins = [...inventory.plugins].sort((a, b) => compare(a.id, b.id));
  const denied = new Set(orderedPlugins.filter(p => [p.id, p.name, p.displayName ?? ''].some(name => excluded(request, name))).map(p => p.id));
  let intentText = request.replace(/(?:do not|don't|never|ไม่ต้อง|ห้าม)\s*(?:publish|deploy|send|เผยแพร่|ส่งข้อความ|ส่งอีเมล)/gi, '');
  for (const p of orderedPlugins.filter(p => denied.has(p.id))) for (const name of [p.id, p.name, p.displayName ?? '']) if (name) intentText = intentText.replaceAll(name, '');
  const { domain, operation } = classify(intentText);
  const intent = `${domain}.${operation}`; const rejected: CapabilityPlan['rejected'] = [];
  const explicit = context.explicitProvider ?? orderedPlugins.find(p => !denied.has(p.id) && [p.id, p.name, p.displayName ?? ''].some(name => mentioned(request, name)))?.id;
  const matches = (p: CapabilityPlugin): boolean => [p.id, p.name, p.displayName].some(name => name?.toLowerCase() === explicit?.toLowerCase());
  const candidates: { tool: CapabilityTool; plugin?: CapabilityPlugin; score: number }[] = [];
  for (const t of [...inventory.tools, ...(inventory.builtins ?? [])].sort((a, b) => compare(a.name, b.name))) {
    const builtin = inventory.builtins?.some(b => b.name === t.name) ?? false;
    const owners = builtin ? [] : orderedPlugins.filter(p => t.provider ? p.id === t.provider : p.toolPrefixes?.some(prefix => t.name.startsWith(prefix)));
    const p = owners.length === 1 ? owners[0] : undefined;
    const provider = builtin ? 'builtin' : p?.id ?? 'unknown';
    let why: string | undefined;
    if (!builtin && !p) why = owners.length > 1 ? 'Ambiguous tool ownership' : 'Unknown tool ownership';
    else if (p && denied.has(p.id)) why = 'Provider explicitly excluded by the request';
    else if (explicit && !(builtin ? explicit === 'builtin' : matches(p!))) why = 'Explicit provider takes precedence';
    else if (p && (!p.installed || !p.enabled)) why = !p.installed ? 'Plugin is not installed' : 'Plugin is disabled';
    else if (!t.capabilities?.includes(intent)) why = 'Required scoped tool capability is absent';
    else if (operation !== 'read' && t.readOnly === true) why = 'Read-only tool cannot satisfy a write request';
    else if (operation === 'read' && t.readOnly !== true) why = 'Read-only behavior is not verified';
    if (why) { rejected.push({ tool: t.name, provider, why }); continue; }
    // Ordinary local, native web, image and document work favor host builtins.
    candidates.push({ tool: t, plugin: p, score: builtin ? 0 : 1 });
  }
  // Use reviewed tool identities for resource fit, never free-form plugin instructions.
  const query=request.toLowerCase();
  const lookup=/search|find|lookup|ค้น|หา/.test(query);
  const pullRequest=domain==='github'&&/pull request|\bpr\b|รีวิวพีอาร์/.test(query);
  function resourceFit(t:CapabilityTool):number {
    if(pullRequest) return lookup ? /search_prs$/.test(t.name)?-3:0 : /get_pr_info$|fetch_pr$|get_pr_diff$/.test(t.name)?-3:0;
    if(domain==='research') return /https?:|doi:|arxiv:|paper[_ -]?id/.test(query) ? /fetch$|read_paper$/.test(t.name)?-2:0 : /search(?:_papers)?$|scholar_search$/.test(t.name)?-2:0;
    return 0;
  }
  candidates.sort((a, b) => a.score - b.score || resourceFit(a.tool)-resourceFit(b.tool) || compare(a.plugin?.id ?? '', b.plugin?.id ?? '') || compare(a.tool.name, b.tool.name));
  const best = candidates[0];
  const needsAuthorization = operation === 'publish' ? !context.authorizedPublish : operation === 'send' ? !context.authorizedMessaging : operation === 'write' ? !context.authorizedWrite : false;
  const nativeSkillNames: Record<string, string[]> = { docx: ['documents'], pdf: ['pdf'], xlsx: ['spreadsheets'], slides: ['presentations'] };
  const skillPlugin = orderedPlugins.find(p => p.installed && p.enabled && !denied.has(p.id) && (!explicit || matches(p)) && [p.id, p.name, p.displayName ?? ''].some(name => nativeSkillNames[domain]?.includes(name.toLowerCase())));
  if (skillPlugin && (!best || best.plugin)) {
    for (const candidate of candidates) rejected.push({ tool: candidate.tool.name, provider: candidate.plugin?.id ?? 'builtin', why: 'Prefer installed native artifact skill workflow' });
    return { intent, selected: [], rejected, workflow: { provider: skillPlugin.id, requiredSkill: skills[domain], needsAuthorization, status: 'skill-required' }, fallback: 'Load the installed artifact skill and resolve its supported host runtime. No callable artifact tool is assumed.', execution: 'host-only' };
  }
  if (!best) return { intent, selected: [], rejected, fallback: explicit ? 'Requested provider has no eligible scoped tool. Report the missing/disabled capability; do not silently switch providers.' : 'No eligible tool. Use a host-supported local workflow if available, otherwise request the missing capability.', execution: 'host-only' };
  const auth = best.plugin?.auth;
  const status = needsAuthorization ? 'authorization-required' : best.plugin && auth !== 'ready' ? auth === 'required' ? 'authentication-required' : 'authentication-unknown' : 'available';
  for (const candidate of candidates.slice(1)) rejected.push({ tool: candidate.tool.name, provider: candidate.plugin?.id ?? 'builtin', why: 'A smaller sufficient tool set is already selected' });
  return { intent, selected: [{ tool: best.tool.name, provider: best.plugin?.id ?? 'builtin', why: explicit ? 'Explicit provider with required scoped capability' : 'Smallest eligible scoped tool set; builtin preferred', status, ...(skills[domain] ? { requiredSkill: skills[domain] } : {}), needsAuthorization }], rejected, fallback: null, execution: 'host-only' };
}
