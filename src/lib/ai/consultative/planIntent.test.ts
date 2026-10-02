import { describe, it, expect } from 'vitest'
import { asksForPlan, requestTexts, promoteTripPlan } from './planIntent'
import type { ConsultDecision } from './consultBrain'

const ask = (t: string) => t.includes('[TAPPY_ASK]')
const pick = (known: Record<string, string>): ConsultDecision => ({ domains: ['travel'], turn: 'pick', known, assumptions: [] })

describe('asksForPlan', () => {
  it.each(['lập kế hoạch đi chơi đà nẵng 3 ngày 2 đêm', 'Lên lịch trình Đà Lạt 2N1Đ', 'làm giúp mình kế hoạch du lịch Phú Quốc', 'plan a trip to Hanoi', 'make me a plan for Da Nang', 'lich trinh di hue'])('%s', t => expect(asksForPlan(t)).toBe(true))
  it.each(['khách sạn đà nẵng', 'bay từ HCM', 'vé máy bay đà nẵng', 'lập kế hoạch đặt vé máy bay đi Hà Nội', 'Mùa này đi du lịch ở đâu', 'Tuần sau · TP.HCM · 2 người'])('%s', t => expect(asksForPlan(t)).toBe(false))
})

describe('promoteTripPlan', () => {
  const opener = { role: 'user', content: 'lập kế hoạch đi chơi đà nẵng 3 ngày 2 đêm' }
  const askCard = { role: 'assistant', content: 'Để lên chuyến:\n[TAPPY_ASK]{}[/TAPPY_ASK]' }
  const answer = { role: 'user', content: 'Tuần sau · TP.HCM · 2 người' }
  it('walks back through the ask card to the request', () => {
    expect(requestTexts([opener, askCard, answer], ask)).toEqual([answer.content, opener.content])
  })
  it('promotes the pick that answers the ask', () => {
    const r = promoteTripPlan(pick({ diem_den: 'Đà Nẵng', so_ngay: '3 ngày 2 đêm' }), [opener, askCard, answer], ask)
    expect(r.promoted).toBe(true)
    expect(r.decision?.turn).toBe('plan')
    expect(r.decision?.known.diem_den).toBe('Đà Nẵng')
  })
  it('promotes a complete one-message request', () => {
    expect(promoteTripPlan(pick({ diem_den: 'Đà Lạt' }), [{ role: 'user', content: 'lập kế hoạch đi đà lạt cuối tuần 2 người từ HCM' }], ask).promoted).toBe(true)
  })
  it('leaves a plain destination request a pick', () => {
    const d = pick({ diem_den: 'Đà Nẵng' })
    const r = promoteTripPlan(d, [{ role: 'user', content: 'khách sạn đà nẵng cuối tuần' }], ask)
    expect(r.promoted).toBe(false)
    expect(r.decision).toBe(d)
  })
  it('does not reach past a finished answer to an older request', () => {
    const msgs = [opener, askCard, answer, { role: 'assistant', content: '**Mình chọn: X**' }, { role: 'user', content: 'cho mình khách sạn khác' }]
    expect(promoteTripPlan(pick({ diem_den: 'Đà Nẵng' }), msgs, ask).promoted).toBe(false)
  })
  it('a typed answer that is a new lodging request is not the plan answer', () => {
    const typed = { role: 'user', content: 'thôi tìm khách sạn Hà Nội giúp mình' }
    expect(promoteTripPlan(pick({ diem_den: 'Hà Nội' }), [opener, askCard, typed], ask).promoted).toBe(false)
  })
  it('only travel picks', () => {
    expect(promoteTripPlan({ ...pick({ diem_den: 'x' }), domains: ['food'] }, [opener], ask).promoted).toBe(false)
    expect(promoteTripPlan({ ...pick({ diem_den: 'x' }), turn: 'ask' }, [opener], ask).promoted).toBe(false)
  })
})
