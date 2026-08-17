import { describe, it, expect } from 'vitest'
import { detectLang, detectExplicitLangRequest } from './intent'
import { buildSystem, buildSystemSimple, buildPlanningBlock } from './promptBuilder'

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

  it('the override teaches by shape, never by a concrete example in one fixed language', () => {
    // This is what kept the TOOL path in English after the first fix. Rule 2 handed the model
    // four English CTA labels right after telling it to write in Vietnamese; a concrete example
    // in a fixed language beats an abstract instruction, which this codebase already learned at
    // buildPlanningBlock in 2026-07-30 and solved with neutral bracketed descriptions.
    //
    // Asserted for EVERY language: an English exemplar is only invisible when the target
    // language happens to be English.
    const ENGLISH_EXEMPLARS = ['Find on Shopee', 'View on Maps', 'Book - Place Name', 'Booking.com']
    for (const lang of LANGS) {
      const { dynamic } = buildSystem(null, 'unknown', true, '', lang, '', null, null, false)
      const override = dynamic.slice(
        dynamic.indexOf('CRITICAL LANGUAGE OVERRIDE'),
        dynamic.indexOf('=========================================================='),
      )
      for (const exemplar of ENGLISH_EXEMPLARS) {
        expect(override, `${lang}: override shows the English exemplar "${exemplar}"`).not.toContain(exemplar)
      }
    }
  })

  it('never instructs a Vietnamese turn to answer in English', () => {
    // The precise landmine: LANG_NAMES had no `vi` entry, and every read site is
    // `LANG_NAMES[lang] || 'English'`. Unguarded, a Vietnamese turn would have been told to
    // reply in English — the defect, but louder.
    const { dynamic } = buildSystem(null, 'unknown', true, '', 'vi', '', null, null, false)
    expect(dynamic).not.toContain('User is writing in English.')
    expect(buildSystemSimple('vi')).not.toContain('The user is writing in English.')
  })
})

// ── Consultative V2 additions ──────────────────────────────────────────────
// Brought forward from the consultative branch. The reproduction gate above is
// the record of the production defect; these assert the surrounding contract:
// where the directive lives, that it never demonstrates another language, and
// that the cache-stable segment is unaffected by any of it.

const toolPath = (lang: string) =>
  buildSystem(null, 'unknown', true, '', lang, '', null, null, false)

describe('LANG-01 — a Vietnamese tool-path turn carries a Vietnamese directive', () => {
  const vi = toolPath('vi')

  it('the override block is present for Vietnamese, not only for other languages', () => {
    expect(vi.dynamic).toContain('CRITICAL LANGUAGE OVERRIDE')
  })

  it('it names Vietnamese — never "English" via the || fallback', () => {
    // LANG_NAMES[lang] || 'English' means a missing `vi` key does not merely omit
    // the directive: it would instruct the model to answer Vietnamese IN ENGLISH.
    expect(vi.dynamic).toContain('Vietnamese')
    expect(vi.dynamic).not.toMatch(/User is writing in English/)
  })

  it('the directive lives in `dynamic`, never in the cached `shared`', () => {
    expect(vi.shared).not.toContain('CRITICAL LANGUAGE OVERRIDE')
  })
})

describe('LANG-01 — the override must not DEMONSTRATE another language', () => {
  it('carries no concrete English label examples, for any language', () => {
    // The measured root cause. Concrete examples in a fixed language beat the
    // instruction above them — the same lesson buildPlanningBlock records from
    // 2026-07-30. The rule must describe SHAPE, never show English.
    for (const lang of ['vi', 'en', 'ja', 'ko']) {
      const block = toolPath(lang).dynamic
      const override = block.slice(block.indexOf('CRITICAL LANGUAGE OVERRIDE'), block.indexOf('=========================================='))
      for (const shown of ['Find on Shopee', 'View on Maps', 'Book - Place Name']) {
        expect(override, `"${shown}" is a concrete English example inside the override (lang=${lang})`)
          .not.toContain(shown)
      }
    }
  })
})

