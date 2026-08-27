import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { rateLimit, clientIp } from '@/lib/security/rateLimit'
import { detectLang } from '@/lib/ai/intent'
import { getTtsProvider, ttsMetricsSnapshot } from '@/lib/voice/tts/service'
import { TtsNotConfiguredError, TtsSynthesisError } from '@/lib/voice/tts/googleTts'
import { normalizeVoiceLanguage } from '@/lib/voice/config'
import { flushPending, recordEvent, recordTtsMetricsDelta } from '@/lib/observability'

// POST /api/voice/tts — speak a message.
//
// THIS ROUTE IS THE LANGUAGE CONTRACT. The client sends TEXT and gets AUDIO; it never decides which
// language the text is in and never names a voice. That is deliberate: detectLang() was shaped by
// two production incidents (2026-07-29 and 07-30), and reimplementing it in Swift and Kotlin would
// create three copies that drift apart the first time one is fixed. One implementation, server-side,
// consumed by all three platforms.
//
// A client MAY declare a language — the chat route already knows the reply language and can pass it
// — but anything it declares is normalized against the supported set, never trusted verbatim.
//
// Credentials never leave the server: the browser receives base64 audio, never a token.

export const runtime = 'nodejs'
export const maxDuration = 30

/** Bounded so one caller cannot run up a synthesis bill. */
const MAX_CHARS = 2000

export async function POST(req: NextRequest) {
  // Deliver whatever earlier requests on this instance buffered. Deliberately
  // NOT awaited: it overlaps with the auth lookup and the synthesis below,
  // both of which this handler was going to wait for anyway, so it adds no
  // latency to the caller. A failure inside it cannot surface here.
  void flushPending(req)

  const startedAt = Date.now()
  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })

  if (!rateLimit(`voice-tts:${user.id}`, 30, 60_000).ok) {
    return NextResponse.json({ error: 'rate_limit', message: serverMessage('rate.tooFast', requestLocale(req)) }, { status: 429 })
  }

  let text: string
  let declared: string | undefined
  try {
    const body = await req.json()
    text = String(body.text ?? '').trim()
    declared = typeof body.language === 'string' ? body.language : undefined
  } catch {
    return NextResponse.json({ error: 'invalid_body', message: serverMessage('validation.badBody', requestLocale(req)) }, { status: 400 })
  }

  if (!text) return NextResponse.json({ error: 'empty_text', message: serverMessage('voice.emptyText', requestLocale(req)) }, { status: 400 })
  if (text.length > MAX_CHARS) {
    return NextResponse.json({ error: 'too_long', message: serverMessage('voice.tooLong', requestLocale(req)), maxChars: MAX_CHARS }, { status: 413 })
  }

  // The authoritative decision. A declared language is a hint that must survive normalization;
  // anything unrecognised falls back to detection rather than being taken at face value.
  const language = normalizeVoiceLanguage(declared) ?? normalizeVoiceLanguage(detectLang(text))
  if (!language) {
    return NextResponse.json({ error: 'language_unsupported', message: serverMessage('voice.languageUnsupported', requestLocale(req)) }, { status: 422 })
  }

  const provider = getTtsProvider(req)
  if (!provider) {
    // Expected while the deployment has no voice identity configured — not a crash.
    // Distinct stage from 'not_configured': that one means no voice for this
    // language, this one means the deployment has no voice identity at all.
    recordEvent({ type: 'tts_failure', stage: 'no_provider', language })
    return NextResponse.json({ error: 'voice_unavailable', message: serverMessage('voice.unavailable', requestLocale(req)), language }, { status: 503 })
  }

  try {
    const audio = await provider.synthesize({ text, language })
    // Counts only: how long the text was, which language decided the voice, and
    // whether the cache spared a billable synthesis. Never the text itself.
    recordEvent({
      type: 'tts_request',
      language,
      characters: text.length,
      cacheHit: audio.cacheHit,
      elapsedMs: Date.now() - startedAt,
    })
    // The provider's own billable counter, as a delta — the authoritative
    // cross-check against summing the event above.
    recordTtsMetricsDelta(ttsMetricsSnapshot())
    return NextResponse.json({
      audioBase64: audio.audioBase64,
      mimeType: audio.mimeType,
      language,
      voiceName: audio.voiceName,
      cacheHit: audio.cacheHit,
    })
  } catch (e) {
    if (e instanceof TtsNotConfiguredError) {
      // No voice chosen yet, or an unsupported language. The client shows a localized notice and
      // keeps the text on screen — it must never hear another language instead.
      recordEvent({ type: 'tts_failure', stage: 'not_configured', language })
      return NextResponse.json({ error: 'voice_unavailable', message: serverMessage('voice.unavailable', requestLocale(req)), language }, { status: 503 })
    }
    if (e instanceof TtsSynthesisError) {
      // Logged server-side; the provider's own message names the project and permission and is
      // never returned to the caller.
      console.error('[voice-tts] synthesis failed', { status: e.status })
      recordEvent({ type: 'tts_failure', stage: 'synthesis', status: e.status, language })
      return NextResponse.json({ error: 'synthesis_failed', message: serverMessage('voice.synthesisFailed', requestLocale(req)) }, { status: 502 })
    }
    console.error('[voice-tts] unexpected failure')
    // Deliberately no error message and no cause — an unclassified throw is the
    // one most likely to carry something that came from the request.
    recordEvent({ type: 'tts_failure', stage: 'unexpected', language })
    return NextResponse.json({ error: 'synthesis_failed', message: serverMessage('voice.synthesisFailed', requestLocale(req)) }, { status: 502 })
  }
}
