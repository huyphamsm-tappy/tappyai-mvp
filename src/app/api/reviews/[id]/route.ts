import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'

// DELETE /api/reviews/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Can dang nhap' }, { status: 401 })
  // .select('id') makes a zero-row delete OBSERVABLE. Postgres/PostgREST does not
  // treat "the WHERE clause matched nothing" as an error — a delete that (for any
  // reason: wrong id, RLS, a row already gone) removes zero rows still returns
  // { error: null }. Without checking the returned rows, the client is told the
  // delete succeeded and removes the clip from its own state, but the row is
  // still in the database — reappearing after the next reload as a "ghost" clip.
  const { data, error } = await supabase.from('reviews').delete().eq('id', params.id).eq('user_id', user.id).select('id')
  if (error) return NextResponse.json({ error: 'Khong the xoa' }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json({ error: 'Khong tim thay bai viet' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

// PATCH /api/reviews/[id] - hide/unhide
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Can dang nhap' }, { status: 401 })
  let body: { is_hidden?: boolean } = {}
  try { body = await req.json() } catch { /* empty */ }
  const { error } = await supabase.from('reviews').update({ is_hidden: body.is_hidden ?? false }).eq('id', params.id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: 'Khong the cap nhat' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
