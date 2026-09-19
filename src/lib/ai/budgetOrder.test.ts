import { describe, it, expect } from 'vitest'
import { applyBudgetFilter } from './budget'

// Item 6 (2026-09-19): the luxury-hotel-brand order is a HOTEL rule. It used to ride every budgeted
// tool result — measured F8 ("nhà hàng … 500k/người"): the restaurant search carried the
// Pullman/Marriott ban, 160 tokens the model had no use for.
describe('_LENH_BAT_BUOC (luxury hotel brand ban) is attached to hotel results only', () => {
  const budget = { min: 400_000, max: 600_000, type: 'range' as const }
  it('hotel category, low budget → the order rides the result', () => {
    const out = applyBudgetFilter({ hotel_list: [] }, budget, 'khach san') as Record<string, unknown>
    expect(String(out._LENH_BAT_BUOC)).toContain('Pullman')
  })
  it('restaurant / product / flight categories → no hotel text', () => {
    for (const category of ['nhà hàng phòng riêng sinh nhật', 'tai nghe bluetooth', 've may bay']) {
      const out = applyBudgetFilter({ results: [] }, budget, category) as Record<string, unknown>
      expect(out, category).not.toHaveProperty('_LENH_BAT_BUOC')
    }
  })
  it('hotel category, high budget → no order either (nothing to ban)', () => {
    const out = applyBudgetFilter({ hotel_list: [] }, { min: 0, max: 5_000_000, type: 'under' }, 'khach san') as Record<string, unknown>
    expect(out).not.toHaveProperty('_LENH_BAT_BUOC')
  })
})
