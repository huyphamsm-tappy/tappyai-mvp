import { NextRequest, NextResponse } from 'next/server'
import { getTrack } from '@/modules/music/services/musicService'

// GET /api/music/tracks/[id]
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const track = await getTrack(params.id)
  if (!track) return NextResponse.json({ error: 'Không tìm thấy bài hát' }, { status: 404 })
  return NextResponse.json(track)
}
