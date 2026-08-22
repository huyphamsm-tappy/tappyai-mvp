import { getRequestUser } from '@/lib/auth/getRequestUser'
import { stripUnservableMedia } from '@/lib/media/servableMedia'
import { authorModerationPayload } from '@/lib/safety/gate/authorNotice'
import { NextRequest, NextResponse } from 'next/server'
import { searchParam } from '@/lib/http/searchParams'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

const EXPLORE_SELECT = `
  id, user_id, place_id, place_name, place_address,
  rating, body, photos, is_verified, like_count, comment_count,
  save_count, watch_time_avg, completion_rate, view_count, content_type, media_url, thumbnail,
  hashtags, source_type, source_url, created_at, music, is_hidden,
  publication_state, safety_state,
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
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })

  const { data: reviews, error } = await supabase
    .from('reviews')
    .select(EXPLORE_SELECT)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('[reviews/mine] query error:', error)
    return NextResponse.json({ error: 'load_failed', message: serverMessage('review.loadMineFailed', requestLocale(req)) }, { status: 500 })
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

  // The author's own moderation outcome, per post.
  //
  // This route is self-scoped BY CONSTRUCTION — `.eq('user_id', user.id)` on an identity taken
  // from the verified session, never from a query parameter — so every row here belongs to the
  // reader and there is no branch to get wrong. The feed route needs an `isOwnProfile` check for
  // the same payload precisely because its `userId` is caller-supplied.
  //
  // 🚨 The raw columns are STRIPPED and replaced. `publication_state` and `safety_state` are
  // selected so the notice can be derived, and must not reach any client — an author who learns
  // WHICH check held their post learns what to change to get past it. Same boundary the feed
  // enforces; restated because this is the second response that legitimately speaks to an author
  // about their own posts.
  //
  // Without this, an Android author saw their held post sitting in their profile with no
  // indication it was not public: the composer's dialog was the only place they were ever told,
  // and it is gone the moment it is dismissed. `authorModerationPayload` returns null while the
  // gate is inactive, so the response shape is unchanged for anyone who has not turned it on.
  const lang =
    searchParam(req, 'lang') ||
    req.headers?.get?.('accept-language')?.split(',')[0]?.trim() ||
    'vi'
  const noticeLang = lang.toLowerCase().startsWith('en') ? 'en' : 'vi'

  const enriched = (reviews || []).map(r => {
    const { publication_state, safety_state, ...rest } = r as Record<string, unknown>
    const moderation = authorModerationPayload(
      { publication_state: publication_state as string, safety_state: safety_state as string },
      noticeLang,
    )
    return {
      ...rest,
      liked_by_me: likedIds.includes(r.id),
      saved_by_me: savedIds.includes(r.id),
      ...(moderation ? { moderation } : {}),
    }
  })

  // Same boundary rule as the feed — see stripUnservableMedia.
  return NextResponse.json({ reviews: enriched.map(stripUnservableMedia) })
}
