// MCP External Spend Pool (R13 §13.2, ADR-CONN-006): the money an external Host's calls may spend, held in its OWN counters on the SAME atomic counter store the Web/App cost gate uses
// (incrDailyCounter: INCRBY returns the new total in one step, so two parallel requests never see the same remainder). It is NOT a second FinOps engine and it never reads or writes a Web/App key:
// every key here starts with `mcp:` (spendPoolKeys) and the Web/App keys (`ai:cost:u:`, the Serper ceiling) never do.
//
//   reserve  → add the call's UPPER BOUND to five levels, widest first: pool → host → install → principal → tool. Any level over its cap → every level already taken is given back → refused.
//   settle   → replace the reservation by the real cost.   release → a call that provably never reached the provider gives it all back.
//   keep     → the call may have reached the provider (error, deadline, client gone mid-flight): the reservation STAYS counted (UNKNOWN_OUTCOME). A timeout does not prove the call was free.
//
// FAIL CLOSED: no cap configured, an invalid cap, a counter store that does not answer, or (in a production runtime) a counter that is only per-instance → no paid call. There is no default cap.
// The caps are the owner's numbers (env MCP_POOL_*_USD). The per-tool reservation below is a conservative PLACEHOLDER, not a measured cost.
import { incrDailyCounter, type CounterResult } from '@/lib/security/kvCounter'
import { isDistributedStoreConfigured } from '@/lib/security/distributedRateLimit'
import { isProductionRuntime } from '@/lib/config/consultFlags'
import { vnToday } from '@/lib/config/product'
import { spendPoolKeys, type ToolName, type VerifiedClaims } from './connectorContract'

type Env = Record<string, string | undefined>
type Incr = (key: string, by: number, env?: NodeJS.ProcessEnv) => Promise<CounterResult>

/** PLACEHOLDER upper bounds in USD for one call of each paid tool (Serper credits are ~0.001 USD each; a search may use a few). Replace by measured values before any launch. */
export const TOOL_RESERVE_USD: Readonly<Record<ToolName, number>> = {
  search_places: 0.01, search_restaurants: 0.01, search_attractions: 0.01, search_shopping: 0.01, search_hotels: 0.03, create_itinerary: 0.15,
  // a link check asks a few providers (threat list, whois, DNS, certificate, redirects); no LLM. PLACEHOLDER like the rest: measure after launch.
  check_scam: 0.01,
}

export const POOL_CAP_ENV = ['MCP_POOL_DAILY_USD', 'MCP_POOL_HOST_USD', 'MCP_POOL_INSTALL_USD', 'MCP_POOL_PRINCIPAL_USD', 'MCP_POOL_TOOL_USD'] as const
export const REQUEST_CAP_ENV = 'MCP_POOL_REQUEST_USD'

export type ReserveRefusal = 'no_caps' | 'request_ceiling' | 'budget_exceeded' | 'store_unavailable'

export interface SpendReservation {
  /** Replaces the reservation by the real cost. Once only, and not after release/keep. */
  settle(actualUsd: number): Promise<void>
  /** The call never reached the provider: gives everything back. Once only. */
  release(): Promise<void>
  /** Unknown outcome: the reservation stays counted. A later release or settle does nothing. */
  keep(reason: string): void
}

export type ReserveResult = { ok: true; reservation: SpendReservation; keys: readonly string[] } | { ok: false; reason: ReserveRefusal }

export interface SpendPool {
  reserve(i: { claims: Pick<VerifiedClaims, 'host' | 'installId' | 'principalId'>; tool: ToolName; estimateUsd: number; requestId: string }): Promise<ReserveResult>
}

/** A cap in micro-USD from a plain positive decimal with at most 6 decimals; anything else is null. */
function capMicros(v: string | undefined): number | null {
  const s = (v ?? '').trim()
  if (!/^\d+(\.\d{1,6})?$/.test(s)) return null
  const n = Math.round(Number(s) * 1_000_000)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

export function createSpendPool(o: { env?: Env; incr?: Incr } = {}): SpendPool {
  const env = o.env ?? process.env
  const incr: Incr = o.incr ?? ((k, by, e) => incrDailyCounter(k, by, e))
  const envForStore = env as NodeJS.ProcessEnv
  return {
    async reserve({ claims, tool, estimateUsd, requestId }) {
      const caps = POOL_CAP_ENV.map(n => capMicros(env[n]))
      const requestCap = capMicros(env[REQUEST_CAP_ENV])
      if (caps.some(c => c === null) || requestCap === null) return { ok: false, reason: 'no_caps' }
      const bound = Number.isFinite(estimateUsd) && estimateUsd > 0 ? Math.ceil(estimateUsd * 1_000_000) : 0
      if (bound > requestCap) return { ok: false, reason: 'request_ceiling' }
      const production = isProductionRuntime(env)
      // a per-instance counter is not a pool: in production it would turn the global ceiling into one per lambda
      if (production && !isDistributedStoreConfigured(envForStore)) return { ok: false, reason: 'store_unavailable' }

      const keys = spendPoolKeys(claims, tool, vnToday())
      const taken: string[] = []
      const giveBack = async () => { for (const k of taken) { try { await incr(k, -bound, envForStore) } catch { /* over-counts: the safe direction */ } } }
      for (let i = 0; i < keys.length; i++) {
        let r: CounterResult
        let answered = true
        try { r = await incr(keys[i], bound, envForStore) } catch { r = { count: 0, scope: 'store_down' }; answered = false }
        if (r.scope === 'store_down' || (production && r.scope === 'instance')) {
          // an ANSWERED store_down means the counter's in-process fallback added this level's bound: give it back too, with every level taken before it. A throw added nothing.
          if (answered) taken.push(keys[i])
          await giveBack()
          console.error(JSON.stringify({ type: 'tappyai_mcp_spend', refused: 'store_unavailable', request_id: requestId }))
          return { ok: false, reason: 'store_unavailable' }
        }
        taken.push(keys[i])
        if (r.count > (caps[i] as number)) {
          await giveBack()
          console.warn(JSON.stringify({ type: 'tappyai_mcp_spend', refused: 'budget_exceeded', level: i, request_id: requestId }))
          return { ok: false, reason: 'budget_exceeded' }
        }
      }
      let state: 'held' | 'done' | 'kept' = 'held'
      const adjust = async (delta: number) => { if (delta === 0) return; for (const k of keys) { try { await incr(k, delta, envForStore) } catch { /* over-counts */ } } }
      const reservation: SpendReservation = {
        async settle(actualUsd) {
          if (state !== 'held') return
          state = 'done'
          if (!(typeof actualUsd === 'number' && Number.isFinite(actualUsd) && actualUsd >= 0)) return // unreadable cost: the reservation stays as the cost
          await adjust(Math.ceil(actualUsd * 1_000_000) - bound)
        },
        async release() { if (state !== 'held') return; state = 'done'; await adjust(-bound) },
        keep(reason) { if (state !== 'held') return; state = 'kept'; console.warn(JSON.stringify({ type: 'tappyai_mcp_spend', unknown_outcome: true, reason, request_id: requestId })) },
      }
      return { ok: true, reservation, keys }
    },
  }
}
