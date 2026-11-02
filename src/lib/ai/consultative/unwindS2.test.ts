// Unwind step 2 (28/10/2026): the code-built question card gives way to an answer with stated assumptions (S2A), a question that is not
// about the shown picks is no longer a follow-up and a follow-up keeps its tools (S2B), and the pre-search query keeps what was asked (S2C).
// Every flag OFF = HEAD 7e60081.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { answerInsteadOfAsk, unwoundAskLine, MIN_KNOWN_TO_ANSWER } from './answerInsteadOfAsk'
import type { ConsultDecision } from './consultBrain'
import { routeConsult } from './consultRouter'
import { coveringQuery, planPresearch } from './presearch'
import { consultUnwindS2aOn, consultUnwindS2bOn, consultUnwindS2cOn, CONSULT_UNWIND_S2A_FLAG, CONSULT_UNWIND_S2B_FLAG, CONSULT_UNWIND_S2C_FLAG } from '@/lib/config/consultFlags'

const route = () => readFileSync(join(process.cwd(), 'src/app/api/chat/route.ts'), 'utf8')

describe('step 2 flags: exactly "1", never in production', () => {
  for (const [name, on] of [[CONSULT_UNWIND_S2A_FLAG, consultUnwindS2aOn], [CONSULT_UNWIND_S2B_FLAG, consultUnwindS2bOn], [CONSULT_UNWIND_S2C_FLAG, consultUnwindS2cOn]] as const) {
    it(name, () => {
      expect(on({})).toBe(false)
      expect(on({ [name]: 'true' })).toBe(false)
      expect(on({ [name]: '1' })).toBe(true)
      expect(on({ [name]: '1', NODE_ENV: 'production' })).toBe(false)
    })
  }
})

describe('S2A — answer with assumptions instead of the code-built card', () => {
  const ask = { lead: 'Để lên trọn buổi cho bạn:', questions: [{ id: 'so_nguoi', q: 'Đi mấy người?', options: ['1', '2', '3-4'] }] }
  const plan: ConsultDecision = { domains: ['travel'], turn: 'ask', known: { diem_den: 'Quy Nhơn', so_ngay: '3 ngày 2 đêm', ngan_sach: '20 triệu' }, assumptions: [], ask }

  it('a card on a decision with enough known slots becomes a pick, and the open questions are kept for the model', () => {
    const r = answerInsteadOfAsk(plan, { serverFallback: false })
    expect(r.decision?.turn).toBe('pick')
    expect(r.decision?.ask).toBeUndefined()
    expect(r.decision?.known).toEqual(plan.known)
    expect(r.unwound).toEqual({ questions: ['Đi mấy người?'] })
  })
  it('the model is told to answer now, state its assumptions and end with one question', () => {
    const line = unwoundAskLine({ questions: ['Đi mấy người?'] }, 'vi')
    expect(line).toContain('KHONG HOI LAI TRUOC')
    expect(line).toContain('NOI RO gia dinh')
    expect(line).toContain('Đi mấy người?')
    expect(line).toContain('DUNG MOT cau hoi')
  })
  it(`a request that really lacks its core (fewer than ${MIN_KNOWN_TO_ANSWER} known slots, empty values not counted) is still asked`, () => {
    expect(answerInsteadOfAsk({ ...plan, known: { diem_den: 'Quy Nhơn' } }, { serverFallback: false }).unwound).toBeNull()
    expect(answerInsteadOfAsk({ ...plan, known: { diem_den: 'Quy Nhơn', so_ngay: '  ' } }, { serverFallback: false }).unwound).toBeNull()
  })
  it('the server fallback, a domain-less card and any non-ask turn are untouched (same object)', () => {
    expect(answerInsteadOfAsk(plan, { serverFallback: true }).decision).toBe(plan)
    const noDomain = { ...plan, domains: [] }
    expect(answerInsteadOfAsk(noDomain, { serverFallback: false }).decision).toBe(noDomain)
    const pick = { ...plan, turn: 'pick' as const, ask: undefined }
    expect(answerInsteadOfAsk(pick, { serverFallback: false }).decision).toBe(pick)
    expect(answerInsteadOfAsk(null, { serverFallback: false }).decision).toBeNull()
  })
  it('route wiring: behind the flag, a travel plan request is promoted, and the line reaches the DA HIEU block', () => {
    const src = route()
    expect(src).toContain('const unwindAsk = consultUnwindS2aOn() && !agentOn ? answerInsteadOfAsk(consultCarded,')
    expect(src).toContain('const consult = agentOn ? null : unwindAsk && unwoundAsk ?')
    expect(src).toContain('promoteTripPlan(unwindAsk.decision, messages, wasAskReply).decision : unwindAsk.decision) : consultCarded')
    expect(src).toContain("${unwoundAsk ? unwoundAskLine(unwoundAsk, lang) : ''}")
  })
})

