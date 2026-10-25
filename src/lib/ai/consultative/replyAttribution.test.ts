// @vitest-environment node
// CONSULT_ANSWER_ATTRIBUTION (Wave 2, default OFF) · what a reply to a clarifying question IS. Uses the measurement of Finding 1 (clarifyAnswer.measure.test.ts: the same
// cards and the same replies) and adds replies written for this change. No sentence is taken from the acceptance set or from the reference set.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { routeConsult, isAnswerToAsk, labelAskReply, recentShownNames } from './consultRouter'
import { attributeReply, shownAsk, QUESTION_MIN_WORDS, RULE_CHAT_MIN_WORDS, type AttributionDeps } from './replyAttribution'
import { buildAskReply, enforceConsultRules, type ConsultDecision } from './consultBrain'
import { consultAnswerAttributionOn } from '@/lib/config/consultFlags'

afterEach(() => { vi.unstubAllEnvs() })
const FLAG = 'CONSULT_ANSWER_ATTRIBUTION'
const ctx = { hasGps: false, lang: 'vi' as const }

const ASK = (lead: string, q: string, options: string[]) => `${lead}\n\n[TAPPY_ASK]${JSON.stringify({ v: 1, questions: [{ id: 'q1', q, options }] })}[/TAPPY_ASK]`
const CLARIFIES = [
  { name: 'shopping', first: 'tôi muốn mua tai nghe bluetooth dưới 1 triệu', ask: ASK('Để chọn đúng tai nghe cho bạn:', 'Loại nào?', ['Nhét tai', 'Chụp tai']) },
  { name: 'food', first: 'tìm quán ăn tối ở quận 1', ask: ASK('Để mình chọn đúng quán cho bạn:', 'Đi mấy người?', ['1-2 người', '3-5 người', 'Nhóm đông']) },
  { name: 'travel', first: 'tìm khách sạn ở Đà Nẵng cuối tuần', ask: ASK('Để mình chọn đúng chỗ ở cho bạn:', 'Tầm bao nhiêu một đêm?', ['Dưới 500k', '500k-1 triệu', 'Trên 1 triệu']) },
]
const routeAfterAsk = (c: typeof CLARIFIES[number], reply: string) =>
  routeConsult([{ role: 'user', content: c.first }, { role: 'assistant', content: c.ask }, { role: 'user', content: reply }], ctx)

const QUESTIONS = ['thủ đô của nước Pháp là thành phố nào?', 'giải thích ngắn gọn blockchain hoạt động thế nào?', 'hôm nay giá xăng RON95 bao nhiêu một lít?']
const CLOSINGS = ['cảm ơn bạn nhé', 'dịch câu này sang tiếng Anh: hẹn gặp lại vào tuần sau']

describe('the flag', () => {
  it('is ON only for exactly "1"', () => {
    for (const v of [undefined, '', '0', 'true', 'on', ' 1', '1 ', 'yes']) expect(consultAnswerAttributionOn({ [FLAG]: v }), String(v)).toBe(false)
    expect(consultAnswerAttributionOn({ [FLAG]: '1' })).toBe(true)
  })
})

describe('OFF (default): the old rule, unchanged', () => {
  it('every reply after an ask is the answer: all 21 off-topic replies of the baseline are still a pick of the clarified search', () => {
    for (const v of [undefined, '0', 'true']) {
      if (v === undefined) vi.unstubAllEnvs(); else vi.stubEnv(FLAG, v)
      let picks = 0, total = 0
      for (const c of CLARIFIES) for (const r of [...QUESTIONS, ...CLOSINGS, 'viết giúp mình lời chúc sinh nhật cho bạn thân', 'thôi mình không cần nữa']) {
        const res = routeAfterAsk(c, r)
        total++
        if (res.decision.turn === 'pick' && res.decision.domains[0] === c.name) picks++
      }
      expect(total).toBe(21)
      expect(picks, `flag=${v}`).toBe(21)
    }
  })
  it('isAnswerToAsk is wasAskReply, for any text', () => {
    for (const r of QUESTIONS) expect(isAnswerToAsk(CLARIFIES[0].ask, r, ctx, 'shopping')).toBe(true)
    expect(isAnswerToAsk('Chào bạn!', 'chụp tai', ctx, 'shopping')).toBe(false)
    expect(isAnswerToAsk(undefined, 'chụp tai', ctx, null)).toBe(false)
  })
})

