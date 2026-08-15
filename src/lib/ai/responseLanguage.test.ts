import { describe, it, expect } from 'vitest'
import { detectLang, detectExplicitLangRequest } from './intent'
import { buildSystem, buildSystemSimple } from './promptBuilder'

// REPRODUCTION GATE for the production defect found on 2026-08-15: a Vietnamese message came back
// in English from https://www.tappyai.com, three times out of three.
//
// The inputs below are the EXACT strings that were sent to production, not paraphrases. The
// language contract lives at src/app/api/chat/route.ts:96-100 — "Response language = the user's
// LATEST message… Never derived from UI locale, browser language" — implemented as
// `detectExplicitLangRequest(lastText) ?? detectLang(lastText)`. So this pair of functions is the
// whole decision, and if it says 'vi' the fault is downstream of it.

/** The composed decision the chat route actually makes. */
const decide = (text: string) => detectExplicitLangRequest(text) ?? detectLang(text)

describe('the production strings that came back in English', () => {
  const VI_INPUTS = [
    'Quán cà phê yên tĩnh ở Quận 1 TPHCM',
    'Chào bạn, bạn giúp được gì cho tôi?',
  ]

  for (const input of VI_INPUTS) {
    it(`"${input}" is detected as Vietnamese`, () => {
      expect(detectLang(input)).toBe('vi')
    })

    it(`"${input}" carries no explicit language request`, () => {
      // If this returned a code, it would override detection and could be the real cause.
      expect(detectExplicitLangRequest(input)).toBeNull()
    })

    it(`the route's composed decision for "${input}" is Vietnamese`, () => {
      expect(decide(input)).toBe('vi')
    })
  }

  it('the English control still resolves to English', () => {
    expect(decide('Hi, what can you help me with?')).toBe('en')
  })
})

describe('ordinary Vietnamese phrasings resolve to Vietnamese', () => {
  // Widened deliberately: whatever the root cause turns out to be, one fixed string is not a
  // guard. These are the shapes a Vietnamese user actually types.
  const CASES = [
    'Tìm quán ăn ngon gần đây',
    'Cho tôi vài gợi ý khách sạn ở Đà Nẵng',
    'Mua tai nghe Sony ở đâu rẻ?',
    'Thời tiết hôm nay thế nào?',
    'Giá iPhone 15 bao nhiêu tiền?',
    'Bạn có thể giúp tôi lên kế hoạch du lịch không?',
  ]
  for (const input of CASES) {
    it(`"${input}"`, () => expect(decide(input)).toBe('vi'))
  }
})

// ── The actual defect ────────────────────────────────────────────────────────
//
// Detection was never wrong. `decide()` returned 'vi' the whole time; the prompt simply never
// told the model. The instruction was emitted only when `lang !== 'vi'`, so the one language the
// product exists to serve was the one language never named — and the fallback it was supposed to
// rely on, "the Vietnamese defaults below", is a prompt body written in UNACCENTED Vietnamese
// under English headings. These assertions are on the prompt, because that is where the bug was.

const LANGS = ['vi', 'en', 'ja', 'ko', 'zh', 'ar', 'th'] as const
const NAMES: Record<string, string> = {
  vi: 'Vietnamese', en: 'English', ja: 'Japanese', ko: 'Korean',
  zh: 'Chinese', ar: 'Arabic', th: 'Thai',
}

describe('every language gets an explicit instruction, Vietnamese included', () => {
  for (const lang of LANGS) {
    it(`buildSystem names ${NAMES[lang]}`, () => {
      const { dynamic } = buildSystem(null, 'unknown', true, '', lang, '', null, null, false)
      expect(dynamic).toContain('CRITICAL LANGUAGE OVERRIDE')
      expect(dynamic).toContain(`User is writing in ${NAMES[lang]}.`)
      expect(dynamic).toContain(`Your ENTIRE response MUST be in ${NAMES[lang]} only`)
    })

    it(`buildSystemSimple names ${NAMES[lang]} up front and again at the end`, () => {
      const prompt = buildSystemSimple(lang)
      expect(prompt).toContain(`The user is writing in ${NAMES[lang]}.`)
      expect(prompt).toContain(`REMINDER: reply in ${NAMES[lang]} only.`)
      // The reminder is the last thing read before generating; if it drifts to the middle it
      // stops doing the job it was placed there for.
      expect(prompt.trimEnd().endsWith(`REMINDER: reply in ${NAMES[lang]} only.`)).toBe(true)
    })
  }

  it('never instructs a Vietnamese turn to answer in English', () => {
    // The precise landmine: LANG_NAMES had no `vi` entry, and every read site is
    // `LANG_NAMES[lang] || 'English'`. Unguarded, a Vietnamese turn would have been told to
    // reply in English — the defect, but louder.
    const { dynamic } = buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false)
    expect(dynamic).not.toContain('User is writing in English.')
    expect(buildSystemSimple('vi')).not.toContain('The user is writing in English.')
  })
})
