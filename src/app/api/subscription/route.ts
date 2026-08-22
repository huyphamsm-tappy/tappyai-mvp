import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextResponse } from 'next/server'
import { FREE_DAILY_LIMIT, ANON_DAILY_LIMIT, countTodayUserMessages } from '@/lib/config/product'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

/**
 * Is this error "the function is not in the schema yet", as opposed to "the call failed"?
 *
 * PostgREST answers `PGRST202` for a function it cannot find in its schema cache. Matching the
 * CODE rather than the message keeps this from turning into a substring check that a reworded
 * server error silently defeats; the message is checked only as a fallback for clients that do
 * not surface the code.
 */
function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === 'PGRST202') return true
  return /could not find the function|does not exist/i.test(error.message ?? '')
}

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
     * 🚨 C48. This reported the REGISTERED quota to anonymous users. Measured live, one anonymous
     * session, one moment:
     *
     *     GET  /api/subscription → {"freeDailyLimit":15,"todayMessageCount":2,"remaining":13}
     *     POST /api/chat         → 401 anon_limit_reached "You've used all 5 free questions…"
     *
     * `/api/chat` branches on `user.is_anonymous` and enforces ANON_DAILY_LIMIT; this route knew
     * only FREE_DAILY_LIMIT. So the paywall told a guest with nothing left that they had 13
     * messages remaining. Anonymous sessions are the majority of accounts, so that was the common
     * case, not the edge one.
     *
     * The limit reported here now comes from the same branch the enforcement uses.
     */
    const isAnonymous = user.is_anonymous === true
    const dailyLimit = isAnonymous ? ANON_DAILY_LIMIT : FREE_DAILY_LIMIT

    /**
     * The count comes from the SAME PLACE THE LIMIT IS ENFORCED, per identity kind.
     *
     * ============================================================================
     * ONE AUTHORITY, NOT TWO
     * ============================================================================
     * C48 fixed the LIMIT half of this: the paywall was quoting the registered limit (15) to
     * anonymous guests whose real ceiling is 5. The COUNT half was left recorded-but-unfixed, and
     * it is the same defect one layer down.
     *
     * `/api/chat` stops an anonymous guest with `anon_chat_usage_increment()`, which counts
     * ATTEMPTS. `countTodayUserMessages` counts user-role rows in `conversations` — TURNS THAT
     * LANDED. A refused turn, an abandoned stream or a client that gave up moves one and not the
     * other, so a guest could read "3 remaining" above a chat box answering 401.
     *
     * `anon_chat_usage_today()` is the read-only sibling of the enforcement RPC (migration
     * 20260821). Same row, same Asia/Ho_Chi_Minh day boundary, no increment — so displaying the
     * paywall cannot consume the quota it describes.
     *
     * 🚨 Two different failures, two different answers — and conflating them is how a correctness
     * fix becomes an outage.
     *
     *   • FUNCTION NOT THERE YET (PGRST202, the deploy window before the migration lands).
     *     `/api/chat` degrades the same way: when the RPC is unavailable it enforces with the
     *     legacy cookie cap. So during that window enforcement is not reading the row either, and
     *     the legacy count is no more divergent than it was the day before. Falling back keeps
     *     display and enforcement equally degraded. Failing closed here instead would tell every
     *     guest they had nothing left, for as long as the code was ahead of the schema — turning
     *     a deploy-ordering detail into a product outage.
     *
     *   • THE AUTHORITY IS BROKEN RIGHT NOW (anything else). Fail CLOSED: report the limit as
     *     used. A guest wrongly told they have none can sign in, which is what the paywall wants
     *     anyway; a guest wrongly told they have plenty is refused mid-sentence with no
     *     explanation.
     */
    let todayMessageCount: number
    if (isPro) {
      todayMessageCount = 0
    } else if (isAnonymous) {
      const { data: used, error: usageError } = await supabase.rpc('anon_chat_usage_today')
      if (!usageError && typeof used === 'number') {
        todayMessageCount = used
      } else if (isMissingFunction(usageError)) {
        console.warn('[subscription] anon_chat_usage_today not deployed yet; using legacy count')
        todayMessageCount = await countTodayUserMessages(supabase, user.id)
      } else {
        console.error('[subscription] anon usage rpc failed:', usageError?.message)
        todayMessageCount = dailyLimit
      }
    } else {
      todayMessageCount = await countTodayUserMessages(supabase, user.id)
    }
    const remaining = Math.max(0, dailyLimit - todayMessageCount)

    return NextResponse.json({
      isPro,
      status: sub?.status ?? null,
      currentPeriodEnd: sub?.current_period_end ?? null,
      /** The limit that is actually enforced for THIS caller. */
      freeDailyLimit: dailyLimit,
      /** Lets a client word the paywall for a guest without re-deriving the rule. */
      isAnonymous,
      todayMessageCount,
      remaining,
    })
  } catch (e) {
    console.error('[subscription] Error:', e)
    return NextResponse.json({ error: 'server_error', message: serverMessage('server.error', requestLocale(req)) }, { status: 500 })
  }
}
