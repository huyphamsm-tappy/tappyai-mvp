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
  { name: 'vi-VN-Chirp3-HD-Kore', locale: 'vi-VN', gender: 'FEMALE', tier: 'Chirp3-HD' },
  { name: 'vi-VN-Chirp3-HD-Aoede', locale: 'vi-VN', gender: 'FEMALE', tier: 'Chirp3-HD' },
  { name: 'vi-VN-Chirp3-HD-Charon', locale: 'vi-VN', gender: 'MALE', tier: 'Chirp3-HD' },
  { name: 'vi-VN-Neural2-A', locale: 'vi-VN', gender: 'FEMALE', tier: 'Neural2' },
  { name: 'vi-VN-Neural2-D', locale: 'vi-VN', gender: 'MALE', tier: 'Neural2' },
  { name: 'en-US-Chirp3-HD-Kore', locale: 'en-US', gender: 'FEMALE', tier: 'Chirp3-HD' },
  { name: 'en-US-Chirp3-HD-Aoede', locale: 'en-US', gender: 'FEMALE', tier: 'Chirp3-HD' },
  { name: 'en-US-Chirp3-HD-Charon', locale: 'en-US', gender: 'MALE', tier: 'Chirp3-HD' },
  { name: 'en-US-Neural2-F', locale: 'en-US', gender: 'FEMALE', tier: 'Neural2' },
  { name: 'en-US-Neural2-D', locale: 'en-US', gender: 'MALE', tier: 'Neural2' },
]

/**
 * Tappy's voice, per language. Chosen by the owner on 2026-08-14 after listening to long-form
 * samples of 16 Vietnamese and 4 English voices.
 *
 * WHY THE SAME NAME APPEARS TWICE: `Kore` is not two similar voices, it is ONE Chirp3-HD persona
 * built for 53 locales. Every other family — Wavenet, Neural2, Studio — defines each language
 * independently, so `vi-VN-Wavenet-C` and `en-US-Wavenet-C` share a letter and nothing else. Kore
 * is what makes Tappy the same person when the reply switches language, and it is why a future
 * Japanese or Korean release keeps that identity instead of introducing a stranger.
 *
 * Measured trade-off, accepted knowingly: Chirp3-HD speaks roughly twice as fast as Wavenet or
 * Neural2 (99KB vs 201KB of audio for the same Vietnamese passage). Vietnamese and English are
 * closely matched to each other (99KB vs 108KB), so the pace is consistent across languages. If it
 * ever reads too fast, `speakingRate` is the dial — not a different voice — and it is part of the
 * cache key, so changing it invalidates cleanly.
 *
 * Null remains the meaningful "unconfigured" state for any language without a choice; a caller
 * reading null must report voice as unavailable rather than substitute a name.
 */
export const SELECTED_VOICE: Record<string, string | null> = {
  vi: 'vi-VN-Chirp3-HD-Kore',
  en: 'en-US-Chirp3-HD-Kore',
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
