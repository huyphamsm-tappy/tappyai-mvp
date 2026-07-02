import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getProfile, rebuildProfile } from '@/lib/preferences/profileCache'

// GET /api/preferences/profile
// Returns the cached UserPreferenceProfile; rebuilds if missing.
export async function GET() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ profile: null }, { status: 401 })

    let profile = await getProfile(user.id, supabase)

    if (!profile) {
      profile = await rebuildProfile(user.id, supabase)
    }

    return NextResponse.json({ profile })
  } catch {
    return NextResponse.json({ profile: null }, { status: 500 })
  }
}

// POST /api/preferences/profile
// Force-rebuilds the profile (e.g., after onboarding completes).
export async function POST() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })

    const profile = await rebuildProfile(user.id, supabase)
    return NextResponse.json({ ok: true, profile })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
