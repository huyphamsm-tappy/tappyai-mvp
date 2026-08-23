// Voice selection for browser Web Speech API TTS (Web V1).
//
// ⚠️ NOT ON THE LIVE CHAT PATH. Read-aloud in chat goes through `useServerTTS` → /api/voice/tts,
// where the server detects the language and synthesizes the audio. The only remaining caller of
// `pickVoice` is `useTTS`, which is not mounted anywhere; it is kept because `stripMarkdownForTTS`
// still lives beside it. Do not reintroduce device-voice availability as a reason chat cannot speak.
//
// The hard rule (owner, 2026-07-25): NEVER read text with a voice of the wrong
// language — no English voice reading Vietnamese. Language comes from the chat
// pipeline's own detector (`detectLang` in @/lib/ai/intent), applied to the text
// being spoken, so this is pipeline metadata, not a separate heuristic. If the
// device has no voice for that language, the caller must show a notice and stay
// silent — never fall back to a mismatched voice.

/** detectLang() short code → a BCP-47 tag we set on the utterance. */
const LANG_BCP47: Record<string, string> = {
  vi: 'vi-VN',
  en: 'en-US',
  ja: 'ja-JP',
  ko: 'ko-KR',
  zh: 'zh-CN',
  th: 'th-TH',
  ar: 'ar-SA',
}

export function bcp47ForLang(code: string): string {
  return LANG_BCP47[code] || code
}

/** Primary subtag, e.g. "vi-VN" → "vi". */
const primarySubtag = (lang: string) => lang.toLowerCase().split(/[-_]/)[0]

/** The shape we need off a SpeechSynthesisVoice (kept minimal so it's unit-testable). */
export interface VoiceLike {
  name: string
  lang: string
  localService?: boolean
  default?: boolean
}

/**
 * Best voice for a detectLang() code, or null when the device has NO voice for
 * that language. NEVER returns a voice whose primary language differs from the
 * target — that guarantee is the whole point of the fix.
 *
 * Among same-language voices it prefers the most natural one: exact region match,
 * then cloud/online voices (localService === false — usually the "Natural"/
 * "Neural"/"Google" ones), then names that look natural; eSpeak is de-ranked.
 */
export function pickVoice<T extends VoiceLike>(voices: readonly T[], langCode: string): T | null {
  const targetTag = bcp47ForLang(langCode).toLowerCase()
  const target = primarySubtag(targetTag)
  const candidates = voices.filter((v) => primarySubtag(v.lang) === target)
  if (candidates.length === 0) return null

  const score = (v: T): number => {
    let s = 0
    if (v.lang.toLowerCase() === targetTag) s += 8 // exact region (vi-VN over vi-*)
    if (v.localService === false) s += 4 // cloud/online = the natural voices
    if (/natural|neural|online|google|wavenet/i.test(v.name)) s += 3
    if (/espeak/i.test(v.name)) s -= 5 // robotic
    if (v.default) s += 1
    return s
  }
  return [...candidates].sort((a, b) => score(b) - score(a))[0]
}

// ── REMOVED: noVoiceMessage() / langDisplayName() / LANG_NAMES ───────────────
//
// They produced "This device has no <language> voice, so the reply can't be read aloud." — and the
// chat UI showed it for a failure that has nothing to do with the device. Read-aloud is synthesized
// server-side; nothing on that path ever looks at the browser's voice list. Measured on production
// (2026-08-23) BOTH vi and en answer 503 `voice_unavailable`, because the deployment has no voice
// provider configured. The server says exactly that, in the user's locale, and the client now shows
// the server's sentence instead of inventing one from a language code.
//
// Deleted rather than left unused: a helper that states something false is a trap for the next
// caller, and "no runtime caller" was already true of the device path that produced it.
