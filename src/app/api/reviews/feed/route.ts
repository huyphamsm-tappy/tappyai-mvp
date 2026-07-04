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
    // Score-based trending feed: fetch a batch, compute score in JS
    const { data, error } = await supabase
      .from('reviews')
      .select(EXPLORE_SELECT)
      .or('is_hidden.is.null,is_hidden.eq.false')
      .order('created_at', { ascending: false })
      .limit(200)

    queryError = error

    if (!error && data) {
      const now = Date.now()
      const scored = data.map(r => {
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
          normalizedWatch * 0.35
          + completionRate * 0.25
          + engagementRate * 0.25
          + recencyScore * 0.15
        ) * locationBoost
        return { ...r, score }
      })
      scored.sort((a, b) => b.score - a.score)
      const page_results = scored.slice(offset, offset + limit)

      // Cold-start: inject up to 2 new posts with zero engagement near end of page
      const cutoff = new Date(now - 24 * 60 * 60 * 1000).toISOString()
      const { data: coldPool } = await supabase
        .from('reviews')
        .select(EXPLORE_SELECT)
        .or('is_hidden.is.null,is_hidden.eq.false')
        .gte('created_at', cutoff)
        .eq('like_count', 0)
        .eq('save_count', 0)
        .eq('comment_count', 0)
        .eq('view_count', 0)
        .order('created_at', { ascending: false })
        .limit(10)

      const pageIds = new Set(page_results.map((r: any) => r.id))
      const coldCandidates = (coldPool || []).filter((r: any) => !pageIds.has(r.id)).slice(0, 2).map((r: any) => ({ ...r, score: 0 }))

      if (coldCandidates.length > 0) {
        page_results.push(...coldCandidates)
      }

      reviews = page_results
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

  // reviews.comment_count drifts from reality (the DB trigger that maintains it is blocked
  // by RLS for ordinary users — see the comments API route for root cause). Override it with
  // a real tally so the feed always shows the true count; the trending/cold-start logic above
  // intentionally keeps reading the raw column for ranking, which is a separate concern.
  const realCommentCounts = new Map<string, number>()
  if (reviews && reviews.length > 0) {
    const { data: commentRows } = await supabase
      .from('review_comments')
      .select('review_id')
      .in('review_id', reviews.map(r => r.id))
    for (const row of commentRows || []) {
      realCommentCounts.set(row.review_id, (realCommentCounts.get(row.review_id) || 0) + 1)
    }
  }

  const enriched = (reviews || []).map(r => ({
    ...r,
    comment_count: realCommentCounts.get(r.id) ?? 0,
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
