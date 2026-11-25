// The one-line way for a route to use the gate: `const refusal = await refuseUnsafeText(req, user.id, 'comment', [body]); if (refusal) return refusal`.
// A refusal is a 422 `content_blocked` (the content breaks the rules), 503 `moderation_unavailable` (could not be checked; retry), or 429 `moderation_locked`. The message is in the request's
// language and never names the rule or the word that matched.
import { NextResponse } from 'next/server'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { moderateUserImage, moderateUserText, type GateDeps, type GateOutcome, type ImageGateDeps, type ModerationSurface } from './gate'

function refusalFor(req: Request, out: GateOutcome): NextResponse | null {
  if (out.allowed) return null
  const locale = requestLocale(req as never)
  if (out.reason === 'blocked') return NextResponse.json({ error: 'content_blocked', code: 'content_blocked', message: serverMessage('moderation.blocked', locale) }, { status: 422 })
  if (out.reason === 'locked') return NextResponse.json({ error: 'moderation_locked', code: 'moderation_locked', message: serverMessage('moderation.locked', locale) }, { status: 429 })
  return NextResponse.json({ error: 'moderation_unavailable', code: 'moderation_unavailable', message: serverMessage('moderation.unavailable', locale) }, { status: 503, headers: { 'Retry-After': '60' } })
}

export async function refuseUnsafeText(req: Request, userId: string, surface: ModerationSurface, texts: Array<string | null | undefined>, deps?: GateDeps): Promise<NextResponse | null> {
  return refusalFor(req, await moderateUserText({ userId, surface, texts }, deps))
}

/** For a picture about to be stored publicly. Call it with the CLEAN bytes, before anything is written. */
export async function refuseUnsafeImage(req: Request, userId: string, surface: ModerationSurface, bytes: Uint8Array, mime: string, deps?: ImageGateDeps): Promise<NextResponse | null> {
  return refusalFor(req, await moderateUserImage({ userId, surface, bytes, mime }, deps))
}
