import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextResponse } from 'next/server'
import { FREE_DAILY_LIMIT, countTodayUserMessages } from '@/lib/config/product'

// GET /api/subscription — Returns the current user's subscription status.
// iOS EntitlementService reads this to gate Pro features (ADR-006).
// Mirrors the computation in subscription/page.tsx to prevent display/enforcement drift.
export async function GET(req: Request) {
  try {
    const { user, supabase } = await getRequestUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('status, current_period_end')
      .eq('user_id', user.id)
      .single()

    const isPro = sub?.status === 'active' && sub?.current_period_end
      ? new Date(sub.current_period_end) > new Date()
      : false

    const todayMessageCount = isPro ? 0 : await countTodayUserMessages(supabase, user.id)
    const remaining = Math.max(0, FREE_DAILY_LIMIT - todayMessageCount)

    return NextResponse.json({
      isPro,
      status: sub?.status ?? null,
      currentPeriodEnd: sub?.current_period_end ?? null,
      freeDailyLimit: FREE_DAILY_LIMIT,
      todayMessageCount,
      remaining,
    })
  } catch (e) {
    console.error('[subscription] Error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
