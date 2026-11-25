import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { publicRateLimit } from '@/lib/security/publicRateLimit'
import { rateLimitedResponse } from '@/lib/security/rateLimitResponse'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

// POST /api/comments/{commentId}/hide   body { hidden: boolean }
// Owner 21/11/2026: the OWNER of a post can hide a comment under their own post (and show it again). Hiding is not deleting: the comment stays, its author still sees it, everyone else does not
// (the database's read policy enforces that, not this route). Only the owner's own hide can be undone here: a hide by the system (reports) or by a moderator is lifted by a moderator only.
export const maxDuration = 30

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest, { params }: { params: { commentId: string } }) {
  const locale = requestLocale(req)
  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', locale) }, { status: 401 })
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal

  const rl = await publicRateLimit(`comment-hide:${user.id}`, 60, 600_000)
  if (!rl.ok) return rateLimitedResponse(req, rl, 'comment_hide')

  if (!UUID.test(params.commentId)) return NextResponse.json({ error: 'not_found', message: serverMessage('server.notFound', locale) }, { status: 404 })
  let hidden: boolean | null = null
  try { const b = await req.json(); if (typeof b?.hidden === 'boolean') hidden = b.hidden } catch { /* invalid below */ }
  if (hidden === null) return NextResponse.json({ error: 'invalid_body', message: serverMessage('validation.badBody', locale) }, { status: 400 })

  const admin = createAdminClient()
  const c = await admin.from('review_comments').select('id, review_id, user_id, hidden_at, hidden_by').eq('id', params.commentId).maybeSingle()
  const comment = c.data as { id: string; review_id: string; user_id: string; hidden_at: string | null; hidden_by: string | null } | null
  if (c.error || !comment) return NextResponse.json({ error: 'not_found', message: serverMessage('server.notFound', locale) }, { status: 404 })

  // only the owner of the POST decides (a comment's own author deletes theirs instead; nobody can hide their own comment from themselves here)
  const r = await admin.from('reviews').select('user_id').eq('id', comment.review_id).maybeSingle()
  const ownerId = (r.data as { user_id: string } | null)?.user_id
  if (!ownerId || ownerId !== user.id) return NextResponse.json({ error: 'not_found', message: serverMessage('server.notFound', locale) }, { status: 404 })
  if (comment.user_id === user.id) return NextResponse.json({ error: 'invalid_target', message: serverMessage('validation.invalid', locale) }, { status: 400 })

  if (hidden) {
    if (!comment.hidden_at) {
      const u = await admin.from('review_comments').update({ hidden_at: new Date().toISOString(), hidden_by: 'owner' }).eq('id', comment.id).is('hidden_at', null)
      if (u.error) return NextResponse.json({ error: 'hide_failed', message: serverMessage('server.error', locale) }, { status: 500 })
    }
    return NextResponse.json({ ok: true, hidden: true })
  }
  // show again: only a hide the owner made themselves
  if (comment.hidden_at && comment.hidden_by !== 'owner') return NextResponse.json({ error: 'held_by_moderation', message: serverMessage('validation.invalid', locale) }, { status: 409 })
  if (comment.hidden_at) {
    const u = await admin.from('review_comments').update({ hidden_at: null, hidden_by: null }).eq('id', comment.id).eq('hidden_by', 'owner')
    if (u.error) return NextResponse.json({ error: 'hide_failed', message: serverMessage('server.error', locale) }, { status: 500 })
  }
  return NextResponse.json({ ok: true, hidden: false })
}
