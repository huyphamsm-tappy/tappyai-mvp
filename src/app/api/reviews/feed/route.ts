import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/reviews/feed?page=0&limit=12&sort=latest|trending&userId=xxx
// Returns paginated community review feed with like status for logged-in user
export async function GET(req: NextRequest) {
  const page = Math.max(0, parseInt(req.nextUrl.searchParams.get('page') || '0'))
  const limit = Math.min(20, parseInt(req.nextUrl.searchParams.get('limit') || '12'))
  const offset = page * limit
  const filterUserId = req.nextUrl.searchParams.get('userId')
  const sort = req.nextUrl.searchParams.get('sort') || 'latest' // 'latest' | 'trending'

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let query = supabase
    .from('reviews')
    .select(`
      id, user_id, place_id, place_name, place_address,
      rating, body, photos, is_verified, like_count, comment_count, created_at,
      profiles(full_name, avatar_url)
    `)
    .eq('is_hidden', false)
    .range(offset, offset + limit - 1)

  if (filterUserId) query = query.eq('user_id', filterUserId)

  if (sort === 'trending') {
    // Trending: high likes + recent (within last 30 days), ordered by like_count desc then recency
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
    return NextResponse.json({ error: 'Lỗi t