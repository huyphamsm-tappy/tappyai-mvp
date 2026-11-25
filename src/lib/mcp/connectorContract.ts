// Remote MCP connector contract (R13 §17.8, ADR-CONN-001..022): the rules every external-AI connector call must pass, as pure functions. There is NO gateway, endpoint or OAuth server here:
// R13 requires a Source Audit and the Owner's explicit authorisation (ADR-CONN-018/019) before any of that is built or deployed. This is the part that can be decided now and tested without a Host:
//   CONNECTOR_TOOLS  — the six initial tools with fixed scopes, annotations (read-only, except job creation which is declared stateful), Top-K and byte ceilings, and result allowlists;
//   admitToolCall()  — request-scoped authentication and authorisation, checked on EVERY call (never cached from an earlier one);
//   connectorLocation() — a Host's proxy IP is never the person's location; a Home Market is never a current location;
//   shapeResult()    — allowlisted DTO fields only, Top-K and byte ceilings, no internal scoring, no raw TVI;
//   spendPoolKey()   — the External Spend Pool's keys live in their own namespace and cannot touch the Web/App allocation.
// Retrieved or tool-returned content is untrusted data. Initial release is READ-ONLY: no booking, purchase, payment or account change.

export const CONNECTOR_CONTRACT_VERSION = 'connector-contract.v1'

/** The ONE list of Hosts a connector can be registered for (22/11/2026: Cursor, Grok, DeepSeek and Meta added by the owner). Everything that names a Host derives from it. */
export const HOST_PLATFORMS = ['claude', 'chatgpt', 'gemini', 'cursor', 'grok', 'deepseek', 'meta'] as const
export type HostPlatform = typeof HOST_PLATFORMS[number]
export type ToolName = 'search_places' | 'search_restaurants' | 'search_shopping' | 'search_hotels' | 'search_attractions' | 'create_itinerary'

export interface ToolContract {
  name: ToolName
  scope: string
  annotations: { readOnlyHint: boolean; destructiveHint: false; idempotentHint: boolean; openWorldHint: boolean }
  /** create_itinerary creates durable job state: control-plane state, never a booking or purchase */
  stateful: boolean
  maxResults: number
  maxResponseBytes: number
  /** the ONLY fields a result row may carry out to a Host */
  dtoFields: readonly string[]
}

const ROW_PLACE = ['id', 'name', 'category', 'address', 'district', 'city', 'rating', 'priceLevel', 'openNow', 'distanceMeters', 'url'] as const

const read = (name: ToolName, scope: string, dtoFields: readonly string[], maxResults = 10): ToolContract => ({
  name, scope, stateful: false, maxResults, maxResponseBytes: 24_000, dtoFields,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
})

export const CONNECTOR_TOOLS: Readonly<Record<ToolName, ToolContract>> = {
  search_places: read('search_places', 'places:read', ROW_PLACE),
  search_restaurants: read('search_restaurants', 'places:read', [...ROW_PLACE, 'cuisine', 'priceRange']),
  search_shopping: read('search_shopping', 'shopping:read', ['id', 'title', 'price', 'currency', 'merchant', 'url', 'rating']),
  search_hotels: read('search_hotels', 'hotels:read', [...ROW_PLACE, 'pricePerNight', 'currency', 'stars']),
  search_attractions: read('search_attractions', 'places:read', [...ROW_PLACE, 'ticketPrice', 'openingHours']),
  create_itinerary: {
    name: 'create_itinerary', scope: 'itinerary:create', stateful: true, maxResults: 1, maxResponseBytes: 24_000,
    // honest annotation: it creates a durable job, so it is NOT read-only; it is still never destructive and never a purchase
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    dtoFields: ['jobId', 'status', 'pollAfterSeconds', 'expiresAt'],
  },
}

export const isToolName = (n: unknown): n is ToolName => typeof n === 'string' && Object.prototype.hasOwnProperty.call(CONNECTOR_TOOLS, n)

// ── request admission ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** What the token verifier established for THIS request (signature, issuer and expiry are checked by the verifier before this). */
export interface VerifiedClaims {
  /** the audience the token was issued for */
  audience: string
  scopes: readonly string[]
  /** seconds since the epoch */
  expiresAt: number
  revoked: boolean
  host: HostPlatform
  /** the connector installation on that Host: distinct from the linked user */
  installId: string
  /** the linked TappyAI user id, or null for an anonymous principal */
  userId: string | null
  /** the principal the request is for; must equal the owner of any job or resource it names */
  principalId: string
}

export type AdmissionError = 'unauthenticated' | 'wrong_audience' | 'token_expired' | 'token_revoked' | 'unknown_tool' | 'insufficient_scope' | 'principal_mismatch' | 'spend_pool_unavailable'

export type Admission = { ok: true; tool: ToolContract } | { ok: false; error: AdmissionError }

