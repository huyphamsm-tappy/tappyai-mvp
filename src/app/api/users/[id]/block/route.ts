import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/security/rateLimit'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { userBlocksEnabled, UUID_RE } from '@/lib/safety/userBlocks'

// POST   /api/users/[id]/block — block a user.
// DELETE /api/users/[id]/block — unblock.
//
// Behind USER_BLOCKS_ENABLED (404 with an empty body while OFF — the same answer as a route that does not exist).
// The writes go through the CALLER's own client, so `user_blocks` / `chat_blocks` RLS (own rows only, no anonymous
// sessions) is the authority; what a block DOES is enforced in the database (20261001_user_blocks.sql): no follow, no
// comment, no posts / comments / notifications of each other, both directions.
//
// Both tables are written: `user_blocks` (the product-wide record) and the release chat's `chat_blocks`, because the
// release chat reads only chat_blocks — writing both makes the chat honour an API block without changing any chat code.
//
// The response never says whether the other account exists or has blocked the caller: any valid UUID other than your own
// answers the same. A block also removes any follow between the two, both directions (the reverse one needs the service
// role: the blocked person's own follow row is not the caller's to delete).

const ok = (blocked: boolean) => NextResponse.json({ ok: true, blocked })

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!userBlocksEnabled()) return new NextResponse(null, { status: 404 })
  const locale = requestLocale(req)
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', locale) }, { status: 401 })
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal
  if (!UUID_RE.test(params.id) || params.id === user.id) {
    return NextResponse.json({ error: 'invalid_target', message: serverMessage('validation.invalid', locale) }, { status: 400 })
  }
  if (!rateLimit(`user-block:${user.id}`, 30, 60_000).ok) {
    return NextResponse.json({ error: 'rate_limit', message: serverMessage('rate.tooFast', locale) }, { status: 429 })
  }

  // 23505 = already blocked (idempotent). 23503 = no such account: answered like success so this is not an existence oracle.
  const benign = (code?: string) => code === '23505' || code === '23503'
  const first = await supabase.from('user_blocks').insert({ blocker_id: user.id, blocked_id: params.id })
  if (first.error && !benign(first.error.code)) {
    return NextResponse.json({ error: 'block_failed', message: serverMessage('server.error', locale) }, { status: 500 })
  }
  const second = await supabase.from('chat_blocks').insert({ blocker_id: user.id, blocked_id: params.id })
  if (second.error && !benign(second.error.code)) {
    // Do not leave half a block: the product-wide row without the chat one would let the blocked person keep messaging.
    if (!first.error) await supabase.from('user_blocks').delete().eq('blocker_id', user.id).eq('blocked_id', params.id)
    return NextResponse.json({ error: 'block_failed', message: serverMessage('server.error', locale) }, { status: 500 })
  }

  try {
    await createAdminClient()
      .from('user_follows')
      .delete()
      .or(`and(follower_id.eq.${user.id},following_id.eq.${params.id}),and(follower_id.eq.${params.id},following_id.eq.${user.id})`)
  } catch (e) {
    // The block stands (RLS already hides both sides); a stale follow row is cosmetic.
    console.error('[user-block] follow cleanup failed:', e instanceof Error ? e.message : e)
  }
  return ok(true)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!userBlocksEnabled()) return new NextResponse(null, { status: 404 })
  const locale = requestLocale(req)
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', locale) }, { status: 401 })
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal
  if (!UUID_RE.test(params.id) || params.id === user.id) {
    return NextResponse.json({ error: 'invalid_target', message: serverMessage('validation.invalid', locale) }, { status: 400 })
  }
  if (!rateLimit(`user-block:${user.id}`, 30, 60_000).ok) {
    return NextResponse.json({ error: 'rate_limit', message: serverMessage('rate.tooFast', locale) }, { status: 429 })
  }
  const a = await supabase.from('user_blocks').delete().eq('blocker_id', user.id).eq('blocked_id', params.id)
  const b = await supabase.from('chat_blocks').delete().eq('blocker_id', user.id).eq('blocked_id', params.id)
  if (a.error || b.error) return NextResponse.json({ error: 'unblock_failed', message: serverMessage('server.error', locale) }, { status: 500 })
  return ok(false)
}
