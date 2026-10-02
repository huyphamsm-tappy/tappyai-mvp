import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { aiQuotaIdentity, peekAiQuestionQuota } from '@/lib/ai/quota/aiQuestionQuota'
import { headers } from 'next/headers'
import { clientIp } from '@/lib/security/rateLimit'
import SubscriptionView from './SubscriptionView'

// Session-bound data only. All presentation lives in SubscriptionView, which is a client component
// because the locale a user chose is only knowable on the client — see the note there (B07).
export default async function SubscriptionPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
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
