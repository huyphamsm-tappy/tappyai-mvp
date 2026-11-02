import { PROVIDER_ACCESS } from '@/lib/providers/travelData'
import { fail } from './common'
import type { RealtimeAdapter } from './types'

// ── Traveloka and Vexere — adapter skeletons (BLOCKED — awaiting provider access) ─────────────────────────────────────────────────
//
// Neither provider publishes an API schema (docs/audit/DATA-SOURCE-RESOLUTION.md, 04/10): Traveloka's Partners Network and Vexere's
// "Tích hợp hệ thống - API" / AMS open after registration and a commercial agreement. A parser written now would be a guess, so these
// adapters have the full interface, the flag, and the credential env NAMES (shared with PROVIDER_ACCESS), and answer:
//   · flag OFF            → 'off'
//   · credentials missing → 'credentials_missing'  (BLOCKED)
//   · credentials present → 'unsupported'          (schema mapping not written: needs the provider's docs)
// They never call the network and never fabricate a result. The dynamic deeplinks that work today stay in src/lib/ccp (the fallback chain).
//
// When an agreement lands, only `search` / `recheck` below gain a provider → SearchResult mapping (route, date, operator, trip, fare, seats
// for Vexere; flight itinerary, fare, availability and hotel room/rate for Traveloka); the contract, flags, resolver and tests do not change.

export const travelokaAdapter: RealtimeAdapter = {
  provider: 'traveloka',
  verticals: ['flight', 'hotel'],
  credentialEnv: PROVIDER_ACCESS.traveloka.credentialEnv,
  flagEnv: 'CCP_REALTIME_TRAVELOKA',
  async search() { return fail('unsupported', 'traveloka schema not published — mapping pending agreement') },
}

export const vexereAdapter: RealtimeAdapter = {
  provider: 'vexere',
  verticals: ['bus'],
  credentialEnv: PROVIDER_ACCESS.vexere.credentialEnv,
  flagEnv: 'CCP_REALTIME_VEXERE',
  async search() { return fail('unsupported', 'vexere schema not published — mapping pending agreement') },
}
