import { describe, it, expect } from 'vitest'
import { detectLang, detectLangConfident } from './intent'

// ─────────────────────────────────────────────────────────────────────────────
// NO-DIACRITIC VIETNAMESE IS VIETNAMESE.
//
// Measured 2026-09-18 on the branch: 13 of 14 undiacriticked Vietnamese queries a phone user
// actually types ("tim quan an toi ngon gan quan 1 cho 2 nguoi") detected as ENGLISH, because
// the detector's only Vietnamese evidence was accented letters plus a 30-word function list.
// Consultative V1 (docs/audit/consultative-v1-design.md §2): after diacritic folding, count
// Vietnamese words that have no English homograph; two or more, outnumbering the English
// function words, is Vietnamese. Genuinely English text is unchanged.
// ─────────────────────────────────────────────────────────────────────────────

const VI_NO_DIACRITICS = [
  'Tim quan an toi ngon gan Quan 1 cho 2 nguoi',
  'quan cafe chill gan day',
  'cho toi 3 quan bun bo ngon o q1',
  'spa nao tot re o Da Nang',
  'mua tai nghe bluetooth duoi 1tr',
  'tim phong khach san da nang 2 dem',
  'di choi toi nay o dau vui',
  'cho 2 nguoi budget 500k',
  'quan nay co gi ngon',
  'ok chon quan dau tien',
  'con quan nao khac ko',
  'xem phim gi hay toi nay',
  'gan day co gi an vat ngon',
  'toi nay an gi',
  'quan nao yen tinh de hen ho',
]

const EN_OR_MIXED = [
  'best pho in district 1',
  'Café recommendations?',
  'Is Đà Nẵng beautiful in September',
  'where can I find good banh mi near me',
  'recommend a spa in Hanoi',
  'what is the weather in Saigon today',
  'cheap hotels near Ben Thanh market',
  'Phú Quốc is nice',
  'show me sushi places',
  'any good rooftop bars around here',
  'I want to buy a laptop under 20 million',
  'how do I get from Hanoi to Sapa',
  'find a quiet cafe for a date',
  'best seafood for 2 people tonight',
  'help me plan a weekend trip',
]

describe('detectLang — undiacriticked Vietnamese', () => {
  it.each(VI_NO_DIACRITICS)('"%s" is vi', (text) => {
    expect(detectLang(text)).toBe('vi')
  })
  it.each(EN_OR_MIXED)('"%s" stays en', (text) => {
    expect(detectLang(text)).toBe('en')
  })
  it('accented Vietnamese is still vi, and the sentence-initial rule still holds', () => {
    expect(detectLang('Quán cafe view đẹp')).toBe('vi')
    expect(detectLang('Tìm quán ăn tối ngon gần Quận 1 cho 2 người')).toBe('vi')
  })
})

describe('detectLangConfident — confident on clearly undiacriticked Vietnamese, silent on doubt', () => {
  it('a long undiacriticked Vietnamese query is confidently vi', () => {
    expect(detectLangConfident('Tim quan an toi ngon gan Quan 1 cho 2 nguoi')).toBe('vi')
    expect(detectLangConfident('cho toi 3 quan bun bo ngon o q1')).toBe('vi')
  })
  it('two words are not enough to be confident either way', () => {
    expect(detectLangConfident('quan nay')).toBeNull()
    expect(detectLangConfident('ok chon')).toBeNull()
  })
  it('English stays out of the confident-vi path', () => {
    expect(detectLangConfident('best pho in district 1')).not.toBe('vi')
    expect(detectLangConfident('find a quiet cafe for a date')).not.toBe('vi')
  })
})
