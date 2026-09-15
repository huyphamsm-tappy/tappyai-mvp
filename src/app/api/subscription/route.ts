import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextResponse } from 'next/server'
import { aiQuotaIdentity, peekAiQuestionQuota } from '@/lib/ai/quota/aiQuestionQuota'
import { clientIp } from '@/lib/security/rateLimit'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

// GET /api/subscription — Returns the current user's subscription status.
// iOS EntitlementService reads this to gate Pro features (ADR-006).
// Mirrors the computation in subscription/page.tsx to prevent display/enforcement drift.
export async function GET(req: Request) {
  try {
    const { user, supabase } = await getRequestUser(req)
    if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('status, current_period_end')
      .eq('user_id', user.id)
      .single()

    const isPro = sub?.status === 'active' && sub?.current_period_end
      ? new Date(sub.current_period_end) > new Date()
      : false

    /**
     * ONE AUTHORITY. The count and the limit come from `lib/ai/quota/aiQuestionQuota.ts` — the
     * same per-identity set that `/api/chat` and `/api/scam-shield/analyze` SPEND from — read
     * without spending. C48 (limit) and its count-half (attempts vs landed rows) are both closed
     * by construction now: there is no second counter to diverge from.
     *
     *   anonymous  → ANON_LIFETIME_LIMIT for the lifetime of the identity (period 'lifetime')
     *   registered → FREE_DAILY_LIMIT per VN day (period 'day')
     *   Pro        → exempt; reported as nothing used
     *
     * A store that cannot report the count answers `used: null`. That is reported as the limit
     * USED — fail closed, as before: a guest wrongly told they have none can sign in, which is what
     * the paywall wants anyway; a guest wrongly told they have plenty is refused mid-sentence.
     */
    const isAnonymous = user.is_anonymous === true
    const quota = await peekAiQuestionQuota(aiQuotaIdentity(user, clientIp(req)))
    const dailyLimit = quota.limit
    const todayMessageCount = isPro ? 0 : (quota.used ?? quota.limit)
    const remaining = isPro ? dailyLimit : Math.max(0, dailyLimit - todayMessageCount)

    return NextResponse.json({
      isPro,
      status: sub?.status ?? null,
      currentPeriodEnd: sub?.current_period_end ?? null,
      /** The limit that is actually enforced for THIS caller — the ONE shared AI pool. */
      freeDailyLimit: dailyLimit,
      /** 'day' for accounts, 'lifetime' for anonymous identities (five, once). */
      quotaPeriod: quota.period,
      /** Lets a client word the paywall for a guest without re-deriving the rule. */
      isAnonymous,
      /** Questions spent in the current period (field name kept for existing clients). */
      todayMessageCount,
      remaining,
    })
  } catch (e) {
    console.error('[subscription] Error:', e)
    return NextResponse.json({ error: 'server_error', message: serverMessage('server.error', requestLocale(req)) }, { status: 500 })
  }
}