describe('LANG-02 — the whole tool-path assembly, VI in → VI directive out', () => {
  // The route computes `lang` from the user's LATEST message only, then hands it
  // to buildSystem. This walks that path for real Vietnamese requests that reach
  // the tool path (place/food requests — not chitchat).
  const VI_TOOL_REQUESTS = [
    'Trưa mai mình muốn tìm quán cơm tấm ngon gần chợ Bến Thành',
    'Cuối tuần này mình muốn dẫn mẹ đi ăn bún chả ở khu Hoàn Kiếm',
    'Gợi ý giúp mình vài quán cà phê yên tĩnh ở Quận 1 để ngồi làm việc',
    'Tìm khách sạn gần biển ở Đà Nẵng dưới 2 triệu một đêm giúp mình',
  ]

  for (const request of VI_TOOL_REQUESTS) {
    it(`"${request.slice(0, 40)}…" → vi → Vietnamese directive`, () => {
      const lang = detectExplicitLangRequest(request) ?? detectLang(request)
      expect(lang, 'language detection has never been the defect').toBe('vi')
      const built = buildSystem(null, 'unknown', true, '', lang, '', null, null, false)
      expect(built.dynamic).toContain('CRITICAL LANGUAGE OVERRIDE')
      expect(built.dynamic).toContain('Vietnamese')
    })
  }

  it('an English request still gets an English directive — no over-correction', () => {
    const en = toolPath('en')
    expect(en.dynamic).toContain('CRITICAL LANGUAGE OVERRIDE')
    expect(en.dynamic).toContain('English')
    expect(en.dynamic).not.toContain('Vietnamese')
  })

  it('every other language keeps its own directive', () => {
    for (const [code, name] of [['ja', 'Japanese'], ['ko', 'Korean'], ['zh', 'Chinese'], ['th', 'Thai']] as const) {
      expect(toolPath(code).dynamic).toContain(name)
    }
  })
})

describe('the chitchat path keeps the directive it was fixed with', () => {
  it('Vietnamese gets both the opening directive and the trailing reminder', () => {
    const vi = buildSystemSimple('vi', '')
    expect(vi).toContain('Vietnamese')
    expect(vi).toMatch(/REMINDER: reply in Vietnamese only/)
  })

  it('English is unaffected', () => {
    const en = buildSystemSimple('en', '')
    expect(en).toContain('English')
    expect(en).not.toContain('Vietnamese')
  })
})

describe('the planning block — current behaviour, recorded not changed', () => {
  it('other languages get a trailing language reminder', () => {
    expect(buildPlanningBlock('trip', 'en')).toContain('English')
  })

  // OPEN, DELIBERATELY NOT FIXED HERE.
  //
  // buildPlanningBlock still gates its reminder on `lang !== 'vi'`, so a Vietnamese
  // trip plan gets NO reminder at the position the file's own comment calls
  // load-bearing ("the spot the model reads immediately before generating"). The
  // same gap exists on production `main`.
  //
  // It is NOT fixed here because (a) it does not reproduce — the defect this step
  // was asked to root-cause is closed on production, and (b) closing it needs
  // REWORDING, not ungating: the existing sentence reads "PHAI viet bang ${langName}
  // — KHONG dung tieng Viet", which is self-contradictory when langName IS
  // Vietnamese. Changing prompt text with no reproduced defect is the "blindly
  // strengthen the prompt" move this step forbids. Reported for an owner decision.
  it('currently emits no reminder for Vietnamese — documented, pending owner decision', () => {
    expect(buildPlanningBlock('trip', 'vi')).not.toMatch(/NGON NGU/)
  })
})

describe('the cache contract survives the language fix', () => {
  it('`shared` is byte-identical across every language', () => {
    const ref = toolPath('vi').shared
    for (const lang of ['en', 'ja', 'ko', 'zh', 'ar', 'th']) {
      expect(toolPath(lang).shared).toBe(ref)
    }
  })
})
