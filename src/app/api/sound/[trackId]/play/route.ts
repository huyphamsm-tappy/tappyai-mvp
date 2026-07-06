import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// POST /api/sound/[trackId]/play — bump the track's play counter. No auth:
// anonymous listens count too (the SECURITY DEFINER music_increment_play
// function bypasses the read-only RLS on music_tracks). Best-effort and fire-
// and-forget from the client — a failed increment never affects playback.
export async function POST(_req: NextRequest, { params }: { params: { trackId: string } }) {
  const trackId = params.trackId?.trim()
  if (!trackId) return NextResponse.json({ error: 'trackId required' }, { status: 400 })

  try {
    await createClient().rpc('music_increment_play', { p_track: trackId })
  } catch { /* pre-migration or transient — non-fatal */ }

  return NextResponse.json({ ok: true })
}
