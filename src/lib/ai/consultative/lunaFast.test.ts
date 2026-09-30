import { describe, it, expect } from 'vitest'
import { consultLunaFastEnabled, skipLunaIntent } from './luna'

const r = (turn: string, confidence: 'rule' | 'unsure' = 'rule', domains = ['food']) => ({ confidence, decision: { turn, domains } })

describe('CONSULT_LUNA_FAST — skip the intent call only when it adds nothing', () => {
  it('is OFF by default and needs CONSULT_LUNA', () => {
    expect(consultLunaFastEnabled({})).toBe(false)
    expect(consultLunaFastEnabled({ CONSULT_LUNA_FAST: '1' })).toBe(false)
    expect(consultLunaFastEnabled({ CONSULT_LUNA: '1', CONSULT_LUNA_FAST: '1' })).toBe(true)
  })
  it('skips a sure follow-up / compare on a stored consultation', () => {
    expect(skipLunaIntent(r('followup'), ['food'], 'quán đó có chỗ đậu ô tô không?')).toBe(true)
    expect(skipLunaIntent(r('compare'), ['food'], 'so sánh 2 quán đầu')).toBe(true)
  })
  it('skips a short more / reject / plan, not one that carries a new request', () => {
    expect(skipLunaIntent(r('more'), ['food'], 'Xem thêm')).toBe(true)
    expect(skipLunaIntent(r('plan'), ['travel'], 'Lên kế hoạch chi tiết')).toBe(true)
    expect(skipLunaIntent(r('reject'), ['food'], 'tìm chỗ khác, dưới 200k, có chỗ đậu ô tô cho 6 người')).toBe(false)
  })
  it('never skips a new request, an ask answer, an unsure turn, or a turn without a stored consultation', () => {
    expect(skipLunaIntent(r('pick'), ['food'], 'quán lẩu quận 3')).toBe(false)
    expect(skipLunaIntent(r('ask'), ['food'], '2 người')).toBe(false)
    expect(skipLunaIntent(r('followup', 'unsure'), ['food'], 'còn gì nữa')).toBe(false)
    expect(skipLunaIntent(r('followup'), [], 'còn gì nữa')).toBe(false)
    expect(skipLunaIntent(r('followup', 'rule', []), ['food'], 'còn gì nữa')).toBe(false)
    expect(skipLunaIntent(null, ['food'], 'x')).toBe(false)
  })
})
