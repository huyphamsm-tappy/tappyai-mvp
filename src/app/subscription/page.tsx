import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FREE_DAILY_LIMIT, countTodayUserMessages } from '@/lib/config/product'
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

  // Same measurement helper /api/chat enforces with — display can never drift
  // from enforcement again (this page once showed 10/day against an enforced 15).
  const todayMsgCount = isPro ? 0 : await countTodayUserMessages(supabase, user.id)
  const remaining = Math.max(0, FREE_DAILY_LIMIT - todayMsgCount)

  return (
    <SubscriptionView
      userInfo={userInfo}
      isPro={isPro}
      periodEnd={sub?.current_period_end ?? null}
      remaining={remaining}
      freeDailyLimit={FREE_DAILY_LIMIT}
    />
  )
}
