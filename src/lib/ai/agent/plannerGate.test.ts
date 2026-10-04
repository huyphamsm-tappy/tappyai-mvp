// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { plannerNeedsDestination, plannerDestinationQuestion } from './plannerGate'

describe('plannerNeedsDestination — asks only when nothing could be a destination', () => {
  it.each([
    'Lên kế hoạch du lịch cuối tuần', 'Lên kế hoạch du lịch', '✈️ Lên kế hoạch trip', 'lên kế hoạch đi chơi 3 ngày 2 đêm cho 2 người 10 triệu',
  ])('missing destination: %s', t => expect(plannerNeedsDestination([t])).toBe(true))
  it.each([
    'đi Đà Nẵng 3 ngày 2 đêm cho 2 người', 'lên kế hoạch du lịch Phú Quốc', 'du lịch Thái Lan 5 ngày', 'cuối tuần đi biển', 'lên kế hoạch đi Sa Pa',
    'lên kế hoạch đi Hội An cuối tuần', 'kế hoạch đi Côn Đảo', 'lập lịch trình đi Bangkok', 'đi Mũi Né cuối tuần', 'lên kế hoạch du lịch Ninh Bình',
  ])('destination present or proposable: %s', t => expect(plannerNeedsDestination([t])).toBe(false))
  it('a destination named earlier in the thread, or a stated slot, is enough', () => {
    expect(plannerNeedsDestination(['đi Đà Nẵng nên ăn gì', 'lên kế hoạch du lịch cuối tuần'])).toBe(false)
    expect(plannerNeedsDestination(['lên kế hoạch du lịch cuối tuần'], { diem_den: 'Huế' })).toBe(false)
  })
  it('the question is the owner wording', () => {
    expect(plannerDestinationQuestion('Lên kế hoạch du lịch cuối tuần', 'vi')).toBe('Cuối tuần này bạn muốn đi đâu? Nếu chưa chốt, mình có thể gợi ý vài điểm phù hợp.')
    expect(plannerDestinationQuestion('Lên kế hoạch du lịch', 'vi')).toBe('Bạn muốn đi đâu? Nếu chưa chốt, mình có thể gợi ý vài điểm phù hợp.')
  })
})
