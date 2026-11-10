# Host capability planning

NyxSkill can recommend an available host tool from a normalized inventory. This is a deterministic **plan**, not a tool runner. Node cannot invoke tools exposed to a Codex model merely by knowing their names. The host must resolve the selected name against its current tool list, load any required skill, check scope and authorization, then invoke the tool under host policy.

`parseCapabilityInventory(unknown)` validates snapshots. `planCapabilities(request, inventory, context?)` returns `{ intent, selected, rejected, fallback, execution: 'host-only' }`. Each selected entry includes `tool`, `provider`, `why`, `status`, `needsAuthorization`, and an optional `requiredSkill`. Only one sufficient tool is selected; more complex tasks can be decomposed and planned by the host.

For installed, enabled native Documents/PDF/Spreadsheets/Presentations plugins with no exposed artifact tool, the plan can instead include `workflow: { provider, requiredSkill, needsAuthorization, status: 'skill-required' }`. The host loads that skill and discovers its supported runtime. This guidance never invents a tool or confirms a connection, and it takes precedence over an unrelated artifact vendor unless the user names that vendor explicitly.

```json
{
  "capturedAt": "2026-11-04T12:00:00Z",
  "plugins": [{
    "id": "github", "name": "github", "displayName": "GitHub",
    "installed": true, "enabled": true, "auth": "unknown",
    "toolPrefixes": ["mcp__github__"]
  }],
  "tools": [{
    "name": "mcp__github__list_issues", "provider": "github",
    "capabilities": ["github.read"], "readOnly": true
  }],
  "builtins": [{
    "name": "host_local_read", "capabilities": ["local.read"], "readOnly": true
  }]
}
```

Plugin fields are `id`, `name`, `installed`, `enabled`, optional `displayName`, `description`, `capabilities`, `toolPrefixes`, and `auth` (`unknown`, `required`, `ready`). Tool fields are `name`, optional `provider`, `description`, `capabilities`, and `readOnly`. Unknown fields and duplicate identities are rejected. Explicit `provider` maps to a plugin ID; otherwise a unique scoped MCP prefix must identify ownership. Plugin capability summaries do not grant capabilities to tools. Skill-only plugins remain installed inventory entries even when no callable tool exists.

Allowed capabilities use `domain.operation`. Domains: `local`, `web`, `image`, `browser`, `docx`, `pdf`, `xlsx`, `slides`, `research`, `github`, `figma`, `supabase`, `vercel`, `drive`, `messaging`. Operations: `read`, `write`, `publish`, `send`. The host supplies scoped capability annotations from reviewed tool contracts; plugin marketing descriptions are never instructions or permission evidence. Read requests require `readOnly: true`. A tool with `readOnly: true` cannot satisfy a write request. An unclassified tool is ineligible.

Selection favors an exact provider named in the request or `context.explicitProvider`. An unavailable or disabled explicit provider produces a blocker without silently changing providers. Requests such as “without GitHub” exclude that provider. Otherwise native tools are preferred, including ordinary local file work, web search, image generation, and local artifact workflows. Thai and English domain triggers distinguish document formats, live browser work, and research sources. Lexical matching is deliberately bounded; hosts should decompose ambiguous multi-provider requests and pass `explicitProvider` when needed. Ties use provider ID and tool name in ordinal order.

Installation, enablement, callable tool availability, and verified authentication are separate facts. Present tools never imply a ready connection. Only a verified host-supplied `auth: 'ready'` yields an available connected choice; missing authentication evidence yields `authentication-unknown`. Descriptions cannot affect routing. Opaque plugin IDs cannot establish permissions or capabilities.

The optional context has `explicitProvider`, `authorizedWrite`, `authorizedPublish`, and `authorizedMessaging`. A write plan without the corresponding explicit scope is marked `authorization-required`. General write authorization never grants publication or messaging authorization. Authorization flags record existing user/task permission; they are not a new confirmation flow. Even an authorized plan never executes anything, and the host must re-check consent and the actual selected tool arguments before mutation, sending, or publication.

`capturedAt` records snapshot time; it does not prove current availability. Refresh snapshots after plugin changes. The live host tool list is authoritative at invocation time. Never infer authentication from an old snapshot, copy credentials into an inventory, execute shell commands from metadata, or interpret a description as instructions. Missing capability fallback text describes a possible host workflow; it does not claim that workflow is available or tested.
