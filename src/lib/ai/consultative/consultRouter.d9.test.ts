// Phase 3A — D9 (domain-less input) and D2 (one clarification question per turn).
// Contract: docs/audit/PHASE-3-IMPLEMENTATION-SPECIFICATION.md 3A.9 "D9 rule text" and 3A.8. The router is deterministic: 0 LLM, 0 search.
import { describe, it, expect } from 'vitest'
import { routeConsult, detectAreas, hasExplicitPriority } from './consultRouter'
import { refineAsk } from './echoQuestion'
import { buildAskReply, type ConsultDecision } from './consultBrain'

const ctx = { hasGps: true, lang: 'vi' }
const route = (...texts: string[]) => routeConsult(texts.map(content => ({ role: 'user', content })), ctx)

describe('D9 — a domain is inferred only from an explicit lexical signal', () => {
  it('high-confidence signals name the domain (existing area lexicon, unchanged)', () => {
    expect(route('Muốn ăn phở quận 1 cho 2 người dưới 100k').decision.domains).toEqual(['food'])
    expect(route('mua laptop cho sinh viên').decision.domains).toEqual(['shopping'])
    expect(route('khách sạn Đà Nẵng gần biển').decision.domains).toEqual(['travel'])
    expect(route('Ăn trưa nay đi đâu nhỉ').decision.domains).toEqual(['food'])
  })
  it('two areas colliding with nothing that orders them stay UNSURE — never a silent pick of one', () => {
    const r = route('karaoke buffet')
    expect(detectAreas('karaoke buffet').conflict).toBe(true)
    expect(r.confidence).toBe('unsure')
  })
})

describe('D9 — state-only input with no domain: ONE deterministic question, nothing invented', () => {
  const STATE_ONLY = ['Ngân sách dưới 300k.', 'Giá quan trọng.', 'Muốn rẻ nhưng bắt buộc có mũ.', 'Giá không quan trọng, ưu tiên chất lượng.']

  for (const text of STATE_ONLY) {
    it(`"${text}" → one domain question, rules-sure, no retrieval`, () => {
      const r = route(text)
      expect(r.confidence).toBe('rule')
      const d = r.decision
      expect(d.turn).toBe('ask')
      expect(d.domains).toEqual([])
      expect(d.ask?.questions).toHaveLength(1)
      expect(d.ask?.questions[0].id).toBe('domain')
      expect(d.ask?.questions[0].options.length).toBeGreaterThanOrEqual(2)
      // nothing is invented, and nothing would be searched
      expect(d.query).toBeUndefined()
      expect(d.area).toBeUndefined()
      expect(d.known).toEqual({})
    })
  }

  it('no city, no date, no time, no area is ever set by the rule', () => {
    for (const text of STATE_ONLY) {
      const d = route(text).decision
      const blob = JSON.stringify(d).toLowerCase()
      for (const k of ['khu_vuc', 'thoi_gian', 'ngay', 'thanh_pho', 'diem_den']) expect(blob, `${text}: ${k}`).not.toContain(k)
      expect(d.assumptions).toEqual([])
    }
  })

  it('English wording of the state is covered by the same rule', () => {
    const d = route('budget under 300k').decision
    expect(d.turn).toBe('ask')
    expect(d.ask?.questions[0].q).toBe('Bạn đang muốn tìm gì?') // vi context; the en template is checked below
    expect(routeConsult([{ role: 'user', content: 'price is not important' }], { hasGps: true, lang: 'en' }).decision.ask?.questions[0].q).toBe('What are you looking for?')
  })

  it('is deterministic: three runs, one decision', () => {
    const runs = [1, 2, 3].map(() => JSON.stringify(route('Ngân sách dưới 300k.')))
    expect(new Set(runs).size).toBe(1)
  })

  it('the ask reply renders ONE question (structured and plain)', () => {
    const ask = route('Ngân sách dưới 300k.').decision.ask!
    const structured = buildAskReply(ask, { lang: 'vi', structured: true })
    expect(JSON.parse(structured.match(/\[TAPPY_ASK\]([\s\S]*?)\[\/TAPPY_ASK\]/)![1]).questions).toHaveLength(1)
    expect(buildAskReply(ask, { lang: 'vi', structured: false }).match(/•/g)).toHaveLength(1)
  })
})

