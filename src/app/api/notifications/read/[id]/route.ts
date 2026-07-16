import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/notifications/read/[id] → mark ONE notification as read.
// .select('id') on the update makes a zero-row match observable (same
// hardening as the reviews DELETE route in BUG 3) — RLS already restricts
// this to the caller's own notifications (auth.uid() = user_id), so a
// zero-row result here means "not found or not yours", not "silently did
// nothing while claiming success".
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Cần đăng nhập' }, { status: 401 })

  const { data, error } = await supabase
    .from('notifications')
    .update({ is_read: true, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select('id')

  if (error) return NextResponse.json({ error: 'Không thể cập nhật' }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json({ error: 'Không tìm thấy thông báo' }, { status: 404 })

  return NextResponse.json({ ok: true })
}