describe('ON: a reply that is a request of its own is not read as the answer', () => {
  it('answers are still a pick of the clarified domain (4 of 4)', () => {
    vi.stubEnv(FLAG, '1')
    const answers: Array<[number, string]> = [[0, 'chụp tai'], [0, 'mình hay nghe nhạc lúc đi làm, ngân sách 800k'], [1, '3-5 người'], [2, 'khoảng 700k một đêm']]
    for (const [i, text] of answers) {
      const res = routeAfterAsk(CLARIFIES[i], text)
      expect(res.decision.turn, text).toBe('pick')
      expect(res.decision.domains[0], text).toBe(CLARIFIES[i].name)
    }
  })

  it('a question of its own and a closing are NOT a pick (3 domains × 5 replies), and they carry no search query', () => {
    vi.stubEnv(FLAG, '1')
    for (const c of CLARIFIES) for (const r of [...QUESTIONS, ...CLOSINGS]) {
      const res = routeAfterAsk(c, r)
      expect(res.decision.turn, `${c.name}: ${r}`).toBe('chat')
      expect(res.decision.query, `${c.name}: ${r}`).toBeUndefined()
    }
  })

  it('a request in ANOTHER consultation domain is still read as that domain (the older rule is untouched)', () => {
    vi.stubEnv(FLAG, '1')
    expect(routeAfterAsk(CLARIFIES[0], 'tìm giúp mình quán phở ngon ở quận 3').decision.domains[0]).toBe('food')
    expect(routeAfterAsk(CLARIFIES[1], 'mua giúp mình một cái ốp lưng điện thoại giá rẻ').decision.domains[0]).toBe('shopping')
  })

  it('the measured improvement (printed for the report): off-topic replies still read as the answer, OFF vs ON', () => {
    const off = [...QUESTIONS, ...CLOSINGS, 'viết giúp mình lời chúc sinh nhật cho bạn thân', 'thôi mình không cần nữa']
    const count = () => { let n = 0; for (const c of CLARIFIES) for (const r of off) { const x = routeAfterAsk(c, r); if (x.decision.turn === 'pick' && x.decision.domains[0] === c.name) n++ } return n }
    const before = count()
    vi.stubEnv(FLAG, '1')
    const after = count()
    process.stdout.write(`F1_ATTRIBUTION off-topic read as the answer: OFF ${before}/21 → ON ${after}/21\n`)
    expect(before).toBe(21)
    expect(after).toBeLessThan(before)
    // pinned, honest: the replies the structure cannot tell from an answer keep the old reading (see the report): a short closing the rules do not know ("thôi mình không cần nữa" ×3) and
    // a request to write something (×3: no question mark, no rule word, and a reply with no information is NOT a request of its own - it can be a delegation)
    expect(after).toBe(6)
  })

  it('a one-word acknowledgement and a delegation after an ask are still the answer (a pick), in every clarified domain', () => {
    vi.stubEnv(FLAG, '1')
    for (const c of CLARIFIES) for (const r of ['ừ', 'ok', 'được', 'sao cũng được', 'gì cũng được bạn chọn giúp mình nhé', 'tuỳ bạn quyết định giúp mình']) {
      const res = routeAfterAsk(c, r)
      expect(res.decision.turn, `${c.name}: ${r}`).toBe('pick')
      expect(res.decision.domains[0], `${c.name}: ${r}`).toBe(c.name)
    }
  })

  it('inside a thread that already showed picks, a question of its own is a new request too (not a "follow-up" about the first shown pick)', () => {
    const shown = 'Mình gợi ý 2 chỗ: **Khách sạn Sông Hàn** và **Khách sạn Mỹ Khê**.'
    const ask = ASK('Để mình chọn kỹ hơn:', 'Tầm bao nhiêu một đêm?', ['Dưới 500k', '500k-1 triệu', 'Trên 1 triệu'])
    const history = (reply: string) => [
      { role: 'user', content: 'tìm khách sạn ở Đà Nẵng cuối tuần' }, { role: 'assistant', content: shown },
      { role: 'user', content: 'ok' }, { role: 'assistant', content: ask },
      { role: 'user', content: reply },
    ]
    vi.stubEnv(FLAG, '1')
    for (const r of QUESTIONS) expect(routeConsult(history(r), ctx).decision.turn, r).toBe('chat')
    vi.unstubAllEnvs()
    for (const r of QUESTIONS) expect(routeConsult(history(r), ctx).decision.turn, `OFF: ${r}`).not.toBe('chat') // the old reading, unchanged
  })

  it('isAnswerToAsk (the brain and the route read it): false for a request of its own, true for an answer, false when nothing was asked', () => {
    vi.stubEnv(FLAG, '1')
    for (const r of QUESTIONS) expect(isAnswerToAsk(CLARIFIES[0].ask, r, ctx, 'shopping'), r).toBe(false)
    expect(isAnswerToAsk(CLARIFIES[0].ask, 'chụp tai', ctx, 'shopping')).toBe(true)
    expect(isAnswerToAsk(CLARIFIES[0].ask, 'ừ', ctx, 'shopping')).toBe(true) // unclear keeps the old reading
    expect(isAnswerToAsk('Chào bạn!', 'chụp tai', ctx, 'shopping')).toBe(false)
    // an explicit env object is honoured (the flag is read from it, not from the process)
    expect(isAnswerToAsk(CLARIFIES[0].ask, QUESTIONS[0], ctx, 'shopping', undefined, {})).toBe(true)
  })

  it('a sentence that points at what the thread showed is about it, not a new request (the deictic rule survives)', () => {
    vi.stubEnv(FLAG, '1')
    const shown = 'Mình gợi ý 2 chỗ: **Khách sạn Sông Hàn** và **Khách sạn Mỹ Khê**.'
    const ask = ASK('Để mình chọn kỹ hơn:', 'Tầm bao nhiêu một đêm?', ['Dưới 500k', '500k-1 triệu', 'Trên 1 triệu'])
    const res = routeConsult([
      { role: 'user', content: 'tìm khách sạn ở Đà Nẵng cuối tuần' }, { role: 'assistant', content: shown },
      { role: 'user', content: 'ok' }, { role: 'assistant', content: ask },
      { role: 'user', content: 'Cái thứ hai có bao gồm ăn sáng không?' },
    ], ctx)
    expect(res.decision.turn).not.toBe('chat')
    expect(labelAskReply(ask, 'Khách sạn Mỹ Khê có hồ bơi không nhỉ?', ctx, 'travel', recentShownNames([{ role: 'assistant', content: shown }, { role: 'assistant', content: ask }])).label).not.toBe('new_request')
    // ... while the same sentence with no shown name behind it is a question of its own
    expect(labelAskReply(ask, 'Khách sạn Mỹ Khê có hồ bơi không nhỉ?', ctx, 'travel', []).label).toBe('new_request')
    expect(labelAskReply(ask, 'Cái thứ hai có bao gồm ăn sáng không?', ctx, 'travel').signal).toBe('points_at_thread')
  })
})

