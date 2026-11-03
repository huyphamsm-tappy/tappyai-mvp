import { describe, expect, it } from 'vitest'
import { vi as payVi, en as payEn } from './payments'
import { dictionaries } from './dictionaries'
import { w2vi, w2en } from './w2'
import { w4vi, w4en } from './w4'
import { v3vi, v3en } from './v3'

// SUBSCRIPTIONS - the payments dictionary is merged LAST, so a key it shares with an older dictionary
// silently rewrites that older screen even with SUBSCRIPTIONS_ENABLED OFF (it happened with
// sub.free.name / sub.free.tagline of the release subscription page). Keys must never collide.
describe('payments i18n keys', () => {
  it('do not override keys of the release dictionaries', () => {
    const older = [dictionaries.vi, dictionaries.en, w2vi, w2en, w4vi, w4en, v3vi, v3en]
    const clash = [...Object.keys(payVi), ...Object.keys(payEn)].filter((k) => older.some((d) => k in d))
    expect([...new Set(clash)]).toEqual([])
  })

  it('promise nothing beyond what a paid plan gives (no "Pro features")', () => {
    for (const d of [payVi, payEn]) {
      for (const [k, v] of Object.entries(d)) if (k.startsWith('sub.')) expect(v, k).not.toMatch(/\bPro\b|Premium/)
    }
  })
})
