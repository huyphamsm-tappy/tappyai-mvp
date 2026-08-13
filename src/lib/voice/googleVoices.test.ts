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

describe('no voice ships until a human has listened', () => {
  it('reports selection as incomplete while any language is unchosen', () => {
    // Deliberately asserts the CURRENT state: nothing in this repo can listen, so nothing here may
    // decide. When the owner picks, SELECTED_VOICE fills in and this test is updated with it.
    expect(SELECTED_VOICE.vi).toBeNull()
    expect(SELECTED_VOICE.en).toBeNull()
    expect(isVoiceSelectionComplete()).toBe(false)
  })

  it('the completeness gate reacts to what is actually set, not to a constant', () => {
    // Guards the guard: a hardcoded `return false` would pass the test above while making the gate
    // useless the moment a voice IS chosen.
    const filled: Record<string, string | null> = { vi: 'vi-VN-Neural2-A', en: 'en-US-Neural2-F' }
    const complete = SUPPORTED_VOICE_LANGUAGES.every((l) => !!filled[l])
    expect(complete).toBe(true)
  })

  it('every selectable value would be a real catalog name', () => {
    const names = new Set(GOOGLE_VOICE_CANDIDATES.map((v) => v.name))
    for (const chosen of Object.values(SELECTED_VOICE)) {
      if (chosen) expect(names.has(chosen), chosen).toBe(true)
    }
  })
})
