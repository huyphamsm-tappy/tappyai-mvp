import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { updateMemory } from '@/lib/memory/memoryService'

export async function POST(req: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })

    const { interests, city } = await req.json()

    // Lưu vào profiles.onboarded (upsert in case the profile row doesn't exist yet)
    await supabase
      .from('profiles')
      .upsert({ id: user.id, onboarded: true }, { onConflict: 'id' })

    // Lưu sở thích vào memory
    const preferences: Record<string, string[]> = {}
    for (const interest of (interests || [])) {
      preferences[interest] = ['quan tâm']
    }

    await updateMemory(user.id, {
      location_base: city || null,
      preferences,
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('onboarding error:', e)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
