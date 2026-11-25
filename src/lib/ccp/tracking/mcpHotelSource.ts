// The connector's (MCP gateway) hotel source: Agoda's Affiliate Lite API through the SAME realtime adapter the Tappy chat already uses (src/lib/providers/realtime/agodaLite.ts).
// Nothing new is invented here: the request, the credentials (names only, read by the adapter), the city-id table and the tracked landing link are the chat's own. This file only
// adapts the adapter's SearchResult to the gateway's HotelOffer and says whether the adapter is READY (flag CCP_REALTIME_AGODA_LITE on and both credentials present).
//
// It lives under ccp/tracking because that is the only place the architecture guard lets partner credentials be reached from (providers.ts names no key and reads no setting).
// UNVERIFIED end to end through the gateway: the adapter itself is the chat's and was measured against Agoda on 30/10/2026; this wrapper is tested with a fake HTTP only.
import { resolveBooking } from '@/lib/providers/realtime/resolve'
import { adapterState } from '@/lib/providers/realtime/common'
import { agodaLiteAdapter } from '@/lib/providers/realtime/agodaLite'
import type { AdapterDeps, SearchCriteria } from '@/lib/providers/realtime/types'
import type { HotelOffer, HotelProvider, HotelQuery, ProviderSource } from '@/lib/mcp/providers'

type Env = Record<string, string | undefined>

/** Two adults, one room: the one occupancy the connector tool can express today (it has no guests field). The price is Agoda's nightly rate, before taxes and fees. */
const ADULTS = 2

export function agodaHotelProvider(env: Env, deps: { http?: AdapterDeps['http']; now?: () => Date } = {}): HotelProvider {
  return {
    async search(q: HotelQuery): Promise<HotelOffer[]> {
      // The Lite API prices a stay: without both dates there is nothing true to say about a price, so nothing is searched and nothing is invented.
      if (!q.checkIn || !q.checkOut) return []
      const criteria: SearchCriteria = {
        vertical: 'hotel', subject: q.location, currency: 'VND', limit: q.limit,
        context: { destination: q.location, checkIn: q.checkIn, checkOut: q.checkOut, adults: ADULTS, rooms: 1 },
      }
      const res = await resolveBooking(criteria, { env: env as AdapterDeps['env'], adapters: [agodaLiteAdapter], fallbackLinks: false, ...(deps.http ? { http: deps.http } : {}), ...(deps.now ? { now: deps.now } : {}) })
      return res.realtime
        .filter(r => r.provider === 'agoda' && r.vertical === 'hotel')
        .slice(0, q.limit)
        .map((r): HotelOffer => ({
          name: r.title,
          pricePerNight: r.price !== null && r.priceUnit === 'per_night' ? r.price : undefined,
          currency: r.price !== null && r.priceUnit === 'per_night' ? r.currency ?? undefined : undefined,
          url: r.bookingUrl ?? undefined,
        }))
    },
  }
}

export const MCP_HOTEL_SOURCE: ProviderSource<HotelProvider> = {
  isConfigured: env => adapterState(agodaLiteAdapter, env as AdapterDeps['env']).state === 'READY',
  create: env => agodaHotelProvider(env),
}
