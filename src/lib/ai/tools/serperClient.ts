// ── THE ONE DOOR TO SERPER (A2, 2026-09-20) ───────────────────────────────────────────────────
//
// Every paid Serper call (maps / search / shopping / images) goes through here, so the DAILY
// CREDIT CEILING is one check in one place. Before this, an abusive script that got past the
// per-IP burst limit could run the place search (3 credits) and the photo lookups (1 each)
// on every turn with nothing above it but the account balance.
//
//   SERPER_DAILY_CREDIT_CEILING   credits per VN day across the deployment (default 15,000 —
//                                 ≈ 2,500 place turns with photos; a normal day is well under).
//   At 80 % a WARNING is logged once per instance per day; at the ceiling every further call is
//   refused (returns null — the tool degrades to "search unavailable", the turn still answers)
//   and an ERROR `tappyai_alert serper_daily_ceiling` is logged once per instance per day.
//
// The counter is the shared daily counter (kvCounter.ts): global when the KV store is
// configured, per-instance otherwise (🚨 NOT PRODUCTION SAFE as a global cap — stated in every
// alert as `scope`). Counting is by credits AS BILLED (`SERPER_CREDITS`), added BEFORE the call
// so a burst cannot slip past the ceiling between the read and the write.

import { recordSerperCall, recordSerperOutcome, recordSerperRefused, SERPER_CREDITS, type SerperEndpoint } from './serperMeter'
import { sanitizeSerperJson } from './serperUntrusted'
import { incrDailyCounter } from '@/lib/security/kvCounter'
import { vnToday } from '@/lib/config/product'
import { admitWithinToolBudget, currentSerperSignal, haltSerperScope, releaseToolBudget, serperHaltedReason } from './serperToolBudget'

export const SERPER_CEILING_KEY = 'serper:credits'
const DEFAULT_CEILING = 15_000
// ── BOUNDED FAIL-OPEN (1b-3, 2026-09-20) ──────────────────────────────────────────────────────
// When the store is configured but does not answer, the counter falls back to THIS instance's
// shadow count (kvCounter.ts). Search must keep working through a KV outage — failing closed
// would take every place answer down with the limiter — but "keep working" used to mean the full
// 15,000 ceiling PER INSTANCE, i.e. N warm lambdas × 15,000 with nobody adding them up. During an
// outage each instance is therefore held to a much smaller ceiling of its own:
//
//   SERPER_OUTAGE_INSTANCE_CEILING   default 1,500 credits = 10 % of the daily ceiling per
//                                    instance. ≈ 375 place turns (4 credits each) — more than one
//                                    instance serves in a normal hour, so real users are not
//                                    refused by an outage; and with the handful of warm instances
//                                    Vercel keeps for this project (≤ 10 observed), N × 1,500 stays
//                                    at or under the one shared day the owner already accepted.
//
// The instance ceiling never exceeds the daily one, and the existing ERROR alert still fires.
const DEFAULT_OUTAGE_INSTANCE_CEILING = 1_500

export function serperDailyCeiling(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.SERPER_DAILY_CREDIT_CEILING)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CEILING
}

/** Per-instance ceiling that applies while the shared store is down. Never above the daily one. */
export function serperOutageInstanceCeiling(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.SERPER_OUTAGE_INSTANCE_CEILING)
  const own = Number.isFinite(n) && n > 0 ? n : DEFAULT_OUTAGE_INSTANCE_CEILING
  return Math.min(own, serperDailyCeiling(env))
}

const alerted = { warn: '', ceiling: '', storeDown: '' }

/** Admits or refuses one call against today's ceiling. Never throws. */
export async function serperAdmit(endpoint: SerperEndpoint, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const credits = SERPER_CREDITS[endpoint]
  // Bounded agent: the per-tool-invocation cap (serperToolBudget.ts) — inert outside an agent tool call.
  if (!admitWithinToolBudget(credits)) {
    console.log(JSON.stringify({ type: 'tappyai_serper_tool_budget', endpoint, refused: true, credits, ...(serperHaltedReason() ? { halted: serperHaltedReason() } : {}) }))
    recordSerperRefused(endpoint)
    return false
  }
  const { count, scope } = await incrDailyCounter(SERPER_CEILING_KEY, credits, env)
  // Store down ⇒ `count` is this instance's own day, so the ceiling it is held to is the
  // per-instance one; otherwise the shared count against the shared ceiling.
  const ceiling = scope === 'store_down' ? serperOutageInstanceCeiling(env) : serperDailyCeiling(env)
  const today = vnToday()
  if (scope === 'store_down' && alerted.storeDown !== today) {
    alerted.storeDown = today
    console.error(JSON.stringify({ type: 'tappyai_alert', alert: 'serper_ceiling_store_down', note: 'counting per instance until the store answers; per-instance outage ceiling applies', count, ceiling, dailyCeiling: serperDailyCeiling(env) }))
  }
  if (count > ceiling) {
    // Reserved on the turn / tool scope above but never sent: nothing can be billed, so the reservation goes back.
    releaseToolBudget(credits)
    recordSerperRefused(endpoint)
    if (alerted.ceiling !== today) {
      alerted.ceiling = today
      console.error(JSON.stringify({ type: 'tappyai_alert', alert: 'serper_daily_ceiling', endpoint, count, ceiling, scope, action: 'refusing further Serper calls today' }))
    }
    return false
  }
  if (count >= ceiling * 0.8 && alerted.warn !== today) {
    alerted.warn = today
    console.warn(JSON.stringify({ type: 'tappyai_alert', alert: 'serper_daily_ceiling_80pct', count, ceiling, scope }))
  }
  return true
}

