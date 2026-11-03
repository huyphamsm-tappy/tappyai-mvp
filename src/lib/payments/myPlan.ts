// SUBSCRIPTIONS — "my plan" + today's allowance for a SIGNED-IN account, one implementation for the
// API route and the /subscription page (docs/payments/PLAN.md). Written by the security session.
// The allowance is read from the SAME store /api/chat spends from: display cannot drift from
// enforcement. A store that cannot report the count shows the allowance as used up.

import type { SupabaseClient } from '@supabase/supabase-js'
import { accountQuotaFor, aiQuotaIdentity, peekAiQuestionQuota } from '@/lib/ai/quota/aiQuestionQuota'
import { getEntitlement } from '@/lib/plans/entitlement'
import { createAdminClient } from '@/lib/supabase/admin'
import { mySubscription, type MySubscription, type SubscriptionRowForState } from './subscriptionState'

export const MY_PLAN_COLUMNS = 'plan, status, current_period_end, cancel_at_period_end, source'

export interface MyPlan {
  signedIn: true
  subscription: MySubscription
  /** Pip is a one-time trial: true once this account has bought it (the database enforces it; this only draws it). */
  pipUsed: boolean
  quota: { limit: number; used: number; remaining: number; period: 'day' | 'lifetime' }
}

/** THE Pip rule's own answer (p7_pip_used: any source, ledger + paid orders) — the same function create_order/apply_sepay use.
 *  Falls back to what the caller's own rows show only if that read fails, and then errs towards "used" never "unused". */
async function pipUsedFor(userId: string, own: boolean): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient().rpc('p7_pip_used', { p_user: userId })
    if (!error && typeof data === 'boolean') return data
  } catch { /* fall through */ }
  return own
}

export async function loadMyPlan(supabase: SupabaseClient, userId: string, ip: string): Promise<MyPlan> {
  const [{ data: row }, { data: pending }, { data: paidPip }, ent] = await Promise.all([
    supabase.from('subscriptions').select(MY_PLAN_COLUMNS).eq('user_id', userId).maybeSingle(),
    supabase.from('payment_orders').select('id').eq('user_id', userId).eq('status', 'pending')
      .gt('expires_at', new Date().toISOString()).limit(1),
    supabase.from('payment_orders').select('id').eq('user_id', userId).eq('plan', 'pip').eq('status', 'paid').limit(1),
    getEntitlement(supabase, { id: userId, is_anonymous: false }),
  ])
  const acct = accountQuotaFor(ent)
  const q = await peekAiQuestionQuota(aiQuotaIdentity({ id: userId, is_anonymous: false }, ip, acct.plan))
  // A store that cannot report the count shows the allowance as used up; an exempt (legacy Pro) period shows nothing used.
  const used = acct.exempt ? 0 : (q.used ?? q.limit)
  return {
    signedIn: true,
    subscription: mySubscription(row as SubscriptionRowForState | null, { pendingOrder: (pending?.length ?? 0) > 0 }),
    pipUsed: await pipUsedFor(userId, (paidPip?.length ?? 0) > 0 || (row as SubscriptionRowForState | null)?.plan === 'pip'),
    quota: { limit: q.limit, used, remaining: Math.max(0, q.limit - used), period: q.period },
  }
}
