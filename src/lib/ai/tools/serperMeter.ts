/**
 * Serper call meter — process-wide counters per endpoint, read by the audit
 * usage sink to attribute paid calls to a turn. Counting only; it never
 * changes whether a call is made. Process-global (not per request): the audit
 * runner sends turns one at a time, and the sink records the delta across a
 * turn, which is exact under that condition and an upper bound otherwise.
 *
 * `hits` (2026-09-29) counts requests answered by the SHARED Serper cache
 * (serperCache.ts) instead of a paid call — i.e. calls avoided. L1 (in-memory)
 * hits are not counted; they existed before and are not new savings.
 */
export type SerperEndpoint = 'maps' | 'search' | 'shopping' | 'images'

const ENDPOINTS: SerperEndpoint[] = ['maps', 'search', 'shopping', 'images']

export type SerperSnapshot = Record<SerperEndpoint, number> & { hits: Record<SerperEndpoint, number> }

const counts: Record<SerperEndpoint, number> = { maps: 0, search: 0, shopping: 0, images: 0 }
const hits: Record<SerperEndpoint, number> = { maps: 0, search: 0, shopping: 0, images: 0 }

/**
 * THE cost model — one definition read by the trace, the per-tool / per-turn budgets and the daily ceiling (serperAdmit reserves
 * `SERPER_CREDITS[endpoint]` BEFORE the request is sent). Post-credit audit (09/10): the table used to say shopping = 1 while the
 * owner's Activity Log shows 2 for a /shopping request, so every cap under-counted each product search by a credit.
 *
 * `basis` says where each number comes from — none of these is claimed to be Serper's official price list:
 *   · 'activity_log'  — observed in the owner's Serper Activity Log (search 1, shopping 2 for Num=40, maps 3 for 20 rows);
 *   · 'unverified'    — NOT observed; the conservative working value (images: one call is assumed to cost at least 1 credit and is
 *                       never treated as free). Counted as UNKNOWN in the ledger until it is reconciled against the Activity Log.
 * Serper also returns the credits it charged in each response body (`credits`); the ledger records that figure (`reported`) next to
 * the estimate, so a mismatch is visible per endpoint without waiting for the dashboard.
 */
export const SERPER_COST: Record<SerperEndpoint, { credits: number; basis: 'activity_log' | 'unverified' }> = {
  maps: { credits: 3, basis: 'activity_log' },
  search: { credits: 1, basis: 'activity_log' },
  shopping: { credits: 2, basis: 'activity_log' },
  images: { credits: 1, basis: 'unverified' },
}

/** Estimated billable credits per call (derived from SERPER_COST — the single source). */
export const SERPER_CREDITS: Record<SerperEndpoint, number> = { maps: SERPER_COST.maps.credits, search: SERPER_COST.search.credits, shopping: SERPER_COST.shopping.credits, images: SERPER_COST.images.credits }

/**
 * Request ledger — what actually happened, kept apart so an attempt is never reported as money spent:
 *   attempted  a request was sent (counts, whatever came back — a client timeout may still have been billed);
 *   outcomes, one per attempted request:
 *     ok             the provider answered 2xx;
 *     http_error     the provider answered a non-2xx that is about THIS request (5xx, bad parameters, rate limit …);
 *     account_error  the provider refused for the ACCOUNT (out of credits, bad key, forbidden) — the turn is halted after it;
 *     timeout        OUR time limit for the request ran out (the provider may still have processed it);
 *     aborted        the runtime / the last interested caller cancelled it mid-flight;
 *     network_error  the request failed before an answer (DNS, reset, `fetch failed`) — not a timeout, not a cancellation;
 *   Credits are NOT derived from the outcome: every attempted request is estimated at the model's price (a network error or a
 *   timeout may or may not have been billed — it is never assumed free).
 *   refused    the budget / ceiling / cancellation stopped it BEFORE sending (no request, no credits);
 *   reported   credits the provider said it charged in the response body (only for responses we could read);
 *   reconciled credits matched against the provider's Activity Log — ALWAYS 0 here: only the owner can reconcile.
 */
export interface SerperLedgerRow { attempted: number; ok: number; http_error: number; account_error: number; network_error: number; timeout: number; aborted: number; refused: number; reported: number; reportedResponses: number }
const emptyRow = (): SerperLedgerRow => ({ attempted: 0, ok: 0, http_error: 0, account_error: 0, network_error: 0, timeout: 0, aborted: 0, refused: 0, reported: 0, reportedResponses: 0 })
const ledger: Record<SerperEndpoint, SerperLedgerRow> = { maps: emptyRow(), search: emptyRow(), shopping: emptyRow(), images: emptyRow() }
const l1Hits: Record<SerperEndpoint, number> = { maps: 0, search: 0, shopping: 0, images: 0 }
const bypass = { l2_not_configured: 0 }

