import { createClient } from '@/lib/supabase/server'
import { aiQuotaIdentity, peekAiQuestionQuota } from '@/lib/ai/quota/aiQuestionQuota'
import { headers } from 'next/headers'
import { clientIp } from '@/lib/security/rateLimit'
import { subscriptionsEnabled } from '@/lib/payments/flags'
import { loadMyPlan } from '@/lib/payments/myPlan'
import { subscriptionCatalog } from '@/lib/payments/subscriptionCatalog'
import { mySubscription } from '@/lib/payments/subscriptionState'
import SubscriptionPlansView from './SubscriptionPlansView'

// Session-bound data only. Phase 7: the ONE canonical catalog is the only plan page — the legacy Pro view was removed.
// With SUBSCRIPTIONS_ENABLED off the same five plans are shown with checkout not offered (no payment tables are read).
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

  // Payments not open yet: the same five plans, read-only. Quota from the ONE authority; no subscription tables touched.
  const ip = clientIp({ headers: headers() })
  const q = await peekAiQuestionQuota(aiQuotaIdentity(user && user.is_anonymous !== true ? user : null, ip))
  const used = q.used ?? q.limit
  const signedIn = !!user && user.is_anonymous !== true
  const me = { signedIn, pipUsed: false, subscription: mySubscription(null), quota: { limit: q.limit, used, remaining: Math.max(0, q.limit - used), period: q.period } }
  const userInfo = user ? { full_name: user.user_metadata?.full_name, avatar_url: user.user_metadata?.avatar_url, email: user.email } : {}
  return <SubscriptionPlansView userInfo={userInfo} catalog={subscriptionCatalog()} me={me} paymentsOpen={false} />
}
