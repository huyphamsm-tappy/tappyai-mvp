import type { SupabaseClient, User } from '@supabase/supabase-js'
import { ANON_LIFETIME_LIMIT, FREE_DAILY_LIMIT, vnToday } from '@/lib/config/product'
import {
  distributedCountInWindow, distributedRateLimit, isDistributedStoreConfigured,
} from '@/lib/security/distributedRateLimit'

// ── The ONE AI question quota ────────────────────────────────────────────────
//
// Every feature that invokes a model spends from HERE and nowhere else: a chat turn in any of the
// five service areas, a Cảnh báo lừa đảo message analysis, a screenshot analysis. Deterministic
// work never calls this module.
//
// ============================================================================
// THE CONTRACT (owner decision 2026-09-15)
// ============================================================================
//   ANONYMOUS   ANON_LIFETIME_LIMIT (5) questions for the LIFETIME of the identity. One trial,
//               once. Not per day, not per session, not again tomorrow.
//   REGISTERED  FREE_DAILY_LIMIT (15) questions per VN calendar day. Resets at 00:00 VN.
//   PRO         exempt — unchanged from before this module existed.
//
// ============================================================================
// WHY THE SHARED STORE, AND WHY NOT THE OLD MECHANISMS
// ============================================================================
// Before this module the "global" quota was three things that could not be shared: an anonymous
// per-day counter in Postgres (`anon_chat_usage_increment`, per-day by SQL, no read policy — so
// "lifetime" cannot be computed from it without a migration), an httpOnly cookie fallback, and a
// registered count of chat rows in `conversations` (which a Scam Alerts analysis can never be a
// row of). The one piece of infrastructure the product already runs that can hold a per-identity
// counter with EITHER a daily or a lifetime window, atomically, is the shared rate-limit store
// (Upstash in production, `lib/security/distributedRateLimit.ts`). So the quota is a sliding
// window keyed by identity: a 24h window on a VN-date-scoped key for the daily tier (the key
// changes at midnight, which IS the reset), and a ten-year window on a date-free key for the
// lifetime tier.
//
// Atomic by construction: the store's Lua script admits-and-records in one step, so two parallel
// requests cannot both observe "one left". Fail-closed when the store is configured and does not
// answer (a metering outage must not become free model calls); in-process counters when no store
// is configured at all (preview builds, local runs), exactly the rule `publicRateLimit.ts` states.
//
// ============================================================================
// WHO IS WHO
// ============================================================================
//   user   a registered account (`user.is_anonymous !== true`)         → daily, keyed by id
//   anon   a Supabase anonymous session (minted by POST /api/auth/anonymous, JWT-verified)
//                                                                       → lifetime, keyed by id
//   guest  no verified identity at all (a direct API call, a browser whose anonymous mint failed)
//                                                                       → lifetime, keyed by IP
// The client never sends, computes or resets any of this. A cleared cookie jar does not raise a
// cap: the counter lives on the server under the identity the server verified.

export type AiQuotaIdentity =
  | { kind: 'user'; id: string }
  | { kind: 'anon'; id: string }
  | { kind: 'guest'; id: string }

export type AiQuotaPeriod = 'day' | 'lifetime'

export interface AiQuotaState {
  limit: number
  period: AiQuotaPeriod
  /** Questions spent in the current period. `null` when the store cannot report it. */
  used: number | null
  /** `null` when `used` is unknown. Never negative. */
  remaining: number | null
}

