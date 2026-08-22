import { getRequestUser } from '@/lib/auth/getRequestUser'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'

export const dynamic = 'force-dynamic'

// Total via the SECURITY DEFINER function (bypasses own-row RLS without a
// service-role key). Best-effort — a failure just returns 0.
async function savedCount(client: SupabaseClient, trackId: string): Promise<number> {
  try {
    const { data } = await client.rpc('music_saved_count', { p_track: trackId })
    return Number(data) || 0
  } catch { return 0 }
}

// POST — save (bookmark) this track for the current user. Idempotent: a repeat
// save is a no-op (unique(user_id, track_id)).
export async function POST(req: NextRequest, { params }: { params: { trackId: string } }) {
  const trackId = params.trackId?.trim()
  if (!trackId) return NextResponse.json({ error: 'missing_fields', message: serverMessage('validation.missingFields', requestLocale(req)) }, { status: 400 })
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })
  // B17 — an anonymous session is authenticated but is not an account; social writes need one.
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal

  const { error } = await supabase.from('music_saved').insert({ user_id: user.id, track_id: trackId })
  // 23505 = already saved → treat as success.
  if (error && error.code !== '23505') return NextResponse.json({ error: 'save_failed', message: serverMessage('music.saveFailed', requestLocale(req)) }, { status: 500 })

  return NextResponse.json({ saved: true, savedCount: await savedCount(supabase, trackId) })
}

// DELETE — remove the save.
export async function DELETE(req: NextRequest, { params }: { params: { trackId: string } }) {
  const trackId = params.trackId?.trim()
  if (!trackId) return NextResponse.json({ error: 'missing_fields', message: serverMessage('validation.missingFields', requestLocale(req)) }, { status: 400 })
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })
  // B17 — an anonymous session is authenticated but is not an account; social writes need one.
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal

  await supabase.from('music_saved').delete().eq('user_id', user.id).eq('track_id', trackId)
  return NextResponse.json({ saved: false, savedCount: await savedCount(supabase, trackId) })
}
