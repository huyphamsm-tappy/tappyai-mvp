import type { SupabaseClient, User } from '@supabase/supabase-js'
import { ANON_LIFETIME_LIMIT, vnToday } from '@/lib/config/product'
import { aiQuotaFor, isGrandfatheredPro, type PlanId } from '@/lib/plans/planConfig'
import { getEntitlement, type Entitlement } from '@/lib/plans/entitlement'
import { subscriptionsEnabled } from '@/lib/payments/flags'
import {
  distributedCountInWindow, distributedRateLimit, distributedRateLimitRelease, isDistributedStoreConfigured,
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
//   REGISTERED  no question limit shown to people (owner 01/11/2026); FREE_DAILY_LIMIT (300) per VN day is a hidden anti-abuse ceiling. Resets at 00:00 VN.
//   PAID PLAN   (Pip / MoMo / Coco / Tappy, SUBSCRIPTIONS_ENABLED) no limit shown; hidden ceiling PAID_DAILY_CEILING (1000) per VN day — PLAN_CONFIG is the one table.
//   (The 10 / 30 per day of the 15/09 contract were replaced on 01/11/2026.)
//   LEGACY PRO  an active Stripe/Apple `pro` period stays exempt until it ends (isGrandfatheredPro); with SUBSCRIPTIONS_ENABLED OFF every
//               active paid subscription is exempt exactly as in the release.
// (P7 closeout 02/10: this is THE quota — plan-aware here; there is no second "v2" module.)
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
  | { kind: 'user'; id: string; /** the account's metered plan; absent = free */ plan?: PlanId }
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

/**
 * A handle for reversing exactly one spent question (F-015). Non-null only when a unit was actually
 * spent AND it can be identified for removal. `key` is the un-namespaced bucket key (the release
 * re-applies the same environment prefix); `member` is the sorted-set member for the distributed
 * path, or the spend timestamp for the in-process path.
 */
export interface AiQuotaRefund {
  scope: 'distributed' | 'instance'
  key: string
  member: string
}

export interface AiQuotaSpend extends AiQuotaState {
  /** True when this question was admitted and one unit was spent. */
  ok: boolean
  /** Which limiter answered. Diagnostics only. */
  scope: 'distributed' | 'instance'
  /**
   * Pass to `refundAiQuestion` to give this question back if the model call it paid for then failed.
   * Null when nothing was spent (`ok: false`) or the spend cannot be identified for removal.
   */
  refund: AiQuotaRefund | null
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000
/** "Lifetime" for a sliding window: long enough that no anonymous identity outlives it. */
const LIFETIME_MS = 10 * 365 * ONE_DAY_MS

export function aiQuotaIdentity(user: Pick<User, 'id' | 'is_anonymous'> | null, ip: string, plan?: PlanId): AiQuotaIdentity {
  if (!user) return { kind: 'guest', id: ip }
  if (user.is_anonymous === true) return { kind: 'anon', id: user.id }
  return plan && plan !== 'free' ? { kind: 'user', id: user.id, plan } : { kind: 'user', id: user.id }
}

/** The store key and window for an identity. The VN date is part of the daily key: the reset IS the key change. */
function bucket(identity: AiQuotaIdentity): { key: string; windowMs: number; limit: number; period: AiQuotaPeriod } {
  if (identity.kind === 'user') {
    return { key: `ai:q:u:${identity.id}:${vnToday()}`, windowMs: ONE_DAY_MS, limit: aiQuotaFor(identity.plan ?? 'free').limit, period: 'day' }
  }
  const prefix = identity.kind === 'anon' ? 'a' : 'g'
  return { key: `ai:q:${prefix}:${identity.id}`, windowMs: LIFETIME_MS, limit: ANON_LIFETIME_LIMIT, period: 'lifetime' }
}

// ── In-process fallback (no store configured) ────────────────────────────────
// The same semantics on a Map: entries carry their timestamps so the daily key expires the way
// the store's window would. Per-instance, like `lib/security/rateLimit.ts`, and for the same
// deployments only.
// Held on globalThis so that every copy of this module in the process (Next bundles route handlers and
// dev HMR can evaluate the module more than once) shares ONE counter: a second copy must not start from 0.
const g = globalThis as { __tappyAiQuotaLocal?: Map<string, number[]>; __tappyAiQuotaLocalWindow?: Map<string, number> }
const local: Map<string, number[]> = (g.__tappyAiQuotaLocal ??= new Map<string, number[]>())
// each key's own window: the sweep below must judge a counter by ITS window, never by the window of whoever triggered the sweep
const localWindow: Map<string, number> = (g.__tappyAiQuotaLocalWindow ??= new Map<string, number>())

function localSpend(key: string, windowMs: number, limit: number): { ok: boolean; used: number; member?: number } {
  const now = Date.now()
  const hits = (local.get(key) ?? []).filter(t => now - t < windowMs)
  if (hits.length >= limit) {
    local.set(key, hits)
    return { ok: false, used: hits.length }
  }
  hits.push(now)
  local.set(key, hits)
  localWindow.set(key, windowMs)
  if (local.size > 5000) {
    for (const [k, v] of local) {
      const w = localWindow.get(k) ?? windowMs
      if (v.every(t => now - t >= w)) { local.delete(k); localWindow.delete(k) }
    }
  }
  return { ok: true, used: hits.length, member: now }
}

/** Reverse one in-process spend: drop the single hit whose timestamp matches `member`. No-op if the
 *  key or that hit is already gone. Mirrors `distributedRateLimitRelease` for the no-store path. */
function localRefund(key: string, member: number): void {
  const hits = local.get(key)
  if (!hits) return
  const i = hits.indexOf(member)
  if (i === -1) return
  hits.splice(i, 1)
  if (hits.length === 0) local.delete(key)
  else local.set(key, hits)
}

function localCount(key: string, windowMs: number): number {
  const now = Date.now()
  return (local.get(key) ?? []).filter(t => now - t < windowMs).length
}

/** Test seam: forget every in-process counter. */
export function __resetAiQuestionQuotaLocal(): void {
  local.clear()
  localWindow.clear()
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
    return {
      ok: r.ok, limit: b.limit, period: b.period, used: r.used, remaining: Math.max(0, b.limit - r.used),
      scope: 'instance',
      refund: r.ok && r.member !== undefined ? { scope: 'instance', key: b.key, member: String(r.member) } : null,
    }
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
    refund: r.ok && r.member ? { scope: 'distributed', key: b.key, member: r.member } : null,
  }
}

/**
 * Give back one question that was spent for a model call that then failed (F-015: a failed AI
 * answer must not be charged). Pass the `refund` handle from the matching `consumeAiQuestion`.
 *
 * Best-effort and never throws — this runs on an already-failing request, and leaving the unit
 * spent (the user stays metered) is the safe direction if the store cannot release. A no-op when
 * `refund` is null. Call it at most once per spend; the underlying ZREM / splice is itself
 * idempotent, so an accidental second call cannot refund twice.
 */
export async function refundAiQuestion(refund: AiQuotaRefund | null): Promise<void> {
  if (!refund) return
  try {
    if (refund.scope === 'instance') localRefund(refund.key, Number(refund.member))
    else await distributedRateLimitRelease(refund.key, refund.member)
  } catch {
    /* leave the unit spent; a failed refund must not surface into the request */
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

// ── Deep Research reports per VN calendar month (owner 20/11/2026: ONE allowance per account, Coco 15, Tappy 30; tiers.ts) ─────────────────
// The same store, the same atomic admit-and-record, the same refund and fail-closed rules as the question pool above; its own key per
// account and month (`ai:dr:u:<id>:<YYYY-MM>` in Vietnam time), a 32-day window so the key's month is the whole window.
const MONTH_WINDOW_MS = 32 * ONE_DAY_MS
const deepKey = (userId: string): string => `ai:dr:u:${userId}:${vnToday().slice(0, 7)}`

// ── Carry-over (owner 21/11/2026: buying a new plan must not cost the person what they had left) ─────────────────────────────────────────────
// When someone buys a plan while another is active, the days stack (p8_apply_entitlement 'stack') and the reports they had LEFT this month are added to the NEXT month's allowance, once.
// Stored in the same shared store as the counter: one credit = one member of `ai:drb:u:<id>:<YYYY-MM>` (the month the credits are for). Added to the plan's limit for that month only.
const CARRY_CAP = 60
const bonusKey = (userId: string, month: string): string => `ai:drb:u:${userId}:${month}`
/** 'YYYY-MM' of the VN month after the current one. */
export function nextVnMonth(today: string = vnToday()): string {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7))
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}
/** Credits carried INTO the current month (0 when none, or when the store did not answer). */
async function deepBonus(userId: string): Promise<number> {
  const key = bonusKey(userId, vnToday().slice(0, 7))
  const n = isDistributedStoreConfigured() ? await distributedCountInWindow(key, MONTH_WINDOW_MS * 2) : localCount(key, MONTH_WINDOW_MS * 2)
  return typeof n === 'number' && n > 0 ? Math.min(n, CARRY_CAP) : 0
}
/** Adds `credits` reports to NEXT month's allowance. Best effort: never throws; returns how many were recorded. */
export async function grantDeepResearchCarryover(userId: string, credits: number): Promise<number> {
  const n = Math.min(CARRY_CAP, Math.max(0, Math.floor(credits)))
  if (n === 0) return 0
  const key = bonusKey(userId, nextVnMonth())
  let done = 0
  try {
    for (let i = 0; i < n; i++) {
      if (isDistributedStoreConfigured()) { const r = await distributedRateLimit(key, CARRY_CAP, MONTH_WINDOW_MS * 2); if (!r.ok) break }
      else if (!localSpend(key, MONTH_WINDOW_MS * 2, CARRY_CAP).ok) break
      done++
    }
  } catch { /* the plan is already granted: a carry-over that fails is only logged by the caller */ }
  return done
}

/** Reports left this month, WITHOUT spending one (the chat asks before it picks a mode). `remaining` is null when the shared store did not answer: the caller then lets the run try (it is metered again at the start). */
export async function peekDeepResearch(userId: string, planLimit: number): Promise<{ limit: number; used: number | null; remaining: number | null }> {
  if (planLimit <= 0) return { limit: 0, used: 0, remaining: 0 }
  const limit = planLimit + (await deepBonus(userId))
  const key = deepKey(userId)
  const used = isDistributedStoreConfigured() ? await distributedCountInWindow(key, MONTH_WINDOW_MS) : localCount(key, MONTH_WINDOW_MS)
  return { limit, used, remaining: used === null ? null : Math.max(0, limit - used) }
}

export async function consumeDeepResearch(userId: string, planLimit: number): Promise<AiQuotaSpend> {
  const key = deepKey(userId)
  if (planLimit <= 0) return { ok: false, limit: 0, period: 'day', used: 0, remaining: 0, scope: 'instance', refund: null }
  const limit = planLimit + (await deepBonus(userId))
  if (!isDistributedStoreConfigured()) {
    const r = localSpend(key, MONTH_WINDOW_MS, limit)
    return { ok: r.ok, limit, period: 'day', used: r.used, remaining: Math.max(0, limit - r.used), scope: 'instance', refund: r.ok && r.member !== undefined ? { scope: 'instance', key, member: String(r.member) } : null }
  }
  const r = await distributedRateLimit(key, limit, MONTH_WINDOW_MS)
  const used = await distributedCountInWindow(key, MONTH_WINDOW_MS)
  return { ok: r.ok, limit, period: 'day', used, remaining: used === null ? null : Math.max(0, limit - used), scope: 'distributed', refund: r.ok && r.member ? { scope: 'distributed', key, member: r.member } : null }
}

/**
 * What a signed-in account's entitlement means for the quota — the ONE rule every metered route uses.
 *
 *   not paid                      → metered as Free
 *   SUBSCRIPTIONS_ENABLED off     → any active paid subscription is exempt (the release behaviour, unchanged)
 *   a grandfathered legacy `pro`  → exempt until its paid period ends
 *   a paid plan (Pip…Sunny)       → metered at that plan's hidden ceiling (PAID_DAILY_CEILING, 1000/day)
 *
 * Decided by the server from the `subscriptions` row; the client names nothing. A read failure is "not paid"
 * (getEntitlement): Free is the safe answer when the entitlement cannot be confirmed.
 */
export function accountQuotaFor(
  ent: Entitlement,
  now: Date = new Date(),
  env: NodeJS.ProcessEnv = process.env,
): { exempt: boolean; plan: PlanId } {
  if (!ent.paid) return { exempt: false, plan: 'free' }
  if (!subscriptionsEnabled(env)) return { exempt: true, plan: ent.plan }
  if (isGrandfatheredPro(ent, now, env)) return { exempt: true, plan: ent.plan }
  return { exempt: false, plan: ent.plan }
}

/** Reads the entitlement and decides (see `accountQuotaFor`). Anonymous / missing users are never exempt. */
export async function resolveAccountQuota(
  supabase: SupabaseClient,
  user: Pick<User, 'id' | 'is_anonymous'> | null,
): Promise<{ exempt: boolean; plan: PlanId }> {
  if (!user || user.is_anonymous === true) return { exempt: false, plan: 'free' }
  return accountQuotaFor(await getEntitlement(supabase, user))
}