export interface AiQuotaSpend extends AiQuotaState {
  /** True when this question was admitted and one unit was spent. */
  ok: boolean
  /** Which limiter answered. Diagnostics only. */
  scope: 'distributed' | 'instance'
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000
/** "Lifetime" for a sliding window: long enough that no anonymous identity outlives it. */
const LIFETIME_MS = 10 * 365 * ONE_DAY_MS

export function aiQuotaIdentity(user: Pick<User, 'id' | 'is_anonymous'> | null, ip: string): AiQuotaIdentity {
  if (!user) return { kind: 'guest', id: ip }
  if (user.is_anonymous === true) return { kind: 'anon', id: user.id }
  return { kind: 'user', id: user.id }
}

/** The store key and window for an identity. The VN date is part of the daily key: the reset IS the key change. */
function bucket(identity: AiQuotaIdentity): { key: string; windowMs: number; limit: number; period: AiQuotaPeriod } {
  if (identity.kind === 'user') {
    return { key: `ai:q:u:${identity.id}:${vnToday()}`, windowMs: ONE_DAY_MS, limit: FREE_DAILY_LIMIT, period: 'day' }
  }
  const prefix = identity.kind === 'anon' ? 'a' : 'g'
  return { key: `ai:q:${prefix}:${identity.id}`, windowMs: LIFETIME_MS, limit: ANON_LIFETIME_LIMIT, period: 'lifetime' }
}

// ── In-process fallback (no store configured) ────────────────────────────────
// The same semantics on a Map: entries carry their timestamps so the daily key expires the way
// the store's window would. Per-instance, like `lib/security/rateLimit.ts`, and for the same
// deployments only.
const local = new Map<string, number[]>()

function localSpend(key: string, windowMs: number, limit: number): { ok: boolean; used: number } {
  const now = Date.now()
  const hits = (local.get(key) ?? []).filter(t => now - t < windowMs)
  if (hits.length >= limit) {
    local.set(key, hits)
    return { ok: false, used: hits.length }
  }
  hits.push(now)
  local.set(key, hits)
  if (local.size > 5000) {
    for (const [k, v] of local) if (v.every(t => now - t >= windowMs)) local.delete(k)
  }
  return { ok: true, used: hits.length }
}

function localCount(key: string, windowMs: number): number {
  const now = Date.now()
  return (local.get(key) ?? []).filter(t => now - t < windowMs).length
}

/** Test seam: forget every in-process counter. */
export function __resetAiQuestionQuotaLocal(): void {
  local.clear()
}

// ── Public surface ───────────────────────────────────────────────────────────

export function quotaFor(identity: AiQuotaIdentity): { limit: number; period: AiQuotaPeriod } {
  const b = bucket(identity)
  return { limit: b.limit, period: b.period }
}

/**
 * Spend ONE AI question. Call it at the moment a model is about to be invoked — never before the
 * request has been validated, never for deterministic work, and at most once per user action.
 *
 * `ok: false` means the identity is at its limit (or the configured store did not answer — fail
 * closed). Nothing was spent in that case.
 */
export async function consumeAiQuestion(identity: AiQuotaIdentity): Promise<AiQuotaSpend> {
  const b = bucket(identity)
  if (!isDistributedStoreConfigured()) {
    const r = localSpend(b.key, b.windowMs, b.limit)
    return { ok: r.ok, limit: b.limit, period: b.period, used: r.used, remaining: Math.max(0, b.limit - r.used), scope: 'instance' }
  }
  // Fail-closed on a store failure is inherited from distributedRateLimit, deliberately.
  const r = await distributedRateLimit(b.key, b.limit, b.windowMs)
  const used = await distributedCountInWindow(b.key, b.windowMs)
  return {
    ok: r.ok,
    limit: b.limit,
    period: b.period,
    used,
    remaining: used === null ? null : Math.max(0, b.limit - used),
    scope: 'distributed',
  }
}

/**
 * Read the quota WITHOUT spending — for the paywall, the profile, the Scam Alerts card. Comes from
 * the same set that enforces, so display and enforcement cannot disagree.
 */
export async function peekAiQuestionQuota(identity: AiQuotaIdentity): Promise<AiQuotaState> {
  const b = bucket(identity)
  const used = isDistributedStoreConfigured()
    ? await distributedCountInWindow(b.key, b.windowMs)
    : localCount(b.key, b.windowMs)
  return { limit: b.limit, period: b.period, used, remaining: used === null ? null : Math.max(0, b.limit - used) }
}

/**
 * Pro exemption — the same rule `/api/chat` and `/api/subscription` apply inline: an `active`
 * subscription whose period has not ended. Anonymous identities are never Pro. A read failure is
 * "not Pro": the free tier is the safe answer when the entitlement cannot be confirmed.
 */
export async function isProAccount(
  supabase: SupabaseClient,
  user: Pick<User, 'id' | 'is_anonymous'> | null,
): Promise<boolean> {
  if (!user || user.is_anonymous === true) return false
  try {
    const { data } = await supabase
      .from('subscriptions')
      .select('status, current_period_end')
      .eq('user_id', user.id)
      .maybeSingle()
    const row = data as { status?: string | null; current_period_end?: string | null } | null
    return row?.status === 'active' && !!row?.current_period_end && new Date(row.current_period_end) > new Date()
  } catch {
    return false
  }
}