describe('D9 — everything else with no domain is unchanged (the router invents nothing)', () => {
  it('a message with content words the lexicon does not know is left to the existing path (unsure chat)', () => {
    for (const s of ['Thuê xe máy giá rẻ', 'Sửa ống nước giá rẻ', 'Tìm thợ điện giá rẻ']) {
      const r = route(s)
      expect(r.decision.turn, s).toBe('chat')
      expect(r.decision.ask, s).toBeUndefined() // content words the state vocabulary does not know: NOT a state-only message
    }
    expect(route('Sửa ống nước giá rẻ').confidence).toBe('unsure')
  })
  it('a stated fact with no request is a state update, not a search trigger', () => {
    const d = route('Tôi ở Quận 3.').decision
    expect(d.turn).toBe('chat')
    expect(d.domains).toEqual([])
    expect(d.query).toBeUndefined()
    expect(d.ask).toBeUndefined()
  })
  it('household context alone is not decision state (D8): no domain question', () => {
    const d = route('Đi với bé 3 tuổi').decision
    expect(d.ask).toBeUndefined()
  })
  it('small talk never becomes a question', () => {
    for (const s of ['cảm ơn bạn', 'xin chào', 'hello']) expect(route(s).decision.turn, s).toBe('chat')
    for (const s of ['cảm ơn bạn', 'xin chào']) expect(route(s).decision.ask, s).toBeUndefined()
  })
  it('no retrieval is caused by an unsupported domain assumption: a domain-less decision is never a pick and carries no query', () => {
    for (const s of ['Ngân sách dưới 300k.', 'Giá quan trọng.', 'Tôi ở Quận 3.', 'Thuê xe máy giá rẻ', 'cảm ơn']) {
      const d = route(s).decision
      expect(d.domains, s).toEqual([])
      expect(d.turn === 'pick', s).toBe(false)
      expect(d.query, s).toBeUndefined()
    }
  })
})

describe('D9 — the answer re-reads the stated state; the budget is not lost', () => {
  it('"Ngân sách dưới 300k." → ask → "Ăn uống" is a pick in the FOOD area carrying the budget', () => {
    const ask = route('Ngân sách dưới 300k.').decision.ask!
    const r = routeConsult([
      { role: 'user', content: 'Ngân sách dưới 300k.' },
      { role: 'assistant', content: buildAskReply(ask, { lang: 'vi', structured: true }) },
      { role: 'user', content: 'Ăn uống' },
    ], ctx)
    expect(r.decision.domains).toEqual(['food'])
    expect(r.decision.turn).not.toBe('ask') // never asks twice
    expect(r.decision.known.ngan_sach).toMatch(/300k/)
  })
})