/** Test seam. */
export function __resetSerperAlerts(): void { alerted.warn = ''; alerted.ceiling = ''; alerted.storeDown = '' }

/**
 * What a REJECTED request was, kept apart in the ledger: our own time limit (`timeout`), a cancellation (`aborted`), anything else that
 * stopped it before an answer (`network_error`: DNS, reset, `fetch failed`). The credit estimate does not depend on this label.
 */
export function classifyThrown(e: unknown): 'timeout' | 'aborted' | 'network_error' {
  if (e instanceof Error) {
    if (e.name === 'AbortError') return 'aborted'
    if (e.message === 'timeout') return 'timeout'
    if (/abort/i.test(e.message)) return 'aborted'
  }
  return 'network_error'
}

/**
 * One Serper request. `null` when refused by the ceiling; otherwise the Response (a timeout
 * rejects, exactly as the inlined `Promise.race` did at every call site before).
 */
export async function serperPost(endpoint: SerperEndpoint, apiKey: string, body: Record<string, unknown>, timeoutMs: number): Promise<Response | null> {
  // Phase 8 runtime: a cancelled tool invocation sends nothing more (no credit spent) and its in-flight request is aborted.
  const signal = currentSerperSignal()
  if (signal?.aborted) { console.log(JSON.stringify({ type: 'tappyai_serper_cancelled', endpoint, at: 'before_admit' })); recordSerperRefused(endpoint); return null }
  if (!(await serperAdmit(endpoint))) return null
  if (signal?.aborted) {
    // Reserved, never sent — the one case where a reservation may be given back.
    releaseToolBudget(SERPER_CREDITS[endpoint])
    recordSerperRefused(endpoint)
    console.log(JSON.stringify({ type: 'tappyai_serper_cancelled', endpoint, at: 'before_send' }))
    return null
  }
  // From here on the request is SENT: a timeout / abort below does NOT release the reservation (the provider may have processed it).
  recordSerperCall(endpoint)
  let res: Response
  try {
    res = await Promise.race([
      fetch(`https://google.serper.dev/${endpoint}`, {
        method: 'POST',
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ])
  } catch (e) {
    recordSerperOutcome(endpoint, classifyThrown(e))
    throw e
  }
  if (!res.ok) {
    // 🚨 An ACCOUNT-level failure (out of credits, bad key, forbidden) is the same answer for every further request of the turn:
    // halt the scope so the parallel requests that have not started yet are never sent (only inside a turn / tool scope).
    let account: string | null = null
    if (res.status === 401 || res.status === 402 || res.status === 403) account = `http_${res.status}`
    else if (res.status === 400) {
      try { if (/credit/i.test(await res.clone().text())) account = 'http_400_credits' } catch { /* classification only */ }
    }
    recordSerperOutcome(endpoint, account ? 'account_error' : 'http_error')
    if (account) haltSerperScope(account)
    return res
  }
  // Search data is untrusted (owner 30/09): URLs and planted instructions leave its free-text fields before any tool
  // reads them — always, not only under CONSULT_LUNA (serperUntrusted.ts). An unchanged answer is returned as is.
  let recorded = false
  try {
    const raw = await res.clone().json()
    // The provider states what it charged for this response (`credits`) — recorded beside the estimate, never used as a refund.
    recorded = true
    recordSerperOutcome(endpoint, 'ok', typeof (raw as { credits?: unknown })?.credits === 'number' ? (raw as { credits: number }).credits : undefined)
    const cleaned = sanitizeSerperJson(raw)
    if (cleaned.changed === 0) return res
    console.log(JSON.stringify({ type: 'tappyai_serper_untrusted_cleaned', endpoint, fields: cleaned.changed }))
    return new Response(JSON.stringify(cleaned.body), { status: res.status, headers: { 'content-type': 'application/json' } })
  } catch { if (!recorded) recordSerperOutcome(endpoint, 'ok'); return res }
}
