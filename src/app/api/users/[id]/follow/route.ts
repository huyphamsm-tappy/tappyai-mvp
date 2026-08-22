import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'
import { emitNotification } from '@/lib/notifications/emit'
import { rebuildProfile } from '@/lib/preferences/profileCache'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'

// POST /api/users/[id]/follow → toggle follow/unfollow (optimistic insert, delete on 23505)
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })
  // B17 — an anonymous session is authenticated but is not an account; social writes need one.
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal
  if (user.id === params.id) return NextResponse.json({ error: 'follow_self', message: serverMessage('social.followSelf', requestLocale(req)) }, { status: 400 })

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

  if (error) return NextResponse.json({ error: 'follow_failed', message: serverMessage('social.followFailed', requestLocale(req)) }, { status: 500 })

  // Insert succeeded → new follow: rebuild profile + fetch + notify
  rebuildProfile(user.id, supabase).catch(() => {})

  const [profileRes, followerRes] = await Promise.all([
    supabase.from('profiles').select('follower_count').eq('id', targetId).single(),
    supabase.from('profiles').select('full_name').eq('id', user.id).single(),
  ])

  const name = followerRes.data?.full_name?.split(' ').pop() || 'Ai đó'
  emitNotification({
    userId: targetId,
    type: 'follow',
    category: 'social',
    title: `👤 ${name} đang theo dõi bạn`,
    body: 'Xem trang cá nhân của họ',
    actorId: user.id,
    entityUrl: `/users/${user.id}`,
  }).catch(() => {})

  return NextResponse.json({ following: true, follower_count: profileRes.data?.follower_count ?? 0 })
}
