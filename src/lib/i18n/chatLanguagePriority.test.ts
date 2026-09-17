import { describe, it, expect } from 'vitest'
import { detectLang, detectLangConfident, detectExplicitLangRequest } from '@/lib/ai/intent'
import { requestLocale } from '@/lib/i18n/requestLocale'

/**
 * The rule `/api/chat` applies when choosing the language it answers in:
 *
 *   explicit request  >  the language the message is CLEARLY in  >  product locale  >  detection
 *
 * The middle two are what make this work for a Vietnamese-first product. Locale alone would answer
 * a plainly English question in Vietnamese; text detection alone answers diacritic-free Vietnamese
 * in English, because `detectLang` must always return something and scores it as English.
 * `detectLangConfident` reports only what the text settles, so the locale decides the rest.
 */
const pick = (text: string, header: string | null) => {
  const req = { headers: { get: (k: string) => (k === 'accept-language' ? header : null) } }
  return detectExplicitLangRequest(text)
    ?? detectLangConfident(text)
    ?? requestLocale(req as never)
    ?? detectLang(text)
}

describe('chat response language priority', () => {
  it('1. Vietnamese locale + accented Vietnamese stays Vietnamese', () => {
    expect(pick('Quán bún bò ngon ở TP.HCM?', 'vi-VN')).toBe('vi')
    expect(pick('Tìm cho tôi một quán cafe yên tĩnh', 'vi-VN')).toBe('vi')
  })

  it('2. Vietnamese locale + diacritic-free Vietnamese stays Vietnamese', () => {
    // The regression this whole change exists for. detectLang alone says English.
    expect(detectLang('Tim quan bun bo ngon o TPHCM')).toBe('en')
    expect(detectLangConfident('Tim quan bun bo ngon o TPHCM')).toBeNull()
    expect(pick('Tim quan bun bo ngon o TPHCM', 'vi-VN')).toBe('vi')
  })

  it('3. Vietnamese locale + a clear English question answers in English', () => {
    expect(pick('What is the best laptop under 20 million?', 'vi-VN')).toBe('en')
    expect(pick('Can you find me a quiet cafe with a good view?', 'vi-VN')).toBe('en')
  })

  it('4. Vietnamese locale + an explicit English request answers in English', () => {
    expect(pick('Trả lời bằng tiếng Anh: tìm cho tôi một quán cafe', 'vi-VN')).toBe('en')
    expect(pick('Answer in English please', 'vi-VN')).toBe('en')
  })

  it('5. English locale + a clear Vietnamese question answers in Vietnamese', () => {
    expect(pick('Quán cà phê nào yên tĩnh ở Hà Nội?', 'en-US')).toBe('vi')
  })

  it('6. ambiguous or short input falls to the product locale', () => {
    expect(pick('ok', 'vi-VN')).toBe('vi')
    expect(pick('ok', 'en-US')).toBe('en')
    expect(pick('cafe', 'vi-VN')).toBe('vi')
  })

  it('7. a brand or provider name never decides the language', () => {
    for (const brand of ['Shopee', 'TikTok Shop', 'Booking.com', 'Grab', 'Google Maps']) {
      expect(detectLangConfident(brand)).toBeNull()
      expect(pick(brand, 'vi-VN')).toBe('vi')
    }
  })

  it('a single English loanword does not flip a Vietnamese turn', () => {
    // "best", "view", "cafe" appear constantly inside ordinary Vietnamese sentences.
    expect(pick('quan cafe view dep nhat o Da Lat', 'vi-VN')).toBe('vi')
  })

  it('a caller that sends no locale at all is still Vietnamese-first', () => {
    // `requestLocale` already defaults to 'vi', so the fourth step (`detectLang`) is a defensive
    // tail rather than a reachable branch here. Pinning that: a header-less request must not fall
    // through to a heuristic that reads ordinary Vietnamese as English.
    expect(pick('Tim quan bun bo ngon o TPHCM', null)).toBe('vi')
  })

  it('a short English imperative is NOT confident enough to override the locale', () => {
    // Deliberate and conservative. "find me a quiet cafe" carries too few English function words
    // to clear the bar, so a Vietnamese-locale user still gets Vietnamese. Loosening the threshold
    // to catch it would risk the regression this exists to prevent — diacritic-free Vietnamese
    // reading as English — and answering a Vietnamese user in Vietnamese is the safer miss.
    expect(detectLangConfident('find me a quiet cafe')).toBeNull()
    expect(pick('find me a quiet cafe', 'vi-VN')).toBe('vi')
    // A fuller English sentence does clear it.
    expect(pick('What is the best laptop under 20 million?', 'vi-VN')).toBe('en')
  })
})
