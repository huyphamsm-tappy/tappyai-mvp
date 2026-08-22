import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'

// Allowed reaction keys. Stored as free text in the DB (no enum), so adding a new key here is
// the only change needed to support a new reaction — no schema migration.
const ALLOWED = new Set(['like', 'love', 'haha', 'wow', 'sad', 'angry'])

// POST /api/comments/[commentId]/reactions  { reaction: 'like' }
// Sets (or changes) the caller's single reaction on a comment. One row per (comment, user) via a
// UNIQUE constraint, so a repeat POST with a different key just updates it.
export async function POST(req: NextRequest, { params }: { params: { commentId: string } }) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })
  // B17 — an anonymous session is authenticated but is not an account; social writes need one.
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal

  let reaction: string
  try {
    const b = await req.json()
    reaction = String(b.reaction || '')
    if (!ALLOWED.has(reaction)) throw new Error('invalid')
  } catch {
    return NextResponse.json({ error: 'invalid_reaction', message: serverMessage('reaction.invalid', requestLocale(req)) }, { status: 400 })
  }

  const { error } = await supabase
    .from('comment_reactions')
    .upsert(
      { comment_id: params.commentId, user_id: user.id, reaction },
      { onConflict: 'comment_id,user_id' },
    )

  if (error) return NextResponse.json({ error: 'reaction_failed', message: serverMessage('reaction.failed', requestLocale(req)) }, { status: 500 })
  return NextResponse.json({ ok: true, reaction })
}

// DELETE /api/comments/[commentId]/reactions  — removes the caller's reaction.
export async function DELETE(req: NextRequest, { params }: { params: { commentId: string } }) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })
  // B17 — an anonymous session is authenticated but is not an account; social writes need one.
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal

  const { error } = await supabase
    .from('comment_reactions')
    .delete()
    .eq('comment_id', params.commentId)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: 'reaction_remove_failed', message: serverMessage('reaction.removeFailed', requestLocale(req)) }, { status: 500 })
  return NextResponse.json({ ok: true })
}
