import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { turnStartsNewConsultation, assessActionability } from './actionability'
import { taskSwitched } from './refinement'
import { classifyTurnIntent } from './intentGate'
import { resolveDecisionStage } from './refinement'

// ─────────────────────────────────────────────────────────────────────────────
// A BROAD TURN OF ANOTHER DOMAIN STARTS A NEW CONSULTATION.
//
// Android re-test 2026-09-19, B9: "toi nay an gi" → canned clarify → chip
// "100–200k/người" → pick (Quán Bụi Central) → "cuoi tuan di choi dau". The need
// profile saw no venue noun, so `taskSwitched` was false; the thread's budget and
// GPS then satisfied the clarify gate FOR FOOD (actionable, no canned clarify), no
// search-now directive fired (not a first reply, not after a clarify), and the
// model asked "Bạn thích chơi gì?" instead of searching — toolCalls 0. B4 in the
// spa session was the same shape. The turn's own domain decides.
// ─────────────────────────────────────────────────────────────────────────────

const B9 = [
  { role: 'user', content: 'toi nay an gi' },
  { role: 'assistant', content: 'Để chọn đúng chỗ, mình cần biết thêm:\n• Tầm giá? (dưới 100k/người / 100–200k/người / trên 200k/người)\nBạn trả lời phần nào cũng được, phần còn lại mình tự giả sử và nói rõ.' },
  { role: 'user', content: '100–200k/người' },
  { role: 'assistant', content: 'Mình chọn **Quán Bụi Central** cho bạn tối nay — 4.5⭐ (889 đánh giá), cách bạn 0.7km.' },
  { role: 'user', content: 'cuoi tuan di choi dau' },
]
const gps = { hasGps: true, lang: 'vi' }

describe('turnStartsNewConsultation', () => {
  it('🚨 B9: the need profile sees no switch, the gate\'s own reading does', () => {
    expect(taskSwitched(B9)).toBe(false)
    expect(turnStartsNewConsultation({ messages: B9, ...gps })).toBe(true)
  })

  it('as routed: the gate on the turn alone is NOT actionable and asks the entertainment questions', () => {
    const thread = assessActionability({ messages: B9, lastAssistantText: String(B9[3].content), ...gps })
    expect(thread.actionable).toBe(true) // the defect: judged actionable for food
    expect(thread.domain).toBe('food')
    const own = assessActionability({ messages: B9.slice(-1), lastAssistantText: null, ...gps })
    expect(own.actionable).toBe(false)
    expect(own.domain).toBe('entertainment')
    expect(own.questions.map(q => q.q)).toEqual(['Tầm giá?', 'Mấy người?'])
    expect(own.questions[0].options).toEqual(['dưới 200k/người', '200–500k/người', 'trên 500k/người'])
  })

  it('as routed: the intent gate reads it as new_consultation', () => {
    const turnIntent = classifyTurnIntent({ stage: resolveDecisionStage(B9), hasPriorAssistantTurn: true, taskSwitched: taskSwitched(B9) || turnStartsNewConsultation({ messages: B9, ...gps }), assistantAskedClarification: false })
    expect(turnIntent).toBe('new_consultation')
  })

  it('never on an answer chip, a refinement, a follow-up or a same-domain request', () => {
    const base = B9.slice(0, 4)
    for (const last of ['dưới 100k/người', 'chỗ nào rẻ hơn?', 'quán này mở mấy giờ?', 'quán ăn ngon ở phú nhuận', 'gợi ý thêm']) {
      expect(turnStartsNewConsultation({ messages: [...base, { role: 'user', content: last }], ...gps }), last).toBe(false)
    }
  })

  it('a first turn is never a switch (nothing to switch from)', () => {
    expect(turnStartsNewConsultation({ messages: [{ role: 'user', content: 'cuoi tuan di choi dau' }], ...gps })).toBe(false)
  })

  it('route.ts wires it into the intent gate, the clarify gate and the situation frame', () => {
    const route = readFileSync('src/app/api/chat/route.ts', 'utf8')
    expect(route).toMatch(/taskSwitched: taskSwitched\(messages\) \|\| ownDomainSwitch/)
    expect(route).toMatch(/const gateMessages = ownDomainSwitch \? messages\.slice\(-1\) : messages/)
    expect(route).toMatch(/deriveSituation\(ownDomainSwitch \? consultationUserTexts\(framingMessages\)\.slice\(-1\)/)
  })
})
