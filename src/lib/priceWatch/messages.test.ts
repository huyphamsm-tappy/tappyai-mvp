import { describe, it, expect } from 'vitest'
import { pw, fmtPriceVnd, normalizePwLang, PW_LANGS } from './messages'

// ── STEP 13 — the Price Watch VI/EN translation layer ──────────────────────
//
// Deterministic and model-free, following the shipped `src/lib/ai/messages.ts`
// convention exactly (`isVi(lang) ? VI : EN`) rather than inventing a second
// localisation framework.
//
// Every user-facing Price Watch string must have BOTH forms. The gap this closes
// was not "one untranslated message" — it was that the entire feature (REST
// route, chat tool, cron, push notification) was Vietnamese-only.

describe('normalizePwLang — explicit and defaulted', () => {
  it("'en' selects English", () => expect(normalizePwLang('en')).toBe('en'))
  it("'vi' selects Vietnamese", () => expect(normalizePwLang('vi')).toBe('vi'))

  it('anything unknown or absent DEFAULTS TO VIETNAMESE', () => {
    // Backward compatibility: every caller today sends nothing, and every one of
    // them currently receives Vietnamese. That behaviour must not change.
    for (const v of [null, undefined, '', 'fr', 'EN', 'vi-VN', 42, {}, []]) {
      expect(normalizePwLang(v), `${JSON.stringify(v)} must default to vi`).toBe('vi')
    }
  })

  it('only the two supported languages are declared', () => {
    expect([...PW_LANGS].sort()).toEqual(['en', 'vi'])
  })
})

describe('fmtPriceVnd — money reads naturally in each language', () => {
  it('VI uses "triệu" for millions', () => {
    expect(fmtPriceVnd(4_500_000, 'vi')).toBe('4.5 triệu')
    expect(fmtPriceVnd(4_000_000, 'vi')).toBe('4 triệu')
  })

  it('EN uses "M" for millions — "triệu" must not leak into an English push', () => {
    expect(fmtPriceVnd(4_500_000, 'en')).toBe('4.5M')
    expect(fmtPriceVnd(4_000_000, 'en')).toBe('4M')
  })

  it('sub-million reads as k in both, which is idiomatic in each', () => {
    expect(fmtPriceVnd(450_000, 'vi')).toBe('450k')
    expect(fmtPriceVnd(450_000, 'en')).toBe('450k')
  })

  it('is deterministic and never throws on edge values', () => {
    for (const n of [0, 1, 999, 1_000_000, 999_999_999]) {
      for (const l of PW_LANGS) expect(typeof fmtPriceVnd(n, l)).toBe('string')
    }
  })
})

// Every message the feature can show a user. If a key is added without both
// forms, this table is where it gets caught.
// `saveError` takes a cause argument and is covered by its own test below.
const KEYS = [
  'unauthorized', 'missingFields', 'missingId', 'dbError',
  'limitReached', 'cancelFailed', 'notFound', 'needLogin',
] as const

describe('every user-facing message has BOTH a VI and an EN form', () => {
  for (const key of KEYS) {
    it(`${key} differs by language and is non-empty in both`, () => {
      const vi = pw[key]('vi')
      const en = pw[key]('en')
      expect(vi.length).toBeGreaterThan(0)
      expect(en.length).toBeGreaterThan(0)
      expect(vi, `${key} returns the same string for both languages`).not.toBe(en)
    })

    it(`${key} EN carries no Vietnamese diacritics`, () => {
      expect(pw[key]('en')).not.toMatch(/[àáâãèéêìíòóôõùúýăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i)
    })
  }
})

describe('the parameterised messages', () => {
  it('saved: names the product, the interval and the target, in each language', () => {
    const vi = pw.saved('vi', 'AirPods Pro 2', 4_500_000)
    const en = pw.saved('en', 'AirPods Pro 2', 4_500_000)
    for (const s of [vi, en]) expect(s).toContain('AirPods Pro 2')
    expect(vi).toContain('4.5 triệu')
    expect(en).toContain('4.5M')
    expect(en).not.toMatch(/triệu|báo|khi/i)
  })

  it('notifyTitle: names the product in both', () => {
    expect(pw.notifyTitle('vi', 'AirPods Pro 2')).toContain('AirPods Pro 2')
    expect(pw.notifyTitle('en', 'AirPods Pro 2')).toContain('AirPods Pro 2')
    expect(pw.notifyTitle('en', 'AirPods Pro 2')).not.toMatch(/đã xuống/)
  })

  it('notifyBody: carries BOTH the current price and the target, in both', () => {
    const vi = pw.notifyBody('vi', 4_200_000, 4_500_000)
    const en = pw.notifyBody('en', 4_200_000, 4_500_000)
    expect(vi).toContain('4.2 triệu')
    expect(vi).toContain('4.5 triệu')
    expect(en).toContain('4.2M')
    expect(en).toContain('4.5M')
  })

  it('notifyBody EN is understandable English, not transliterated Vietnamese', () => {
    const en = pw.notifyBody('en', 4_200_000, 4_500_000)
    expect(en).toMatch(/target/i)
    expect(en).not.toMatch(/[àáâãèéêìíòóôõùúýăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i)
  })

  it('saveError keeps the underlying cause attached, in both languages', () => {
    expect(pw.saveError('vi', 'duplicate key')).toContain('duplicate key')
    expect(pw.saveError('en', 'duplicate key')).toContain('duplicate key')
  })
})

describe('the layer is pure', () => {
  it('same inputs, same output', () => {
    expect(pw.notifyBody('en', 1, 2)).toBe(pw.notifyBody('en', 1, 2))
    expect(pw.limitReached('vi')).toBe(pw.limitReached('vi'))
  })
})
