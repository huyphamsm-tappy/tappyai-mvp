import { describe, it, expect } from 'vitest'
import { dictionaries } from '../dictionaries'
import { w2vi, w2en } from '../w2'
import { w3vi, w3en } from '../w3'
import { w4vi, w4en } from '../w4'
import { vi as adminVi, en as adminEn } from '../admin'
import { vi as landingVi, en as landingEn } from '../landing'

// translate() resolves `full[locale][key] ?? full.vi[key] ?? key`, so a key that
// is missing an English value does not blow up — it silently renders Vietnamese.
// That is exactly how "English is selected but the page is in Vietnamese" got
// shipped, and it is invisible in review. These tests turn that class of bug
// into a build failure.
const MODULES: [string, Record<string, string>, Record<string, string>][] = [
  ['dictionaries', dictionaries.vi, dictionaries.en],
  ['w2', w2vi, w2en],
  ['w3', w3vi, w3en],
  ['w4', w4vi, w4en],
  ['admin', adminVi, adminEn],
  ['landing', landingVi, landingEn],
]

describe('i18n locale parity', () => {
  it.each(MODULES)('%s defines every key in both vi and en', (_name, vi, en) => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(vi).sort())
  })

  it.each(MODULES)('%s has no empty values', (_name, vi, en) => {
    const empty = [...Object.entries(vi), ...Object.entries(en)]
      .filter(([, v]) => v.trim() === '')
      .map(([k]) => k)
    expect(empty).toEqual([])
  })

  // Placeholders are positional ({1}, {2}) and come from Android's %1$s/%2$s.
  // A translation that drops or renumbers one renders a literal "{1}" to users.
  it.each(MODULES)('%s keeps the same placeholders across locales', (_name, vi, en) => {
    const holders = (s: string) => (s.match(/\{[^}]+\}/g) ?? []).sort()
    const mismatched = Object.keys(vi)
      .filter((k) => en[k] !== undefined)
      .filter((k) => holders(vi[k]).join() !== holders(en[k]).join())
    expect(mismatched).toEqual([])
  })
})

describe('i18n namespace collisions', () => {
  it('no key is defined by more than one module', () => {
    const seen = new Map<string, string>()
    const dupes: string[] = []
    for (const [name, vi] of MODULES.map(([n, vi]) => [n, vi] as const)) {
      for (const key of Object.keys(vi)) {
        // Modules are merged with object spread in useTranslation, so a repeated
        // key means one module silently overrides the other.
        if (seen.has(key)) dupes.push(`${key} (${seen.get(key)} + ${name})`)
        else seen.set(key, name)
      }
    }
    expect(dupes).toEqual([])
  })
})
