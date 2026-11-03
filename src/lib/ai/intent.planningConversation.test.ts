/* Regression: flagship Travel Plan degraded to plain markdown in the
 * clarify-then-answer flow. /api/chat detected planning intent on the LAST user
 * message only; after Tappy's clarifying question, the user's answer ("cuối
 * tuần này, ngân sách 8 triệu, cặp đôi...") carries no destination/day/trip
 * keyword, so the [TAPPY_PLAN] planning block was never injected on exactly the
 * turn the plan was generated — no TripPlanCard, no brochure (UAT 2026-07-22).
 * detectPlanningIntentFromConversation scans the recent turns instead. */
import { describe, it, expect } from 'vitest'
import { detectPlanningIntent, detectPlanningIntentFromConversation } from './intent'

const TRIP_ASK = 'Lên kế hoạch du lịch Đà Nẵng 3 ngày 2 đêm cho 2 người'
const CLARIFY = 'Để lên kế hoạch tốt nhất cho bạn, mình cần hỏi thêm vài điều: ngày đi, ngân sách, sở thích?'
const CLARIFY_ANSWER = 'Đi cuối tuần này, ngân sách 8 triệu cho 2 người, cặp đôi, thích biển và ẩm thực'

describe('detectPlanningIntentFromConversation', () => {
  it('keeps trip mode when the user merely answers a clarifying question (the original bug)', () => {
    // Sanity: the clarify answer alone does NOT look like a trip — that is why
    // last-message-only detection failed.
    expect(detectPlanningIntent(CLARIFY_ANSWER)).toBeNull()

    const messages = [
      { role: 'user', content: TRIP_ASK },
      { role: 'assistant', content: CLARIFY },
      { role: 'user', content: CLARIFY_ANSWER },
    ]
    expect(detectPlanningIntentFromConversation(messages)).toBe('trip')
  })

  it('still detects a direct trip request in the last message', () => {
    expect(detectPlanningIntentFromConversation([{ role: 'user', content: TRIP_ASK }])).toBe('trip')
  })

  it('does NOT force a new plan for follow-up chat after a plan was already delivered', () => {
    const messages = [
      { role: 'user', content: TRIP_ASK },
      { role: 'assistant', content: 'Đây là kế hoạch! [TAPPY_PLAN]{"type":"trip"}[/TAPPY_PLAN] Chúc vui!' },
      { role: 'user', content: 'Tìm quán ăn cụ thể giúp mình' },
    ]
    expect(detectPlanningIntentFromConversation(messages)).toBeNull()
  })

  it('does not resurrect a trip asked outside the lookback window', () => {
    const filler = Array.from({ length: 6 }, (_, i) => (
      { role: i % 2 ? 'assistant' : 'user', content: `chuyện khác ${i}` }
    ))
    const messages = [{ role: 'user', content: TRIP_ASK }, ...filler]
    expect(detectPlanningIntentFromConversation(messages)).toBeNull()
  })

  it('handles array-form (multimodal) message content without crashing', () => {
    const messages = [
      { role: 'user', content: [{ type: 'text', text: TRIP_ASK }] },
      { role: 'assistant', content: CLARIFY },
      { role: 'user', content: [{ type: 'text', text: CLARIFY_ANSWER }] },
    ]
    expect(detectPlanningIntentFromConversation(messages)).toBe('trip')
  })
})
