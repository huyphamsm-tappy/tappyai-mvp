// Per-Host compatibility profiles as DATA (connector doc §4, R13 §25.4, ADR-CONN-016). A profile changes configuration only: limits, naming rules and what must be proven before launch. It never holds search,
// ranking, entitlement or TVI logic, and no profile claims parity with another.
//
// 🚨 EVERY profile is UNVERIFIED. The facts below are the 10/11/2026 baseline written in the connector doc (§4.2-4.5) and must be rechecked against the official documentation and a real account on the exact
// surface immediately before implementation and launch (the doc says so itself). Nothing here has been exercised against a Host: no connector is registered anywhere. The numeric limits are conservative
// placeholders for the SERVER side (our own deadline and response size), NOT measured Host limits.
import type { HostPlatform } from './connectorContract'

export type ProfileId = 'claude' | 'chatgpt' | 'gemini_apps' | 'gemini_api' | 'cursor' | 'grok_api' | 'deepseek' | 'meta'

export interface HostProfile {
  id: ProfileId
  /** the platform label the Gateway sees in the verified claims (both Gemini channels share one) */
  host: HostPlatform
  label: string
  /** always the connector doc baseline: no profile is verified */
  verification: 'unverified'
  /** where the facts come from: the connector doc for the first three, a web search on 22/11/2026 (docs and secondary sources, NOT a real account) for Cursor / Grok / DeepSeek / Meta */
  baseline: 'connector-doc-v2.1 (10/11/2026)' | 'web-search-22-11-2026 (not tested on a real account)'
  transport: { streamableHttp: true; sse: boolean }
  /** our own limits for calls from this Host: server deadline and response size, placeholders until measured against the Host */
  limits: { serverDeadlineMs: number; maxResponseBytes: number }
  /** the shape the Host requires of the server name, where the doc states one */
  serverNameRule: RegExp | null
  /** every tool name must satisfy this (function-calling name rules); the doc states one for Gemini */
  toolNameRule: RegExp
  /** facts from the doc that limit who can use it: the Host LLM and the owner must be told, the Gateway never relies on them */
  eligibility: readonly string[]
  /** what MUST be proven on the real Host before any launch claim */
  mustVerify: readonly string[]
}

const COMMON_MUST = ['initialization and tool discovery on the exact surface', 'JSON Schema acceptance of the published catalog', 'OAuth / authentication flow end to end', 'structured response and error handling', 'streaming / deadline behaviour', 'schema update lifecycle'] as const
const LIMITS = { serverDeadlineMs: 12_000, maxResponseBytes: 24_000 } as const
const NAME = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/

