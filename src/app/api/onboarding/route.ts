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

    // Marking the profile onboarded IS this endpoint's job: auth/callback reads
    // profiles.onboarded on every login and sends the user back here whenever it
    // is false. Reporting ok:true after a failed upsert therefore doesn't
    // degrade gracefully — it hands the client a success it can act on, the
    // client leaves, and the next login bounces straight back to onboarding,
    // forever. Fail loudly so the client can retry.
    if (upsertError) {
      console.error('onboarding: upsert failed', upsertError)
      return NextResponse.json({ ok: false }, { status: 500 })
    }

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
