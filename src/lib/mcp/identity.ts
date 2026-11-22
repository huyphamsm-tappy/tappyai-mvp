// Identity of an external Host call (R13 §10.7, ADR-CONN-004): how an MCP access token becomes the request principal, as deterministic functions plus ONE injected call to the identity provider.
//
// WHAT IS REAL: the mapping, the refusal rules, the per-request provider check, the protected-resource metadata. WHAT IS NOT BUILT (and cannot be without a Host and secrets, Source Audit §4): the
// authorization server itself (authorize / token / client registration are Supabase's OAuth server, which must be switched on in the project), the consent screen, the registration of each
// connector at Claude / ChatGPT / Gemini, and an end-to-end token issued to a real Host. The claim names of a Supabase OAuth token (`client_id`, `scope`, `aud`, `sub`, `is_anonymous`) are
// INFERRED from the auth-js types and the OAuth 2.1 profile, NOT yet seen on a real token.
//
// The four identities stay distinct: the Host (from the REGISTERED client, never from a claim the Host writes), the installation (host + client id), the linked user (`sub` of a verified
// token) and the anonymous principal (an anonymous Supabase session). A token is never believed from its payload alone: the identity provider is asked on every request, and refusal or
// outage means no access. No service-role client is involved anywhere here.
import { HOST_PLATFORMS, type HostPlatform, type VerifiedClaims } from './connectorContract'
import type { TokenVerifier } from './gateway'

type Env = Record<string, string | undefined>

export const MCP_SCOPES = ['places:read', 'hotels:read', 'shopping:read', 'itinerary:create'] as const
const SCOPE_SET: ReadonlySet<string> = new Set(MCP_SCOPES)
const HOSTS: ReadonlySet<string> = new Set<string>(HOST_PLATFORMS)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** client_id of a registered connector → the Host it was registered for. Written by the owner at registration time; client ids are not secrets. */
export type ClientRegistry = Readonly<Record<string, { host: HostPlatform }>>

/** Reads MCP_OAUTH_CLIENTS (JSON: {"<client_id>": {"host": "claude"}}). Anything malformed is an empty registry, so nobody is let in. Pure. */
export function parseClientRegistry(raw: string | undefined): ClientRegistry {
  try {
    const j = JSON.parse(raw ?? '{}') as unknown
    if (!j || typeof j !== 'object' || Array.isArray(j)) return {}
    const out: Record<string, { host: HostPlatform }> = {}
    for (const [id, v] of Object.entries(j as Record<string, unknown>)) {
      const host = v && typeof v === 'object' ? (v as { host?: unknown }).host : undefined
      if (id && typeof host === 'string' && HOSTS.has(host)) out[id] = { host: host as HostPlatform }
    }
    return out
  } catch { return {} }
}

export interface IdentityOptions { expectedAudience: string; registry: ClientRegistry; now: () => Date }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Claims of THIS call from an already-validated token payload. Null when the token names no registered client or has no usable subject/expiry. Pure. */
export function claimsFromJwtPayload(p: Record<string, unknown>, o: IdentityOptions): VerifiedClaims | null {
  const clientId = typeof p.client_id === 'string' ? p.client_id : ''
  const client = clientId && Object.prototype.hasOwnProperty.call(o.registry, clientId) ? o.registry[clientId] : null
  if (!client) return null
  const sub = typeof p.sub === 'string' && UUID.test(p.sub) ? p.sub : null
  const exp = num(p.exp)
  if (!sub || exp === null) return null
  const aud = Array.isArray(p.aud) ? p.aud.filter((a): a is string => typeof a === 'string') : typeof p.aud === 'string' ? [p.aud] : []
  const scopes = (typeof p.scope === 'string' ? p.scope.split(/\s+/) : []).filter(s => SCOPE_SET.has(s))
  const anonymous = p.is_anonymous === true
  return {
    audience: aud.includes(o.expectedAudience) ? o.expectedAudience : (aud[0] ?? ''),
    scopes: [...new Set(scopes)], expiresAt: exp, revoked: false,
    host: client.host, installId: `${client.host}:${clientId}`,
    userId: anonymous ? null : sub, principalId: anonymous ? `a:${sub}` : `u:${sub}`,
  }
}

/** The token of a `Bearer <token>` header: visible token characters only, bounded size. Pure. */
export function bearerOf(h: string | null | undefined): string | null {
  if (typeof h !== 'string') return null
  const m = /^Bearer ([A-Za-z0-9._~+/=-]{1,4096})$/.exec(h)
  return m ? m[1] : null
}

/** The payload of a JWT as an object, WITHOUT checking anything: only for reading claims of a token the identity provider has just accepted. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const j = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as unknown
    return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : null
  } catch { return null }
}

export interface ProviderUser { id: string; is_anonymous?: boolean }

/**
 * The verifier of the Gateway. `getUser` is the identity provider's own check (Supabase `auth.getUser(token)`: signature, expiry, session revocation); it is called on EVERY request.
 * Its answer is authoritative for "is this token alive and whose is it": the payload is read only afterwards, and its subject must equal the provider's user.
 */
export function createSupabaseTokenVerifier(o: IdentityOptions & { getUser: (token: string) => Promise<ProviderUser | null> }): TokenVerifier {
  return async authorization => {
    const token = bearerOf(authorization)
    if (!token) return null
    const payload = decodeJwtPayload(token)
    if (!payload) return null
    let user: ProviderUser | null
    try { user = await o.getUser(token) } catch { return null }
    if (!user || user.id !== payload.sub) return null
    return claimsFromJwtPayload(payload, o)
  }
}

/** RFC 9728 protected-resource metadata, from configuration. Null (the route answers 404) unless the resource and its authorization server are both configured over https. Pure. */
export function protectedResourceMetadata(env: Env): Record<string, unknown> | null {
  const resource = env.MCP_RESOURCE_URL ?? ''
  const server = env.MCP_AUTH_SERVER_URL ?? ''
  if (!resource.startsWith('https://') || !server.startsWith('https://')) return null
  return { resource, authorization_servers: [server], scopes_supported: [...MCP_SCOPES], bearer_methods_supported: ['header'], resource_name: 'TappyAI MCP' }
}
