import { describe, it, expect } from 'vitest'
import { planCostSubject } from './streamEnrichment'
import { appendConsultPlanCost } from './planBudgetMath'

// Replay FOOD-1 (30/09, level A): the plan chose MANMARU but its cost line priced "FEN Izakaya" (the first search row).
const bands = new Map([['FEN Izakaya', { lo: 100000, hi: 600000 } as never], ['Nori - Modern Izakaya', { lo: 200000, hi: 400000 } as never]])
const plan = '**Mình chọn: MANMARU - Japanese Restaurant - 71 Mạc Đĩnh Chi, Hồ Chí Minh** — 4.4⭐\n\n**Chi phí**\n\n**Đi lại & gửi xe**'

describe('plan cost line — the chosen venue, never the first search row', () => {
  it('no band for the chosen venue → no band (not another venue\'s)', () => {
    expect(planCostSubject(plan, 'FEN Izakaya', bands)).toEqual({ name: 'MANMARU - Japanese Restaurant - 71 Mạc Đĩnh Chi, Hồ Chí Minh', band: null })
    const out = appendConsultPlanCost(plan, { people: 2, band: null, perHead: null, pickName: 'MANMARU - Japanese Restaurant - 71 Mạc Đĩnh Chi, Hồ Chí Minh' }).text
    expect(out).not.toContain('FEN Izakaya')
    expect(out).toContain('MANMARU - Japanese Restaurant - 71 Mạc Đĩnh Chi, Hồ Chí Minh: chưa có giá — hỏi quán.')
  })
  it('the chosen venue\'s own band when it has one (short form matches the long row name)', () => {
    expect(planCostSubject('**Mình chọn: Nori**\n', null, bands)).toEqual({ name: 'Nori', band: { lo: 200000, hi: 400000 } })
  })
  it('no stated pick → the card\'s first recommendation, matched by name', () => {
    expect(planCostSubject('no pick line', 'FEN Izakaya', bands).band).toEqual({ lo: 100000, hi: 600000 })
  })
  it('ENT-1: no "Mình chọn" in the plan → the conversation\'s pick (Santori), not the first row (MEI)', () => {
    const karaoke = new Map([['Karaoke MEI', { lo: 100000, hi: 600000 } as never]])
    const text = ['**Lịch buổi**', '- 19:30–23:00: Hát karaoke tại **Karaoke Santori**', '', '**Chi phí**', ''].join('\n')
    const subj = planCostSubject(text, 'Karaoke Santori', karaoke)
    expect(subj).toEqual({ name: 'Karaoke Santori', band: null })
    expect(appendConsultPlanCost(text, { people: 8, band: subj.band, perHead: null, pickName: subj.name }).text).not.toContain('MEI')
  })
})
