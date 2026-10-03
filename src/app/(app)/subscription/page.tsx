import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { aiQuotaIdentity, peekAiQuestionQuota } from '@/lib/ai/quota/aiQuestionQuota'
import { headers } from 'next/headers'
import { clientIp } from '@/lib/security/rateLimit'
import { subscriptionsEnabled } from '@/lib/payments/flags'
import { loadMyPlan } from '@/lib/payments/myPlan'
import { subscriptionCatalog } from '@/lib/payments/subscriptionCatalog'
import { mySubscription } from '@/lib/payments/subscriptionState'
import SubscriptionPlansView from './SubscriptionPlansView'
import SubscriptionView from './SubscriptionView'

// Session-bound data only. All presentation lives in SubscriptionView, which is a client component
// because the locale a user chose is only knowable on the client — see the note there (B07).
export default async function SubscriptionPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // SUBSCRIPTIONS (P7): the five plans. A guest (or anonymous session) can LOOK at every plan; buying asks them to sign in.
  // All state is server-side: plan, period, quota and the one-time Pip are read here, never taken from the client.
  if (subscriptionsEnabled()) {
    const ip = clientIp({ headers: headers() })
    if (!user || user.is_anonymous === true) {
      const q = await peekAiQuestionQuota(aiQuotaIdentity(user, ip))
      const used = q.used ?? q.limit
      const me = { signedIn: false, pipUsed: false, subscription: mySubscription(null), quota: { limit: q.limit, used, remaining: Math.max(0, q.limit - used), period: q.period } }
      return <SubscriptionPlansView userInfo={{}} catalog={subscriptionCatalog()} me={me} />
    }
    const [{ data: profile }, me] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      loadMyPlan(supabase, user.id, ip),
    ])
    const userInfo = profile || { full_name: user.user_metadata?.full_name, avatar_url: user.user_metadata?.avatar_url, email: user.email }
    return <SubscriptionPlansView userInfo={userInfo} catalog={subscriptionCatalog()} me={me} />
  }

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const userInfo = profile || { full_name: user.user_metadata?.full_name, avatar_url: user.user_metadata?.avatar_url, email: user.email }

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('status, current_period_end')
    .eq('user_id', user.id)
    .single()

  const isPro = sub?.status === 'active' && sub?.current_period_end
    ? new Date(sub.current_period_end) > new Date()
    : false

  // Read from the ONE shared AI quota /api/chat and /api/scam-shield/analyze spend from — display
  // can never drift from enforcement (this page once showed 10/day against an enforced 15). A
  // store that cannot report the count is shown as the limit used, never as plenty left.
  // The same derivation /api/chat enforces with (clientIp: platform-set headers first) — a page
  // that keyed on the raw leftmost x-forwarded-for could show a different bucket than it spends.
  const ip = clientIp({ headers: headers() })
  const quota = await peekAiQuestionQuota(aiQuotaIdentity(user, ip))
  const todayMsgCount = isPro ? 0 : (quota.used ?? quota.limit)
  const remaining = isPro ? quota.limit : Math.max(0, quota.limit - todayMsgCount)

  return (
    <SubscriptionView
      userInfo={userInfo}
      isPro={isPro}
      periodEnd={sub?.current_period_end ?? null}
      remaining={remaining}
      freeDailyLimit={quota.limit}
    />
  )
}
