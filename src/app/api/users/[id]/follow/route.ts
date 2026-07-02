import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { sendNotificationToUser } from '@/lib/notifications/send'
import { rebuildProfile } from '@/lib/preferences/profileCache'

// POST /api/users/[id]/follow → toggle follow/unfollow (optimistic insert, delete on 23505)
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Cần đăng nhập' }, { status: 401 })
  if (user.id === params.id) return NextResponse.json({ error: 'Không thể tự follow' }, { status: 400 })

  const targetId = params.id

  const { error } = await supabase
    .from('user_follows')
    .insert({ follower_id: user.id, following_id: targetId })

  if (error?.code === '23505') {
    // Already following → unfollow
    await supabase
      .from('user_follows')
      .delete()
      .eq('follower_id', user.id)
      .eq('following_id', targetId)

    rebuildProfile(user.id, supabase).catch(() => {})

    const { data: profile } = await supabase
      .from('profiles')
      .select('follower_count')
      .eq('id', targetId)
      .single()

    return NextResponse.json({ following: false, follower_count: profile?.follower_count ?? 0 })
  }

  if (error) return NextResponse.json({ error: 'Không thể follow' }, { status: 500 })

  // Insert succeeded → new follow: rebuild profile + fetch + notify
  rebuildProfile(user.id, supabase).catch(() => {})

  const [profileRes, followerRes] = await Promise.all([
    supabase.from('profiles').select('follower_count').eq('id', targetId).single(),
    supabase.from('profiles').select('full_name').eq('id', user.id).single(),
  ])

  const name = followerRes.data?.full_name?.split(' ').pop() || 'Ai đó'
  sendNotificationToUser(targetId, {
    title: `👤 ${name} đang theo dõi bạn`,
    body: 'Xem trang cá nhân của họ',
    data: { url: `/users/${user.id}` },
  }).catch(() => {})

  return NextResponse.json({ following: true, follower_count: profileRes.data?.follower_count ?? 0 })
}
