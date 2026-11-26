import { getRequestUser } from '@/lib/auth/getRequestUser'
import { NextRequest, NextResponse } from 'next/server'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/messaging/threads/:id/decline - the RECIPIENT ignores/deletes a waiting message request (migration 20261210).
// The sender is told nothing: their thread simply stops accepting messages. Answers { declined: true } when it changed, 404 otherwise
// (not a request, not the recipient, or already handled: one neutral answer, no oracle).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { user, supabase } = await getRequestUser(req)
  if (!user) {
    return NextResponse.json(
      { error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) },
      { status: 401 },
    )
  }
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal

  const notFound = () => NextResponse.json(
    { error: 'not_found', message: serverMessage('server.notFound', requestLocale(req)) },
    { status: 404 },
  )
  if (!UUID.test(params.id)) return notFound()

  const { data, error } = await supabase.rpc('chat_decline_request', { p_thread: params.id })
  if (error) {
    console.error('[messaging] decline request:', error.message)
    return NextResponse.json(
      { error: 'server_error', message: serverMessage('server.error', requestLocale(req)) },
      { status: 500 },
    )
  }
  if (data !== true) return notFound()
  return NextResponse.json({ declined: true })
}
