import { processContent } from '@/lib/explore/contentProcessor'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { rateLimit } from '@/lib/security/rateLimit'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { NextRequest, NextResponse } from 'next/server'

const EMPTY: Record<string, unknown> = { caption: '', hashtags: [], category: 'other', location: '' }

/**
 * POST /api/explore/process  { thumbnail_url?, caption?, title? }
 *
 * Priority: caption → title → thumbnail_url (never uses thumbnail alone if text is available).
 * Only runs on upload — never during feed loading or scrolling.
 *
 * ============================================================================
 * 🚨 THIS ROUTE SPENDS MONEY — U15
 * ============================================================================
 * `processContent` makes up to two `AI.generate()` calls and one `AI.vision()` call, and vision is
 * the expensive one. It used to be reachable by any caller carrying a session, with NO rate limit
 * of any kind. An anonymous session is a session, and `POST /api/auth/anonymous` mints one for any
 * visitor, so a single anonymous identity could call this in a loop and bill the project without
 * ever creating an account.
 *
 * Two independent limits now, because they fail differently:
 *
 *  1. ANONYMOUS IS REFUSED. Not merely as cost control — an anonymous caller has no legitimate use
 *     for this endpoint at all. It exists to assist a review upload, and `POST /api/reviews` and
 *     `POST /api/reviews/upload` both refuse anonymous callers, so nothing an anonymous session
 *     produced here could ever be published. The work was already unusable; only the bill was real.
 *
 *  2. REGISTERED CALLERS ARE CAPPED per user. An account is cheap to create too, and the composer
 *     calls this once per upload — a real user cannot approach 20 in a minute, and an automated
 *     one is stopped before the spend is interesting.
 *
 * The empty-result shape is preserved for the unauthenticated case: the composer treats `EMPTY` as
 * "no suggestion available" and carries on, and turning that into an error would break an upload
 * flow over an optional convenience. The refusals below are explicit because they are decisions,
 * not missing data.
 */
export async function POST(req: NextRequest) {
  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json(EMPTY)
  // An anonymous session is authenticated but is not an account, and cannot publish a review.
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal

  if (!rateLimit(`explore-process:${user.id}`, 20, 60_000).ok) {
    return NextResponse.json(
      { error: 'rate_limit', message: serverMessage('rate.tooFast', requestLocale(req)) },
      { status: 429 },
    )
  }

  let thumbnail_url = '', caption = '', title = ''
  try {
    const b = await req.json()
    thumbnail_url = b.thumbnail_url?.trim() || ''
    caption = b.caption?.trim() || ''
    title = b.title?.trim() || ''
  } catch { /* empty body */ }

  // SSRF guard: the thumbnail URL is fetched server-side (AI SDK image input).
  // Only allow https URLs to public hosts; drop anything pointing at
  // localhost/loopback/private/link-local/internal or a non-https scheme.
  if (thumbnail_url && !isSafeHttpsUrl(thumbnail_url)) {
    console.warn('[explore/process] rejected unsafe thumbnail_url')
    thumbnail_url = ''
  }

  if (!thumbnail_url && !caption && !title) return NextResponse.json(EMPTY)

  const result = await processContent({
    thumbnailUrl: thumbnail_url || undefined,
    caption: caption || undefined,
    title: title || undefined,
  })
  return NextResponse.json(result)
}
