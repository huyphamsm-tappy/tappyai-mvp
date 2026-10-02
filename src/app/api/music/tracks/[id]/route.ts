import { NextRequest, NextResponse } from 'next/server'
import { getTrack } from '@/modules/music/services/musicService'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

// A track's metadata (title, credit, licence) is DATA that changes without a deploy — the
// attribution backfill of 2026-09-22 did exactly that — and a GET handler that reads only
// `params` is cached by the framework by default. Measured: after the backfill this route
// kept answering the old title/no licence while `/api/music/tracks` (already dynamic) had
// the new ones. Same rule as the categories route.
export const dynamic = 'force-dynamic'

// GET /api/music/tracks/[id]
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const track = await getTrack(params.id)
  if (!track) return NextResponse.json({ error: 'track_not_found', message: serverMessage('music.trackNotFound', requestLocale(req)) }, { status: 404 })
  return NextResponse.json(track)
}
