import { describe, it, expect } from 'vitest'
import { detectLang, detectExplicitLangRequest } from './intent'

// Vietnamese short consultative queries must resolve to Vietnamese.
//
// Production, real Web UI, UI language Vietnamese: "Cafe view đẹp Hà Nội?" answered in English.
// Measured inside the route: words=5, accentedWords=3, lowercaseAccentedWords=1, ratio=0.200,
// threshold=0.4 → 'en'. The detector did exactly what it was written to do; the scoring is what
// is wrong for the way people actually search.
//
// Two effects compound, and only on SHORT queries — which is why every earlier corpus of long
// conversational sentences passed and hid this:
//
//   1. Loanwords in ordinary Vietnamese use carry no diacritics ("cafe", "view", "homestay").
//   2. Accented PROPER NOUNS are dropped from the numerator by the uppercase filter, yet still
//      counted in the denominator — so "Hà Nội" actively drags the score DOWN despite being
//      unambiguously Vietnamese evidence.
//
// A long sentence has enough lowercase accented words to absorb both. A five-word search query
// does not.
//
// The controls matter as much as the corpus: the fix must not start calling English text
// Vietnamese, and must not disturb explicit language requests.

/** The composed decision the chat route makes (route.ts:100). */
const decide = (text: string) => detectExplicitLangRequest(text) ?? detectLang(text)

describe('short Vietnamese consultative queries are Vietnamese', () => {
  const VI_SHORT = [
    'Cafe view đẹp Hà Nội?',            // the exact production failure
    'Quán ăn ngon Đà Nẵng?',
    'Khách sạn đẹp Nha Trang?',
    'Quán cà phê đẹp ở Hội An?',
    'Homestay view biển Phú Quốc?',
  ]
  for (const q of VI_SHORT) {
    it(`"${q}"`, () => expect(decide(q)).toBe('vi'))
  }
})

describe('longer Vietnamese consultative queries stay Vietnamese', () => {
  const VI_LONG = [
    'Tìm nhà hàng ngon ở Vũng Tàu',
    'Gợi ý khách sạn đẹp ở Sa Pa',
    'Chỗ nào bán bánh xèo ngon ở Cần Thơ?',
  ]
  for (const q of VI_LONG) {
    it(`"${q}"`, () => expect(decide(q)).toBe('vi'))
  }
})

describe('Vietnamese chitchat stays Vietnamese', () => {
  it('"Ê bạn ơi, dạo này khoẻ không?"', () =>
    expect(decide('Ê bạn ơi, dạo này khoẻ không?')).toBe('vi'))
})

describe('English is still English', () => {
  // The risk of any numerator change is over-claiming Vietnamese. These hold the line.
  const EN = [
    'Recommend some good restaurants in District 1',
    'Hi, what can you help me with?',
    'Find a quiet hotel near the beach in Nha Trang',
    'Best coffee in Hanoi?',
  ]
  for (const q of EN) {
    it(`"${q}"`, () => expect(decide(q)).toBe('en'))
  }
})

describe('explicit language requests still win', () => {
  it('"Trả lời bằng tiếng Anh" → en', () => expect(decide('Trả lời bằng tiếng Anh')).toBe('en'))
  it('"Answer in English" → en', () => expect(decide('Answer in English')).toBe('en'))
  it('"Answer in Vietnamese" → vi', () => expect(decide('Answer in Vietnamese')).toBe('vi'))
})