export type SerperOutcome = 'ok' | 'http_error' | 'account_error' | 'network_error' | 'timeout' | 'aborted'
export function recordSerperOutcome(endpoint: SerperEndpoint, outcome: SerperOutcome, reportedCredits?: number): void {
  ledger[endpoint][outcome]++
  if (typeof reportedCredits === 'number' && Number.isFinite(reportedCredits) && reportedCredits >= 0) { ledger[endpoint].reported += reportedCredits; ledger[endpoint].reportedResponses++ }
}
export function recordSerperRefused(endpoint: SerperEndpoint): void { ledger[endpoint].refused++ }
/** One request answered from the in-memory cache (L1): no provider call. */
export function recordSerperL1Hit(endpoint: SerperEndpoint): void { l1Hits[endpoint]++ }
/** The shared cache (L2) could not be used because no store is configured: every L2 read is a miss, every write a no-op. */
export function recordSerperL2Bypass(): void { bypass.l2_not_configured++ }

export interface SerperLedgerSnapshot {
  endpoints: Record<SerperEndpoint, SerperLedgerRow>
  l1Hits: Record<SerperEndpoint, number>
  l2Bypass: { l2_not_configured: number }
}
export function serperLedgerSnapshot(): SerperLedgerSnapshot {
  const endpoints = { maps: { ...ledger.maps }, search: { ...ledger.search }, shopping: { ...ledger.shopping }, images: { ...ledger.images } }
  return { endpoints, l1Hits: { ...l1Hits }, l2Bypass: { ...bypass } }
}
/** Ledger movement since `before`, with the estimated billable credits (attempted × model) split into known / UNKNOWN basis. */
export function serperLedgerDelta(before: SerperLedgerSnapshot): {
  endpoints: Record<SerperEndpoint, SerperLedgerRow>
  l1Hits: number
  l2Bypass: number
  estimatedBillable: number
  estimatedUnknownBasis: number
  reported: number
  reconciled: 0
} {
  const now = serperLedgerSnapshot()
  const out = { maps: emptyRow(), search: emptyRow(), shopping: emptyRow(), images: emptyRow() }
  let estimatedBillable = 0, estimatedUnknownBasis = 0, reported = 0
  for (const k of ENDPOINTS) {
    for (const f of Object.keys(out[k]) as Array<keyof SerperLedgerRow>) out[k][f] = now.endpoints[k][f] - before.endpoints[k][f]
    const est = out[k].attempted * SERPER_CREDITS[k]
    estimatedBillable += est
    if (SERPER_COST[k].basis === 'unverified') estimatedUnknownBasis += est
    reported += out[k].reported
  }
  const sum = (r: Record<SerperEndpoint, number>) => ENDPOINTS.reduce((n, k) => n + r[k], 0)
  return { endpoints: out, l1Hits: sum(now.l1Hits) - sum(before.l1Hits), l2Bypass: now.l2Bypass.l2_not_configured - before.l2Bypass.l2_not_configured, estimatedBillable, estimatedUnknownBasis, reported, reconciled: 0 }
}

/**
 * Wave 2G (CONSULT_TRACE_DIAGNOSTICS only): a listener told about each request AT THE MOMENT it is sent, so the trace can charge the request to the tool call that sent it (the process-wide
 * counters above cannot tell two overlapping calls apart). Null unless a trace turn registered one; it never changes a count, a decision or a request, and a listener that throws is ignored.
 */
let callObserver: ((endpoint: SerperEndpoint) => void) | null = null
export function setSerperCallObserver(fn: ((endpoint: SerperEndpoint) => void) | null): void { callObserver = fn }

export function recordSerperCall(endpoint: SerperEndpoint): void {
  counts[endpoint]++
  ledger[endpoint].attempted++
  if (callObserver) { try { callObserver(endpoint) } catch { /* a trace can never break a request */ } }
}

/** One request served from the shared cache — no Serper call, no credits. */
export function recordSerperCacheHit(endpoint: SerperEndpoint): void {
  hits[endpoint]++
}

export function serperSnapshot(): SerperSnapshot {
  return { ...counts, hits: { ...hits } }
}


/**
 * Calls/credits since `before`, plus shared-cache `hits` and the credits they saved.
 * `before` may be an older snapshot without `hits` (treated as zero).
 */
export function serperDelta(before: Record<SerperEndpoint, number> & { hits?: Record<SerperEndpoint, number> }): {
  calls: Record<SerperEndpoint, number>
  credits: number
  hits: Record<SerperEndpoint, number>
  creditsSaved: number
} {
  const now = serperSnapshot()
  const calls = { maps: now.maps - before.maps, search: now.search - before.search, shopping: now.shopping - before.shopping, images: now.images - before.images }
  const credits = ENDPOINTS.reduce((n, k) => n + calls[k] * SERPER_CREDITS[k], 0)
  const b = before.hits
  const hitDelta = { maps: now.hits.maps - (b?.maps ?? 0), search: now.hits.search - (b?.search ?? 0), shopping: now.hits.shopping - (b?.shopping ?? 0), images: now.hits.images - (b?.images ?? 0) }
  const creditsSaved = ENDPOINTS.reduce((n, k) => n + hitDelta[k] * SERPER_CREDITS[k], 0)
  return { calls, credits, hits: hitDelta, creditsSaved }
}
