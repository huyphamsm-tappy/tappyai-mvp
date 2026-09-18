import { getRequestUser } from '@/lib/auth/getRequestUser'
import { publishableFilter } from '@/lib/safety/gate/publicationAccess'
import { NextRequest, NextResponse } from 'next/server'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

export const runtime = 'edge'

// The columns every caller may see. `profiles` is public-read, and these are the
// social-identity fields — never `language`, `onboarded` or anything else the row
// carries for the owner's own use.
const PUBLIC_COLUMNS = 'id, full_name, avatar_url, follower_count, following_count'
// Public presentation fields added by `20260915_profile_public_presentation.sql`.
// 🔑 Schema bridge: until that migration is applied the columns do not exist and
// PostgREST answers 42703 (undefined column). The read then falls back to the
// column set above, so the profile keeps working in either order of deploy and
// migration; the absence of `bio` / `cover_url` in the response is how the
// client knows the fields are not available yet. Remove once applied.
const PRESENTATION_COLUMNS = ', bio, cover_url'
const UNDEFINED_COLUMN = '42703'

type PublicProfileRow = {
  id: string; full_name: string | null; avatar_url: string | null
  follower_count: number | null; following_count: number | null
  bio?: string | null; cover_url?: string | null
}

async function readPublicProfile(supabase: Awaited<ReturnType<typeof getRequestUser>>['supabase'], id: string): Promise<PublicProfileRow | null> {
  // profiles table has public SELECT policy so regular client works
  const first = await supabase.from('profiles').select(PUBLIC_COLUMNS + PRESENTATION_COLUMNS).eq('id', id).single()
  if (first.error?.code !== UNDEFINED_COLUMN) return first.error ? null : (first.data as unknown as PublicProfileRow | null)
  const second = await supabase.from('profiles').select(PUBLIC_COLUMNS).eq('id', id).single()
  return second.error ? null : (second.data as unknown as PublicProfileRow | null)
}

// GET /api/users/[id] → public profile info + follow status
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user, supabase } = await getRequestUser(req)

  const profile = await readPublicProfile(supabase, params.id)

  if (!profile) {
    return NextResponse.json({ error: 'user_not_found', message: serverMessage('social.userNotFound', requestLocale(req)) }, { status: 404 })
  }

  // Check if current user follows this profile
  let is_following = false
  if (user && user.id !== params.id) {
    const { data: followRow } = await supabase
      .from('user_follows')
      .select('id')
      .eq('follower_id', user.id)
      .eq('following_id', params.id)
      .maybeSingle()
    is_following = !!followRow
  }

  // Review count — PUBLISHED only.
  //
  // This is the public profile statistic, shown to whoever is looking, so it
  // must mean the same thing for everyone: how many of this person's posts are
  // actually public. Counting unpublished ones would state on a public surface
  // that content exists which no visitor can reach, and would make the number
  // change depending on who asked — the author would see a larger figure than
  // anyone else and have no way to tell why.
  //
  // The author's own complete post list is a different surface with a different
  // question: /api/reviews/feed?userId=<self> deliberately serves their held
  // posts so they can act on them. That exemption is not wanted here.
  const { count: reviewCount } = await supabase
    .from('reviews')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', params.id)
    .eq('is_hidden', false)
    .or(publishableFilter())

  return NextResponse.json({
    ...profile,
    review_count: reviewCount || 0,
    is_following,
    is_self: user?.id === params.id,
  })
}
