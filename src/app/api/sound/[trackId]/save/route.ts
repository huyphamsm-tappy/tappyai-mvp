import { getRequestUser } from '@/lib/auth/getRequestUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

async function savedCount(trackId: string): Promise<number> {
  try {
    const { count } = await createAdminClient()
      .from('music_saved').select('id', { count: 'exact', head: true }).eq('track_id', trackId)
    return count ?? 0
  } catch { return 0 }
}

// POST — save (bookmark) this track for the current user. Idempotent: a repeat
// save is a no-op (unique(user_id, track_id)).
export async function POST(req: NextRequest, { params }: { params: { trackId: string } }) {
  const trackId = params.trackId?.trim()
  if (!trackId) return NextResponse.json({ error: 'trackId required' }, { status: 400 })
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Cần đăng nhập' }, { status: 401 })

  const { error } = await supabase.from('music_saved').insert({ user_id: user.id, track_id: trackId })
  // 23505 = already saved → treat as success.
  if (error && error.code !== '23505') return NextResponse.json({ error: 'Không lưu được' }, { status: 500 })

  return NextResponse.json({ saved: true, savedCount: await savedCount(trackId) })
}

// DELETE — remove the save.
export async function DELETE(req: NextRequest, { params }: { params: { trackId: string } }) {
  const trackId = params.trackId?.trim()
  if (!trackId) return NextResponse.json({ error: 'trackId required' }, { status: 400 })
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Cần đăng nhập' }, { status: 401 })

  await supabase.from('music_saved').delete().eq('user_id', user.id).eq('track_id', trackId)
  return NextResponse.json({ saved: false, savedCount: await savedCount(trackId) })
}
