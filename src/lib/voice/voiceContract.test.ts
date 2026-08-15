// The one voice/language contract every platform reads.
//
// WHY THIS EXISTS: before it, the locale was a literal typed at each call site — 'vi-VN' appeared
// in ChatInterface.tsx, SearchBar.tsx, VoiceInputManager.swift and TTSManager.swift (twice). Android
// alone derived it from the app language. Five hardcoded sites, three platforms, two behaviours.
// A shared table is the only thing that makes "the same language everywhere" checkable rather than
// hopeful.
//
// TWO RULES THAT LOOK SIMILAR AND ARE NOT:
//   Voice INPUT follows the UI language — you dictate in the language you chose to work in.
//   Voice OUTPUT follows the MESSAGE language — a Vietnamese reply is read in Vietnamese even
//   when the interface is English. (Frozen product decision.)
// Conflating them is exactly how Android ended up reading Vietnamese replies with an English voice.
//
// AND THE RULE THAT PROTECTS THE USER: an unsupported language returns null. Never a default,
// never "the closest one", never English-reading-Vietnamese. Callers must show a notice and stay
// silent. `?? DEFAULT` on any of these functions reintroduces the bug they exist to prevent.

import { describe, it, expect } from 'vitest'
import {
  VOICE_LANGUAGES,
  SUPPORTED_VOICE_LANGUAGES,
  inputLocaleFor,
  outputLocaleFor,
  isSupportedVoiceLanguage,
  normalizeVoiceLanguage,
} from './config'

describe('the supported language set', () => {
  it('ships exactly Vietnamese and English in V2', () => {
    expect([...SUPPORTED_VOICE_LANGUAGES].sort()).toEqual(['en', 'vi'])
  })

  it('describes each language by data, not by branching', () => {
    for (const lang of SUPPORTED_VOICE_LANGUAGES) {
      const cfg = VOICE_LANGUAGES[lang]
      expect(cfg.language).toBe(lang)
      expect(cfg.locale).toMatch(/^[a-z]{2}-[A-Z]{2}$/)
      expect(cfg.displayName.length).toBeGreaterThan(0)
    }
  })

  // Adding a language must be a config entry, not a code change. If this ever needs editing
  // alongside a platform file, the abstraction has failed.
  it('is a table, so a new language is one entry', () => {
    expect(Object.keys(VOICE_LANGUAGES).sort()).toEqual([...SUPPORTED_VOICE_LANGUAGES].sort())
  })
})

describe('voice INPUT locale — follows the UI language', () => {
  it.each([
    ['vi', 'vi-VN'],
    ['en', 'en-US'],
  ])('%s → %s', (lang, locale) => {
    expect(inputLocaleFor(lang)).toBe(locale)
  })

  it.each(['ja', 'ko', 'zh', 'fr', ''])('returns null for the unsupported %s', (lang) => {
    expect(inputLocaleFor(lang)).toBeNull()
  })

  // A longer BCP-47 tag is still that language — 'vi-VN-x-something' is Vietnamese. Reducing to the
  // primary subtag is correct; rejecting it would strand real callers.
  it('accepts a tag carrying extra subtags', () => {
    expect(inputLocaleFor('VI-vn-extra')).toBe('vi-VN')
  })

  it('never invents a fallback locale', () => {
    // The bug this prevents: `inputLocaleFor(x) ?? 'vi-VN'` at a call site.
    expect(inputLocaleFor('ja')).not.toBe('vi-VN')
    expect(inputLocaleFor('ja')).not.toBe('en-US')
  })
})

describe('voice OUTPUT locale — follows the MESSAGE language, never the UI', () => {
  it.each([
    ['vi', 'vi-VN'],
    ['en', 'en-US'],
  ])('a %s message is spoken as %s', (lang, locale) => {
    expect(outputLocaleFor(lang)).toBe(locale)
  })

  // The frozen contract, stated as an executable fact rather than a comment.
  it('an English UI reading a Vietnamese reply speaks Vietnamese', () => {
    const uiLanguage = 'en'
    const messageLanguage = 'vi'
    expect(outputLocaleFor(messageLanguage)).toBe('vi-VN')
    expect(outputLocaleFor(messageLanguage)).not.toBe(inputLocaleFor(uiLanguage))
  })

  it('a Vietnamese UI reading an English reply speaks English', () => {
    expect(outputLocaleFor('en')).toBe('en-US')
    expect(outputLocaleFor('en')).not.toBe(inputLocaleFor('vi'))
  })

  it('refuses an unsupported message language rather than substituting one', () => {
    expect(outputLocaleFor('ja')).toBeNull()
    expect(outputLocaleFor('th')).toBeNull()
  })
})

describe('normalizing what callers actually pass', () => {
  // detectLang() returns bare codes; UI settings and BCP-47 tags arrive in mixed shapes.
  it.each([
    ['vi', 'vi'],
    ['VI', 'vi'],
    ['vi-VN', 'vi'],
    ['en', 'en'],
    ['en-US', 'en'],
    ['en_GB', 'en'],
  ])('%s normalizes to %s', (input, expected) => {
    expect(normalizeVoiceLanguage(input)).toBe(expected)
  })

  it('normalizes an unsupported tag to null rather than guessing', () => {
    expect(normalizeVoiceLanguage('ja-JP')).toBeNull()
    expect(normalizeVoiceLanguage('')).toBeNull()
  })

  it('is not fooled by a supported code appearing inside another tag', () => {
    // "ven" must not read as "en".
    expect(normalizeVoiceLanguage('ven')).toBeNull()
  })
})

describe('the support predicate agrees with the table', () => {
  it.each(['vi', 'en', 'vi-VN', 'en-US'])('%s is supported', (lang) => {
    expect(isSupportedVoiceLanguage(lang)).toBe(true)
  })

  it.each(['ja', 'ko', 'zh', ''])('%s is not supported', (lang) => {
    expect(isSupportedVoiceLanguage(lang)).toBe(false)
  })

  it('cannot disagree with the locale lookups', () => {
    for (const lang of ['vi', 'en', 'ja', 'ko', '']) {
      expect(isSupportedVoiceLanguage(lang)).toBe(inputLocaleFor(lang) !== null)
      expect(isSupportedVoiceLanguage(lang)).toBe(outputLocaleFor(lang) !== null)
    }
  })
})
