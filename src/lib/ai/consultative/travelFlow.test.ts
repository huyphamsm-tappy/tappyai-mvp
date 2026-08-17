import { describe, it, expect } from 'vitest'
import { extractBudget } from '../budget'
import { detectLang, detectPlanningIntent } from '../intent'
import { deriveNeedProfile } from './needProfile'
import { detectTransportMode, resolveTripContext } from './tripContext'

// ── Travel Consultative flow — BUDGET-* and FLOW-01…10 ─────────────────────
//
// The owner's product flow:
//
//   understand trip → advise destination → ASK TRANSPORT MODE → discovery
//   → compare / trade-off → Pick → real external link → user books → refine
//
// Two things this file locks down:
//
//   1. The bare budget form. "ngân sách 5 triệu" is the most natural Vietnamese
//      phrasing and the one in the owner's own example, and extractBudget
//      returned null for it — so the 5-triệu constraint never reached the prompt
//      budget block, applyBudgetFilter, or the ranker.
//   2. "Ask which transport mode" as DETERMINISTIC state, not prompt luck.
//      Whether to ask is decided by backend code; the prompt only phrases it.

const M = 1_000_000

// ── Task 1 — bare budget ──────────────────────────────────────────────────
describe('BUDGET-BARE — the bare "ngân sách N" / "budget N" form', () => {
  it('BUDGET-BARE-VI-01: "ngân sách 5 triệu"', () => {
    const b = extractBudget('ngân sách 5 triệu')
    expect(b).not.toBeNull()
    expect(b!.max).toBe(5 * M)
  })

  it('BUDGET-BARE-VI-02: "ngân sách 5 triệu đồng"', () => {
    expect(extractBudget('ngân sách 5 triệu đồng')!.max).toBe(5 * M)
  })

  it('handles 10 triệu, with and without đồng', () => {
    expect(extractBudget('ngân sách 10 triệu')!.max).toBe(10 * M)
    expect(extractBudget('ngân sách 10 triệu đồng')!.max).toBe(10 * M)
  })

  it('BUDGET-BARE-EN-01: "budget 5 million"', () => {
    expect(extractBudget('budget 5 million')!.max).toBe(5 * M)
  })

  it('handles "budget of 5 million" and "my budget is 5 million"', () => {
    expect(extractBudget('budget of 5 million')!.max).toBe(5 * M)
    expect(extractBudget('my budget is 5 million')!.max).toBe(5 * M)
  })

  it('a bare budget is a CEILING, not a midpoint', () => {
    const b = extractBudget('ngân sách 5 triệu')!
    expect(b.type).toBe('under')
    expect(b.min).toBe(0)
  })

  it('an explicit qualifier still wins — "khoảng" keeps its ±20% band', () => {
    // The existing markers must not be shadowed by the new bare form.
    const b = extractBudget('ngân sách khoảng 5 triệu')!
    expect(b.type).toBe('around')
    expect(b.max).toBe(6 * M)
  })

  it('supports k as well as triệu', () => {
    expect(extractBudget('ngân sách 500k')!.max).toBe(500_000)
  })

  // ── Found by LIVE Shopping acceptance, 2026-08-17 ─────────────────────────
  //
  // A refinement turn worded "Thôi ngân sách tối đa của mình là 20 triệu"
  // extracted NO budget, so the narrowed constraint was silently ignored and the
  // recommendation never changed. Two rules both just missed it:
  //   underRe  — "toi da" must be immediately followed by the number, but here
  //              "cua minh la" sits between them.
  //   bareRe   — only allowed `of|is|la` between the keyword and the number.
  // The keyword anchor plus the required unit is what keeps a bounded gap safe.
  it('handles words between the budget keyword and the amount', () => {
    expect(extractBudget('Thôi ngân sách tối đa của mình là 20 triệu')!.max).toBe(20 * M)
    expect(extractBudget('ngân sách tối đa là 15 triệu')!.max).toBe(15 * M)
    expect(extractBudget('my maximum budget is 20 million')!.max).toBe(20 * M)
    expect(extractBudget('budget for this trip is 5 triệu')!.max).toBe(5 * M)
  })

  it('the bounded gap still cannot swallow an unrelated number', () => {
    // The unit requirement is the guard: "2 người" has no money unit, so the
    // match keeps expanding until it finds the real amount.
    expect(extractBudget('ngân sách cho 2 người là 20 triệu')!.max).toBe(20 * M)
    // …and with no amount at all, still nothing.
    expect(extractBudget('ngân sách cho 2 người')).toBeNull()
  })

  it('does not reach across a sentence boundary', () => {
    expect(extractBudget('Mình chưa rõ ngân sách. Chuyến đi 3 ngày.')).toBeNull()
  })
})

