import { getRequestUser } from '@/lib/auth/getRequestUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { updateMemory } from '@/lib/memory/memoryService'

export async function POST(req: Request) {
  try {
    const { user } = await getRequestUser(req)
    if (!user) {
      console.error('onboarding: unauthenticated request (no session cookie)')
      return NextResponse.json({ ok: false }, { status: 401 })
    }

    const { interests, city } = await req.json()

    // Use the admin client (service-role key, bypasses RLS) so the upsert
    // succeeds even when RLS INSERT policies haven't been applied yet or when
    // the trigger-created profile row is missing the onboarded column update.
    const admin = createAdminClient()
    const { error: upsertError } = await admin
      .from('profiles')
      .upsert({ id: user.id, onboarded: true }, { onConflict: 'id' })

    if (upsertError) {
      console.error('onboarding: upsert failed', upsertError)
    }

    // Lưu sở thích vào memory
    const preferences: Record<string, string[]> = {}
    for (const interest of (interests || [])) {
      preferences[interest] = ['quan tâm']
    }

    // The onboarding city is a DESTINATION / DISCOVERY INTEREST (a place the
    // user wants to explore), not where they live — so it is stored as
    // `discovery_city`, never `location_base`. See
    // 20260911_user_memory_discovery_city.sql for the semantic split.
    await updateMemory(user.id, {
      discovery_city: city || null,
      preferences,
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('onboarding error:', e)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
