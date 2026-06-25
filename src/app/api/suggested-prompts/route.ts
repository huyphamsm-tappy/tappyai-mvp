import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMemory } from '@/lib/memory/memoryService'
import { getDynamicPrompts } from '@/lib/suggestedPrompts'

export async function GET(req: NextRequest) {
  try {
    // VN time = UTC+7
    const now = new Date()
    const vnMs = now.getTime() + 7 * 60 * 60 * 1000
    const vnTime = new Date(vnMs)

    // Allow ?hour=X&day=Y overrides for testing
    const { searchParams } = req.nextUrl
    const testHour = searchParams.get('hour')
    const testDay = searchParams.get('day')

    const hour = testHour !== null ? parseInt(testHour, 10) : vnTime.getUTCHours()
    const dayOfWeek = testDay !== null ? parseInt(testDay, 10) : vnTime.getUTCDay()

    // Load user memory if logged in
    let memory = null
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) memory = await getMemory(user.id)
    } catch {
      // non-fatal — proceed without memory
    }

    const prompts = getDynamicPrompts(hour, dayOfWeek, memory)

    return NextResponse.json({ prompts, hour, dayOfWeek })
  } catch (e) {
    console.error('suggested-prompts error:', e)
    return NextResponse.json({ prompts: [], error: 'Failed' }, { status: 500 })
  }
}
