// The Gateway's default wiring (what /api/mcp runs with). It is deliberately inert until the owner supplies the missing pieces:
//   · token verifier   → DENIES EVERYTHING. No OAuth handshake exists (Source Audit §4): the SDK is not in the repo and the Supabase OAuth server is not confirmed. Until a real verifier is plugged
//                        in here, every request is 401 AUTH_REQUIRED, so none of the adapters below can be reached over HTTP.
//   · job store        → unavailable (no durable queue chosen).
//   · hotels adapter   → NOT wired (Agoda/Vexere keys do not exist yet; nothing is invented).
//   · places + shopping adapters → real, lazily imported existing services (searchPlaces, searchProducts), never called in tests.
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import type { GatewayDeps, TokenVerifier } from './gateway'
import { createSpendPool } from './spendPool'
import { createAbuseMonitor } from './abuseGuard'
import { unavailableJobStore, type JobStore, type JobWorkerStore } from './jobs'
import { createRpcJobStore } from './jobsRpc'
import { NO_ADAPTERS, type ServiceAdapters } from './serviceMap'
import { createSupabaseTokenVerifier, parseClientRegistry, type ProviderUser } from './identity'

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
export function buildVerifier(env: Env, getUser?: (token: string) => Promise<ProviderUser | null>): TokenVerifier {
  const audience = env.MCP_RESOURCE_URL ?? ''
  const registry = parseClientRegistry(env.MCP_OAUTH_CLIENTS)
  const providerConfigured = !!env.NEXT_PUBLIC_SUPABASE_URL && !!env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!audience.startsWith('https://') || Object.keys(registry).length === 0 || (!getUser && !providerConfigured)) return denyAllVerifier
  return createSupabaseTokenVerifier({ expectedAudience: audience, registry, now: () => new Date(), getUser: getUser ?? supabaseGetUser(env) })
}

/** Per-principal rate limit: the shared sliding window, which refuses when its store is missing or down (fail closed). PLACEHOLDER numbers. */
const RATE_LIMIT = 30
const RATE_WINDOW_MS = 60_000

// per-instance memory (see abuseGuard.ts): module scope so one warm instance keeps its history between requests
const abuse = createAbuseMonitor()

export function realAdapters(): ServiceAdapters {
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
    // 'hotels.prices': deliberately null. getHotelPrices (src/lib/ai/tools/travel.ts) exists, but the owner asked for the hotel/Agoda path to stay unwired until the keys exist.
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
    adapters: realAdapters(),
    spend: createSpendPool({ env }),
    jobs: rpcJobStore(env) ?? unavailableJobStore,
    abuse,
    rateLimit: async key => {
      const r = await distributedRateLimit(key, RATE_LIMIT, RATE_WINDOW_MS)
      return { ok: r.ok, retryAfter: r.retryAfter, reason: r.reason }
    },
    log: e => console.log(JSON.stringify(e)),
    allowedOrigins: (env.MCP_ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean),
  }
}
