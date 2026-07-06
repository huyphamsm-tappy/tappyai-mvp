import { createClient } from '@/lib/supabase/server'
import { getTrack } from '@/modules/music/server'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET /api/sound/[trackId] — data for a track's "sound page":
//   - track metadata (from the Music Module)
//   - how many visible videos use this track + a grid of them
//
// The count/grid are derived from the reviews table (music->>'trackId'), NOT
// from music_usage: reviews is the source of truth that reflects hidden/deleted
// posts, so the number never drifts above what a user can actually open.
export async function GET(_req: NextRequest, { params }: { params: { trackId: string } }) {
  const trackId = params.trackId?.trim()
  if (!trackId) return NextResponse.json({ error: 'trackId required' }, { status: 400 })

  const track = await getTrack(trackId)
  if (!track) return NextResponse.json({ error: 'Bài nhạc không tồn tại' }, { status: 404 })

  const supabase = createClient()
  const { data, count } = await supabase
    .from('reviews')
    .select('id, place_name, body, thumbnail, photos, content_type, like_count, created_at', { count: 'exact' })
    .eq('music->>trackId', trackId)
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .limit(60)

  const videos = (data ?? []).map((r) => ({
    id: r.id as string,
    placeName: (r.place_name as string) ?? '',
    body: (r.body as string) ?? '',
    thumbnail:
      (r.thumbnail as string | null) ??
      (Array.isArray(r.photos) ? (r.photos[0] as string) : null) ??
      null,
    contentType: (r.content_type as string) ?? 'photo',
    likeCount: (r.like_count as number) ?? 0,
  }))

  return NextResponse.json({
    track: {
      id: track.id,
      title: track.title,
      artist: track.artist,
      durationSec: track.durationSec,
      coverUrl: track.coverUrl,
      previewUrl: track.previewUrl,
      audioUrl: track.audioUrl,
    },
    usageCount: count ?? videos.length,
    videos,
  })
}
