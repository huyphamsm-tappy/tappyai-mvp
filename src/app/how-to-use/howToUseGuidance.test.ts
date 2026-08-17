import { describe, it, expect } from 'vitest'
import { HOW_TO_USE_DOC } from './howToUseDoc'
import { en, vi } from '@/lib/i18n/guide'
import { translate } from '@/lib/i18n/useTranslation'

// The failure this suite exists to prevent is a silent one. LegalDocument
// renders t(key), and translate() resolves `full[locale][key] ?? full.vi[key] ??
// key` — so a MISSING ENGLISH STRING does not throw and does not even render the
// key: it renders the Vietnamese one. An English reader would get a page with
// Vietnamese sentences scattered through it and no error anywhere. Presence in
// the module map is therefore not enough; the assertions below also pin what
// translate() actually returns per locale.

/** Every i18n key the document references, in document order. */
function keysOf(): string[] {
  const keys = [HOW_TO_USE_DOC.titleKey, HOW_TO_USE_DOC.effectiveKey]
  for (const section of HOW_TO_USE_DOC.sections) {
    keys.push(section.headingKey)
    for (const block of section.blocks) {
      if (block.kind === 'bullets' || block.kind === 'steps') keys.push(...block.keys)
      else if (block.kind !== 'contact') keys.push(block.key)
    }
  }
  return keys
}

describe('how-to-use guidance — the document and the dictionaries agree', () => {
  const keys = keysOf()

  it('references a non-trivial number of keys', () => {
    // Guards against a refactor that empties the document and makes every
    // per-key assertion below vacuously pass.
    expect(keys.length).toBeGreaterThan(50)
  })

  it('names no key twice', () => {
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('every referenced key has non-empty English and Vietnamese', () => {
    const missingEn = keys.filter((k) => typeof en[k] !== 'string' || en[k].trim() === '')
    const missingVi = keys.filter((k) => typeof vi[k] !== 'string' || vi[k].trim() === '')
    expect(missingEn).toEqual([])
    expect(missingVi).toEqual([])
  })

  it('the two locales define exactly the same keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(vi).sort())
  })

  it('defines no key the document never renders', () => {
    // An unused string is dead weight that later reads as coverage.
    const referenced = new Set(keys)
    expect(Object.keys(en).filter((k) => !referenced.has(k))).toEqual([])
  })

  it('every key is namespaced under guide.', () => {
    expect(Object.keys(en).filter((k) => !k.startsWith('guide.'))).toEqual([])
  })

  it('English and Vietnamese are actually different text', () => {
    // A copy-paste that leaves English sitting in the Vietnamese map is
    // invisible to a presence check.
    expect(Object.keys(en).filter((k) => en[k] === vi[k])).toEqual([])
  })
})

describe('how-to-use guidance — survives the merge into the app dictionary', () => {
  const keys = keysOf()

  it('translate() returns the English string for every key, not the Vietnamese fallback', () => {
    // This is the assertion that actually proves the guide module was added to
    // the spread in useTranslation. Comparing against en[k] rather than merely
    // against the key name is what makes the vi-fallback detectable.
    const wrong = keys.filter((k) => translate('en', k) !== en[k])
    expect(wrong).toEqual([])
  })

  it('translate() returns the Vietnamese string for every key', () => {
    const wrong = keys.filter((k) => translate('vi', k) !== vi[k])
    expect(wrong).toEqual([])
  })

  it('no key resolves to its own name in either locale', () => {
    // translate()'s last resort is the key itself — that is what a user sees
    // when a string is missing from both locales.
    for (const locale of ['en', 'vi'] as const) {
      expect(keys.filter((k) => translate(locale, k) === k)).toEqual([])
    }
  })
})

describe('how-to-use guidance — reachable from Settings', () => {
  it('the Settings entry point is localized in both languages', () => {
    const enLabel = translate('en', 'settings.howToUse')
    const viLabel = translate('vi', 'settings.howToUse')
    expect(enLabel).not.toBe('settings.howToUse')
    expect(viLabel).not.toBe('settings.howToUse')
    expect(enLabel).not.toBe(viLabel)
  })
})
