import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/reviews/feed?page=0&limit=12&sort=latest|trending&userId=xxx&following=true
// Returns paginated community review feed with like status for logged-in user
export async function GET(req: NextRequest) {
  const page = Math.max(0, parseInt(req.nextUrl.searchParams.get('page') || '0'))
  const limit = Math.min(20, parseInt(req.nextUrl.searchParams.get('limit') || '12'))
  const offset = page * limit
  const filterUserId = req.nextUrl.searchParams.get('userId')
  const sort = req.nextUrl.searchParams.get('sort') || 'latest' // 'latest' | 'trending'
  const search = req.nextUrl.searchParams.get('search')?.trim() || ''
  const followingOnly = req.nextUrl.searchParams.get('following') === 'true'

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

  let query = supabase
    .from('reviews')
    .select(`
      id, user_id, place_id, place_name, place_address,
      rating, body, photos, is_verified, like_count, comment_count, created_at,
      profiles(full_name, avatar_url)
    `)
    .or('is_hidden.is.null,is_hidden.eq.false')
    .range(offset, offset + limit - 1)

  if (filterUserId) query = query.eq('user_id', filterUserId)
  if (followingIds) query = query.in('user_id', followingIds)
  if (search) query = query.or(`place_name.ilike.%${search}%,body.ilike.%${search}%`)

  if (sort === 'trending') {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    query = query
      .gte('created_at', thirtyDaysAgo)
      .order('like_count', { ascending: false })
      .order('created_at', { ascending: false })
  } else {
    query = query.order('created_at', { ascending: false })
  }

  const { data: reviews, error } = await query

  if (error) {
    console.error('[reviews/feed] query error:', error)
    return NextResponse.json({ error: 'Lỗi tải feed' }, { status: 500 })
  }

  // Fetch liked review IDs for the current user
  let likedIds: string[] = []
  if (user && reviews && reviews.length > 0) {
    const ids = reviews.map(r => r.id)
    const { data: likes } = await supabase
      .from('review_likes')
      .select('review_id')
      .eq('user_id', user.id)
      .in('review_id', ids)
    likedIds = (likes || []).map(l => l.review_id)
  }

  // Fetch saved IDs
  let savedIds: string[] = []
  if (user && reviews && reviews.length > 0) {
    const ids = reviews.map(r => r.id)
    const { data: saves } = await supabase
      .from('review_saves')
      .select('review_id')
      .eq('user_id', user.id)
      .in('review_id', ids)
    savedIds = (saves || []).map(s => s.review_id)
  }

  const enriched = (reviews || []).map(r => ({
    ...r,
    liked_by_me: likedIds.includes(r.id),
    saved_by_me: savedIds.includes(r.id),
  }))

  return NextResponse.json({ reviews: enriched, page, limit })
}
