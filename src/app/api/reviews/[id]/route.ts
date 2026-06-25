import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// DELETE /api/reviews/[id]  — owner only
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Cần đăng nhập' }, { status: 401 })

  const { error } = await supabase
    .from('reviews')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id)  // RLS + double check

  if (error) return NextResponse.json({ error: 'Không thể xoá' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// PATCH /api/reviews/[id]  — owner only (hide/unhide)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Cần đăng nhập' }, { status: 401 })

  let body: { is_hidden?: boolean } = {}
  try { body = await req.json() } catch { /* empty */ }

  const { error } = await supabase
    .from('reviews')
    .update({ is_hidden: body.is_hidden ?? false })
    .eq('id', params.id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: 'Không thể cập nhật' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
