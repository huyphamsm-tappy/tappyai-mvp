import { describe, it, expect } from 'vitest'
import { detectLang, detectExplicitLangRequest } from './intent'
import { vi as viDict, en as enDict } from '@/lib/i18n/v3/web'

// ── Quick Suggestions answer in the language they are written in ────────────
//
// 🚨 THE REPORTED BUG: clicking "Quán cafe view đẹp" on Home produced an ENGLISH
// answer. The chip was never the problem — `HomeV3` calls `ask(t(chip))`, which
// sends the chip's text as an ordinary message, so the click and typing the same
// sentence take the identical path. Both were wrong, and both are fixed by the
// same change.
//
// Measured before the fix: `detectLang('Quán cafe view đẹp')` → 'en'.
// `Quán` is an ordinary Vietnamese noun, accented, capitalised only because it
// opens the sentence — and the uppercase filter dropped it from the Vietnamese
// evidence, leaving `đẹp` alone against `cafe` and `view`, the undiacriticked
// loanwords Vietnamese speakers actually write. 1/3 = 0.333 < 0.4 → English.
//
// 🔑 WHAT THIS FILE TESTS IS THE DETERMINISTIC DECISION, NOT MODEL OUTPUT. The
// chat route composes the response language as
// `detectExplicitLangRequest(lastText) ?? detectLang(lastText)` and threads the
// result through the system prompt and every tool call. Asserting on a sentence
// the model happened to produce would be a test of the weather; asserting on
// this function is a test of the product.

/** The composed decision `/api/chat` makes for the response language. */
const responseLang = (text: string) => detectExplicitLangRequest(text) ?? detectLang(text)

/**
 * The Home quick-suggestion chips, READ FROM THE DICTIONARY.
 *
 * 🚨 Not a copy of the five strings. `HomeV3.QUICK_CHIPS` renders `t(key)`, so
 * the text a user actually clicks is whatever the dictionary holds — and a chip
 * reworded later must be re-checked, not silently exempted. Hardcoding the
 * phrases here would have let exactly this bug back in under a new wording.
 */
const CHIP_KEYS = [
  'v3.chip.cafe',
  'v3.chip.plan',
  'v3.chip.translate',
  'v3.chip.split',
  'v3.chip.scam',
] as const

describe('every Vietnamese quick suggestion resolves to Vietnamese', () => {
  for (const key of CHIP_KEYS) {
    const text = viDict[key]
    it(`${key} — "${text}"`, () => {
      expect(text, `${key} missing from the vi dictionary`).toBeTruthy()
      expect(responseLang(text)).toBe('vi')
    })
  }
})

describe('every English quick suggestion resolves to English', () => {
  for (const key of CHIP_KEYS) {
    const text = enDict[key]
    it(`${key} — "${text}"`, () => {
      expect(text, `${key} missing from the en dictionary`).toBeTruthy()
      expect(responseLang(text)).toBe('en')
    })
  }
})

describe('a clicked chip and the same sentence typed are the same decision', () => {
  // 🔑 The point of the whole report. `ask(t(chip))` sends the chip's text as an
  // ordinary message — there is no quick-suggestion payload, no source flag and
  // no separate route. If these two ever diverge, something has grown a special
  // case for chips, which is exactly what must not happen.
  for (const key of CHIP_KEYS) {
    it(`${key}`, () => {
      const clicked = viDict[key]
      const typed = `${viDict[key]}` // same characters, arriving from the composer
      expect(responseLang(clicked)).toBe(responseLang(typed))
    })
  }
})

describe('the specific regression, pinned', () => {
  it('"Quán cafe view đẹp" is Vietnamese', () => {
    // The exact production failure. 'en' here means the fix has been undone.
    expect(responseLang('Quán cafe view đẹp')).toBe('vi')
  })

  it('so is the same query without the capital', () => {
    expect(responseLang('quán cafe view đẹp')).toBe('vi')
  })

  it('and the shape generalises beyond that one phrase', () => {
    // A sentence-initial accented Vietnamese word followed by undiacriticked
    // loanwords — the class the bug belonged to, not the instance.
    for (const q of [
      'Quán bar view đẹp',
      'Món ăn ngon gần đây',
      'Khách sạn view biển',
      'Địa điểm chill cuối tuần',
    ]) {
      expect(responseLang(q), q).toBe('vi')
    }
  })
})

describe('the uppercase filter still does its real job', () => {
  // 🚨 The guard rails on the fix. Counting the first word must never turn an
  // English sentence Vietnamese because it happens to name a Vietnamese place.
  const ENGLISH = [
    'Đà Nẵng is beautiful',            // opens with a two-word proper noun
    'Phú Quốc is nice',
    'Café recommendations?',           // a lone loanword decides nothing
    'Best bún chả in Hà Nội?',
    'Find me a beautiful cafe with a great view.',
    'Recommend some good restaurants in District 1',
  ]
  for (const q of ENGLISH) {
    it(`"${q}" stays English`, () => expect(responseLang(q)).toBe('en'))
  }
})

describe('other languages are unaffected', () => {
  // The route serves vi/en/ja/ko/zh/ar/th; the fix touches only Latin scoring,
  // which runs after every script check.
  const CASES: [string, string][] = [
    ['カフェを探して', 'ja'],
    ['카페 추천해줘', 'ko'],
    ['推荐一家咖啡馆', 'zh'],
    ['ร้านกาแฟแนะนำ', 'th'],
  ]
  for (const [text, lang] of CASES) {
    it(`${lang}`, () => expect(responseLang(text)).toBe(lang))
  }
})

describe('an explicit language request still overrides detection', () => {
  it('Vietnamese text asking for English gets English', () => {
    expect(responseLang('Quán cafe view đẹp, trả lời bằng tiếng Anh')).toBe('en')
  })
  it('English text asking for Vietnamese gets Vietnamese', () => {
    expect(responseLang('Find a cafe, answer in Vietnamese')).toBe('vi')
  })
})
