import { createClient } from '@/lib/supabase/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { getTrack } from '@/modules/music/server'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// GET /api/sound/[trackId] — mini-Spotify sound page data:
//   track metadata + music_type + play_count, how many visible videos use it
//   (+ a grid), saved/followed counts and this user's state, and a weekly
//   trending rank.
//
// Everything beyond the core track + video count is BEST-EFFORT and wrapped so
// a missing table/column/function (pre-migration) or a transient error degrades
// to a safe default rather than 500-ing the page. Totals come from SECURITY
// DEFINER rpc functions (no service-role key, no public row exposure); this
// user's own state uses their authenticated client (own-row RLS).
export async function GET(req: NextRequest, { params }: { params: { trackId: string } }) {
  const trackId = params.trackId?.trim()
  if (!trackId) return NextResponse.json({ error: 'trackId required' }, { status: 400 })

  const track = await getTrack(trackId)
  if (!track) return NextResponse.json({ error: 'Bài nhạc không tồn tại' }, { status: 404 })

  const supabase = createClient()

  // Videos using this track + accurate count (source of truth = reviews).
  const { data: vids, count } = await supabase
    .from('reviews')
    .select('id, place_name, body, thumbnail, photos, content_type, like_count, created_at', { count: 'exact' })
    .eq('music->>trackId', trackId)
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .limit(60)

  const videos = (vids ?? []).map((r) => ({
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

  // music_type + play_count (columns may not exist pre-migration).
  let musicType = 'royalty_free'
  let playCount = 0
  try {
    const { data: meta } = await supabase.from('music_tracks').select('music_type, play_count').eq('id', trackId).maybeSingle()
    if (meta) {
      musicType = (meta.music_type as string) ?? musicType
      playCount = (meta.play_count as number) ?? 0
    }
  } catch { /* pre-migration */ }

  // Saved / followed totals via SECURITY DEFINER functions (never leak who).
  let savedCount = 0
  let followCount = 0
  try { const { data } = await supabase.rpc('music_saved_count', { p_track: trackId }); savedCount = Number(data) || 0 } catch { /* pre-migration */ }
  try { const { data } = await supabase.rpc('music_followed_count', { p_track: trackId }); followCount = Number(data) || 0 } catch { /* pre-migration */ }

  // This user's saved/followed state — their own client, own-row RLS. Wrapped
  // so an auth/cookie hiccup never 500s the whole page.
  let savedByMe = false
  let followedByMe = false
  try {
    const { user, supabase: userClient } = await getRequestUser(req)
    if (user) {
      try { const { data } = await userClient.from('music_saved').select('id').eq('track_id', trackId).eq('user_id', user.id).maybeSingle(); savedByMe = !!data } catch { /* pre-migration */ }
      try { const { data } = await userClient.from('music_followed').select('id').eq('track_id', trackId).eq('user_id', user.id).maybeSingle(); followedByMe = !!data } catch { /* pre-migration */ }
    }
  } catch { /* anon or auth error → treat as not-saved */ }

  // Weekly trending rank: rank this track among all tracks used by visible
  // videos in the last 7 days. Null when the track wasn't used this week.
  let trendingRank: number | null = null
  try {
    const since = new Date(Date.now() - WEEK_MS).toISOString()
    const { data: recent } = await supabase
      .from('reviews')
      .select('music')
      .eq('is_hidden', false)
      .not('music', 'is', null)
      .gt('created_at', since)
      .limit(2000)
    const counts = new Map<string, number>()
    for (const r of recent ?? []) {
      const tid = (r.music as { trackId?: string } | null)?.trackId
      if (tid) counts.set(tid, (counts.get(tid) ?? 0) + 1)
    }
    if ((counts.get(trackId) ?? 0) > 0) {
      const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
      const idx = ranked.findIndex(([tid]) => tid === trackId)
      if (idx >= 0) trendingRank = idx + 1
    }
  } catch { /* non-fatal */ }

  return NextResponse.json({
    track: {
      id: track.id,
      title: track.title,
      artist: track.artist,
      durationSec: track.durationSec,
      coverUrl: track.coverUrl,
      previewUrl: track.previewUrl,
      audioUrl: track.audioUrl,
      musicType,
      playCount,
    },
    usageCount: count ?? videos.length,
    savedCount,
    savedByMe,
    followCount,
    followedByMe,
    trendingRank,
    videos,
  })
}
