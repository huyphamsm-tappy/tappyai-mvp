import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/reviews/saved — the user's saved reviews (the "reference/bookmark" kind that,
// together with Favorites, makes up the unified Saved library — MFS 4.9/4.11).
export async function GET(req: NextRequest) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: saves, error } = await supabase
    .from('review_saves')
    .select('review_id, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: 'Lỗi tải danh sách' }, { status: 500 })

  const ids = (saves || []).map(s => s.review_id)
  if (ids.length === 0) return NextResponse.json({ reviews: [] })

  const savedAt = new Map((saves || []).map(s => [s.review_id, s.created_at as string]))
  const { data: reviews } = await supabase
    .from('reviews')
    .select('id, place_name, body, photos, thumbnail, content_type, created_at')
    .in('id', ids)
    .or('is_hidden.is.null,is_hidden.eq.false')

  const ordered = (reviews || [])
    .map(r => ({ ...r, saved_at: savedAt.get(r.id) || r.created_at }))
    .sort((a, b) => (b.saved_at || '').localeCompare(a.saved_at || ''))

  return NextResponse.json({ reviews: ordered })
}
