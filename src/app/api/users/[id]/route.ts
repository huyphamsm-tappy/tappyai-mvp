import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'

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
    return NextResponse.json({ error: 'Không tìm thấy người dùng' }, { status: 404 })
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

  // Review count
  const { count: reviewCount } = await supabase
    .from('reviews')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', params.id)
    .eq('is_hidden', false)

  return NextResponse.json({
    ...profile,
    review_count: reviewCount || 0,
    is_following,
    is_self: user?.id === params.id,
  })
}