describe('S2B — a question that is not about the shown picks is not a follow-up', () => {
  const thread = [
    { role: 'user', content: 'gợi ý chỗ đi chơi ở quy nhơn' },
    { role: 'assistant', content: 'Bạn có thể ghé **Kỳ Co** và **Eo Gió** — hai điểm nổi tiếng nhất.' },
    { role: 'user', content: 'ông biết thiếu tướng phạm xuân ẩn không' },
  ]
  it('flag OFF: read as a follow-up on the first pick (HEAD)', () => {
    const r = routeConsult(thread, { hasGps: false, lang: 'vi' })
    expect(r.decision.turn).toBe('followup')
    expect(r.confidence).toBe('rule')
  })
  it('flag ON: a new request with no domain, unsure (the intent layer reads it)', () => {
    const r = routeConsult(thread, { hasGps: false, lang: 'vi', unwindFollowup: true })
    expect(r.decision.turn).toBe('chat')
    expect(r.decision.domains).toEqual([])
    expect(r.confidence).toBe('unsure')
  })
  it('flag ON: a question that names a shown pick is still a follow-up', () => {
    const named = [...thread.slice(0, 2), { role: 'user', content: 'kỳ co có xa không' }]
    expect(routeConsult(named, { hasGps: false, lang: 'vi', unwindFollowup: true }).decision.turn).toBe('followup')
  })
  it('route wiring: the router gets the flag, and a follow-up keeps its tools only with the flag', () => {
    const src = route()
    expect(src).toContain("routeConsult(routingMessages, { hasGps: !!userLocation, lang, ...(consultUnwindS2bOn() ? { unwindFollowup: true } : {})")
    expect(src).toContain("const s2bFollowTools = consultUnwindS2bOn() && (consult?.turn === 'followup' || consult?.turn === 'compare') && intent !== 'chitchat' && decisionStage !== 'confirmation'")
    expect(src).toContain("&& !consultFollowReuse)) && !s2bFollowTools")
  })
  it('the CONSULT_LUNA_FAST comment says what the code does (unset = ON)', () => {
    const luna = readFileSync(join(process.cwd(), 'src/lib/ai/consultative/luna.ts'), 'utf8')
    expect(luna).not.toContain('CONSULT_LUNA_FAST (needs CONSULT_LUNA; default OFF)')
    expect(luna).toContain('NOT default OFF')
  })
})

describe('S2C — the pre-search query keeps the dish and the area', () => {
  const text = 'kiếm quán cơm gà ở phan xích long giúp tui'
  it('the rules query that drops the dish is not chosen; the intent query that keeps it is', () => {
    expect(coveringQuery(['quán cơm', 'quán cơm gà Phan Xích Long'], text, 'Phan Xích Long')).toBe('quán cơm gà Phan Xích Long')
  })
  it('the area the intent layer read counts as covered, so a query without it still passes', () => {
    expect(coveringQuery(['cơm gà'], text, 'phan xích long')).toBe('cơm gà')
    expect(coveringQuery(['cơm gà'], text, null)).toBeNull()
  })
  it('no candidate covers the request: null (the code does not pre-search; the model searches)', () => {
    expect(coveringQuery(['quán cơm', undefined, ''], text, 'Phan Xích Long')).toBeNull()
  })
  it('the first covering candidate wins (the rules query when it already covers)', () => {
    expect(coveringQuery(['quán cơm gà', 'cơm gà ngon Phan Xích Long'], text, 'Phan Xích Long')).toBe('quán cơm gà')
  })
  it('the area reaches the pre-search location when no district was stated', () => {
    const situation = { place: { text: null } } as unknown as Parameters<typeof planPresearch>[1]
    const plan = planPresearch({ query: 'quán cơm gà', type: 'restaurant', exact: true }, situation, { statedArea: 'Phan Xích Long', userText: text })
    expect(plan?.args).toEqual({ query: 'quán cơm gà', type: 'restaurant', location: 'Phan Xích Long' })
  })
  it('route wiring: OFF keeps the rules query; ON chooses and passes the area', () => {
    const src = route()
    expect(src).toContain(': consult?.query\n')
    expect(src).toContain('coveringQuery([consult.query, lunaStated?.decision.query], framingText, s2cArea ?? statedArea?.label ?? null)')
    expect(src).toContain('statedArea: statedArea?.label ?? s2cArea ?? null, userText: framingText')
    expect(src).toContain("const s2cArea = consultUnwindS2cOn() ? (consult?.area ?? consult?.known.khu_vuc ?? null) : null")
  })
})
