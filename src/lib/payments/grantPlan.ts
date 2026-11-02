// PAYMENTS — THE way a plan is granted or changed (docs/phase8/PAYMENTS.md §2.2).
//
// Every channel (web SePay, Android/iOS via RevenueCat, admin) goes through the
// SQL function `p8_apply_entitlement`, which in ONE transaction:
//   - refuses a repeated `externalRef` (idempotent: retries never grant twice),
//   - serialises writers per user (two channels at once both count),
//   - stacks a purchase on top of the current expiry,
//   - writes `subscriptions` (the single source of truth) + an append-only ledger row.
// Service role only. No LLM anywhere in here.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { PLAN_CONFIG, type PaidPlanId } from '@/lib/plans/planConfig'
import type { SubscriptionSource } from '@/lib/plans/entitlement'

/** The channels the owner talks about. Mapped onto the `subscriptions.source` values that already exist. */
export type GrantChannel = 'web_sepay' | 'android' | 'ios' | 'admin'

export const CHANNEL_SOURCE: Readonly<Record<GrantChannel, Exclude<SubscriptionSource, 'web'>>> = Object.freeze({
  web_sepay: 'web_sepay',
  android: 'google_play',
  ios: 'apple_iap',
  admin: 'manual',
})

export type EntitlementMode = 'stack' | 'extend_to' | 'revoke_store' | 'mark'

export interface ApplyEntitlementInput {
  userId: string
  plan: PaidPlanId | null
  channel: GrantChannel
  externalRef: string
  mode: EntitlementMode
  baseAt?: Date | null
  seconds?: number | null
  expiresAt?: Date | null
  cancelAtPeriodEnd?: boolean | null
  actorId?: string | null
  note?: string | null
}

export type ApplyEntitlementResult =
  | { status: 'duplicate' }
  | { status: 'applied'; changed: boolean; plan: string | null; beforeEnd: string | null; afterEnd: string | null }

export class EntitlementWriteError extends Error {
  constructor(readonly code: string | undefined) {
    super('entitlement write failed')
    this.name = 'EntitlementWriteError'
  }
}

export async function applyEntitlement(
  input: ApplyEntitlementInput,
  db: SupabaseClient = createAdminClient(),
): Promise<ApplyEntitlementResult> {
  const { data, error } = await db.rpc('p8_apply_entitlement', {
    p_user: input.userId,
    p_plan: input.plan,
    p_source: CHANNEL_SOURCE[input.channel],
    p_external_ref: input.externalRef,
    p_mode: input.mode,
    p_base_at: input.baseAt ? input.baseAt.toISOString() : null,
    p_seconds: input.seconds ?? null,
    p_expires_at: input.expiresAt ? input.expiresAt.toISOString() : null,
    p_cancel: input.cancelAtPeriodEnd ?? null,
    p_actor: input.actorId ?? null,
    p_note: input.note ?? null,
  })
  if (error) throw new EntitlementWriteError(error.code)
  const r = (data ?? {}) as Record<string, unknown>
  if (r.status === 'duplicate') return { status: 'duplicate' }
  return {
    status: 'applied',
    changed: r.changed === true,
    plan: (r.plan as string | null) ?? null,
    beforeEnd: (r.before_end as string | null) ?? null,
    afterEnd: (r.after_end as string | null) ?? null,
  }
}

/**
 * Grant `plan` to `userId`. Idempotent by `externalRef`. Buying while still paid
 * STACKS from the current expiry.
 *
 * - Without `expiresAt` (web, admin): one plan period (`PLAN_CONFIG[plan].durationDays`).
 * - With `expiresAt` (a store period): the store period's length, `expiresAt − purchasedAt`,
 *   counted from `purchasedAt` or from the current expiry, whichever is later.
 */
export async function grantPlan(
  userId: string,
  plan: PaidPlanId,
  channel: GrantChannel,
  externalRef: string,
  expiresAt?: Date | null,
  opts: { purchasedAt?: Date; actorId?: string | null; note?: string | null; db?: SupabaseClient } = {},
): Promise<ApplyEntitlementResult> {
  const base = opts.purchasedAt ?? new Date()
  const seconds = expiresAt
    ? Math.round((expiresAt.getTime() - base.getTime()) / 1000)
    : PLAN_CONFIG[plan].durationDays! * 86_400
  if (!(seconds > 0)) throw new EntitlementWriteError('invalid_period')
  return applyEntitlement(
    { userId, plan, channel, externalRef, mode: 'stack', baseAt: base, seconds, expiresAt: expiresAt ?? null, actorId: opts.actorId, note: opts.note },
    opts.db,
  )
}
