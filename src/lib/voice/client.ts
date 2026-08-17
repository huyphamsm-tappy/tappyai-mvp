// ── Browser → /api/voice/tts ─────────────────────────────────────────────────
//
// The client half of the language contract, and deliberately thin. It sends TEXT and receives
// AUDIO. It does not choose a voice, does not decide the language, and never sees a credential —
// all three live on the server, because all three are decisions the browser must not be able to
// make. A caller may pass the language it already knows; the server still normalizes it.
//
// EVERY FAILURE IS A NAMED OUTCOME, NOT AN EXCEPTION. Read-aloud failing is an ordinary state — no
// voice chosen yet, deployment not configured, provider down — and each needs a different sentence
// in front of the user. Returning a discriminated result rather than throwing is what lets the UI
// say the right one instead of a generic "something went wrong".
//
// 'unavailable' NEVER means "use a different voice". The caller shows a notice and leaves the text
// on screen. Reading Vietnamese aloud in English sounds broken; saying nothing sounds unavailable.

export type SpeechResult =
  | { status: 'ok'; audioBase64: string; mimeType: string; language: string; voiceName: string; cacheHit: boolean }
  /** No voice configured for this language yet, or the deployment has none. Show the notice. */
  | { status: 'unavailable'; language: string | null }
  /** The provider failed. Distinct from unavailable: retrying may work. */
  | { status: 'failed' }
  /** The caller cancelled — the user pressed stop or navigated away. Show nothing. */
  | { status: 'cancelled' }

export interface RequestSpeechOptions {
  text: string
  /** Optional hint. The server normalizes it and falls back to its own detection. */
  language?: string
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

export async function requestSpeech(opts: RequestSpeechOptions): Promise<SpeechResult> {
  const doFetch = opts.fetchImpl ?? fetch
  let res: Response
  try {
    res = await doFetch('/api/voice/tts', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      // No voice field, by design: the browser cannot pick what we pay for.
      body: JSON.stringify({ text: opts.text, ...(opts.language ? { language: opts.language } : {}) }),
      signal: opts.signal,
    })
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') return { status: 'cancelled' }
    return { status: 'failed' }
  }

  // 503 = no voice selected / not configured. 422 = language we cannot speak. Both mean "say
  // nothing and explain", never "substitute a voice".
  if (res.status === 503 || res.status === 422) {
    const body = (await res.json().catch(() => ({}))) as { language?: string }
    return { status: 'unavailable', language: body.language ?? opts.language ?? null }
  }
  if (!res.ok) return { status: 'failed' }

  const body = (await res.json().catch(() => null)) as
    | { audioBase64?: string; mimeType?: string; language?: string; voiceName?: string; cacheHit?: boolean }
    | null
  if (!body?.audioBase64) return { status: 'failed' }

  return {
    status: 'ok',
    audioBase64: body.audioBase64,
    mimeType: body.mimeType ?? 'audio/mpeg',
    language: body.language ?? opts.language ?? '',
    voiceName: body.voiceName ?? '',
    cacheHit: body.cacheHit ?? false,
  }
}

/** Base64 → a playable object URL. Callers must revoke it when playback ends. */
export function audioUrlFromBase64(audioBase64: string, mimeType: string): string {
  const binary = atob(audioBase64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }))
}
