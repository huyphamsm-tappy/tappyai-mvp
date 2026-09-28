// Owner 2026-09-28: the evening frame keeps its stages, times and code-written queries, but the
// choice follows what the user said — never one script for everyone.
import { describe, it, expect } from 'vitest'
import { EVENING_STAGES, eveningStagesFor } from './eveningPlan'
import { deriveSituation } from './consultative/situationFrame'

const q = (stages: ReturnType<typeof eveningStagesFor>) => Object.fromEntries(stages.map(s => [s.key, s.searches.map(x => x.query)]))
const sit = (text: string) => {
  const f = deriveSituation([text], { budget: null, location: { text: null } } as never)
  return { who: f.who, mood: f.mood, occasion: f.occasion, hard: f.hard, partySize: f.partySize, budgetMax: null }
}

describe('eveningStagesFor', () => {
  it('keeps the frame: same three stages, same times, every search code-written', () => {
    for (const s of [null, sit('tối nay đi chơi với người yêu'), sit('hội bạn 5 người đi quẩy')]) {
      const st = eveningStagesFor(s)
      expect(st.map(x => [x.key, x.time])).toEqual(EVENING_STAGES.map(x => [x.key, x.time]))
      for (const x of st) expect(x.searches.length).toBeGreaterThan(0)
    }
  })

  it('nothing said → the default searches', () => {
    expect(q(eveningStagesFor(sit('tối nay đi đâu chơi quận 1')))).toEqual(q(eveningStagesFor(null)))
  })

  it('a group of friends → group dinner, karaoke first, beer first', () => {
    const r = q(eveningStagesFor(sit('Tối nay đi chơi gì với hội bạn 5 người ở Quận 1')))
    expect(r.dinner[0]).toBe('quán nhậu ăn tối nhóm bạn')
    expect(r.night[0]).toBe('karaoke bowling')
    expect(r.drinks[0]).toBe('quán bia craft beer')
  })

  it('a date → romantic dinner, live music first, rooftop first', () => {
    const r = q(eveningStagesFor(sit('tối nay hẹn hò với người yêu ở quận 3')))
    expect(r.dinner[0]).toBe('nhà hàng lãng mạn ăn tối')
    expect(r.night[0]).toBe('live music phòng trà')
    expect(r.drinks[0]).toBe('rooftop bar view đẹp')
  })

  it('family → family dinner, no bar first', () => {
    const r = q(eveningStagesFor(sit('tối nay đi chơi với gia đình có con nít')))
    expect(r.dinner[0]).toBe('nhà hàng gia đình ăn tối')
    expect(r.night[0]).toBe('phố đi bộ chợ đêm')
    expect(r.drinks[0]).toBe('quán cà phê mở khuya')
  })

  it('a small budget → cheap dinner, a café for the last stop', () => {
    const r = q(eveningStagesFor({ budgetMax: 100_000 }))
    expect(r.dinner[0]).toBe('quán ăn tối ngon giá rẻ')
    expect(r.dinner).toContain('nhà hàng ăn tối ngon')
    expect(r.drinks[0]).toBe('quán cà phê mở khuya')
  })
})
