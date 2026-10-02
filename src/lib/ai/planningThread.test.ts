import { describe, expect, it } from 'vitest'
import { detectPlanningIntent, detectTripLength, isPlanningRefinement } from './intent'
import { buildPlanningBlock } from './promptBuilder'

// ── Phase 7 group 4 (2026-09-22): a plan is built across turns, not re-asked ─────
//
// Golden set T1 (three turns) and G4a, measured on the baseline run:
//   T1 t1 "…Đà Nẵng 3 ngày, 2 người…"     → asked "máy bay hay xe khách?", no plan
//   T1 t2 "mai đi mốt về, budget 20 triệu"  → "3 ngày…" (misread), re-asked transport, no plan
//   T1 t3 "gần biển"                        → cards, no plan, question again
//   G4a  "Đi Đà Lạt cuối tuần này"          → two questions, no plan
// The planning block was decided from the LAST message alone; the follow-ups never carried it.

describe('detectTripLength', () => {
  it('🚨 "mai đi mốt về" is two days, one night — not three', () => {
    expect(detectTripLength('mai đi mốt về, budget 20 triệu')).toEqual({ days: 2, nights: 1, from: 'mai đi mốt về' })
  })
  it('literal lengths', () => {
    expect(detectTripLength('Đà Nẵng 3 ngày 2 đêm')).toMatchObject({ days: 3, nights: 2 })
    expect(detectTripLength('đi Đà Nẵng 3 ngày, 2 người')).toMatchObject({ days: 3, nights: 2 })
    expect(detectTripLength('2 đêm ở Đà Lạt')).toMatchObject({ days: 3, nights: 2 })
    expect(detectTripLength('sáng đi chiều về Vũng Tàu')).toMatchObject({ days: 1, nights: 0 })
  })
  it('nothing stated → null (the block states the default as an assumption)', () => {
    expect(detectTripLength('gần biển')).toBeNull()
    expect(detectTripLength('Đi Đà Lạt cuối tuần này')).toBeNull()
  })
})

describe('detectPlanningIntent — go-verb + destination + when', () => {
  it('🚨 G4a: "Đi Đà Lạt cuối tuần này" is a trip', () => {
    expect(detectPlanningIntent('Đi Đà Lạt cuối tuần này')).toBe('trip')
    expect(detectPlanningIntent('lên Đà Lạt tuần sau')).toBe('trip')
    expect(detectPlanningIntent('mai đi Vũng Tàu')).toBe('trip')
  })
  it('a ticket question keeps its transport tool', () => {
    expect(detectPlanningIntent('xe khách đi Đà Lạt cuối tuần')).toBeNull()
    expect(detectPlanningIntent('vé máy bay đi Đà Nẵng tuần sau')).toBeNull()
  })
  it('a destination with no when is still a plain search', () => {
    expect(detectPlanningIntent('Tìm khách sạn Đà Nẵng')).toBeNull()
    expect(detectPlanningIntent('quán ăn ngon ở Đà Lạt')).toBeNull()
  })
})

describe('isPlanningRefinement', () => {
  it('the T1 follow-ups refine the plan', () => {
    expect(isPlanningRefinement('mai đi mốt về, budget 20 triệu')).toBe(true)
    expect(isPlanningRefinement('gần biển')).toBe(true)
    expect(isPlanningRefinement('2 người thôi')).toBe(true)
  })
  it('a new subject does not inherit the plan', () => {
    expect(isPlanningRefinement('giá vàng hôm nay')).toBe(false)
    expect(isPlanningRefinement('muốn mua macbook pro m1')).toBe(false)
    expect(isPlanningRefinement('vé máy bay đi Hà Nội bao nhiêu')).toBe(false)
  })
})

describe('buildPlanningBlock — thread context', () => {
  it('states the decided length and demands that many days', () => {
    const block = buildPlanningBlock('trip', 'vi', { tripLength: { days: 2, nights: 1, from: 'mai đi mốt về' } })
    expect(block).toContain('ĐỘ DÀI CHUYẾN ĐI: 2 ngày 1 đêm')
    expect(block).toContain('ĐÚNG 2 phần tử')
  })
  it('an unstated length is an assumption, said so', () => {
    expect(buildPlanningBlock('trip', 'vi')).toContain('mặc định 2 ngày 1 đêm')
    expect(buildPlanningBlock('evening', 'vi')).not.toContain('ĐỘ DÀI CHUYẾN ĐI')
  })
  it('a refinement turn is told to acknowledge and plan, never re-ask', () => {
    const block = buildPlanningBlock('trip', 'vi', { inherited: true, refinement: 'gần biển' })
    expect(block).toContain('LƯỢT BỔ SUNG')
    expect(block).toContain('"gần biển"')
    expect(block).toContain('KHÔNG hỏi lại')
  })
  it('transport is an assumption, not a question; a correction replaces the number', () => {
    const block = buildPlanningBlock('trip', 'vi')
    expect(block).toContain('KHÔNG hỏi "đi máy bay hay xe khách')
    expect(block).toContain('SỬA LÀ THAY THẾ')
    expect(block).toContain('HỎI MỘT LẦN, KHÔNG HỎI LẠI')
  })
})
