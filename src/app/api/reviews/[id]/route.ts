import { getRequestUser } from '@/lib/auth/getRequestUser'
import { attemptsPublicationBypass, publishableFilter } from '@/lib/safety/gate/publicationAccess'
import { NextRequest, NextResponse } from 'next/server'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'

/**
 * GET /api/reviews/[id] — one review, by id.
 *
 * ============================================================================
 * WHY THIS ROUTE EXISTS
 * ============================================================================
 * It did not, and that absence was the root cause of a parity gap on BOTH native clients.
 *
 * The web has a review detail page, but it is a server component that reads the row straight out
 * of Supabase — a mechanism no native client can use. So Android built its detail screen on an
 * in-memory cache populated by the feed, and its own source says why: "the backend has no single
 * review GET". That works only when the review was already on screen. Open a SHARED link — the
 * one surface a detail page exists for — and Android shows an empty state, because nothing ever
 * put that row in the cache. iOS had no detail screen at all.
 *
 * Adding the route fixes the cause rather than the symptom: one contract, all three clients, and
 * a deep link that resolves from a cold start.
 *
 * ============================================================================
 * ACCESS
 * ============================================================================
 * 🔑 Exactly the filters the web page applies in `getReview` — hidden rows and non-publishable
 * rows are refused, and there is NO author exemption. This is the shareable public URL for a post;
 * an author reaches their own held content through `/api/reviews/mine`, which is the surface built
 * for it. A link that works for its author and 404s for everyone they send it to is worse than a
 * link that never worked.
 *
 * 🚨 Defence in depth, not the boundary. RESTRICTIVE RLS already refuses held rows; this route
 * carries the same guard as the other five review APIs so it does not stand alone on a migration
 * having been applied.
 *
 * Anonymous callers are allowed — this is a public read. `liked_by_me`/`saved_by_me` are computed
 * for whoever is asking and are simply false when nobody is.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, supabase } = await getRequestUser(req)

  const { data: review, error } = await supabase
    .from('reviews')
    .select(`
      id, user_id, place_name, place_address, rating, body,
      photos, is_verified, like_count, comment_count, save_count, created_at, music,
      content_type, media_url, thumbnail, source_type, source_url, hashtags,
      profiles(full_name, avatar_url)
    `)
    .eq('id', params.id)
    .or('is_hidden.is.null,is_hidden.eq.false')
    .or(publishableFilter())
    .maybeSingle()

  if (error || !review) {
    return NextResponse.json(
      { error: 'not_found', message: serverMessage('server.notFound', requestLocale(req)) },
      { status: 404 },
    )
  }

  // `reviews.comment_count` drifts from reality — the trigger that maintains it is blocked by RLS
  // for ordinary users — so the detail page counts the rows, exactly as the web page does. A
  // detail screen showing "3 comments" above two comments is the version of this bug users see.
  const { count: realCommentCount } = await supabase
    .from('review_comments')
    .select('id', { count: 'exact', head: true })
    .eq('review_id', params.id)

  let likedByMe = false
  let savedByMe = false
  if (user) {
    const [{ data: like }, { data: save }] = await Promise.all([
      supabase.from('review_likes').select('id')
        .eq('review_id', params.id).eq('user_id', user.id).maybeSingle(),
      supabase.from('review_saves').select('id')
        .eq('review_id', params.id).eq('user_id', user.id).maybeSingle(),
    ])
    likedByMe = !!like
    savedByMe = !!save
  }

  return NextResponse.json({
    ...review,
    like_count: review.like_count ?? 0,
    save_count: review.save_count ?? 0,
    comment_count: realCommentCount ?? 0,
    liked_by_me: likedByMe,
    saved_by_me: savedByMe,
  })
}

/**
 * DELETE /api/reviews/[id]
 *
 * ============================================================================
 * WHY THIS COUNTS ROWS — B16
 * ============================================================================
 * Deleting SOMEONE ELSE'S review used to answer `200 {"ok":true}` while deleting nothing.
 *
 * The security was never in doubt and still is not: the statement is scoped
 * `.eq('id', …).eq('user_id', user.id)`, and RLS refuses the row independently — a UAT probe
 * confirmed all rows survived. What was wrong is that PostgREST does not treat "0 rows matched"
 * as an error, and this handler only inspected `error`. So an unauthorized delete, a delete of a
 * row that never existed, and a real delete were indistinguishable to the caller. A client
 * removes the post from the list on `ok`, and it comes back on the next refresh.
 *
 * 🚨 `404` for both the not-found and not-yours cases, deliberately. Answering `403` for a row
 * that exists but belongs to someone else would confirm its existence to anyone who can guess an
 * id — the ownership check would become an existence oracle. The caller learns only "there is no
 * such review of yours", which is all they are entitled to know and all they can act on.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })
  // B17 — an anonymous session is authenticated but is not an account; social writes need one.
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal

  // `select('id')` is what makes the affected rows observable — without it PostgREST returns no
  // representation and the count is unknowable.
  const { data, error } = await supabase
    .from('reviews').delete().eq('id', params.id).eq('user_id', user.id).select('id')

  if (error) return NextResponse.json({ error: 'delete_failed', message: serverMessage('server.deleteFailed', requestLocale(req)) }, { status: 500 })
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'not_found', message: serverMessage('server.notFound', requestLocale(req)) }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}

// PATCH /api/reviews/[id] - hide/unhide
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })
  // B17 — an anonymous session is authenticated but is not an account; social writes need one.
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal
  let body: { is_hidden?: boolean } = {}
  try { body = await req.json() } catch { /* empty */ }

  // Content safety gate — publication state is decided by the server from an
  // evaluation and is never accepted from a request. A body that tries to set it
  // is refused rather than quietly sanitised: this is not a client mistake.
  // (`is_hidden` stays the author's own control and is handled below as before.)
  const { is_hidden: _authorHide, ...rest } = body as Record<string, unknown>
  if (attemptsPublicationBypass(rest)) {
    return NextResponse.json({ error: 'invalid_input', message: serverMessage('validation.invalid', requestLocale(req)) }, { status: 400 })
  }

  // Same affected-row contract as DELETE above — see that comment for why 0 rows is a 404 and
  // not a 403.
  const { data, error } = await supabase
    .from('reviews').update({ is_hidden: body.is_hidden ?? false })
    .eq('id', params.id).eq('user_id', user.id).select('id')

  if (error) return NextResponse.json({ error: 'update_failed', message: serverMessage('server.updateFailed', requestLocale(req)) }, { status: 500 })
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'not_found', message: serverMessage('server.notFound', requestLocale(req)) }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
