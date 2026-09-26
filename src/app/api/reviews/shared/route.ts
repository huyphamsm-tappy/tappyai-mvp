import { getRequestUser } from '@/lib/auth/getRequestUser'
import { stripUnservableMedia } from '@/lib/media/servableMedia'
import { publishableFilter } from '@/lib/safety/gate/publicationAccess'
import { NextRequest, NextResponse } from 'next/server'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

/** The same cap `/saved` and `/liked` use; `?limit=` can only narrow it. */
const MAX_LIMIT = 100

// GET /api/reviews/shared[?limit=n] — the reviews the caller has shared, the self profile's
// "Đã share" collection. 2026-09-15. The same contract as `/api/reviews/saved` and `/liked`:
// bearer-only (no user parameter to aim at someone else), newest activity first, hidden and held
// posts filtered out, unservable media stripped, bounded.
//
// `review_shares` is a HISTORY (one row per share), the grid is a COLLECTION: rows are collapsed
// per review, keeping the LATEST share — that is when the post last moved through this account,
// and it is what `shared_at` carries. The raw rows stay in the table for anyone who later wants
// the activity view.
export async function GET(req: NextRequest) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })

  const requested = Number(new URL(req.url).searchParams.get('limit'))
  const limit = Number.isFinite(requested) && requested > 0 ? Math.min(Math.floor(requested), MAX_LIMIT) : MAX_LIMIT

  // Read a few rows beyond the limit so a post shared repeatedly does not eat the page.
  const { data: shares, error } = await supabase
    .from('review_shares')
    .select('review_id, created_at, channel')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit * 3)

  if (error) return NextResponse.json({ error: 'load_failed', message: serverMessage('server.loadFailed', requestLocale(req)) }, { status: 500 })

  const latest = new Map<string, { shared_at: string; channel: string }>()
  for (const s of shares || []) {
    if (!latest.has(s.review_id)) latest.set(s.review_id, { shared_at: s.created_at as string, channel: s.channel as string })
    if (latest.size >= limit) break
  }
  const ids = [...latest.keys()]
  if (ids.length === 0) return NextResponse.json({ reviews: [] })

  const { data: reviews } = await supabase
    .from('reviews')
    .select('id, place_name, body, photos, thumbnail, content_type, created_at')
    .in('id', ids)
    .or('is_hidden.is.null,is_hidden.eq.false')
    // Content safety gate — a shared post that is under review is not served.
    .or(publishableFilter())

  const ordered = (reviews || [])
    .map(r => ({ ...r, shared_at: latest.get(r.id)?.shared_at || r.created_at, share_channel: latest.get(r.id)?.channel }))
    .sort((a, b) => (b.shared_at || '').localeCompare(a.shared_at || ''))

  // Same boundary rule as the feed — see stripUnservableMedia.
  return NextResponse.json({ reviews: ordered.map(stripUnservableMedia) })
}
