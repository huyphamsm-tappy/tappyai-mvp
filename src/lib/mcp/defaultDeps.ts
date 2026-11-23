// The Gateway's default wiring (what /api/mcp runs with). It is deliberately inert until the owner supplies the missing pieces:
//   · token verifier   → DENIES EVERYTHING unless the https resource URL, a registered client and the identity-provider settings are all configured (identity.ts). The OAuth server itself is not built here
//                        (Source Audit §4), so with no configuration every request is 401 AUTH_REQUIRED and none of the adapters below can be reached over HTTP.
//   · job store        → unavailable unless MCP_JOBS_ENABLED=1 (and the owner has applied the 20261121 migration).
//   · hotels adapter   → NOT wired until Agoda keys are present AND a real client is plugged in (providers.ts); today no client exists, so it stays null. Nothing is invented.
//   · places + shopping adapters → real, lazily imported existing services (searchPlaces, searchProducts), never called in tests.
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import type { GatewayDeps, TokenVerifier } from './gateway'
import { createSpendPool } from './spendPool'
import { createAbuseMonitor } from './abuseGuard'
import { unavailableJobStore, type JobStore, type JobWorkerStore } from './jobs'
import { createRpcJobStore } from './jobsRpc'
import { hotelAdapter, hotelProviderFromEnv } from './providers'
import { attributionConfig } from './attribution'
import { createMetrics } from './metrics'
import { NO_ADAPTERS, type ServiceAdapters } from './serviceMap'
import { createSupabaseTokenVerifier, parseClientRegistry, type ProviderUser } from './identity'
import type { ClientLookup } from './clientApproval'
import { approvalResolver } from './approvalWiring'

type Env = Record<string, string | undefined>

export const denyAllVerifier: TokenVerifier = async () => null

/** The identity provider's own token check (Supabase auth.getUser): signature, expiry and session revocation. A plain anon-key client acting for the token: no service role. Lazily imported. */
function supabaseGetUser(env: Env): (token: string) => Promise<ProviderUser | null> {
  return async token => {
    const { createClient } = await import('@supabase/supabase-js')
    const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL as string, env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data, error } = await c.auth.getUser(token)
    return error || !data.user ? null : { id: data.user.id, is_anonymous: data.user.is_anonymous }
  }
}

/**
 * The token verifier: the Supabase-backed one ONLY when the resource URL (https), at least one registered client and the identity provider settings are all configured; otherwise deny-all.
 * `getUser` is a test seam. Presence of settings is checked, their values are never read into any output.
 */
export function buildVerifier(env: Env, getUser?: (token: string) => Promise<ProviderUser | null>, lookup?: ClientLookup | null): TokenVerifier {
  const audience = env.MCP_RESOURCE_URL ?? ''
  const registry = parseClientRegistry(env.MCP_OAUTH_CLIENTS)
  const providerConfigured = !!env.NEXT_PUBLIC_SUPABASE_URL && !!env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  // A client is approved by hand (MCP_OAUTH_CLIENTS) or, when the admin lookup is configured, by where it redirects (clientApproval.ts). With neither, nobody is let in.
  const resolveClient = approvalResolver(env, lookup)
  if (!audience.startsWith('https://') || (Object.keys(registry).length === 0 && !resolveClient) || (!getUser && !providerConfigured)) return denyAllVerifier
  return createSupabaseTokenVerifier({ expectedAudience: audience, registry, now: () => new Date(), getUser: getUser ?? supabaseGetUser(env), ...(resolveClient ? { resolveClient } : {}) })
}

/** Per-principal rate limit: the shared sliding window, which refuses when its store is missing or down (fail closed). PLACEHOLDER numbers. */
const RATE_LIMIT = 30
const RATE_WINDOW_MS = 60_000

// per-instance memory (see abuseGuard.ts): module scope so one warm instance keeps its history between requests
const abuse = createAbuseMonitor()
const metrics = createMetrics()

export function realAdapters(env: Env = process.env): ServiceAdapters {
  return {
    ...NO_ADAPTERS,
    'places.search': async c => {
      const [{ searchPlaces }, { createPlacesBudget, PLACES_BUDGET_DEFAULT }] = await Promise.all([import('@/lib/ai/tools/food'), import('@/lib/ai/tools/placesBudget')])
      const bias = c.lat !== undefined && c.lng !== undefined ? { lat: c.lat, lng: c.lng } : null
      const r = (await searchPlaces(c.query, c.location, c.placeType, c.lang, bias, createPlacesBudget(PLACES_BUDGET_DEFAULT), { priceRetry: false })) as { results?: unknown }
      return { rows: Array.isArray(r?.results) ? (r.results as Array<Record<string, unknown>>) : [] }
    },
    'shopping.search': async c => {
      const { searchProducts } = await import('@/lib/ai/tools/shopping')
      const r = (await searchProducts(c.query, c.lang, { merchantLinks: false })) as { search_results?: unknown }
      return { rows: Array.isArray(r?.search_results) ? (r.search_results as Array<Record<string, unknown>>) : [] }
    },
    // hotels: wired ONLY when the provider keys are present AND a real client has been plugged in (providers.ts); today no client exists, so this stays null. getHotelPrices (travel.ts) is deliberately not used.
    'hotels.prices': (() => { const p = hotelProviderFromEnv(env); return p ? hotelAdapter(p) : null })(),
  }
}

/**
 * The persisted job store, ONLY when MCP_JOBS_ENABLED=1 (set it after the owner has applied supabase/migrations/20261121_mcp_jobs.sql); otherwise null. It reaches the table through the
 * migration's service-role functions only (each filters on the owner principal); the admin client is created on first use, so a missing service configuration is JobStoreUnavailable, never a crash.
 */
export function rpcJobStore(env: Env = process.env): (JobStore & JobWorkerStore) | null {
  if (env.MCP_JOBS_ENABLED !== '1') return null
  return createRpcJobStore({ rpc: async (fn, args) => { const { createAdminClient } = await import('@/lib/supabase/admin'); return createAdminClient().rpc(fn, args) } })
}

export function buildGatewayDeps(env: Env = process.env, seams: { getUser?: (token: string) => Promise<ProviderUser | null> } = {}): GatewayDeps {
  return {
    verify: buildVerifier(env, seams.getUser),
    expectedAudience: env.MCP_RESOURCE_URL ?? '',
    resourceMetadataUrl: env.MCP_RESOURCE_METADATA_URL || undefined,
    adapters: realAdapters(env),
    spend: createSpendPool({ env }),
    jobs: rpcJobStore(env) ?? unavailableJobStore,
    abuse,
    attribution: attributionConfig(env),
    metrics: e => metrics.record(e),
    rateLimit: async key => {
      const r = await distributedRateLimit(key, RATE_LIMIT, RATE_WINDOW_MS)
      return { ok: r.ok, retryAfter: r.retryAfter, reason: r.reason }
    },
    log: e => console.log(JSON.stringify(e)),
    allowedOrigins: (env.MCP_ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean),
  }
}
