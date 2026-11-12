// Per-Host compatibility profiles as DATA (connector doc §4, R13 §25.4, ADR-CONN-016). A profile changes configuration only: limits, naming rules and what must be proven before launch. It never holds search,
// ranking, entitlement or TVI logic, and no profile claims parity with another.
//
// 🚨 EVERY profile is UNVERIFIED. The facts below are the 10/11/2026 baseline written in the connector doc (§4.2-4.5) and must be rechecked against the official documentation and a real account on the exact
// surface immediately before implementation and launch (the doc says so itself). Nothing here has been exercised against a Host: no connector is registered anywhere. The numeric limits are conservative
// placeholders for the SERVER side (our own deadline and response size), NOT measured Host limits.
import type { HostPlatform } from './connectorContract'

export type ProfileId = 'claude' | 'chatgpt' | 'gemini_apps' | 'gemini_api'

export interface HostProfile {
  id: ProfileId
  /** the platform label the Gateway sees in the verified claims (both Gemini channels share one) */
  host: HostPlatform
  label: string
  /** always the connector doc baseline: no profile is verified */
  verification: 'unverified'
  baseline: 'connector-doc-v2.1 (10/11/2026)'
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
})

export const PROFILE_IDS = Object.keys(HOST_PROFILES) as ProfileId[]

/** Profiles that answer to a platform label (two for Gemini). Pure. */
export const profilesFor = (host: HostPlatform): HostProfile[] => PROFILE_IDS.map(i => HOST_PROFILES[i]).filter(p => p.host === host)

/** The limits that apply to a Host's calls: the STRICTEST of its profiles, so a call is safe whichever channel it came through. Pure. */
export function limitsFor(host: HostPlatform): { serverDeadlineMs: number; maxResponseBytes: number } {
  const ps = profilesFor(host)
  return { serverDeadlineMs: Math.min(...ps.map(p => p.limits.serverDeadlineMs)), maxResponseBytes: Math.min(...ps.map(p => p.limits.maxResponseBytes)) }
}
