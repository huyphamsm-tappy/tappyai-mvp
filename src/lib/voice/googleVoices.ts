// ── Google Cloud TTS voice catalog ───────────────────────────────────────────
//
// EVERY NAME HERE WAS READ FROM THE API, not from documentation and not guessed. Enumerated on
// 2026-08-13 against project aerobic-lock-498409-u7 via `GET /v1/voices?languageCode=…` — vi-VN
// returned 40 voices, en-US returned 100. A wrong voice name is not a validation error at deploy
// time; it is a 400 at the moment a user presses play, so these are transcribed rather than typed
// from memory.
//
// TIERS, and why the shortlist is a shortlist:
//   Chirp3-HD  Google's newest generative tier. Present for BOTH vi-VN and en-US, which matters —
//              a tier available in English but not Vietnamese would force different generations per
//              language and make the two voices sound like different products.
//   Neural2    previous generation, available for both.
//   Studio     en-US only. Deliberately NOT a candidate: no Vietnamese counterpart.
//
// WHAT IS DELIBERATELY NOT DECIDED HERE: which voice Tappy uses. Picking it requires listening, and
// nothing in this repository can listen. Samples were generated and handed to the owner; until a
// choice comes back, `SELECTED_VOICE` stays null and callers must treat voice as unconfigured
// rather than fall back to an arbitrary name.

import { SUPPORTED_VOICE_LANGUAGES, VOICE_LANGUAGES } from './config'

export interface GoogleVoiceCandidate {
  /** Exact `name` as returned by the API. */
  name: string
  /** BCP-47 code the voice serves. */
  locale: string
  gender: 'MALE' | 'FEMALE'
  /** Generation family, as reflected in the name. */
  tier: 'Chirp3-HD' | 'Neural2'
}

/**
 * The shortlist offered for selection — verified present in BOTH languages, so whichever tier is
 * chosen, Vietnamese and English can use the same generation.
 */
export const GOOGLE_VOICE_CANDIDATES: readonly GoogleVoiceCandidate[] = [
  { name: 'vi-VN-Chirp3-HD-Aoede', locale: 'vi-VN', gender: 'FEMALE', tier: 'Chirp3-HD' },
  { name: 'vi-VN-Chirp3-HD-Charon', locale: 'vi-VN', gender: 'MALE', tier: 'Chirp3-HD' },
  { name: 'vi-VN-Neural2-A', locale: 'vi-VN', gender: 'FEMALE', tier: 'Neural2' },
  { name: 'vi-VN-Neural2-D', locale: 'vi-VN', gender: 'MALE', tier: 'Neural2' },
  { name: 'en-US-Chirp3-HD-Aoede', locale: 'en-US', gender: 'FEMALE', tier: 'Chirp3-HD' },
  { name: 'en-US-Chirp3-HD-Charon', locale: 'en-US', gender: 'MALE', tier: 'Chirp3-HD' },
  { name: 'en-US-Neural2-F', locale: 'en-US', gender: 'FEMALE', tier: 'Neural2' },
  { name: 'en-US-Neural2-D', locale: 'en-US', gender: 'MALE', tier: 'Neural2' },
]

/**
 * The chosen voice per language. Null until a human has listened.
 *
 * Null is the honest state, and it is also the safe one: a caller that reads null must report the
 * voice as unconfigured. Seeding a "reasonable default" would silently ship whichever name happened
 * to be typed first as Tappy's voice.
 */
export const SELECTED_VOICE: Record<string, string | null> = {
  vi: null,
  en: null,
}

/** Candidates serving a given supported language, for a selection UI or a decision record. */
export function candidatesForLanguage(language: string): readonly GoogleVoiceCandidate[] {
  const cfg = VOICE_LANGUAGES[language]
  if (!cfg) return []
  return GOOGLE_VOICE_CANDIDATES.filter((v) => v.locale === cfg.locale)
}

/** True once every supported language has a chosen voice — the gate for enabling Google TTS. */
export function isVoiceSelectionComplete(): boolean {
  return SUPPORTED_VOICE_LANGUAGES.every((lang) => !!SELECTED_VOICE[lang])
}
