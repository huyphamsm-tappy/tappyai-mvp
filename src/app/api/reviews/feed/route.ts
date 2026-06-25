import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/reviews/feed?page=0&limit=12&sort=latest|trending&userId=xxx
export async function GET(req: NextRequest) {
  const page = Math.max(0, parseInt(req.nextUrl.searchParams.get('page') || '0'))
  const limit = Math.min(20, parseInt(req.nextUrl.searchParams.get('limit') || '12'))
  const offset = page * limit
  const filterUserId = req.nextUrl.searchParams.get('userId')
  const sort = req.nextUrl.searchParams.get('sort') || 'latest'
  const search = req.nextUrl.searchParams.get('search')?.trim() || ''

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

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
  if (error) return NextResponse.json({ error: 'Loi tai feed' }, { status: 500 })

  let likedIds: string[] = []
  if (user && reviews?.length) {
    const ids = reviews.map(r => r.id)
    const { data: likes } = await supabase.from('review_likes').select('review_id').eq('user_id', user.id).in('review_id', ids)
    likedIds = (likes || []).map(l => l.review_id)
  }
  let savedIds: string[] = []
  if (user && reviews?.length) {
    const ids = reviews.map(r => r.id)
    const { data: saves } = await supabase.from('review_saves').select('review_id').eq('user_id', user.id).in('review_id', ids)
    savedIds = (saves || []).map(s => s.review_id)
  }

  return NextResponse.json({
    reviews: (reviews || []).map(r => ({ ...r, liked_by_me: likedIds.includes(r.id), saved_by_me: savedIds.includes(r.id) })),
    page,
    limit,
  })
}
