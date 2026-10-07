import { getRequestUser } from '@/lib/auth/getRequestUser'
import { stripUnservableMedia } from '@/lib/media/servableMedia'
import { publishableFilter } from '@/lib/safety/gate/publicationAccess'
import { NextRequest, NextResponse } from 'next/server'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

// GET /api/reviews/liked — the user's liked reviews, the self profile's "Đã thích" collection.
//
// 🔑 WHY THIS ROUTE EXISTS (2026-09-15). The web's own-profile tab (`reviews/ProfileTab.tsx`) reads
// `review_likes` through the browser Supabase client and then `reviews` by id — a read the native
// clients cannot make (they have no PostgREST client, by design). `ProfileView.tsx` omitted a
// Liked tab for the same reason it refused that direct read: it bypasses `publishableFilter()`
// and `stripUnservableMedia`. This route is the gated version of that read — the SAME shape,
// order and boundary as `/api/reviews/saved`: the bearer's own likes only (no user parameter),
// newest like first, hidden and held posts filtered out, unservable media stripped, capped at 100.
export async function GET(req: NextRequest) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })

  const { data: likes, error } = await supabase
    .from('review_likes')
    .select('review_id, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: 'load_failed', message: serverMessage('server.loadFailed', requestLocale(req)) }, { status: 500 })

  const ids = (likes || []).map(l => l.review_id)
  if (ids.length === 0) return NextResponse.json({ reviews: [] })

  const likedAt = new Map((likes || []).map(l => [l.review_id, l.created_at as string]))
  const { data: reviews } = await supabase
    .from('reviews')
    .select('id, place_name, body, photos, thumbnail, content_type, created_at')
    .in('id', ids)
    .or('is_hidden.is.null,is_hidden.eq.false')
    // Content safety gate — a liked post that is under review is not served.
    .or(publishableFilter())

  const ordered = (reviews || [])
    .map(r => ({ ...r, liked_at: likedAt.get(r.id) || r.created_at }))
    .sort((a, b) => (b.liked_at || '').localeCompare(a.liked_at || ''))

  // Same boundary rule as the feed — see stripUnservableMedia.
  return NextResponse.json({ reviews: ordered.map(stripUnservableMedia) })
}
