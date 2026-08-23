// @vitest-environment jsdom
//
// ── What the user is TOLD when read-aloud produces no sound ──────────────────
//
// These drive the real hook over a stubbed network — `useServerTTS` calling the real `requestSpeech`
// — because the defect lived in the seam between them and a source-text assertion cannot see it.
//
// THE BUG: the chat UI told people "This device has no Vietnamese voice, so the reply can't be read
// aloud." Nothing on this path consults the device. Read-aloud is synthesized server-side, and
// production (2026-08-23) answered 503 `voice_unavailable` for BOTH languages:
//
//   vi  "Xin chào, tôi có thể giúp bạn tìm một quán ăn phù hợp."  -> 503 language=vi
//   en  "Hello, I can help you find a suitable restaurant."       -> 503 language=en
//
// The deployment simply has no voice provider configured. The server said so, in the user's locale;
// the client discarded that sentence and the UI invented one from the language code alone. So the
// property under test is not "which language" — it is WHO IS BLAMED.

import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useServerTTS } from '@/hooks/useServerTTS'
import { vi as viVoice, en as enVoice } from '@/lib/i18n/w2/voice'

const VI_REPLY = 'Xin chào, tôi có thể giúp bạn tìm một quán ăn phù hợp.'
const EN_REPLY = 'Hello, I can help you find a suitable restaurant.'

/** Exactly what the deployed route returns today for an unconfigured provider. */
const PROVIDER_UNAVAILABLE_EN = 'Voice is unavailable right now. Please try again later.'
const PROVIDER_UNAVAILABLE_VI = 'Giọng đọc chưa sẵn sàng. Vui lòng thử lại sau.'

/** Anything that names the user's hardware as the reason. */
const BLAMES_DEVICE = /this device|thiết bị|máy của bạn|your device|no .* voice installed/i

function stubServer(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as Response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => { vi.unstubAllGlobals() })

async function speakAndRead(text: string) {
  const { result } = renderHook(() => useServerTTS())
  await act(async () => { await result.current.speak('m1', text) })
  return result
}

describe('a Vietnamese reply the server cannot voice', () => {
  it('shows the SERVER’s explanation, not a sentence built from the language code', async () => {
    stubServer(503, { error: 'voice_unavailable', language: 'vi', message: PROVIDER_UNAVAILABLE_EN })
    const result = await speakAndRead(VI_REPLY)

    expect(result.current.unavailableMessage).toBe(PROVIDER_UNAVAILABLE_EN)
  })

  it('never blames the device', async () => {
    stubServer(503, { error: 'voice_unavailable', language: 'vi', message: PROVIDER_UNAVAILABLE_EN })
    const result = await speakAndRead(VI_REPLY)

    expect(result.current.unavailableMessage ?? '').not.toMatch(BLAMES_DEVICE)
  })

  it('carries a Vietnamese-locale message through verbatim', async () => {
    stubServer(503, { error: 'voice_unavailable', language: 'vi', message: PROVIDER_UNAVAILABLE_VI })
    const result = await speakAndRead(VI_REPLY)

    expect(result.current.unavailableMessage).toBe(PROVIDER_UNAVAILABLE_VI)
    expect(result.current.unavailableMessage ?? '').not.toMatch(BLAMES_DEVICE)
  })

  it('still reports the language, so the reply is never spoken in another one', async () => {
    stubServer(503, { error: 'voice_unavailable', language: 'vi', message: PROVIDER_UNAVAILABLE_EN })
    const result = await speakAndRead(VI_REPLY)

    expect(result.current.unavailableLang).toBe('vi')
    expect(result.current.speakingId).toBeNull()
  })
})

describe('an English reply hits the SAME failure — so it was never a Vietnamese problem', () => {
  it('produces the identical provider message for en', async () => {
    stubServer(503, { error: 'voice_unavailable', language: 'en', message: PROVIDER_UNAVAILABLE_EN })
    const result = await speakAndRead(EN_REPLY)

    expect(result.current.unavailableMessage).toBe(PROVIDER_UNAVAILABLE_EN)
    expect(result.current.unavailableLang).toBe('en')
  })

  it('says nothing language-specific about the device for en either', async () => {
    stubServer(503, { error: 'voice_unavailable', language: 'en', message: PROVIDER_UNAVAILABLE_EN })
    const result = await speakAndRead(EN_REPLY)

    expect(result.current.unavailableMessage ?? '').not.toMatch(BLAMES_DEVICE)
    expect(result.current.unavailableMessage ?? '').not.toMatch(/English voice|giọng đọc tiếng Anh/i)
  })
})

describe('422 — the one case where the language really is the reason', () => {
  it('keeps the server’s language-specific wording instead of flattening it', async () => {
    const msg = 'Voice is not supported for this language yet.'
    stubServer(422, { error: 'language_unsupported', message: msg })
    const result = await speakAndRead('こんにちは')

    // Distinguishing 503 from 422 is the reason the message comes from the server at all: one is a
    // provider that is not configured, the other is a language we do not offer.
    expect(result.current.unavailableMessage).toBe(msg)
    expect(result.current.unavailableMessage ?? '').not.toMatch(BLAMES_DEVICE)
  })
})

describe('when the server sends no message at all', () => {
  it('reports none rather than fabricating one, leaving the UI to use its own fallback', async () => {
    stubServer(503, { error: 'voice_unavailable', language: 'vi' })
    const result = await speakAndRead(VI_REPLY)

    expect(result.current.unavailableMessage).toBeNull()
    expect(result.current.unavailableLang).toBe('vi')
  })

  it('and that fallback is itself truthful in both locales', () => {
    // The UI renders `tts.unavailableMessage ?? t('voice.voiceUnavailable')`, so this string is what
    // the user sees when the server explains nothing. It must not reintroduce the same false claim.
    for (const [locale, catalog] of [['vi', viVoice], ['en', enVoice]] as const) {
      const fallback = catalog['voice.voiceUnavailable']
      expect(fallback, `${locale} fallback exists`).toBeTruthy()
      expect(fallback, `${locale} fallback blames the device`).not.toMatch(BLAMES_DEVICE)
      // It also must not name a language, since the same failure affects every language.
      expect(fallback, `${locale} fallback names a language`).not.toMatch(/Vietnamese|tiếng Việt|English|tiếng Anh|\{language\}/i)
    }
  })

  it('no user-facing read-aloud string in either catalog blames the device', () => {
    for (const [locale, catalog] of [['vi', viVoice], ['en', enVoice]] as const) {
      for (const [key, value] of Object.entries(catalog)) {
        // Voice INPUT genuinely depends on the device's microphone — those may say so.
        if (key === 'voice.audioCapture' || key === 'voice.unsupportedBrowser') continue
        expect(value, `${locale} ${key}`).not.toMatch(BLAMES_DEVICE)
      }
    }
  })
})

describe('a retryable failure keeps its own voice', () => {
  it('carries the server’s synthesis-failure message', async () => {
    const msg = "Couldn't generate the audio. Please try again."
    stubServer(502, { error: 'synthesis_failed', message: msg })
    const result = await speakAndRead(VI_REPLY)

    expect(result.current.failed).toBe(true)
    expect(result.current.failedMessage).toBe(msg)
    // Still distinct from unavailable — collapsing them would tell the user to retry something
    // that cannot succeed, or to give up on something that could.
    expect(result.current.unavailableMessage).toBeNull()
  })
})
