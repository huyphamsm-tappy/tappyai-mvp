import { getRequestUser } from '@/lib/auth/getRequestUser'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { emitNotification } from '@/lib/notifications/emit'
import { resolveUserLang } from '@/lib/priceWatch/messages'
import { actorShortName, shareNotice, vietnamDayStartIso } from '@/lib/i18n/socialNotices'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { publicRateLimit } from '@/lib/security/publicRateLimit'
import { rateLimitedResponse } from '@/lib/security/rateLimitResponse'

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
  // a share can now send a push to the post's author (18/11/2026): limited per account like the like and comment routes
  const rl = await publicRateLimit(`share:${user.id}`, 30, 60_000)
  if (!rl.ok) return rateLimitedResponse(req, rl, 'review_share')

  let channel = 'unknown'
  try {
    const body = await req.json()
    if (typeof body?.channel === 'string' && CHANNEL_RE.test(body.channel)) channel = body.channel
  } catch {
    // No body is fine — the channel is metadata, not the record.
  }

  // The review must exist (a share of a deleted post is nothing to remember); the FK would refuse
  // it anyway, but a 404 says why.
  const { data: review } = await supabase.from('reviews').select('id, user_id, place_name').eq('id', params.id).maybeSingle()
  if (!review) return NextResponse.json({ error: 'not_found', message: serverMessage('server.notFound', requestLocale(req)) }, { status: 404 })

  const { data, error } = await supabase
    .from('review_shares')
    .insert({ review_id: params.id, user_id: user.id, channel })
    .select('id, created_at')
    .single()
  if (error || !data) return NextResponse.json({ error: 'share_failed', message: serverMessage('server.saveFailed', requestLocale(req)) }, { status: 500 })

  // Tell the post's author (never for a self-share), at most ONE row per sharer per post per day (Vietnam time): sharing the same
  // post to three channels is one notification. Best-effort: a failure here never fails the share, which is already recorded.
  const ownerId = (review as { user_id?: string | null }).user_id ?? null
  if (ownerId && ownerId !== user.id) {
    try {
      const admin = createAdminClient()
      const entityUrl = '/reviews/' + params.id
      const dayStart = vietnamDayStartIso(new Date())
      const { count } = await admin
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', ownerId)
        .eq('type', 'share')
        .eq('actor_id', user.id)
        .eq('entity_url', entityUrl)
        .gte('created_at', dayStart)
      if (!count) {
        const [lang, { data: sharer }] = await Promise.all([
          resolveUserLang(admin, ownerId),
          admin.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
        ])
        const copy = shareNotice(lang, actorShortName((sharer as { full_name?: string | null } | null)?.full_name, lang), (review as { place_name?: string | null }).place_name)
        emitNotification({
          userId: ownerId,
          type: 'share',
          category: 'social',
          title: copy.title,
          body: copy.body,
          actorId: user.id,
          entityUrl,
        }).catch(() => {})
      }
    } catch { /* best-effort */ }
  }

  return NextResponse.json({ shared: true, id: data.id, created_at: data.created_at })
}
