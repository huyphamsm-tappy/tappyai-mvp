import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'

const EXPLORE_SELECT = `
  id, user_id, place_id, place_name, place_address,
  rating, body, photos, is_verified, like_count, comment_count,
  save_count, watch_time_avg, completion_rate, view_count, content_type, media_url, thumbnail,
  hashtags, source_type, source_url, created_at, music, is_hidden,
  profiles(full_name, avatar_url)
`

// GET /api/reviews/mine — the current user's own reviews, including hidden ones (own-only view,
// not the public feed). `/api/reviews/feed?userId=` always excludes is_hidden rows even for the
// owner, so this is a dedicated self-scoped route rather than a feed param, mirroring the
// pattern of /api/reviews/saved. Ownership is enforced both by the explicit `.eq('user_id', ...)`
// below and by RLS's "Owners can see own reviews" policy — without the explicit filter this would
// also return every other user's public reviews (RLS only gates visibility, it doesn't scope the
// query to "mine").
export async function GET(req: NextRequest) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: reviews, error } = await supabase
    .from('reviews')
    .select(EXPLORE_SELECT)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('[reviews/mine] query error:', error)
    return NextResponse.json({ error: 'Lỗi tải review của bạn' }, { status: 500 })
  }

  let likedIds: string[] = []
  let savedIds: string[] = []
  if (reviews && reviews.length > 0) {
    const ids = reviews.map(r => r.id)
    const [likesRes, savesRes] = await Promise.all([
      supabase.from('review_likes').select('review_id').eq('user_id', user.id).in('review_id', ids),
      supabase.from('review_saves').select('review_id').eq('user_id', user.id).in('review_id', ids),
    ])
    likedIds = (likesRes.data || []).map(l => l.review_id)
    savedIds = (savesRes.data || []).map(s => s.review_id)
  }

  const enriched = (reviews || []).map(r => ({
    ...r,
    liked_by_me: likedIds.includes(r.id),
    saved_by_me: savedIds.includes(r.id),
  }))

  return NextResponse.json({ reviews: enriched })
}
