// 20/11 (owner): the shared plan page carries the plan's cost lines and tips (like a proper brochure), never a link, always short.
import { describe, it, expect } from 'vitest'
import { toPlanShareSnapshot, readPlanShareSnapshot } from './planShare'
import type { TappyPlan } from '@/components/TripPlanCard'

const base = (extra: Record<string, unknown>) => ({ type: 'trip', title: 'Trip', days: [{ label: 'D1', items: [{ time: '09:00', emoji: 'x', category: 'food', name: 'Pho' }] }], ...extra }) as unknown as TappyPlan

describe('toPlanShareSnapshot: costs and tips', () => {
  it('keeps the cost lines and the tips, at most 8 and 6, link-free', () => {
    const cost_breakdown = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`Item ${i}`, `${i + 1}00.000d`]))
    cost_breakdown['Linked'] = 'see https://x.test/price'
    const local_tips = Array.from({ length: 8 }, (_, i) => ({ text: `Tip ${i}`, basis: 'general' }))
    local_tips.unshift({ text: 'Book at https://x.test/book', basis: 'general' })
    const s = toPlanShareSnapshot(base({ cost_breakdown, local_tips }))!
    expect(s.costs).toHaveLength(8)
    expect(s.costs!.some(c => /https?:/.test(c.value))).toBe(false)
    expect(s.tips!.length).toBeLessThanOrEqual(6) // the first six are read, the one that carries a link is dropped
    expect(s.tips!.some(t => /https?:/.test(t))).toBe(false)
    expect(s.tips![0]).toBe('Tip 0')
  })
  it('a plan with neither has neither field, and a stored snapshot reads back the same', () => {
    const s = toPlanShareSnapshot(base({}))!
    expect(s.costs).toBeUndefined()
    expect(s.tips).toBeUndefined()
    const t = toPlanShareSnapshot(base({ cost_breakdown: { Stay: '1.000.000d' }, local_tips: [{ text: 'Bring a coat', basis: 'general' }] }))!
    expect(readPlanShareSnapshot(JSON.parse(JSON.stringify(t)))).toEqual(t)
  })
})
