import { getRequestUser } from '@/lib/auth/getRequestUser'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { NextRequest, NextResponse } from 'next/server'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

/** Bounded like the column: a target id ('copy', 'native', 'facebook', 'zalo', 'tiktok') or 'android:<package>'. */
const CHANNEL_RE = /^[a-z0-9][a-z0-9._:-]{0,63}$/i

// POST /api/reviews/[id]/share — record that the caller SHARED this review (the self profile's
// "Đã share" history). 2026-09-15.
//
// 🔑 Called only after the share succeeded — the clients decide that boundary (web: copy
// resolved / navigator.share resolved / the hand-off window opened; Android: the chooser
// reported a chosen component). Opening the share sheet records nothing.
//
// Not a toggle: every successful share is a new history row (`review_shares` has no unique
// pair). Same gates as like/save: 401 without a session, 403 for an anonymous session (B17),
// and the row is pinned to the bearer — the body carries no user id to trust.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal

  let channel = 'unknown'
  try {
    const body = await req.json()
    if (typeof body?.channel === 'string' && CHANNEL_RE.test(body.channel)) channel = body.channel
  } catch {
    // No body is fine — the channel is metadata, not the record.
  }

  // The review must exist (a share of a deleted post is nothing to remember); the FK would refuse
  // it anyway, but a 404 says why.
  const { data: review } = await supabase.from('reviews').select('id').eq('id', params.id).maybeSingle()
  if (!review) return NextResponse.json({ error: 'not_found', message: serverMessage('server.notFound', requestLocale(req)) }, { status: 404 })

  const { data, error } = await supabase
    .from('review_shares')
    .insert({ review_id: params.id, user_id: user.id, channel })
    .select('id, created_at')
    .single()
  if (error || !data) return NextResponse.json({ error: 'share_failed', message: serverMessage('server.saveFailed', requestLocale(req)) }, { status: 500 })

  return NextResponse.json({ shared: true, id: data.id, created_at: data.created_at })
}
