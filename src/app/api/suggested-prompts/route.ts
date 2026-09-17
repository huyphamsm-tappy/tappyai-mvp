import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { getMemory } from '@/lib/memory/memoryService'
import { getDynamicPrompts } from '@/lib/suggestedPrompts'
import { getDemographics, toPromptGender } from '@/lib/account/demographics'
import { requestSearchParams } from '@/lib/http/searchParams'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

// Reads per-request auth/searchParams — never statically prerender.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const now = new Date()
    const vnMs = now.getTime() + 7 * 60 * 60 * 1000
    const vnTime = new Date(vnMs)

    const searchParams = requestSearchParams(req)
    const testHour = searchParams.get('hour')
    const testDay = searchParams.get('day')

    const hour = testHour !== null ? parseInt(testHour, 10) : vnTime.getUTCHours()
    const dayOfWeek = testDay !== null ? parseInt(testDay, 10) : vnTime.getUTCDay()

    let memory = null
    let gender: 'male' | 'female' | null = null

    try {
      const { user, supabase } = await getRequestUser(req)
      if (user) {
        // V3 — the canonical `user_demographics` row, not
        // `auth.users.raw_user_meta_data`: metadata is writable by its own
        // subject from the browser and could hold any value at all.
        const [mem, demographics] = await Promise.all([
          getMemory(user.id, supabase),
          getDemographics(supabase, user.id),
        ])
        memory = mem
        gender = toPromptGender(demographics.gender)
      }
    } catch {
      // non-fatal
    }

    const prompts = getDynamicPrompts(hour, dayOfWeek, memory, gender)

    return NextResponse.json({ prompts, hour, dayOfWeek, gender })
  } catch (e) {
    console.error('suggested-prompts error:', e)
    return NextResponse.json({ prompts: [], error: 'server_error', message: serverMessage('server.error', requestLocale(req)) }, { status: 500 })
  }
}
