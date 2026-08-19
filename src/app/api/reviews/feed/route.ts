import { getRequestUser } from '@/lib/auth/getRequestUser'
import { toExploreFeedItems, toProfileFeedItems } from '@/lib/media/servableMedia'
import { observePrivacyForFeed } from '@/lib/policy/explore/reviewFeedObservation'
import { publishableFilter } from '@/lib/safety/gate/publicationAccess'
import { authorModerationPayload } from '@/lib/safety/gate/authorNotice'
import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'edge'

const EXPLORE_SELECT = `
  id, user_id, place_id, place_name, place_address,
  rating, body, photos, is_verified, like_count, comment_count,
  save_count, watch_time_avg, completion_rate, view_count, content_type, media_url, thumbnail,
  hashtags, source_type, source_url, created_at, music,
  profiles(full_name, avatar_url)
`

// GET /api/reviews/feed?page=0&limit=12&sort=latest|trending&userId=xxx&following=true&city=xxx
export async function GET(req: NextRequest) {
  const page = Math.max(0, parseInt(req.nextUrl.searchParams.get('page') || '0'))
  const limit = Math.min(20, parseInt(req.nextUrl.searchParams.get('limit') || '12'))
  const offset = page * limit
  const filterUserId = req.nextUrl.searchParams.get('userId')
  const sort = req.nextUrl.searchParams.get('sort') || 'latest'
  const search = req.nextUrl.searchParams.get('search')?.trim() || ''
  const followingOnly = req.nextUrl.searchParams.get('following') === 'true'
  const city = req.nextUrl.searchParams.get('city')?.trim().toLowerCase() || ''

  const { user, supabase } = await getRequestUser(req)
  // Identity-scoped: only the author's OWN profile steps past the publication
  // boundary, and only that branch is told the moderation state.
  const isOwnProfile = Boolean(filterUserId && user && filterUserId === user.id)

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

  let reviews: any[] | null = null
  let queryError: any = null

  // Explore is a DISCOVERY surface: never serve the viewer their own posts.
  // Those live in "Hồ sơ & Bài của tôi" (?userId=me). Without this the client's
  // hashtag personalization ranks the viewer's own clips first — their
  // interaction history is dominated by their own posts — so opening Explore
  // showed your own content on the first slides, with no follow affordance
  // (you cannot follow yourself). Applies to the general feed only: an explicit
  // ?userId= profile feed and the following feed are unaffected.
  const excludeOwn = <T extends { neq: (c: string, v: string) => T }>(q: T): T =>
    user && !filterUserId ? q.neq('user_id', user.id) : q

  if (sort === 'trending' && !filterUserId && !followingIds && !search) {
    // Phase 1 — LIGHT scoring pass: pull only the columns the score needs (no
    // profiles join, no body/photos/hashtags) for the candidate pool. Ranking a
    // 200-row pool no longer drags 200 full rows + a join across the wire.
    const { data: pool, error } = await excludeOwn(supabase
      .from('reviews')
      .select('id, created_at, place_address, like_count, comment_count, save_count, view_count, watch_time_avg, completion_rate')
      .or('is_hidden.is.null,is_hidden.eq.false')
      // Content safety gate — Explore and the profile feed both serve only what
      // the gate has published. Legacy rows (NULL) keep their prior visibility.
      .or(publishableFilter())
      .order('created_at', { ascending: false })
      .limit(200))

    queryError = error

    if (!error && pool) {
      const now = Date.now()
      const cutoff = now - 24 * 60 * 60 * 1000
      const scored = pool.map((r: any) => {
        const daysOld = (now - new Date(r.created_at).getTime()) / (86400 * 1000)
        const recencyScore = 1.0 / (1.0 + daysOld)
        const locationBoost = city && r.place_address?.toLowerCase().includes(city) ? 1.3 : 1.0
        const normalizedWatch = Math.min((r.watch_time_avg || 0) / 60.0, 1.0)
        const completionRate = r.completion_rate || 0
        const viewCount = r.view_count || 0
        const engagementRate = Math.min(
          ((r.like_count || 0) + (r.comment_count || 0) + (r.save_count || 0)) / Math.max(viewCount, 1),
          1.0
        )
        const score = (
          normalizedWatch * 0.35 + completionRate * 0.25 + engagementRate * 0.25 + recencyScore * 0.15
        ) * locationBoost
        return { id: r.id as string, score }
      })
      scored.sort((a, b) => b.score - a.score)
      const pageRows = scored.slice(offset, offset + limit)
      const pageIds = new Set(pageRows.map(x => x.id))

      // Cold-start: up to 2 recent zero-engagement posts, taken from the SAME
      // pool (no separate query) so brand-new posts still surface.
      const cold = (pool as any[]).filter(r =>
        new Date(r.created_at).getTime() >= cutoff &&
        !r.like_count && !r.save_count && !r.comment_count && !r.view_count &&
        !pageIds.has(r.id)
      ).slice(0, 2)

      const wantIds = [...pageRows.map(x => x.id), ...cold.map(r => r.id)]
      // Phase 2 — fetch FULL rows (with the profiles join) only for what this
      // page renders (~12–14), not the whole 200-row pool.
      if (wantIds.length > 0) {
        const { data: full, error: fullErr } = await supabase
          .from('reviews')
          .select(EXPLORE_SELECT)
          .in('id', wantIds)
        queryError = fullErr
        const byId = new Map((full || []).map((r: any) => [r.id, r]))
        reviews = wantIds.map(id => byId.get(id)).filter(Boolean) as any[]
      } else {
        reviews = []
      }
    }
  } else {
    // Latest, filtered, search, or following feed
    let query = supabase
      .from('reviews')
      // The lifecycle columns are read ONLY on the author's own profile, and are
      // stripped again before the response — see the enrichment below. Every
      // other branch never even selects them.
      .select(isOwnProfile ? `${EXPLORE_SELECT}, publication_state, safety_state` : EXPLORE_SELECT)
      .or('is_hidden.is.null,is_hidden.eq.false')
      .range(offset, offset + limit - 1)

    // Content safety gate — Explore and other people's profiles serve only what
    // the gate has published. Legacy rows (NULL) keep their prior visibility.
    //
    // 🔑 EXCEPT the author's own profile. This route backs "Bài của tôi" and the
    // profile grid, which is the one place an author can reach a post to edit,
    // hide or delete it. Filtering a held post out THERE does not hide it from
    // the public — it strands it: invisible to the only person who could act on
    // it, while the gate holds it indefinitely. The same reasoning already
    // exempts this branch from the unrenderable-media filter below, and
    // /api/reviews/mine is deliberately unfiltered for exactly this reason.
    //
    // 🚨 Scoped to the AUTHOR, not to "a profile feed". `filterUserId` is a
    // query parameter and anyone can put anyone's id in it; `user.id` comes from
    // a verified session or JWT (getRequestUser). Only when they are the same
    // person does the gate step aside, and only for that person's own rows —
    // the `.eq('user_id', filterUserId)` below keeps the query self-scoped, and
    // the database's own publication boundary independently refuses a held row
    // to anyone but its author.
    // (hoisted above the branch — see declaration near the top of the handler)
    if (!isOwnProfile) query = query.or(publishableFilter())

    if (filterUserId) query = query.eq('user_id', filterUserId)
    if (followingIds) query = query.in('user_id', followingIds)
    else query = excludeOwn(query)
    if (search) {
      // Wrap the value in double quotes and escape \ and " so PostgREST treats
      // reserved chars (, . ( )) as literal search text instead of filter syntax.
      // Prevents filter injection while preserving search behavior (% stays a wildcard).
      const safe = search.replace(/[\\"]/g, m => '\\' + m)
      query = query.or(`place_name.ilike."%${safe}%",body.ilike."%${safe}%"`)
    }
    query = query.order('created_at', { ascending: false })

    const { data, error } = await query
    reviews = data
    queryError = error
  }

  if (queryError) {
    console.error('[reviews/feed] query error:', queryError)
    return NextResponse.json({ error: 'Loi tai feed' }, { status: 500 })
  }

  // Fetch liked and saved IDs for current user
  let likedIds: string[] = []
  let savedIds: string[] = []
  // Authors the viewer already follows — drives the feed avatar's "+" affordance
  // (WEB-EXPLORE-FOLLOW-002). Without it the "+" would reappear after every
  // refresh even for an author the viewer just followed.
  let followedAuthorIds: string[] = []
  if (user && reviews && reviews.length > 0) {
    const ids = reviews.map(r => r.id)
    const authorIds = [...new Set(reviews.map(r => r.user_id).filter(Boolean))]
    const [likesRes, savesRes, followsRes] = await Promise.all([
      supabase.from('review_likes').select('review_id').eq('user_id', user.id).in('review_id', ids),
      supabase.from('review_saves').select('review_id').eq('user_id', user.id).in('review_id', ids),
      supabase.from('user_follows').select('following_id').eq('follower_id', user.id).in('following_id', authorIds),
    ])
    likedIds = (likesRes.data || []).map(l => l.review_id)
    savedIds = (savesRes.data || []).map(s => s.review_id)
    followedAuthorIds = (followsRes.data || []).map(f => f.following_id)
  }

  // comment_count is now maintained accurately by the SECURITY DEFINER counter
  // trigger (add_counter_security_definer.sql) + its one-time backfill, so we
  // trust the column directly instead of re-tallying review_comments on every
  // feed load (that extra query was only there while the RLS-blocked trigger
  // left the column drifting).
  // Moderation state, for the author's own profile ONLY.
  //
  // Without this an author sees their rejected post sitting in their profile with
  // no indication it is not public — which is the "it uploaded fine and then
  // vanished" experience the gate is supposed to prevent. `isOwnProfile` is the
  // same identity-scoped branch that let the row through at all, so nothing is
  // exposed to anyone the row was not already served to.
  //
  // 🚨 The raw columns are STRIPPED and replaced by the author-facing payload:
  // `publication_state` and `safety_state` never reach any client. What is
  // returned is the visibility of the post plus honest wording — never a policy
  // identity, a reason code or a coverage detail.
  const lang =
    req.nextUrl.searchParams.get('lang') ||
    // Optional chaining throughout: a header bag is not guaranteed on every
    // caller, and a missing Accept-Language must fall back to Vietnamese rather
    // than throw and take the whole feed down for a wording lookup.
    req.headers?.get?.('accept-language')?.split(',')[0]?.trim() ||
    'vi'
  const noticeLang = lang.toLowerCase().startsWith('en') ? 'en' : 'vi'

  const enriched: any[] = (reviews || []).map(r => {
    const { publication_state, safety_state, ...rest } = r as Record<string, unknown>
    const moderation = isOwnProfile
      ? authorModerationPayload(
          { publication_state: publication_state as string, safety_state: safety_state as string },
          noticeLang,
        )
      : null
    return {
      ...rest,
      liked_by_me: likedIds.includes(r.id),
      saved_by_me: savedIds.includes(r.id),
      is_following: followedAuthorIds.includes(r.user_id),
      ...(moderation ? { moderation } : {}),
    }
  })

  // Historical Vercel Blob media is dropped at the response boundary. The store
  // is suspended for data transfer, so those URLs 403 today — and would start
  // billing egress again the moment the allowance resets. Nothing is deleted;
  // the post keeps every other field and simply renders without a dead player.
  //
  // …and a post left with NO media at all is then dropped from Explore, because a
  // slide with nothing on it is not content. Measured on production 2026-08-15:
  // 3 of the 5 rows in ?sort=latest came back with media_url null, thumbnail null
  // and no photos, and the client renders exactly that as a blank gradient panel
  // (feedShared.tsx:443). Explore eligibility is the backend's call, so it is made
  // here rather than asking every client to re-derive it. Visibility only — no row
  // is deleted, and the author still sees the post under /api/reviews/mine.
  //
  // `hasMore` is measured BEFORE that filter, and exists because of it: the web feed
  // used to stop paginating on `rows.length >= 12`, so a page shortened by dropping
  // dead rows would have ended the feed early and hidden healthy posts below it.
  // Whether more rows exist is a property of the query, not of how many survived
  // rendering, so the server is the only place that can answer it honestly.
  //
  // …but ONLY for the discovery surfaces. `?userId=` is a profile feed, and it backs the one
  // place an author can reach a post to hide or delete it ("Bài của tôi" and the profile grid).
  // Dropping unrenderable rows there would strand the post: invisible to its owner, therefore
  // undeletable. Discovery hides it; management must not.
  const hasMore = enriched.length >= limit
  // Explore's served collection is bound separately from the profile one, and is
  // `null` on the profile path. Trust & Safety P1 observes what Explore actually
  // serves (Owner decision 2026-08-17), and binding it this way makes observing
  // the wrong collection unrepresentable rather than merely discouraged: there is
  // no variable here holding "whichever of the two we ended up with", so the
  // pre-filter `enriched` rows and the profile rows cannot be reached by it.
  const exploreServed = filterUserId ? null : toExploreFeedItems(enriched)
  const reviewsOut = exploreServed ?? toProfileFeedItems(enriched)
  const res = NextResponse.json({ reviews: reviewsOut, page, limit, hasMore })

  // Cache ONLY the truly uniform response: anonymous, non-following, non-profile
  // feeds (every anon caller gets identical rows with liked_by_me/saved_by_me all
  // false). A signed-in response is personalized per user by the enrichment above
  // — the previous condition forgot that, so the CDN cached one user's
  // liked_by_me/saved_by_me and served it to everyone for 30s (+60s stale):
  // cross-user state leak + likes visibly flip-flopping right after interaction
  // (x-vercel-cache HIT/STALE confirmed live on prod, 2026-07-27).
  if (!user && !followingOnly && !filterUserId) {
    res.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
  } else {
    // Explicit, not just absent: authed responses must never be stored by any
    // shared cache (Vercel edge serves cached copies even to cookie-bearing
    // requests — observed live), and Vary documents the auth dependency for
    // any intermediary that does respect it.
    res.headers.set('Cache-Control', 'private, no-store')
    res.headers.set('Vary', 'Authorization, Cookie')
  }

  // Trust & Safety P1 (`ts.privacy.personal-information@1`) — OBSERVATION ONLY.
  //
  // Runs after the response is built, on the FINAL EXPLORE-SERVED collection —
  // after the media filtering above, never on the pre-filter `enriched` rows and
  // never on profile-feed rows (`exploreServed` is null there, so the call is
  // skipped). Classifying a row Explore already removed would be observing
  // something no user was shown.
  //
  // It reads only body + hashtags + the row's own place fields, and cannot change
  // what this handler returns: `res` is already constructed above, and the
  // observation record type has no field for visibility, ranking, ordering,
  // recommendation, pagination or notification.
  //
  // THE RESULT IS DISCARDED, ON PURPOSE. There is no sink to send it to — no
  // edge-compatible audit or event writer exists, and `reviews` has no
  // classification column. Where these records are stored, and for how long, is
  // an unmade Product and privacy decision. Wiring the call now means that
  // decision costs one line, not a re-integration; until it is made this
  // computes the classification and drops it.
  //
  // `observePrivacyForFeed` is total: it returns an empty list rather than
  // throwing, so a classifier problem can never break the feed.
  if (exploreServed) observePrivacyForFeed(exploreServed, new Date().toISOString())

  return res
}
