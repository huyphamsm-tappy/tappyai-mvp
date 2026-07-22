import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'

// Allowed reaction keys. Stored as free text in the DB (no enum), so adding a new key here is
// the only change needed to support a new reaction — no schema migration.
const ALLOWED = new Set(['like', 'love', 'haha', 'wow', 'sad', 'angry'])

// POST /api/comments/[commentId]/reactions  { reaction: 'like' }
// Sets (or changes) the caller's single reaction on a comment. One row per (comment, user) via a
// UNIQUE constraint, so a repeat POST with a different key just updates it.
export async function POST(req: NextRequest, { params }: { params: { commentId: string } }) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Can dang nhap' }, { status: 401 })

  let reaction: string
  try {
    const b = await req.json()
    reaction = String(b.reaction || '')
    if (!ALLOWED.has(reaction)) throw new Error('invalid')
  } catch {
    return NextResponse.json({ error: 'Reaction khong hop le' }, { status: 400 })
  }

  const { error } = await supabase
    .from('comment_reactions')
    .upsert(
      { comment_id: params.commentId, user_id: user.id, reaction },
      { onConflict: 'comment_id,user_id' },
    )

  if (error) return NextResponse.json({ error: 'Khong the react' }, { status: 500 })
  return NextResponse.json({ ok: true, reaction })
}

// DELETE /api/comments/[commentId]/reactions  — removes the caller's reaction.
export async function DELETE(req: NextRequest, { params }: { params: { commentId: string } }) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Can dang nhap' }, { status: 401 })

  const { error } = await supabase
    .from('comment_reactions')
    .delete()
    .eq('comment_id', params.commentId)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: 'Khong the xoa reaction' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
