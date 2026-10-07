import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { userBlocksEnabled } from '@/lib/safety/userBlocks'

// GET /api/users/blocks — the caller's OWN block list (a "Blocked accounts" settings screen). Behind USER_BLOCKS_ENABLED.
// RLS returns only rows the caller created; who blocked the caller is never readable. The release chat's `chat_blocks`
// is merged in, so a block made in the chat can be undone from the same screen (unblock removes both).

export async function GET(req: NextRequest) {
  if (!userBlocksEnabled()) return new NextResponse(null, { status: 404 })
  const locale = requestLocale(req)
  const { user, supabase } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', locale) }, { status: 401 })
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal

  const [a, b] = await Promise.all([
    supabase.from('user_blocks').select('blocked_id, created_at').order('created_at', { ascending: false }).limit(500),
    supabase.from('chat_blocks').select('blocked_id, created_at').order('created_at', { ascending: false }).limit(500),
  ])
  if (a.error || b.error) return NextResponse.json({ error: 'load_failed', message: serverMessage('server.error', locale) }, { status: 500 })
  const seen = new Set<string>()
  const blocks = [...(a.data ?? []), ...(b.data ?? [])]
    .filter((r: { blocked_id: string }) => (seen.has(r.blocked_id) ? false : (seen.add(r.blocked_id), true)))
    .sort((x: { created_at: string }, y: { created_at: string }) => (x.created_at < y.created_at ? 1 : -1))
    .slice(0, 500)
  return NextResponse.json({ blocks })
}
