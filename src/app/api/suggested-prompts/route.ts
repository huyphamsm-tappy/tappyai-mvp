import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMemory } from '@/lib/memory/memoryService'
import { getDynamicPrompts } from '@/lib/suggestedPrompts'

export async function GET(req: NextRequest) {
  try {
    const now = new Date()
    const vnMs = now.getTime() + 7 * 60 * 60 * 1000
    const vnTime = new Date(vnMs)

    const { searchParams } = req.nextUrl
    const testHour = searchParams.get('hour')
    const testDay = searchParams.get('day')

    const hour = testHour !== null ? parseInt(testHour, 10) : vnTime.getUTCHours()
    const dayOfWeek = testDay !== null ? parseInt(testDay, 10) : vnTime.getUTCDay()

    let memory = null
    let gender: 'male' | 'female' | null = null

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        memory = await getMemory(user.id)
        // Gender from user metadata (set via preferences page)
        const g = user.user_metadata?.gender
        if (g === 'male' || g === 'female') gender = g
      }
    } catch {
      // non-fatal
    }

    const prompts = getDynamicPrompts(hour, dayOfWeek, memory, gender)

    return NextResponse.json({ prompts, hour, dayOfWeek, gender })
  } catch (e) {
    console.error('suggested-prompts error:', e)
    return NextResponse.json({ prompts: [], error: 'Failed' }, { status: 500 })
  }
}
