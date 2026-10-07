import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'
import { searchParam } from '@/lib/http/searchParams'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

// ── GET /api/social/connections?type=following|followers ────────────────────
//
// The two lists the Friends / Social page is made of, over `user_follows` —
// which already exists, is already maintained by the follow endpoint, and whose
// counts are already denormalised onto `profiles`.
//
// 🚨 THE CALLER'S OWN GRAPH ONLY. There is no `[id]` in this route on purpose.
// `user_follows` is readable by policy ("Anyone can read follows"), so a route
// taking a user id would have worked — and would have shipped a general-purpose
// "browse anyone's social graph" surface that nothing asked for. The page needs
// the signed-in user's two lists; that is what this returns.
//
// 🚨 NOT A FRIEND LIST. `user_follows` is DIRECTIONAL. `following` and
// `followers` are different sets and are returned as different things. Nothing
// here intersects them into a "friends" list, because the product has no
// friendship model and a mutual follow is not a mutual agreement.

const PAGE_SIZE = 60

interface ProfileRow {
  id: string
  full_name: string | null
  avatar_url: string | null
  follower_count: number | null
  following_count: number | null
}

export async function GET(req: NextRequest) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) {
    return NextResponse.json(
      { error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) },
      { status: 401 },
    )
  }

  const type = searchParam(req, 'type') === 'followers' ? 'followers' : 'following'

  // following → rows where I am the follower, and the OTHER id is what I want.
  // followers → rows where I am the followed, and the other id is the follower.
  const [matchColumn, wantedColumn] = type === 'followers'
    ? ['following_id', 'follower_id']
    : ['follower_id', 'following_id']

  // 🚨 Literal select strings, not an interpolated one. `supabase-js` parses the
  // column list AT THE TYPE LEVEL, so a template literal resolves to a
  // `ParserError` and the row type collapses. Two explicit branches keep the
  // query typed; the column names are already decided above either way.
  const { data: edges, error: edgeError } = type === 'followers'
    ? await supabase
        .from('user_follows')
        .select('follower_id, created_at')
        .eq(matchColumn, user.id)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)
    : await supabase
        .from('user_follows')
        .select('following_id, created_at')
        .eq(matchColumn, user.id)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)

  if (edgeError) {
    console.error('[social] connections:', edgeError.message)
    return NextResponse.json(
      { error: 'server_error', message: serverMessage('server.error', requestLocale(req)) },
      { status: 500 },
    )
  }

  const ids = [...new Set((edges ?? []).map(e => (e as unknown as Record<string, string>)[wantedColumn]))]
  if (ids.length === 0) return NextResponse.json({ users: [] })

  const { data: profiles } = await supabase
    .from('profiles')
    // 🚨 THE SAME PUBLIC-SAFE COLUMNS `/api/users/search` RETURNS, AND NO MORE.
    // `profiles` also holds `email`. Selecting it here would put addresses on a
    // discovery page for everyone the user follows — the search endpoint can
    // MATCH an exact email and still does not return one, and this keeps that
    // line in the same place.
    .select('id, full_name, avatar_url, follower_count, following_count')
    .in('id', ids)

  const rows = (profiles ?? []) as ProfileRow[]

  /**
   * Is the caller following each of these people?
   *
   * For `following` the answer is trivially yes. For `followers` it genuinely
   * varies — someone can follow you without being followed back — and that is
   * exactly the state the card's button has to render, so it is asked for
   * rather than assumed.
   */
  let followingSet: Set<string>
  if (type === 'following') {
    followingSet = new Set(ids)
  } else {
    const { data: backRows } = await supabase
      .from('user_follows')
      .select('following_id')
      .eq('follower_id', user.id)
      .in('following_id', ids)
    followingSet = new Set((backRows ?? []).map(r => (r as { following_id: string }).following_id))
  }

  // Ordered by the edge, not by the profile fetch: most recently connected first.
  const byId = new Map(rows.map(p => [p.id, p]))
  const users = ids
    .map(id => byId.get(id))
    .filter((p): p is ProfileRow => !!p)
    .map(p => ({ ...p, is_following: followingSet.has(p.id) }))

  return NextResponse.json({ users })
}