export const HOST_PROFILES: Readonly<Record<ProfileId, HostProfile>> = Object.freeze({
  claude: {
    id: 'claude', host: 'claude', label: 'Claude (remote connectors)', verification: 'unverified', baseline: 'connector-doc-v2.1 (10/11/2026)',
    transport: { streamableHttp: true, sse: false }, limits: LIMITS, serverNameRule: null, toolNameRule: NAME,
    eligibility: ['needs a publicly reachable endpoint: a connector on a developer machine is not a remote connector', 'target surfaces (Web, Desktop, Mobile) must each be tested'],
    mustVerify: [...COMMON_MUST, 'each target surface separately (Web / Desktop / Mobile)', 'account and plan eligibility for custom connectors'],
  },
  chatgpt: {
    id: 'chatgpt', host: 'chatgpt', label: 'ChatGPT (custom MCP)', verification: 'unverified', baseline: 'connector-doc-v2.1 (10/11/2026)',
    transport: { streamableHttp: true, sse: false }, limits: LIMITS, serverNameRule: null, toolNameRule: NAME,
    eligibility: ['availability depends on plan and workspace: the doc records Pro with read/fetch permissions and full MCP for Business / Enterprise / Edu', 'custom MCP connections are documented as web-only', 'tools that are not read-only (job creation and cancellation) may be unavailable where only read/fetch is permitted', 'workspace controls may limit who can add or use a connector'],
    mustVerify: [...COMMON_MUST, 'plan / workspace / surface eligibility', 'refresh-token requirements', 'tool snapshot, review and refresh process', 'read-only classification of each tool annotation'],
  },
  gemini_apps: {
    id: 'gemini_apps', host: 'gemini', label: 'Gemini Apps (Connected Apps)', verification: 'unverified', baseline: 'connector-doc-v2.1 (10/11/2026)',
    transport: { streamableHttp: true, sse: false }, limits: LIMITS, serverNameRule: null, toolNameRule: NAME,
    eligibility: ['the doc records: US location, personal Google Account, age 18 or older, Keep Activity on, custom Connected Apps English-only', 'NOT to be represented as available in Vietnam without verification', 'set up in Gemini Web, then used on supported web and mobile surfaces'],
    mustVerify: [...COMMON_MUST, 'current geographic, account, age and language eligibility', 'whether the connection model supports the OAuth flow used'],
  },
  gemini_api: {
    id: 'gemini_api', host: 'gemini', label: 'Gemini API (Interactions API Remote MCP)', verification: 'unverified', baseline: 'connector-doc-v2.1 (10/11/2026)',
    transport: { streamableHttp: true, sse: false }, limits: LIMITS, serverNameRule: /^[a-z][a-z0-9_]*$/, toolNameRule: NAME,
    eligibility: ['a developer / API channel, not a consumer app installation', 'the doc records: Streamable HTTP, SSE not supported, server name follows the API naming rules (snake_case guidance)', 'authentication and billing are governed by the API'],
    mustVerify: [...COMMON_MUST, 'target-model behaviour with the published catalog', 'API-specific authentication and billing model'],
  },
  // ---- added 22/11/2026 at the owner's request. Facts: official docs and secondary sources read the same day; NOTHING here was tried on a real account. ----
  cursor: {
    id: 'cursor', host: 'cursor', label: 'Cursor (MCP in the editor / Cursor agents)', verification: 'unverified', baseline: 'web-search-22-11-2026 (not tested on a real account)',
    transport: { streamableHttp: true, sse: false }, limits: LIMITS, serverNameRule: null, toolNameRule: NAME,
    eligibility: ['docs (cursor.com/docs/mcp): remote servers over Streamable HTTP, configured in mcp.json (project .cursor/mcp.json or global ~/.cursor/mcp.json), OAuth handled by Cursor (discovery, registration, PKCE), static bearer headers also possible', 'the docs list separate OAuth redirect URLs for the desktop app and for web / Cursor Agents: both must be allowed on the authorization server', 'forum reports (not confirmed): OAuth failed when the protected-resource URL had a trailing slash, and a localhost callback sent no response: test both before claiming support', 'a developer tool: the user is a developer, not a consumer'],
    mustVerify: [...COMMON_MUST, 'both OAuth redirect URLs (desktop and web agents)', 'protected-resource URL without a trailing slash', 'tool-approval prompts (Cursor asks the user before running a tool)'],
  },
  grok_api: {
    id: 'grok_api', host: 'grok', label: 'Grok (xAI API remote MCP tools)', verification: 'unverified', baseline: 'web-search-22-11-2026 (not tested on a real account)',
    transport: { streamableHttp: true, sse: false }, limits: LIMITS, serverNameRule: null, toolNameRule: NAME,
    eligibility: ['docs (docs.x.ai/developers/tools/remote-mcp): remote MCP is a TOOL of the API (xAI SDK, OpenAI-compatible Responses API, Voice Agent API): the developer adds {type: mcp, server_url, server_label} to a request. It is not an installable consumer connector', 'require_approval and connector_id are documented as not supported', 'the docs show an allowed_tool_names filter: a developer who leaves it broad hands Grok every tool of the server', 'whether the consumer Grok app can add a custom MCP server was NOT confirmed'],
    mustVerify: [...COMMON_MUST, 'how the API sends an access token to the server (static header or OAuth)', 'current model names and whether they discover tools', 'the consumer Grok app, if a connector surface exists at all'],
  },
  deepseek: {
    id: 'deepseek', host: 'deepseek', label: 'DeepSeek (no confirmed connector surface)', verification: 'unverified', baseline: 'web-search-22-11-2026 (not tested on a real account)',
    transport: { streamableHttp: true, sse: false }, limits: LIMITS, serverNameRule: null, toolNameRule: NAME,
    eligibility: ['NO official DeepSeek document was found saying the DeepSeek app accepts a custom remote MCP connector: do NOT claim DeepSeek support', 'the DeepSeek developer harness (dsh) is reported by a third party to include an MCP client (stdio or Streamable HTTP): a developer channel, not a consumer one', 'DeepSeek models are usually reached through another MCP-capable client (Cursor, Claude Code), which then falls under THAT client\'s profile'],
    mustVerify: [...COMMON_MUST, 'whether any first-party surface (app, API or harness) can register a remote MCP server', 'authentication supported by that surface'],
  },
  meta: {
    id: 'meta', host: 'meta', label: 'Meta AI (Muse agent; no confirmed Llama API connector)', verification: 'unverified', baseline: 'web-search-22-11-2026 (not tested on a real account)',
    transport: { streamableHttp: true, sse: false }, limits: LIMITS, serverNameRule: null, toolNameRule: NAME,
    eligibility: ['only secondary sources (parallel.ai, CData) say Meta\'s personal agent (Muse) connects to custom remote MCP servers; no Meta document was read, so this is NOT a confirmed surface', 'Meta publishes its OWN MCP servers (Facebook, Instagram, WhatsApp, Meta Ads, developers.facebook.com/documentation/mcp): that is Meta as a server, not a host for ours', 'no confirmation that the first-party Llama API supports remote MCP; Llama models run on MCP-capable hosts such as Groq or Llama Stack, which are other hosts', 'the owner\'s account type, country and plan eligibility are unknown'],
    mustVerify: [...COMMON_MUST, 'that a Meta first-party surface can register a custom remote MCP server at all', 'country, age and account eligibility', 'who reviews custom connectors'],
  },
})

export const PROFILE_IDS = Object.keys(HOST_PROFILES) as ProfileId[]

/** Profiles that answer to a platform label (two for Gemini). Pure. */
export const profilesFor = (host: HostPlatform): HostProfile[] => PROFILE_IDS.map(i => HOST_PROFILES[i]).filter(p => p.host === host)

/** The limits that apply to a Host's calls: the STRICTEST of its profiles, so a call is safe whichever channel it came through. Pure. */
export function limitsFor(host: HostPlatform): { serverDeadlineMs: number; maxResponseBytes: number } {
  const ps = profilesFor(host)
  return { serverDeadlineMs: Math.min(...ps.map(p => p.limits.serverDeadlineMs)), maxResponseBytes: Math.min(...ps.map(p => p.limits.maxResponseBytes)) }
}
