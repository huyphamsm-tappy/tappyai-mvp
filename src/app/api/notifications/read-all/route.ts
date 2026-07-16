import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/notifications/read-all → mark every unread notification read for
// the current user in one statement (not one round trip per row).
export async function POST(req: NextRequest) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Cần đăng nhập' }, { status: 401 })

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('is_read', false)

  if (error) return NextResponse.json({ error: 'Không thể cập nhật' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
