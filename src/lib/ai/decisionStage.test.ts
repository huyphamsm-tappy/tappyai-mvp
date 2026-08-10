import { describe, it, expect } from 'vitest'
import { detectDecisionStage } from './intent'

// C2 — where in a decision the user currently is. Deterministic regex, no LLM
// call: the whole point is that consultative behaviour must not add a
// classification round trip (Cost Optimization is finalized and must not regress).
//
// Precision beats recall here. A missed signal falls back to exactly today's
// behaviour; a FALSE refinement tells the model to carry over a task the user
// has actually moved on from, which is a worse answer than the one we ship now.

const cold = (t: string) => detectDecisionStage(t, { hasPriorAssistantTurn: false })
const after = (t: string) => detectDecisionStage(t, { hasPriorAssistantTurn: true })

describe('detectDecisionStage — refinement', () => {
  describe('Vietnamese, after an assistant turn', () => {
    for (const t of [
      'rẻ hơn', 'Rẻ hơn nữa', 'gần biển hơn', 'ít cay hơn', 'ngon hơn không?',
      'có cái nào tốt hơn không?', 'còn chỗ nào rẻ hơn không',
      'đổi sang quận 3', 'chuyển sang Đà Lạt', 'thay bằng quán khác',
      'quán khác đi', 'chỗ khác được không', 'khách sạn khác',
      'gần biển', 'gần trung tâm', 'dưới 1 triệu', 'trên 4 sao',
    ]) {
      it(`"${t}"`, () => expect(after(t)).toBe('refinement'))
    }
  })

  describe('English, after an assistant turn', () => {
    for (const t of [
      'cheaper', 'a bit cheaper', 'closer to the beach', 'less spicy', 'quieter please',
      'anything better?', 'any other options', 'something else',
      'change to District 3', 'switch to Da Lat', 'instead of that one',
      'near the centre', 'under 2 million', 'more central',
    ]) {
      it(`"${t}"`, () => expect(after(t)).toBe('refinement'))
    }
  })

  it('is NOT refinement at cold start — there is no task to refine', () => {
    for (const t of ['rẻ hơn', 'cheaper', 'gần biển', 'closer to the beach', 'đổi sang quận 3']) {
      expect(cold(t), t).not.toBe('refinement')
    }
  })

  it('does not swallow a genuinely new request that happens to be long', () => {
    for (const t of [
      'Gợi ý quán ăn ngon ở Quận 1 giá dưới 200k cho 4 người đi ăn tối cuối tuần',
      'Suggest a good seafood restaurant in Da Nang near the beach for a family of four',
      'Lên lịch trình du lịch Đà Nẵng 3 ngày ngân sách 5 triệu',
    ]) {
      expect(after(t), t).not.toBe('refinement')
    }
  })
})

describe('detectDecisionStage — comparison', () => {
  for (const t of [
    'A hay B?', 'Nên chọn A hay B?', 'Nên mua iPhone hay Samsung?',
    'iPhone vs Samsung', 'so sánh Agoda và Booking',
    'Which is better, A or B?', 'Compare A and B', 'iPhone or Samsung, which one?',
  ]) {
    it(`"${t}"`, () => expect(cold(t)).toBe('comparison'))
  }

  it('is recognized cold — a comparison is a valid first message', () => {
    expect(cold('Nên mua iPhone hay Samsung?')).toBe('comparison')
    expect(after('Nên mua iPhone hay Samsung?')).toBe('comparison')
  })

  it('does not fire on an ordinary request that merely contains "hay" or "or"', () => {
    expect(cold('Quán này hay lắm')).not.toBe('comparison')
    expect(cold('Tìm quán ăn ngon hay quán cafe đẹp ở Hà Nội cho tôi nhé')).not.toBe('comparison')
    expect(cold('Find a restaurant or two in Hanoi for dinner tonight please')).not.toBe('comparison')
  })
})

describe('detectDecisionStage — confirmation', () => {
  for (const t of ['ok', 'OK', 'oke', 'được', 'được rồi', 'ừ', 'ừm', 'vâng', 'yes', 'sure', 'sounds good', 'perfect', 'ok nhé', 'ok bạn']) {
    it(`"${t}"`, () => expect(after(t)).toBe('confirmation'))
  }

  it('is not confirmation when the message continues into a real request', () => {
    for (const t of [
      'ok cho mình xem quán ăn quận 1',
      'ok show me cafes in Hanoi',
      'được rồi, tìm khách sạn Đà Nẵng giúp mình',
      'yes but cheaper than that',
    ]) {
      expect(after(t), t).not.toBe('confirmation')
    }
  })

  it('"yes but cheaper" is refinement, not confirmation — the constraint wins', () => {
    expect(after('yes but cheaper')).toBe('refinement')
  })
})

describe('detectDecisionStage — nothing to report', () => {
  it('returns null for ordinary requests, factual questions and greetings', () => {
    for (const t of [
      'Gợi ý quán ăn ngon ở Quận 1', 'Suggest a good restaurant in District 1',
      'Thời tiết Hà Nội hôm nay', 'What is the gold price today',
      'Chào Tappy', 'hello', '',
    ]) {
      expect(after(t), t).toBeNull()
    }
  })

  it('never throws on odd input', () => {
    for (const t of ['', '   ', '???', '123', '🙂']) {
      expect(() => after(t)).not.toThrow()
    }
  })
})
