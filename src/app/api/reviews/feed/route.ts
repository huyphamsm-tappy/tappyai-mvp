import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'edge'

const EXPLORE_SELECT = `
  id, user_id, place_id, place_name, place_address,
  rating, body, photos, is_verified, like_count, comment_count,
  save_count, watch_time_avg, completion_rate, view_count, content_type, media_url, thumbnail,
  hashtags, source_type, source_url, created_at, music,
  profiles(full_name, avatar_url)
`

// GET /api/reviews/feed?page=0&limit=12&sort=latest|trending&userId=xxx&following=true&city=xxx
export async function GET(req: NextRequest) {
  const page = Math.max(0, parseInt(req.nextUrl.searchParams.get('page') || '0'))
  const limit = Math.min(20, parseInt(req.nextUrl.searchParams.get('limit') || '12'))
  const offset = page * limit
  const filterUserId = req.nextUrl.searchParams.get('userId')
  const sort = req.nextUrl.searchParams.get('sort') || 'latest'
  const search = req.nextUrl.searchParams.get('search')?.trim() || ''
  const followingOnly = req.nextUrl.searchParams.get('following') === 'true'
  const city = req.nextUrl.searchParams.get('city')?.trim().toLowerCase() || ''

  const { user, supabase } = await getRequestUser(req)

  // For "following" feed: get list of followed user IDs
  let followingIds: string[] | null = null
  if (followingOnly && user) {
    const { data: follows } = await supabase
      .from('user_follows')
      .select('following_id')
      .eq('follower_id', user.id)
    followingIds = (follows || []).map(f => f.following_id)
    if (followingIds.length === 0) {
      return NextResponse.json({ reviews: [], page, limit, empty: 'not_following_anyone' })
    }
  }

  let reviews: any[] | null = null
  let queryError: any = null

  if (sort === 'trending' && !filterUserId && !followingIds && !search) {
    // Phase 1 — LIGHT scoring pass: pull only the columns the score needs (no
    // profiles join, no body/photos/hashtags) for the candidate pool. Ranking a
    // 200-row pool no longer drags 200 full rows + a join across the wire.
    const { data: pool, error } = await supabase
      .from('reviews')
      .select('id, created_at, place_address, like_count, comment_count, save_count, view_count, watch_time_avg, completion_rate')
      .or('is_hidden.is.null,is_hidden.eq.false')
      .order('created_at', { ascending: false })
      .limit(200)

    queryError = error

    if (!error && pool) {
      const now = Date.now()
      const cutoff = now - 24 * 60 * 60 * 1000
      const scored = pool.map((r: any) => {
        const daysOld = (now - new Date(r.created_at).getTime()) / (86400 * 1000)
        const recencyScore = 1.0 / (1.0 + daysOld)
        const locationBoost = city && r.place_address?.toLowerCase().includes(city) ? 1.3 : 1.0
        const normalizedWatch = Math.min((r.watch_time_avg || 0) / 60.0, 1.0)
        const completionRate = r.completion_rate || 0
        const viewCount = r.view_count || 0
        const engagementRate = Math.min(
          ((r.like_count || 0) + (r.comment_count || 0) + (r.save_count || 0)) / Math.max(viewCount, 1),
          1.0
        )
        const score = (
          normalizedWatch * 0.35 + completionRate * 0.25 + engagementRate * 0.25 + recencyScore * 0.15
        ) * locationBoost
        return { id: r.id as string, score }
      })
      scored.sort((a, b) => b.score - a.score)
      const pageRows = scored.slice(offset, offset + limit)
      const pageIds = new Set(pageRows.map(x => x.id))

      // Cold-start: up to 2 recent zero-engagement posts, taken from the SAME
      // pool (no separate query) so brand-new posts still surface.
      const cold = (pool as any[]).filter(r =>
        new Date(r.created_at).getTime() >= cutoff &&
        !r.like_count && !r.save_count && !r.comment_count && !r.view_count &&
        !pageIds.has(r.id)
      ).slice(0, 2)

      const wantIds = [...pageRows.map(x => x.id), ...cold.map(r => r.id)]
      // Phase 2 — fetch FULL rows (with the profiles join) only for what this
      // page renders (~12–14), not the whole 200-row pool.
      if (wantIds.length > 0) {
        const { data: full, error: fullErr } = await supabase
          .from('reviews')
          .select(EXPLORE_SELECT)
          .in('id', wantIds)
        queryError = fullErr
        const byId = new Map((full || []).map((r: any) => [r.id, r]))
        reviews = wantIds.map(id => byId.get(id)).filter(Boolean) as any[]
      } else {
        reviews = []
      }
    }
  } else {
    // Latest, filtered, search, or following feed
    let query = supabase
      .from('reviews')
      .select(EXPLORE_SELECT)
      .or('is_hidden.is.null,is_hidden.eq.false')
      .range(offset, offset + limit - 1)

    if (filterUserId) query = query.eq('user_id', filterUserId)
    if (followingIds) query = query.in('user_id', followingIds)
    if (search) {
      // Wrap the value in double quotes and escape \ and " so PostgREST treats
      // reserved chars (, . ( )) as literal search text instead of filter syntax.
      // Prevents filter injection while preserving search behavior (% stays a wildcard).
      const safe = search.replace(/[\\"]/g, m => '\\' + m)
      query = query.or(`place_name.ilike."%${safe}%",body.ilike."%${safe}%"`)
    }
    query = query.order('created_at', { ascending: false })

    const { data, error } = await query
    reviews = data
    queryError = error
  }

  if (queryError) {
    console.error('[reviews/feed] query error:', queryError)
    return NextResponse.json({ error: 'Loi tai feed' }, { status: 500 })
  }

  // Fetch liked and saved IDs for current user
  let likedIds: string[] = []
  let savedIds: string[] = []
  if (user && reviews && reviews.length > 0) {
    const ids = reviews.map(r => r.id)
    const [likesRes, savesRes] = await Promise.all([
      supabase.from('review_likes').select('review_id').eq('user_id', user.id).in('review_id', ids),
      supabase.from('review_saves').select('review_id').eq('user_id', user.id).in('review_id', ids),
    ])
    likedIds = (likesRes.data || []).map(l => l.review_id)
    savedIds = (savesRes.data || []).map(s => s.review_id)
  }

  // comment_count is now maintained accurately by the SECURITY DEFINER counter
  // trigger (add_counter_security_definer.sql) + its one-time backfill, so we
  // trust the column directly instead of re-tallying review_comments on every
  // feed load (that extra query was only there while the RLS-blocked trigger
  // left the column drifting).
  const enriched = (reviews || []).map(r => ({
    ...r,
    liked_by_me: likedIds.includes(r.id),
    saved_by_me: savedIds.includes(r.id),
  }))

  const res = NextResponse.json({ reviews: enriched, page, limit })

  // Cache public (non-personalized) feeds only
  if (!followingOnly && !filterUserId) {
    res.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
  }

  return res
}
