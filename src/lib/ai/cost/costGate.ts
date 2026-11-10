// ── The cost gate (R13 §13 slice 1, owner 10/11/2026): a per-account DAILY spend ceiling, reserved BEFORE the model runs ──────────────────────
//
// Why: the plan limits count questions, not money. A turn can cost 0.017 USD or 0.25 USD, and a script or a loop can spend a whole account's
// month in a day. This gate holds one number per account per VN day, in micro-USD, in the shared counter store (Upstash, the same one the plan
// quota and the Serper ceiling use), and refuses a turn BEFORE any model or search work when the day's money would pass the ceiling.
//
//   reserve  → add the turn's UPPER BOUND (by mode) to the account's day total; if the total passes the ceiling, take it back and refuse.
//   settle   → when the turn is done, replace the reservation by the turn's REAL cost (the same number the usage ledger records).
//   release  → a turn that produced nothing (failed, cancelled) gives the whole reservation back.
//
// The same shape as the Serper credit ceiling (lib/ai/tools/serperClient.ts): INCRBY returns the new total in one step, so two parallel turns
// can never both see the same remainder. Over-estimating is safe (the day total is settled down at the end); under-estimating is bounded by the
// ceiling's headroom and shows as `over_estimate` in the log.
//
// FAIL CLOSED: when the store is configured and does not answer, the turn is refused (`store_unavailable`), the same rule as the plan quota
// (a metering outage must not become free model calls). With no store configured at all (previews, local runs) it counts in the process.
//
// It is a SAFETY NET, not a product limit: the numbers are far above ordinary use and the person is told only "come back tomorrow", never a
// figure. OFF unless AI_COST_GATE=1, and locked off in a production runtime until the owner lists the name in CONSULT_PRODUCTION_ALLOW.
//
// Cost basis for the defaults (03/11 UAT logs): a chat turn ≈ 0.017 USD, a Deep Research run ≈ 0.09 USD. Plan prices: Coco 175,000đ ≈ 7 USD a
// month, Tappy 225,000đ ≈ 9 USD (×25,000).

import { incrDailyCounter } from '@/lib/security/kvCounter'
import { lockedInProduction } from '@/lib/config/consultFlags'
import type { Tier } from '@/lib/plans/tiers'

type Env = Record<string, string | undefined>

export const COST_GATE_FLAG = 'AI_COST_GATE'
/** Pure. ON only for the exact value "1", and never in a production runtime unless the owner lists the name in CONSULT_PRODUCTION_ALLOW. */
export const costGateOn = (env: Env = process.env): boolean => env[COST_GATE_FLAG] === '1' && !lockedInProduction(env, COST_GATE_FLAG)

export type GateMode = 'chat' | 'web' | 'think' | 'auto' | 'deep'

/** What one turn of this mode may cost at most, in USD. Reserved before the turn, replaced by the real cost after it. */
export const TURN_RESERVE_USD: Readonly<Record<GateMode, number>> = { chat: 0.05, web: 0.06, auto: 0.10, think: 0.12, deep: 0.25 }

/** The ceiling of one account's day by tier, in USD (VN calendar day). Optional overrides: AI_COST_DAILY_CAP_USD_FREE / _PRO / _PROMAX. */
export const DEFAULT_DAILY_CAP_USD: Readonly<Record<Tier, number>> = { free: 0.4, pro: 1.5, promax: 3.0 }

export const toMicros = (usd: number): number => (typeof usd === 'number' && Number.isFinite(usd) && usd > 0 ? Math.round(usd * 1_000_000) : 0)

/** The day ceiling in micro-USD: the env override when it is a positive number, else the default. Pure. */
export function dailyCapMicros(tier: Tier, env: Env = process.env): number {
  const raw = Number((env[`AI_COST_DAILY_CAP_USD_${tier.toUpperCase()}`] ?? '').trim())
  return toMicros(Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DAILY_CAP_USD[tier])
}

export const reserveMicros = (mode: GateMode): number => toMicros(TURN_RESERVE_USD[mode] ?? TURN_RESERVE_USD.deep)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const keyFor = (userId: string) => `ai:cost:u:${userId}`

export type CostRefusal = 'daily_cap' | 'store_unavailable'

export interface CostTurn {
  /** Replaces the reservation by the turn's real cost. Once only; a second call does nothing. */
  settle: (actualUsd: number) => Promise<void>
  /** Gives the whole reservation back. Once only, and not after a settle. */
  release: () => Promise<void>
}

export type CostReserveResult =
  | { ok: true; turn: CostTurn; usedMicros: number; capMicros: number }
  | { ok: false; reason: CostRefusal; usedMicros: number; capMicros: number }

/**
 * Reserves a turn's upper bound against the account's day ceiling. Never throws. An id that is not a UUID is not metered here (no account to
 * meter): the caller only passes a verified, signed-in account.
 */
export async function reserveTurnCost(input: { userId: string; tier: Tier; mode: GateMode; env?: Env }): Promise<CostReserveResult> {
  const env = input.env ?? process.env
  const cap = dailyCapMicros(input.tier, env)
  const bound = reserveMicros(input.mode)
  if (!UUID.test(input.userId)) return { ok: false, reason: 'store_unavailable', usedMicros: 0, capMicros: cap }
  const key = keyFor(input.userId)
  const reserved = await incrDailyCounter(key, bound, env as NodeJS.ProcessEnv)
  if (reserved.scope === 'store_down') {
    await incrDailyCounter(key, -bound, env as NodeJS.ProcessEnv)
    console.error(JSON.stringify({ type: 'tappyai_cost_gate', refused: 'store_unavailable', mode: input.mode, tier: input.tier }))
    return { ok: false, reason: 'store_unavailable', usedMicros: 0, capMicros: cap }
  }
  if (reserved.count > cap) {
    await incrDailyCounter(key, -bound, env as NodeJS.ProcessEnv)
    console.warn(JSON.stringify({ type: 'tappyai_cost_gate', refused: 'daily_cap', mode: input.mode, tier: input.tier, scope: reserved.scope }))
    return { ok: false, reason: 'daily_cap', usedMicros: Math.max(0, reserved.count - bound), capMicros: cap }
  }
  let done = false
  const turn: CostTurn = {
    async settle(actualUsd: number) {
      if (done) return
      done = true
      const actual = toMicros(actualUsd)
      const delta = actual - bound
      if (delta > 0) console.warn(JSON.stringify({ type: 'tappyai_cost_gate', over_estimate: true, mode: input.mode, reservedMicros: bound, actualMicros: actual }))
      if (delta === 0) return
      try { await incrDailyCounter(key, delta, env as NodeJS.ProcessEnv) } catch { /* the day total only ever over-counts then */ }
    },
    async release() {
      if (done) return
      done = true
      try { await incrDailyCounter(key, -bound, env as NodeJS.ProcessEnv) } catch { /* over-counts, the safe direction */ }
    },
  }
  return { ok: true, turn, usedMicros: reserved.count, capMicros: cap }
}

/** Today's total for an account, in micro-USD (0 to read). For the ledger and diagnostics; it does not reserve anything. */
export async function dayCostMicros(userId: string, env: Env = process.env): Promise<number> {
  if (!UUID.test(userId)) return 0
  const r = await incrDailyCounter(keyFor(userId), 0, env as NodeJS.ProcessEnv)
  return Math.max(0, r.count)
}