describe('BUDGET-CONTEXT — numbers that are NOT money stay out', () => {
  it('BUDGET-CONTEXT-01: "Đà Nẵng 3 ngày" is not a 3 budget', () => {
    expect(extractBudget('Đà Nẵng 3 ngày')).toBeNull()
  })

  it('BUDGET-CONTEXT-02: "2 người" is not a 2 budget', () => {
    expect(extractBudget('2 người')).toBeNull()
  })

  it('"đi 5 ngày" is not a 5 budget', () => {
    expect(extractBudget('đi 5 ngày')).toBeNull()
  })

  it('a bare number after "budget" with NO unit is refused', () => {
    // "budget 5" is ambiguous — 5 what? Requiring a unit is what keeps
    // "3 ngày" and "2 người" out.
    expect(extractBudget('budget 5')).toBeNull()
    expect(extractBudget('ngân sách 5')).toBeNull()
  })

  it('never throws on odd input', () => {
    for (const s of ['', '   ', 'ngân sách', 'budget', 'ngân sách abc']) {
      expect(() => extractBudget(s)).not.toThrow()
    }
  })
})

// ── FLOW-01 / FLOW-05 — the owner's exact examples ────────────────────────
const VI_TRIP = 'Tôi muốn đi Đà Nẵng 3 ngày, ngân sách 5 triệu, đi từ TP.HCM'
const EN_TRIP = 'I want to go to Da Nang for 3 days, budget 5 million VND, from Ho Chi Minh City.'

describe('FLOW-01 — the Vietnamese trip request is fully understood', () => {
  const ctx = resolveTripContext([{ role: 'user', content: VI_TRIP }])

  it('language is Vietnamese', () => expect(detectLang(VI_TRIP)).toBe('vi'))
  it('trip intent is recognised', () => expect(detectPlanningIntent(VI_TRIP)).toBe('trip'))
  it('destination = Da Nang', () => expect(ctx.destination).toBe('da nang'))
  it('duration = 3 days', () => expect(ctx.durationDays).toBe(3))
  it('origin = Ho Chi Minh City', () => expect(ctx.origin).toBe('ho chi minh'))
  it('budget = 5,000,000 VND', () => expect(extractBudget(VI_TRIP)!.max).toBe(5 * M))

  it('the budget survives into the Consultative profile', () => {
    const p = deriveNeedProfile([{ role: 'user', content: VI_TRIP }])
    expect(p.budgetStated).toBe(5 * M)
    expect(p.budget!.max).toBe(5 * M)
  })
})

describe('FLOW-05 — the English equivalent is understood identically', () => {
  const ctx = resolveTripContext([{ role: 'user', content: EN_TRIP }])

  it('language is English', () => expect(detectLang(EN_TRIP)).toBe('en'))
  it('destination = Da Nang', () => expect(ctx.destination).toBe('da nang'))
  it('duration = 3 days', () => expect(ctx.durationDays).toBe(3))
  it('origin = Ho Chi Minh City', () => expect(ctx.origin).toBe('ho chi minh'))
  it('budget = 5,000,000', () => expect(extractBudget(EN_TRIP)!.max).toBe(5 * M))
  it('VI and EN agree on every trip fact', () => {
    const vi = resolveTripContext([{ role: 'user', content: VI_TRIP }])
    expect({ d: ctx.destination, o: ctx.origin, n: ctx.durationDays })
      .toEqual({ d: vi.destination, o: vi.origin, n: vi.durationDays })
  })
})

// ── Task 3 — the deterministic transport-mode stage ───────────────────────
describe('detectTransportMode — both languages', () => {
  for (const [text, mode] of [
    ['Máy bay', 'flight'], ['máy bay nhé', 'flight'], ['Tôi muốn bay', 'flight'],
    ['Xe khách', 'bus'], ['đi xe khách', 'bus'], ['xe giường nằm', 'bus'],
    ['Flight', 'flight'], ['I want to fly', 'flight'], ['by plane', 'flight'],
    ['Bus', 'bus'], ['by coach', 'bus'], ["I'd rather take a coach", 'bus'],
  ] as const) {
    it(`"${text}" → ${mode}`, () => expect(detectTransportMode(text)).toBe(mode))
  }

  it('returns null when no mode is named', () => {
    for (const t of ['Tôi muốn đi Đà Nẵng', 'I want a restaurant', 'ok', '']) {
      expect(detectTransportMode(t)).toBeNull()
    }
  })
})

describe('FLOW-02 — Tappy asks once the trip is understood and no mode is chosen', () => {
  const ctx = resolveTripContext([{ role: 'user', content: VI_TRIP }])

  it('the question is due', () => expect(ctx.shouldAskTransportMode).toBe(true))
  it('no mode is selected yet', () => expect(ctx.mode).toBeNull())
  it('the trip is recognised', () => expect(ctx.isTrip).toBe(true))

  it('is NOT due when the destination is unknown', () => {
    const noDest = resolveTripContext([{ role: 'user', content: 'Tôi muốn đi du lịch 3 ngày' }])
    expect(noDest.shouldAskTransportMode).toBe(false)
  })
})