describe('the labelling function (pure, with injected readers)', () => {
  const deps = (over: Partial<AttributionDeps> = {}): AttributionDeps => ({
    fold: s => s.toLowerCase(), slotKnown: () => ({ known: {} }), aloneIsRuleChat: () => false, pointsAtThread: () => false, ...over,
  })
  const prev = ASK('Hỏi:', 'Ngân sách?', ['Dưới 1 triệu', 'Trên 1 triệu'])
  const prevIds = (ids: string[]) => `x\n\n[TAPPY_ASK]${JSON.stringify({ v: 1, questions: ids.map(id => ({ id, q: 'q', options: ['a1', 'b1'] })) })}[/TAPPY_ASK]`

  it('reads the options and ids of the card; a broken or missing card gives nothing', () => {
    expect(shownAsk(prev)).toEqual({ ids: ['q1'], options: ['Dưới 1 triệu', 'Trên 1 triệu'] })
    expect(shownAsk('no card')).toEqual({ ids: [], options: [] })
    expect(shownAsk('[TAPPY_ASK]{not json[/TAPPY_ASK]')).toEqual({ ids: [], options: [] })
  })
  it('an offered option (button or typed) is an answer, even when it is long or a question mark follows', () => {
    expect(attributeReply(prev, 'Dưới 1 triệu', deps())).toEqual({ label: 'answer', signal: 'option' })
    expect(attributeReply(prev, 'trên 1 triệu thôi nhé, được không?', deps()).label).toBe('answer')
  })
  it('the asked slot being filled is an answer (budget / party / date / time / area)', () => {
    const slot = (k: string) => deps({ slotKnown: () => ({ known: { [k]: 'x' } }) })
    expect(attributeReply(prevIds(['budget']), 'sao cũng được nhé các bạn ơi, nhưng đừng đắt quá nha?', slot('ngan_sach')).signal).toBe('asked_slot:budget')
    expect(attributeReply(prevIds(['party']), 'đi cùng gia đình mình đông lắm, có được không bạn?', slot('so_nguoi')).signal).toBe('asked_slot:party')
    expect(attributeReply(prevIds(['date']), 'mình định đi vào cuối tuần này, có chỗ nào không?', slot('ngay')).signal).toBe('asked_slot:date')
    expect(attributeReply(prevIds(['time']), 'khoảng bảy giờ tối, có chỗ nào không bạn?', slot('gio')).signal).toBe('asked_slot:time')
    expect(attributeReply(prevIds(['area']), 'ở gần chỗ mình ở nhé, có được không bạn?', deps({ slotKnown: () => ({ known: {}, area: 'quận 7' }) })).signal).toBe('asked_slot:area')
    // a slot the question did NOT ask does not make it an answer
    expect(attributeReply(prevIds(['party']), 'đi cùng gia đình mình đông lắm, có được không bạn?', slot('ngan_sach')).label).toBe('new_request')
  })
  it(`a question of its own needs ${QUESTION_MIN_WORDS}+ words and a question mark`, () => {
    expect(attributeReply(prev, 'ai viết ra cuốn sách đó?', deps()).label).toBe('new_request')
    expect(attributeReply(prev, 'cái nào?', deps()).label).toBe('unclear')
    expect(attributeReply(prev, 'ai viết cuốn sách đó', deps()).label).toBe('unclear')
  })
  it(`a greeting / closing the router recognises is a new request from ${RULE_CHAT_MIN_WORDS} words; a single word ("ok", "ừ") is not`, () => {
    expect(attributeReply(prev, 'ok cảm ơn', deps({ aloneIsRuleChat: () => true })).signal).toBe('rule_chat')
    expect(attributeReply(prev, 'ok', deps({ aloneIsRuleChat: () => true })).label).toBe('unclear')
  })
  it('a long sentence with no information is NOT a new request (a delegation such as "you choose for me" is an answer): no rule reads the amount of information', () => {
    expect(attributeReply(prev, 'gì cũng được bạn chọn giúp mình nhé', deps()).label).toBe('unclear')
  })
  it('points at the thread → never a new request', () => {
    expect(attributeReply(prev, 'cái đầu tiên có rẻ hơn không bạn nhỉ?', deps({ pointsAtThread: () => true })).signal).toBe('points_at_thread')
  })
  it('an empty or symbol-only reply is unclear (old behaviour)', () => {
    expect(attributeReply(prev, '   ', deps()).label).toBe('unclear')
    expect(attributeReply(prev, '👍', deps()).label).toBe('unclear')
  })
})

