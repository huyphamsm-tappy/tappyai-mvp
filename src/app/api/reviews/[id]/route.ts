import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// DELETE /api/reviews/[id]
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Can dang nhap' }, { status: 401 })
  const { error } = await supabase.from('reviews').delete().eq('id', params.id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: 'Khong the xoa' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// PATCH /api/reviews/[id] - hide/unhide
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Can dang nhap' }, { status: 401 })
  let body: { is_hidden?: boolean } = {}
  try { body = await req.json() } catch { /* empty */ }
  const { error } = await supabase.from('reviews').update({ is_hidden: body.is_hidden ?? false }).eq('id', params.id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: 'Khong the cap nhat' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
