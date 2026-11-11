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
import { unavailableJobStore } from './jobs'
import { NO_ADAPTERS, type ServiceAdapters } from './serviceMap'

type Env = Record<string, string | undefined>

export const denyAllVerifier: TokenVerifier = async () => null

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

export function buildGatewayDeps(env: Env = process.env): GatewayDeps {
  return {
    verify: denyAllVerifier,
    expectedAudience: env.MCP_RESOURCE_URL ?? '',
    resourceMetadataUrl: env.MCP_RESOURCE_METADATA_URL || undefined,
    adapters: realAdapters(),
    spend: createSpendPool({ env }),
    jobs: unavailableJobStore,
    abuse,
    rateLimit: async key => {
      const r = await distributedRateLimit(key, RATE_LIMIT, RATE_WINDOW_MS)
      return { ok: r.ok, retryAfter: r.retryAfter, reason: r.reason }
    },
    log: e => console.log(JSON.stringify(e)),
    allowedOrigins: (env.MCP_ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean),
  }
}
