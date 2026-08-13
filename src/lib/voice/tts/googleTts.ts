// ── Google Cloud Text-to-Speech provider ─────────────────────────────────────
//
// SERVER-SIDE ONLY. The access token arrives via an injected `getAccessToken()` — the same shape the
// GCS provider uses — so no credential is read, stored, or constructed here, and none can reach a
// client. Voice comes from configuration, never from the caller: a request carries what to say and
// in which language, never which voice to spend money on.
//
// THE GATE: when no voice has been selected for a language this throws TtsNotConfiguredError and
// makes no network call. The tempting alternative — fall back to the first candidate — would ship
// whichever name happened to be listed first as Tappy's voice. That choice needs a human who can
// listen, so the correct behaviour while it is pending is to refuse, loudly.
//
// The same refusal covers an unsupported language. Substituting a different language's voice is the
// single worst failure this system can have: it reads Vietnamese aloud in English and sounds broken
// rather than unavailable.

import { outputLocaleFor, normalizeVoiceLanguage } from '../config'
import { normalizeForTts, ttsCacheKey, type TtsCache } from './cache'
import type { TtsMetrics } from './metrics'

const ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize'

/** Scope the voice service account needs. Distinct from the media SA's storage scope by design. */
export const TTS_SCOPE = 'https://www.googleapis.com/auth/cloud-platform'

export const DEFAULT_SPEAKING_RATE = 1.0
export const DEFAULT_PITCH = 0.0

/** No voice configured for this language, or the language is unsupported. Nothing was sent. */
export class TtsNotConfiguredError extends Error {
  readonly language: string
  constructor(language: string, reason: string) {
    super(`Text-to-speech is not configured for "${language}": ${reason}`)
    this.name = 'TtsNotConfiguredError'
    this.language = language
  }
}

/** The provider refused or failed. Never carries the provider's response body. */
export class TtsSynthesisError extends Error {
  readonly status?: number
  constructor(reason: string, status?: number) {
    super(`Text-to-speech failed: ${reason}`)
    this.name = 'TtsSynthesisError'
    this.status = status
  }
}

export interface TtsSynthesizeRequest {
  text: string
  /** The MESSAGE language — the language of the text being spoken, not the interface language. */
  language: string
}

export interface TtsAudio {
  audioBase64: string
  mimeType: string
  voiceName: string
  /** Characters actually sent to the provider. Zero on a cache hit. */
  characters: number
  cacheHit: boolean
}

export interface GoogleTtsDeps {
  /** Injected, exactly like the GCS provider. This module never builds a credential. */
  getAccessToken: () => Promise<string>
  /** language → voice name, or null while the choice is pending. */
  selectedVoice: Record<string, string | null>
  cache?: TtsCache
  metrics?: TtsMetrics
  fetchImpl?: typeof fetch
  speakingRate?: number
  pitch?: number
  now?: () => number
}

export interface GoogleTtsProvider {
  readonly id: 'google-cloud'
  synthesize(req: TtsSynthesizeRequest): Promise<TtsAudio>
}

export function createGoogleTtsProvider(deps: GoogleTtsDeps): GoogleTtsProvider {
  const doFetch = deps.fetchImpl ?? fetch
  const now = deps.now ?? (() => Date.now())
  const speakingRate = deps.speakingRate ?? DEFAULT_SPEAKING_RATE
  const pitch = deps.pitch ?? DEFAULT_PITCH

  return {
    id: 'google-cloud',

    async synthesize(req: TtsSynthesizeRequest): Promise<TtsAudio> {
      deps.metrics?.recordRequest()

      // 1. Can we speak this language at all? Refuse before anything is spent.
      const language = normalizeVoiceLanguage(req.language)
      const locale = language ? outputLocaleFor(language) : null
      if (!language || !locale) {
        throw new TtsNotConfiguredError(req.language, 'language is not supported')
      }

      // 2. Has a human chosen the voice yet?
      const voiceName = deps.selectedVoice[language]
      if (!voiceName) {
        throw new TtsNotConfiguredError(language, 'no voice has been selected')
      }

      // 3. Silence is not worth paying for.
      const text = normalizeForTts(req.text)
      if (text.length === 0) {
        throw new TtsSynthesisError('there is no text to speak')
      }

      const key = ttsCacheKey({ text, language, voiceName, speakingRate, pitch })
      const cached = deps.cache?.get(key)
      if (cached) {
        deps.metrics?.recordCacheHit()
        return { ...cached, characters: 0, cacheHit: true }
      }
      deps.metrics?.recordCacheMiss()

      const token = await deps.getAccessToken()
      const startedAt = now()

      let res: Response
      try {
        res = await doFetch(ENDPOINT, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { text },
            voice: { languageCode: locale, name: voiceName },
            audioConfig: { audioEncoding: 'MP3', speakingRate, pitch },
          }),
        })
      } catch {
        deps.metrics?.recordError()
        throw new TtsSynthesisError('the request failed')
      }

      if (!res.ok) {
        deps.metrics?.recordError()
        // The provider's body names the project and the permission that was denied. It is logged by
        // the caller if at all, never put in an error that could surface to a client.
        throw new TtsSynthesisError('the provider refused the request', res.status)
      }

      const body = (await res.json()) as { audioContent?: string }
      if (!body.audioContent) {
        deps.metrics?.recordError()
        throw new TtsSynthesisError('the provider returned no audio')
      }

      deps.metrics?.recordSynthesis(text.length, now() - startedAt)

      const entry = { audioBase64: body.audioContent, mimeType: 'audio/mpeg', voiceName }
      deps.cache?.set(key, entry)
      return { ...entry, characters: text.length, cacheHit: false }
    },
  }
}
