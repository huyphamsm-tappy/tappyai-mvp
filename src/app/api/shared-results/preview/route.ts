import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { apiError } from '@/lib/http/apiError'
import { rateLimit, clientIp } from '@/lib/security/rateLimit'
import { parseShareRequest, resolveShareSource } from '@/lib/share/shareRequest'
import { validateSharedResultPayload } from '@/lib/share/sharedResult'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

// POST /api/shared-results/preview — "This is what others will see."
//
// Runs the EXACT sanitizer the create route runs, against the EXACT source
// message, and returns the payload without persisting anything. The preview
// the user confirms is what gets published (modulo the title they may still
// edit, which is re-sanitized on create). No LLM.
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!rateLimit(`share-preview:${clientIp(req)}`, 60, 60_000).ok) return apiError(req, 'rate_limit', 'rate.tooFast', 429)
  const { user, supabase } = await getRequestUser(req)
  if (!user) return apiError(req, 'unauthorized', 'auth.required', 401)
  // A public page is public content: the anonymous tier may READ and ASK, never publish.
  const anonRefusal = refuseAnonymousSocialWrite(req, user)
  if (anonRefusal) return anonRefusal

  let body: unknown
  try { body = await req.json() } catch { return apiError(req, 'invalid_request', 'validation.missingFields', 400) }
  const parsed = parseShareRequest(body)
  if (parsed === 'invalid_request') return apiError(req, 'invalid_request', 'validation.missingFields', 400)

  const resolved = await resolveShareSource(supabase, user.id, parsed)
  if (!resolved.ok) return apiError(req, resolved.code, 'server.notFound', 404)
  const reason = validateSharedResultPayload(resolved.payload)
  if (reason) return NextResponse.json({ error: 'not_shareable', reason, message: serverMessage('share.notShareable', requestLocale(req)) }, { status: 422 })
  return NextResponse.json({ payload: resolved.payload })
}
