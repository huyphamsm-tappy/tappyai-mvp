import { getRequestUser } from '@/lib/auth/getRequestUser'
import { publishableFilter } from '@/lib/safety/gate/publicationAccess'
import { NextRequest, NextResponse } from 'next/server'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

/**
 * GET /api/reviews/[id]/likes — who currently likes this review.
 *
 * ============================================================================
 * WHY THIS ROUTE EXISTS
 * ============================================================================
 * The Like COUNT was rendered on six web surfaces and was never its own click target — it sat
 * inside the like-toggle button, inside a tile button, or inside a <Link> to the post. So the one
 * thing a user means by tapping "❤️ 3" — *who are those three* — had no answer, and the tap did
 * something else instead: it toggled the like, or navigated away. This route is the missing half.
 *
 * ============================================================================
 * CURRENT STATE, NOT HISTORY
 * ============================================================================
 * 🔑 It reads `review_likes`, which is the set of likes that EXIST RIGHT NOW. Unliking deletes the
 * row, so an unliked person is simply absent. This is deliberately NOT the notification inbox:
 * `notifications` is an append-only event log that keeps a "X liked your post" row forever, even
 * after X unlikes. Those two answering differently is expected — one is a log, this is a census —
 * and a like list built on the log would name people who no longer like the post.
 *
 * ============================================================================
 * ACCESS
 * ============================================================================
 * Gated on the REVIEW, with exactly the filters `GET /api/reviews/[id]` applies: hidden rows and
 * non-publishable rows are refused, and there is no author exemption. If you may not read the
 * post, you may not enumerate who liked it.
 *
 * Anonymous callers are allowed — this is a public read of ONE clip's likers, and only `id`,
 * `full_name` and `avatar_url` are served; no email, no auth data.
 *
 * 🔑 Since `20260915b_review_likes_private.sql` the `review_likes` table is owner-read (a person's
 * liked COLLECTION is private), so this route no longer selects the table: it calls
 * `review_likers(review, limit, before)`, a SECURITY DEFINER read scoped to one review that
 * re-applies the same visibility gate as above inside the database. There is no function that
 * answers "everything user X liked" — that question is the one being closed.
 */

const DEFAULT_LIMIT = 30
const MAX_LIMIT = 50

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { supabase } = await getRequestUser(req)

  // Gate on the post itself, not on the likes — same filters as the single-review read.
  const { data: review } = await supabase
    .from('reviews')
    .select('id')
    .eq('id', params.id)
    .or('is_hidden.is.null,is_hidden.eq.false')
    .or(publishableFilter())
    .maybeSingle()

  if (!review) {
    return NextResponse.json(
      { error: 'not_found', message: serverMessage('server.notFound', requestLocale(req)) },
      { status: 404 },
    )
  }

  const url = new URL(req.url)
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(url.searchParams.get('limit') || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
  )
  const before = url.searchParams.get('before')

  const { data: rows, error } = await supabase.rpc('review_likers', {
    p_review_id: params.id,
    p_limit: limit,
    p_before: before || null,
  })
  if (error) {
    return NextResponse.json(
      { error: 'load_failed', message: serverMessage('server.loadFailed', requestLocale(req)) },
      { status: 500 },
    )
  }

  const likeRows = (rows ?? []) as Array<{ user_id: string; created_at: string }>

  // 🚨 `review_likes.user_id` references `auth.users`, NOT `profiles`, so PostgREST has no
  // relationship to embed and `select('profiles(...)')` would fail. One batched fetch instead —
  // the same two-step `GET /api/notifications` uses to resolve its actors, for the same reason.
  const userIds = Array.from(new Set(likeRows.map(r => r.user_id as string).filter(Boolean)))
  let profileMap: Record<string, { full_name: string | null; avatar_url: string | null }> = {}
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', userIds)
    profileMap = Object.fromEntries(
      (profiles ?? []).map(p => [
        p.id as string,
        { full_name: (p.full_name as string | null) ?? null, avatar_url: (p.avatar_url as string | null) ?? null },
      ]),
    )
  }

  // A liker with no `profiles` row is real and is kept: anonymous sessions never got one
  // (handle_new_user skips them), and dropping the row would make the list disagree with the
  // count beside it. `full_name: null` is the client's cue to render its own localized fallback.
  const likers = likeRows.map(r => ({
    id: r.user_id as string,
    full_name: profileMap[r.user_id as string]?.full_name ?? null,
    avatar_url: profileMap[r.user_id as string]?.avatar_url ?? null,
    created_at: r.created_at as string,
  }))

  return NextResponse.json({
    likers,
    // Only a full page can have more behind it; a short page is the end of the list.
    next_cursor: likeRows.length === limit ? (likeRows[likeRows.length - 1].created_at as string) : null,
  })
}
