// The voice catalog, and the rule that stops it shipping a voice nobody chose.
//
// A wrong Google voice name fails at the moment a user presses play, not at deploy — so the names
// are transcribed from a live `voices.list` call and pinned here in the shape the API returns them.

import { describe, it, expect } from 'vitest'
import {
  GOOGLE_VOICE_CANDIDATES,
  SELECTED_VOICE,
  candidatesForLanguage,
  isVoiceSelectionComplete,
} from './googleVoices'
import { SUPPORTED_VOICE_LANGUAGES, VOICE_LANGUAGES } from './config'

describe('the candidate catalog', () => {
  it('names every voice in the exact form the API returns', () => {
    for (const v of GOOGLE_VOICE_CANDIDATES) {
      expect(v.name, v.name).toMatch(/^[a-z]{2}-[A-Z]{2}-(Chirp3-HD|Neural2)-[A-Za-z]+$/)
      expect(v.name.startsWith(v.locale), v.name).toBe(true)
    }
  })

  it('only serves locales the language contract knows', () => {
    const known = new Set(Object.values(VOICE_LANGUAGES).map((c) => c.locale))
    for (const v of GOOGLE_VOICE_CANDIDATES) expect(known.has(v.locale), v.locale).toBe(true)
  })

  // The point of the shortlist: whichever tier is chosen, both languages can use it. A tier present
  // in English but not Vietnamese would make the two voices sound like different products.
  it('offers every tier in BOTH languages', () => {
    const tiers = new Set(GOOGLE_VOICE_CANDIDATES.map((v) => v.tier))
    for (const tier of tiers) {
      const locales = new Set(GOOGLE_VOICE_CANDIDATES.filter((v) => v.tier === tier).map((v) => v.locale))
      expect([...locales].sort(), tier).toEqual(['en-US', 'vi-VN'])
    }
  })

  it('offers both genders per language, so the choice is not forced', () => {
    for (const lang of SUPPORTED_VOICE_LANGUAGES) {
      const genders = new Set(candidatesForLanguage(lang).map((v) => v.gender))
      expect([...genders].sort(), lang).toEqual(['FEMALE', 'MALE'])
    }
  })

  it('excludes en-US-only families like Studio', () => {
    // Studio has no Vietnamese counterpart; including it would strand the pairing.
    expect(GOOGLE_VOICE_CANDIDATES.some((v) => v.name.includes('Studio'))).toBe(false)
  })

  it('maps each supported language to real candidates', () => {
    for (const lang of SUPPORTED_VOICE_LANGUAGES) {
      expect(candidatesForLanguage(lang).length, lang).toBeGreaterThan(0)
    }
    expect(candidatesForLanguage('ja')).toEqual([])
  })
})

describe('the chosen voice', () => {
  // INVERTED 2026-08-14. Until the owner listened, this block asserted the opposite — that
  // SELECTED_VOICE.vi and .en were both null and isVoiceSelectionComplete() was false — because
  // nothing in this repository can hear, so nothing here was allowed to decide. The decision has
  // now been made from long-form samples, so the assertions flip to pin WHAT was chosen.

  it('is Kore in both languages', () => {
    expect(SELECTED_VOICE.vi).toBe('vi-VN-Chirp3-HD-Kore')
    expect(SELECTED_VOICE.en).toBe('en-US-Chirp3-HD-Kore')
    expect(isVoiceSelectionComplete()).toBe(true)
  })

  it('is the SAME Chirp3-HD persona across languages, not two lookalike voices', () => {
    // The reason Kore was chosen. Wavenet/Neural2/Studio define each language independently, so
    // matching suffixes there mean nothing; Chirp3-HD builds one persona across locales. If a future
    // edit swapped either side to a per-language family, Tappy would silently become two people.
    const persona = (v: string | null) => v?.replace(/^[a-z]{2}-[A-Z]{2}-/, '')
    expect(persona(SELECTED_VOICE.vi)).toBe(persona(SELECTED_VOICE.en))
    expect(persona(SELECTED_VOICE.vi)).toBe('Chirp3-HD-Kore')
  })

  it('names only voices that exist in the verified catalog', () => {
    const names = new Set(GOOGLE_VOICE_CANDIDATES.map((v) => v.name))
    for (const chosen of Object.values(SELECTED_VOICE)) {
      if (chosen) expect(names.has(chosen), chosen).toBe(true)
    }
  })

  it('speaks the language it is registered under', () => {
    // A vi-VN voice sitting in the `en` slot would read English with Vietnamese phonetics.
    for (const [lang, chosen] of Object.entries(SELECTED_VOICE)) {
      if (!chosen) continue
      const cfg = VOICE_LANGUAGES[lang]
      expect(chosen.startsWith(cfg.locale), `${lang} -> ${chosen}`).toBe(true)
    }
  })

  it('the completeness gate still reacts to what is set, not to a constant', () => {
    // Guards the guard in the other direction now: a hardcoded `return true` would satisfy the
    // first test while making the gate useless if a language were ever left unchosen.
    const partial: Record<string, string | null> = { vi: 'vi-VN-Chirp3-HD-Kore', en: null }
    expect(SUPPORTED_VOICE_LANGUAGES.every((l) => !!partial[l])).toBe(false)
  })
})
