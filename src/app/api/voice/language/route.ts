import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { rateLimit } from '@/lib/security/rateLimit'
import { detectLang } from '@/lib/ai/intent'
import { normalizeVoiceLanguage } from '@/lib/voice/config'

// POST /api/voice/language — "what language is this reply in?"
//
// EXISTS FOR THE NATIVE CLIENTS. Android and iOS read replies aloud with their own on-device speech
// engines, which is good — it is free, offline-capable and already working. What they must NOT do is
// decide the LANGUAGE themselves: detectLang() was shaped by two production incidents (2026-07-29
// and 07-30, in opposite directions), and a Kotlin copy plus a Swift copy would drift apart the
// first time one of them is corrected.
//
// So the split is: the backend owns the decision, the platform owns the playback. This endpoint
// returns the decision alone — no audio, no voice name, no cost. /api/voice/tts returns audio for
// callers that want the Google voice instead.
//
// `null` is a real answer. It means "we cannot name a language we support", and a client receiving
// it must stay silent and show its unavailable notice rather than guess.

export const runtime = 'nodejs'

const MAX_CHARS = 4000

export async function POST(req: NextRequest) {
  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })

  // Cheap (no model call, no provider call) but not free — it still parses a body per request.
  if (!rateLimit(`voice-lang:${user.id}`, 60, 60_000).ok) {
    return NextResponse.json({ error: 'rate_limit', message: serverMessage('rate.tooFast', requestLocale(req)) }, { status: 429 })
  }

  let text: string
  try {
    const body = await req.json()
    text = String(body.text ?? '').trim()
  } catch {
    return NextResponse.json({ error: 'invalid_body', message: serverMessage('validation.badBody', requestLocale(req)) }, { status: 400 })
  }

  if (!text) return NextResponse.json({ error: 'empty_text', message: serverMessage('voice.emptyText', requestLocale(req)) }, { status: 400 })
  // Detection only needs a sample; truncating keeps a long reply from costing anything to classify.
  const sample = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text

  // Normalized against the supported set, so a client can never receive a language it has no voice
  // for and try to speak it anyway.
  const language = normalizeVoiceLanguage(detectLang(sample))

  return NextResponse.json({
    language,
    /** False when we cannot name a supported language — the client must stay silent. */
    speakable: language !== null,
  })
}