describe('real ask cards built by the router', () => {
  it('a reply that fills the asked slot is an answer; the same slot words inside a question of its own are still an answer (the slot is what was asked)', () => {
    const first = routeConsult([{ role: 'user', content: 'tìm khách sạn ở Đà Nẵng' }], ctx).decision
    expect(first.turn).toBe('ask')
    const text = buildAskReply(first.ask!, { lang: 'vi', structured: true })
    const ids = shownAsk(text).ids
    expect(ids.length).toBeGreaterThan(0)
    for (const o of shownAsk(text).options) expect(labelAskReply(text, o, ctx, 'travel').label, o).toBe('answer')
    expect(labelAskReply(text, 'thủ đô của nước Pháp là thành phố nào?', ctx, 'travel').signal).toBe('own_question')
  })
})

describe('the brain\'s "never two asks in a row" follows the same label', () => {
  const askDecision: ConsultDecision = { domains: ['food'], turn: 'ask', known: {}, assumptions: [], ask: { lead: 'x', questions: [{ id: 'party', q: 'Đi mấy người?', options: ['1', '2', '3'] }, { id: 'budget', q: 'Ngân sách?', options: ['a', 'b', 'c'] }] } as never }
  it('previousWasAsk true turns a second ask into a pick; false lets a new request be asked about', () => {
    const asked = enforceConsultRules(askDecision, { hasGps: false, previousWasAsk: true } as never)
    expect(asked?.turn).toBe('pick')
    const fresh = enforceConsultRules(askDecision, { hasGps: false, previousWasAsk: false } as never)
    expect(fresh?.turn).toBe('ask')
  })
})
