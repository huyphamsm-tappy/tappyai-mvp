import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { getMemory } from '@/lib/memory/memoryService'
import { getDynamicPrompts } from '@/lib/suggestedPrompts'

// Reads per-request auth/searchParams — never statically prerender.
export const dynamic = 'force-dynamic'

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
      const { user, supabase } = await getRequestUser(req)
      if (user) {
        memory = await getMemory(user.id, supabase)
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
