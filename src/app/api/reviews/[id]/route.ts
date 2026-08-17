import { getRequestUser } from '@/lib/auth/getRequestUser'
import { attemptsPublicationBypass } from '@/lib/safety/gate/publicationAccess'
import { NextRequest, NextResponse } from 'next/server'

// DELETE /api/reviews/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Can dang nhap' }, { status: 401 })
  const { error } = await supabase.from('reviews').delete().eq('id', params.id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: 'Khong the xoa' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// PATCH /api/reviews/[id] - hide/unhide
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Can dang nhap' }, { status: 401 })
  let body: { is_hidden?: boolean } = {}
  try { body = await req.json() } catch { /* empty */ }

  // Content safety gate — publication state is decided by the server from an
  // evaluation and is never accepted from a request. A body that tries to set it
  // is refused rather than quietly sanitised: this is not a client mistake.
  // (`is_hidden` stays the author's own control and is handled below as before.)
  const { is_hidden: _authorHide, ...rest } = body as Record<string, unknown>
  if (attemptsPublicationBypass(rest)) {
    return NextResponse.json({ error: 'Khong hop le' }, { status: 400 })
  }

  const { error } = await supabase.from('reviews').update({ is_hidden: body.is_hidden ?? false }).eq('id', params.id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: 'Khong the cap nhat' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