describe('D2 — exactly one clarification question per ask turn (final card), gate unchanged', () => {
  const finalAsk = (text: string): ConsultDecision | null => refineAsk(route(text).decision, [text], { localShop: false })

  it('a vague first turn the router would ask 2–3 questions for shows exactly ONE', () => {
    const raw = route('Cho tôi quán ăn ngon.').decision
    expect(raw.turn).toBe('ask')
    expect(raw.ask!.questions.length).toBeGreaterThanOrEqual(2) // the router still ranks its open questions (the gate)
    const shown = finalAsk('Cho tôi quán ăn ngon.')
    expect(shown?.turn).toBe('ask')
    expect(shown?.ask?.questions).toHaveLength(1)
    expect(shown?.ask?.questions[0].id).toBe(raw.ask!.questions[0].id) // the first of the router's own order
  })
  it('the shown card never batches, whoever produced it (intent call / brain style 3-question card)', () => {
    const d: ConsultDecision = {
      domains: ['food'], turn: 'ask', known: {}, assumptions: [],
      ask: { lead: 'x', questions: [1, 2, 3].map(n => ({ id: `q${n}`, q: `Câu hỏi ${n}?`, options: ['a', 'b'] })) },
    }
    const shown = refineAsk(d, ['tìm quán'], { localShop: false })
    expect(shown?.ask?.questions.map(q => q.id)).toEqual(['q1'])
  })
  it('an answer to an ask is a pick — a second question only ever comes in a LATER turn, never in the same one', () => {
    const first = route('Cho tôi quán ăn ngon.').decision
    const reply = buildAskReply(refineAsk(first, ['Cho tôi quán ăn ngon.'], { localShop: false })!.ask!, { lang: 'vi', structured: true })
    const second = routeConsult([
      { role: 'user', content: 'Cho tôi quán ăn ngon.' },
      { role: 'assistant', content: reply },
      { role: 'user', content: 'Món Việt' },
    ], ctx).decision
    expect(second.turn).toBe('pick')
    expect(second.ask).toBeUndefined()
  })
  it('sufficient context → no clarification (the existing gate: three stated facts are enough)', () => {
    const d = route('Quán phở Bắc quận 1 cho 2 người dưới 200k').decision
    expect(d.turn).toBe('pick')
    expect(d.ask).toBeUndefined()
  })
  it('a question the user already answered is dropped, and a card with nothing left is not shown (search runs)', () => {
    const d: ConsultDecision = {
      domains: ['food'], turn: 'ask', known: {}, assumptions: [],
      ask: { lead: 'x', questions: [{ id: 'budget', q: 'Tầm bao nhiêu mỗi người?', options: ['a', 'b'] }, { id: 'party', q: 'Đi mấy người?', options: ['2', '4'] }] },
    }
    expect(refineAsk(d, ['quán ăn 300k cho 4 người'], { localShop: false })?.turn).toBe('pick')
  })
  it('clarification precedes candidate-specific search: an ask turn carries no query and no area', () => {
    const d = route('Cho tôi quán ăn ngon.').decision
    expect(d.turn).toBe('ask')
    expect(d.query).toBeUndefined()
  })
})

describe('OWNER (3A) — sufficiency: an explicit user-stated priority is a valid decision criterion', () => {
  const turn = (s: string) => route(s).decision
  it('A. "Ăn trưa, ưu tiên tiết kiệm." proceeds — no ask-first gate for the missing budget / area', () => {
    const d = turn('Ăn trưa, ưu tiên tiết kiệm.')
    expect(d.domains).toEqual(['food'])
    expect(d.turn).toBe('pick')
    expect(d.ask).toBeUndefined()
  })
  it('B. "Ăn trưa, ưu tiên chất lượng." proceeds', () => {
    expect(turn('Ăn trưa, ưu tiên chất lượng.').turn).toBe('pick')
  })
  it('C. "Ăn trưa." has no explicit criterion: the existing clarification logic still applies', () => {
    const d = turn('Ăn trưa.')
    expect(d.turn).toBe('ask')
  })
  it('D. "Ăn trưa, giá không quan trọng." — a dismissed price is NOT a positive criterion: still the existing ask, no price preference', () => {
    const d = turn('Ăn trưa, giá không quan trọng.')
    expect(d.turn).toBe('ask')
    expect(hasExplicitPriority('Ăn trưa, giá không quan trọng.')).toBe(false)
  })
  it('E. a balance statement is a criterion: "Ăn trưa, muốn cân bằng giá và chất lượng." proceeds', () => {
    expect(turn('Ăn trưa, muốn cân bằng giá và chất lượng.').turn).toBe('pick')
    expect(hasExplicitPriority('Muốn cân bằng giá và chất lượng.')).toBe(true)
  })
  it('a dismissed priority next to a stated one still counts only the stated one', () => {
    expect(hasExplicitPriority('Ăn trưa, giá không quan trọng, ưu tiên chất lượng.')).toBe(true)
    expect(turn('Ăn trưa, giá không quan trọng, ưu tiên chất lượng.').turn).toBe('pick')
  })
  it('generic descriptive text is not a priority (no inference)', () => {
    for (const s of ['Ăn trưa quán ngon', 'Ăn trưa gần đây', 'quán yên tĩnh']) expect(hasExplicitPriority(s), s).toBe(false)
  })
  it('the threshold is not lowered for anything else: the vague request still asks, exactly one question is shown', () => {
    const shown = refineAsk(turn('Cho tôi quán ăn ngon.'), ['Cho tôi quán ăn ngon.'], { localShop: false })
    expect(shown?.turn).toBe('ask')
    expect(shown?.ask?.questions).toHaveLength(1)
  })
})