export interface CallContext {
  claims: VerifiedClaims | null
  expectedAudience: string
  now: Date
  toolName: unknown
  /** the principal that owns the job/resource the call names, when it names one (polling a job, reading a result) */
  resourceOwner?: string | null
  /** false when the External Spend Pool could not be reached or has no room: the call fails closed */
  spendPoolOk: boolean
}

/** Authenticate and authorise ONE call. Every call is judged on its own; a token that passed before proves nothing now. Pure. */
export function admitToolCall(c: CallContext): Admission {
  const k = c.claims
  if (!k) return { ok: false, error: 'unauthenticated' }
  if (k.audience !== c.expectedAudience) return { ok: false, error: 'wrong_audience' }
  if (k.revoked) return { ok: false, error: 'token_revoked' }
  if (!(k.expiresAt * 1000 > c.now.getTime())) return { ok: false, error: 'token_expired' }
  if (!isToolName(c.toolName)) return { ok: false, error: 'unknown_tool' }
  const tool = CONNECTOR_TOOLS[c.toolName]
  if (!k.scopes.includes(tool.scope)) return { ok: false, error: 'insufficient_scope' }
  if (c.resourceOwner != null && c.resourceOwner !== k.principalId) return { ok: false, error: 'principal_mismatch' }
  if (!c.spendPoolOk) return { ok: false, error: 'spend_pool_unavailable' }
  return { ok: true, tool }
}

// ── location ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export type ConnectorLocation =
  | { kind: 'explicit'; lat: number; lng: number; preciseProximityAllowed: true }
  | { kind: 'last_known'; lat: number; lng: number; preciseProximityAllowed: true }
  | { kind: 'home_market'; market: string; preciseProximityAllowed: false }
  | { kind: 'none'; preciseProximityAllowed: false }

const okLatLng = (p: { lat?: unknown; lng?: unknown } | null | undefined): p is { lat: number; lng: number } =>
  !!p && typeof p.lat === 'number' && typeof p.lng === 'number' && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180

/**
 * Where the person is, for a connector call: an explicit location they gave, else a PERMITTED last-known one, else only their Home Market (never a precise location), else nothing.
 * The Host's proxy/egress IP is not an input at all: it cannot become a location. Pure.
 */
export function connectorLocation(i: { explicit?: { lat?: unknown; lng?: unknown } | null; lastKnown?: { lat?: unknown; lng?: unknown } | null; lastKnownPermitted?: boolean; homeMarket?: string | null }): ConnectorLocation {
  if (okLatLng(i.explicit)) return { kind: 'explicit', lat: i.explicit.lat, lng: i.explicit.lng, preciseProximityAllowed: true }
  if (i.lastKnownPermitted === true && okLatLng(i.lastKnown)) return { kind: 'last_known', lat: i.lastKnown.lat, lng: i.lastKnown.lng, preciseProximityAllowed: true }
  if (i.homeMarket) return { kind: 'home_market', market: i.homeMarket, preciseProximityAllowed: false }
  return { kind: 'none', preciseProximityAllowed: false }
}

// ── result shaping ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface Shaped { rows: Array<Record<string, unknown>>; /** rows were dropped to fit the Top-K or byte ceiling: the Host is told */ partial: boolean; dropped: number }

/** Allowlisted fields only (no internal score, rank formula or raw TVI export can pass), at most maxResults rows, within the byte ceiling. No unrestricted pagination. Pure. */
export function shapeResult(toolName: ToolName, rows: ReadonlyArray<Record<string, unknown>>): Shaped {
  const t = CONNECTOR_TOOLS[toolName]
  const allowed = new Set<string>(t.dtoFields)
  const shaped = rows.slice(0, t.maxResults).map(r => Object.fromEntries(Object.entries(r).filter(([k, v]) => allowed.has(k) && v !== undefined)))
  const kept: Array<Record<string, unknown>> = []
  let bytes = 2
  for (const row of shaped) {
    const n = new TextEncoder().encode(JSON.stringify(row)).length + 1
    if (bytes + n > t.maxResponseBytes) break
    kept.push(row); bytes += n
  }
  const dropped = rows.length - kept.length
  return { rows: kept, partial: dropped > 0, dropped }
}

// ── External Spend Pool isolation ────────────────────────────────────────────────────────────────────────────────────────

/** Counter keys for the External Spend Pool. All carry the `mcp:` prefix; the Web/App allocation never does, so one cannot consume the other. Pure. */
export function spendPoolKeys(c: Pick<VerifiedClaims, 'host' | 'installId' | 'principalId'>, tool: ToolName, day: string): string[] {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 80)
  return [
    `mcp:pool:${day}`,
    `mcp:host:${c.host}:${day}`,
    `mcp:install:${safe(c.installId)}:${day}`,
    `mcp:principal:${safe(c.principalId)}:${day}`,
    `mcp:tool:${tool}:${day}`,
  ]
}
