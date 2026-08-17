// EN/VI parity for the voice strings.
//
// These fire while the user is holding a microphone open, which is the worst moment to receive a
// message in a language they did not choose — the whole reason the hardcoded Vietnamese errors were
// a defect and not a cosmetic issue. Parity has to be checked, not assumed.

import { describe, it, expect } from 'vitest'
import { vi as viVoice, en as enVoice } from '../w2/voice'
import { w2vi, w2en } from '../w2'

describe('the voice dictionary', () => {
  it('defines the same keys in both languages', () => {
    expect(Object.keys(viVoice).sort()).toEqual(Object.keys(enVoice).sort())
  })

  it('has no empty or whitespace-only string', () => {
    for (const [key, value] of [...Object.entries(viVoice), ...Object.entries(enVoice)]) {
      expect(value.trim(), key).not.toBe('')
    }
  })

  it('namespaces every key under voice.', () => {
    for (const key of Object.keys(viVoice)) expect(key).toMatch(/^voice\./)
  })

  it('is not accidentally the same text in both languages', () => {
    // A copy-paste that leaves English in the Vietnamese map would otherwise pass every check above.
    const identical = Object.keys(viVoice).filter((k) => viVoice[k] === enVoice[k])
    expect(identical).toEqual([])
  })

  it('keeps placeholders consistent across languages', () => {
    for (const key of Object.keys(viVoice)) {
      const placeholders = (s: string) => (s.match(/\{[a-zA-Z]+\}/g) ?? []).sort()
      expect(placeholders(viVoice[key]), key).toEqual(placeholders(enVoice[key]))
    }
  })
})

describe('the voice module is actually wired into the app dictionary', () => {
  // Registering the module in w2/index.ts is a separate step from writing it; forgetting that would
  // leave every t('voice.*') call rendering a raw key.
  it.each(Object.keys(viVoice))('%s resolves in both merged dictionaries', (key) => {
    expect(w2vi[key]).toBeTruthy()
    expect(w2en[key]).toBeTruthy()
  })
})
