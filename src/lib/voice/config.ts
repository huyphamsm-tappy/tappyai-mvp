// ── The voice/language contract — one table, every platform ──────────────────
//
// Before this file the locale was a literal typed at each call site: 'vi-VN' in ChatInterface.tsx,
// in SearchBar.tsx, in VoiceInputManager.swift, and twice in TTSManager.swift. Android alone
// derived it from the app language. Five hardcoded sites, three platforms, two behaviours — so an
// English-mode user dictated English into a Vietnamese recogniser, and a Vietnamese reply could be
// read aloud by an English voice.
//
// TWO RULES THAT LOOK ALIKE AND ARE NOT:
//
//   INPUT  follows the UI LANGUAGE      — you dictate in the language you chose to work in.
//   OUTPUT follows the MESSAGE LANGUAGE — a Vietnamese reply is spoken in Vietnamese even when the
//                                         interface is English. (Frozen product decision.)
//
// They are separate functions rather than one `localeFor()` precisely so a caller has to say which
// one it means. Conflating them is the bug this file exists to end.
//
// UNSUPPORTED LANGUAGES RETURN null — never a default, never "the closest match". A caller must
// keep the text visible and stay silent. Writing `inputLocaleFor(x) ?? 'vi-VN'` at a call site
// reintroduces exactly the defect this replaced.
//
// ADDING A LANGUAGE is a row in VOICE_LANGUAGES plus its localization catalog entries — no platform
// code changes. V2 ships vi + en only; the shape is what makes the next one cheap.

/** A language TappyAI can speak and listen in. */
export interface VoiceLanguageConfig {
  /** Primary subtag — the key callers pass around (matches detectLang() output). */
  language: string
  /** BCP-47 tag handed to the platform speech engines. */
  locale: string
  /** For language pickers and voice-unavailable notices. */
  displayName: string
}

/**
 * The whole supported set, as data.
 *
 * V2 release scope is Vietnamese + English — deliberately matching Android's `AppLanguage`, so no
 * platform can offer a language the others cannot.
 */
export const VOICE_LANGUAGES: Record<string, VoiceLanguageConfig> = {
  vi: { language: 'vi', locale: 'vi-VN', displayName: 'Tiếng Việt' },
  en: { language: 'en', locale: 'en-US', displayName: 'English' },
}

export const SUPPORTED_VOICE_LANGUAGES: readonly string[] = Object.keys(VOICE_LANGUAGES)

/**
 * Reduce whatever a caller has — 'vi', 'VI', 'vi-VN', 'en_GB' — to a supported primary subtag, or
 * null. Splitting on the separator rather than matching a prefix is what stops 'ven' reading as
 * 'en'.
 */
export function normalizeVoiceLanguage(value: string | null | undefined): string | null {
  if (!value) return null
  const primary = value.toLowerCase().split(/[-_]/)[0]
  return primary in VOICE_LANGUAGES ? primary : null
}

export function isSupportedVoiceLanguage(value: string | null | undefined): boolean {
  return normalizeVoiceLanguage(value) !== null
}

/**
 * Locale for speech RECOGNITION. Pass the UI/app language: dictation should hear the language the
 * user chose to work in.
 */
export function inputLocaleFor(uiLanguage: string | null | undefined): string | null {
  const lang = normalizeVoiceLanguage(uiLanguage)
  return lang ? VOICE_LANGUAGES[lang].locale : null
}

/**
 * Locale for speech SYNTHESIS. Pass the MESSAGE language — the language of the text about to be
 * spoken, not the interface language. Returns null when we cannot speak it, and the caller must
 * then show a notice and leave the text on screen.
 */
export function outputLocaleFor(messageLanguage: string | null | undefined): string | null {
  const lang = normalizeVoiceLanguage(messageLanguage)
  return lang ? VOICE_LANGUAGES[lang].locale : null
}

/** Display name for a voice-unavailable notice. */
export function voiceLanguageDisplayName(value: string | null | undefined): string | null {
  const lang = normalizeVoiceLanguage(value)
  return lang ? VOICE_LANGUAGES[lang].displayName : null
}
