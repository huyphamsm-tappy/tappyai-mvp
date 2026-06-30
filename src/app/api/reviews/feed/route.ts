import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'edge'

const EXPLORE_SELECT = `
  id, user_id, place_id, place_name, place_address,
  rating, body, photos, is_verified, like_count, comment_count,
  save_count, watch_time_avg, content_type, media_url, thumbnail,
  hashtags, source_type, source_url, created_at,
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

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

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
        const recencyBoost = 1.0 / (1.0 + daysOld)
        const locationBoost = city && r.place_address?.toLowerCase().includes(city) ? 1.3 : 1.0
        const score = (
          5
          + (r.watch_time_avg || 0) * 0.4
          + (r.save_count || 0) * 0.3
          + (r.like_count || 0) * 0.2
          + (r.comment_count || 0) * 0.1
        ) * locationBoost * recencyBoost
        return { ...r, score }
      })
      scored.sort((a, b) => b.score - a.score)
      reviews = scored.slice(offset, offset + limit)
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
    if (search) query = query.or(`place_name.ilike.%${search}%,body.ilike.%${search}%`)
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
