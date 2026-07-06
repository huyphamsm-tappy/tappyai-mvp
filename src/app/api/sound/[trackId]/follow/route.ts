import { getRequestUser } from '@/lib/auth/getRequestUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

async function followCount(trackId: string): Promise<number> {
  try {
    const { count } = await createAdminClient()
      .from('music_followed').select('id', { count: 'exact', head: true }).eq('track_id', trackId)
    return count ?? 0
  } catch { return 0 }
}

// POST — follow this track: reserve the user's intent to be notified when new
// videos use it. Notification delivery is deferred; the state is stored now.
export async function POST(req: NextRequest, { params }: { params: { trackId: string } }) {
  const trackId = params.trackId?.trim()
  if (!trackId) return NextResponse.json({ error: 'trackId required' }, { status: 400 })
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Cần đăng nhập' }, { status: 401 })

  const { error } = await supabase.from('music_followed').insert({ user_id: user.id, track_id: trackId })
  if (error && error.code !== '23505') return NextResponse.json({ error: 'Không theo dõi được' }, { status: 500 })

  return NextResponse.json({ followed: true, followCount: await followCount(trackId) })
}

// DELETE — unfollow.
export async function DELETE(req: NextRequest, { params }: { params: { trackId: string } }) {
  const trackId = params.trackId?.trim()
  if (!trackId) return NextResponse.json({ error: 'trackId required' }, { status: 400 })
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Cần đăng nhập' }, { status: 401 })

  await supabase.from('music_followed').delete().eq('user_id', user.id).eq('track_id', trackId)
  return NextResponse.json({ followed: false, followCount: await followCount(trackId) })
}
