// Voice selection for browser Web Speech API TTS (Web V1).
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

/** Human name of a language for the "no voice" notice, in the UI locale. */
const LANG_NAMES: Record<string, { vi: string; en: string }> = {
  vi: { vi: 'tiếng Việt', en: 'Vietnamese' },
  en: { vi: 'tiếng Anh', en: 'English' },
  ja: { vi: 'tiếng Nhật', en: 'Japanese' },
  ko: { vi: 'tiếng Hàn', en: 'Korean' },
  zh: { vi: 'tiếng Trung', en: 'Chinese' },
  th: { vi: 'tiếng Thái', en: 'Thai' },
  ar: { vi: 'tiếng Ả Rập', en: 'Arabic' },
}

export function langDisplayName(code: string, uiLocale: string): string {
  const n = LANG_NAMES[code]
  if (!n) return code
  return uiLocale === 'en' ? n.en : n.vi
}

/** The localized "this device has no <language> voice" notice. */
export function noVoiceMessage(code: string, uiLocale: string): string {
  const name = langDisplayName(code, uiLocale)
  return uiLocale === 'en'
    ? `This device has no ${name} voice, so the reply can't be read aloud.`
    : `Thiết bị này không có giọng đọc ${name} nên chưa thể đọc câu trả lời.`
}
