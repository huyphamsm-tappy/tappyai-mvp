import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { sendNotificationToUser } from '@/lib/notifications/send'

// POST /api/users/[id]/follow → toggle follow/unfollow
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Cần đăng nhập' }, { status: 401 })
  if (user.id === params.id) return NextResponse.json({ error: 'Không thể tự follow' }, { status: 400 })

  const targetId = params.id

  const { data: existing } = await supabase
    .from('user_follows')
    .select('id')
    .eq('follower_id', user.id)
    .eq('following_id', targetId)
    .maybeSingle()

  if (existing) {
    // Unfollow
    await supabase
      .from('user_follows')
      .delete()
      .eq('follower_id', user.id)
      .eq('following_id', targetId)

    const { data: profile } = await supabase
      .from('profiles')
      .select('follower_count')
      .eq('id', targetId)
      .single()

    return NextResponse.json({ following: false, follower_count: profile?.follower_count ?? 0 })
  } else {
    // Follow
    const { error } = await supabase
      .from('user_follows')
      .insert({ follower_id: user.id, following_id: targetId })

    if (error) return NextResponse.json({ error: 'Không thể follow' }, { status: 500 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('follower_count, full_name')
      .eq('id', targetId)
      .single()

    // Notify target user
    const { data: follower } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()
    const name = follower?.full_name?.split(' ').pop() || 'Ai đó'
    sendNotificationToUser(targetId, {
      title: `👤 ${name} đang theo dõi bạn`,
      body: 'Xem trang cá nhân của họ',
      data: { url: `/users/${user.id}` },
    }).catch(() => {})

    return NextResponse.json({ following: true, follower_count: profile?.follower_count ?? 0 })
  }
}