describe('FLOW-03 / FLOW-04 — the user answers, and is not asked twice', () => {
  const afterAnswer = (answer: string) => resolveTripContext([
    { role: 'user', content: VI_TRIP },
    { role: 'assistant', content: 'Bạn muốn đi máy bay hay xe khách?' },
    { role: 'user', content: answer },
  ])

  it('FLOW-03: "Máy bay" → flight, question not repeated', () => {
    const ctx = afterAnswer('Máy bay')
    expect(ctx.mode).toBe('flight')
    expect(ctx.shouldAskTransportMode).toBe(false)
  })

  it('FLOW-04: "Xe khách" → bus, question not repeated', () => {
    const ctx = afterAnswer('Xe khách')
    expect(ctx.mode).toBe('bus')
    expect(ctx.shouldAskTransportMode).toBe(false)
  })

  it('the trip facts survive the answer turn', () => {
    const ctx = afterAnswer('Máy bay')
    expect(ctx.destination).toBe('da nang')
    expect(ctx.durationDays).toBe(3)
    expect(ctx.origin).toBe('ho chi minh')
  })
})

describe('FLOW-06 / FLOW-07 — English answers', () => {
  const afterAnswer = (answer: string) => resolveTripContext([
    { role: 'user', content: EN_TRIP },
    { role: 'assistant', content: 'Would you prefer to fly or travel by coach?' },
    { role: 'user', content: answer },
  ])

  it("FLOW-06: \"I'd prefer to fly.\" → flight, no repeat", () => {
    const ctx = afterAnswer("I'd prefer to fly.")
    expect(ctx.mode).toBe('flight')
    expect(ctx.shouldAskTransportMode).toBe(false)
  })

  it("FLOW-07: \"I'd rather take a coach.\" → bus, no repeat", () => {
    const ctx = afterAnswer("I'd rather take a coach.")
    expect(ctx.mode).toBe('bus')
    expect(ctx.shouldAskTransportMode).toBe(false)
  })
})

describe('FLOW-08 — a mode stated up front is never re-asked', () => {
  it('VI: "Tôi muốn đi máy bay tới Đà Nẵng"', () => {
    const ctx = resolveTripContext([{ role: 'user', content: 'Tôi muốn đi máy bay tới Đà Nẵng 3 ngày' }])
    expect(ctx.mode).toBe('flight')
    expect(ctx.shouldAskTransportMode).toBe(false)
  })

  it('EN: "I want to fly to Da Nang."', () => {
    const ctx = resolveTripContext([{ role: 'user', content: 'I want to fly to Da Nang for 3 days' }])
    expect(ctx.mode).toBe('flight')
    expect(ctx.shouldAskTransportMode).toBe(false)
  })
})

describe('FLOW-09 — a non-trip request never triggers the question', () => {
  for (const t of [
    'I want a restaurant in Da Nang',
    'Gợi ý quán ăn ngon ở Đà Nẵng',
    'Thời tiết Đà Nẵng hôm nay thế nào?',
    'Giá vàng hôm nay',
  ]) {
    it(`"${t}" does not ask about transport`, () => {
      expect(resolveTripContext([{ role: 'user', content: t }]).shouldAskTransportMode).toBe(false)
    })
  }
})

describe('FLOW-10 — a later turn changes the mode, with no stale preference', () => {
  const msgs = [
    { role: 'user', content: 'Đi Đà Nẵng, tôi muốn đi máy bay.' },
    { role: 'assistant', content: 'Đây là vài chuyến bay.' },
    { role: 'user', content: 'Thôi, tôi muốn tiết kiệm, đi xe khách.' },
  ]

  it('turn 1 is flight', () => {
    expect(resolveTripContext([msgs[0]]).mode).toBe('flight')
  })

  it('turn 3 switches to bus — the latest choice wins', () => {
    expect(resolveTripContext(msgs).mode).toBe('bus')
  })

  it('and the question is not re-asked after the switch', () => {
    expect(resolveTripContext(msgs).shouldAskTransportMode).toBe(false)
  })

  it('the destination survives the switch', () => {
    expect(resolveTripContext(msgs).destination).toBe('da nang')
  })
})

describe('the stage is deterministic and safe', () => {
  it('same messages, same result', () => {
    const m = [{ role: 'user', content: VI_TRIP }]
    expect(resolveTripContext(m)).toEqual(resolveTripContext(m))
  })

  it('never throws on degenerate input', () => {
    for (const m of [[], [{ role: 'assistant', content: 'hi' }], [{ role: 'user', content: '' }]]) {
      expect(() => resolveTripContext(m as Array<{ role: string; content: string }>)).not.toThrow()
    }
  })

  it('reads USER turns only — an assistant mention of "máy bay" selects nothing', () => {
    const ctx = resolveTripContext([
      { role: 'user', content: VI_TRIP },
      { role: 'assistant', content: 'Bạn muốn đi máy bay hay xe khách?' },
    ])
    expect(ctx.mode).toBeNull()
    expect(ctx.shouldAskTransportMode).toBe(true)
  })
})
