import { NextRequest, NextResponse } from 'next/server'
import { getTrack } from '@/modules/music/services/musicService'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

// GET /api/music/tracks/[id]
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const track = await getTrack(params.id)
  if (!track) return NextResponse.json({ error: 'track_not_found', message: serverMessage('music.trackNotFound', requestLocale(req)) }, { status: 404 })
  return NextResponse.json(track)
}
