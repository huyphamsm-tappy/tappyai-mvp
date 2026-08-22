import { getRequestUser } from '@/lib/auth/getRequestUser'
import { publishableFilter } from '@/lib/safety/gate/publicationAccess'
import { NextRequest, NextResponse } from 'next/server'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

export const runtime = 'edge'

// GET /api/users/[id] → public profile info + follow status
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user, supabase } = await getRequestUser(req)

  // profiles table has public SELECT policy so regular client works
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, follower_count, following_count')
    .eq('id', params.id)
    .single()

  if (error || !profile) {
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
