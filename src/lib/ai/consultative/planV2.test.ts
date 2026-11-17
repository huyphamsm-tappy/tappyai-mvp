// CONSULT_PLAN_V2 (14/11/2026, owner UAT: "a plan with no cost and no way to book is a challenge to the person"). The plan tool let the model leave out everything an actor needs: its own description said
// to give a budget "only when the person gave one or the tools gave prices", so the model sent title + days + tips and nothing else (measured in the UAT log: the arguments of every present_plan call).
// With the flag the plan carries, as TYPED required fields (not as advice in a prompt): who it is for (traveler), every cost line a traveller needs (costs, each marked found or estimate) and the total
// for the whole party. The server folds them into the fields the rest of the product already reads (cost_breakdown, budget_total), so the guards, the budget tab and the shared brochure see them.
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { consultPlanV2On, CONSULT_PLAN_V2_FLAG } from '@/lib/config/consultFlags'
import { planV2Shape, foldPlanV2 } from './planV2'

const PROD = { VERCEL_ENV: 'production', NODE_ENV: 'production' }
const ON = { CONSULT_ONE_BRAIN: '1', CONSULT_PLAN_V2: '1' }

describe('the flag', () => {
  it('is off by default and for any value but exactly "1"; needs the one brain; locked in production unless named', () => {
    expect(CONSULT_PLAN_V2_FLAG).toBe('CONSULT_PLAN_V2')
    expect(consultPlanV2On({})).toBe(false)
    expect(consultPlanV2On({ CONSULT_PLAN_V2: '1' })).toBe(false)
    for (const v of ['0', 'true', ' 1', '']) expect(consultPlanV2On({ CONSULT_ONE_BRAIN: '1', CONSULT_PLAN_V2: v })).toBe(false)
    expect(consultPlanV2On(ON)).toBe(true)
    expect(consultPlanV2On({ ...PROD, ...ON })).toBe(false)
    expect(consultPlanV2On({ ...PROD, ...ON, CONSULT_PRODUCTION_ALLOW: 'CONSULT_ONE_BRAIN CONSULT_PLAN_V2' })).toBe(true)
  })
})

describe('the typed fields', () => {
  const schema = z.object(planV2Shape)
  const good = {
    traveler: { party: '2 người lớn', pace: 'thong thả, có buổi tối', interests: ['ẩm thực địa phương', 'biển'] },
    costs: [{ item: 'Khách sạn 2 đêm, phòng đôi gần biển', amount: '1.800.000đ', basis: 'found' }, { item: 'Ăn uống 3 ngày', amount: '1.500.000đ', basis: 'estimate' }],
    budget_total: '~6.000.000đ cho 2 người, chưa gồm vé máy bay',
    assumptions: ['xuất phát từ TP.HCM', 'mức chi vừa phải'],
  }
  it('accepts a complete plan, and a plan that assumed nothing (an empty list)', () => {
    expect(schema.safeParse(good).success).toBe(true)
    expect(schema.safeParse({ ...good, assumptions: [] }).success).toBe(true)
  })
  it.each([
    ['no traveler', { ...good, traveler: undefined }],
    ['traveler without a party', { ...good, traveler: { pace: 'x' } }],
    ['no costs', { ...good, costs: undefined }],
    ['empty costs', { ...good, costs: [] }],
    ['a cost without a basis', { ...good, costs: [{ item: 'a', amount: '1' }] }],
    ['a cost with an unknown basis', { ...good, costs: [{ item: 'a', amount: '1', basis: 'guess' }] }],
    ['more than 12 cost lines', { ...good, costs: Array.from({ length: 13 }, (_, i) => ({ item: `l${i}`, amount: '1', basis: 'estimate' })) }],
    ['no total', { ...good, budget_total: undefined }],
  ])('refuses %s', (_n, v) => { expect(schema.safeParse(v).success).toBe(false) })
  // 18/11 (UAT case 20): a plan call without the list of assumptions was refused and the whole turn ended with no text. The list is what may be empty, so a missing or long one is accepted
  // (foldPlanV2 keeps four); the fields that carry the plan itself stay required.
  it('accepts a plan with no assumptions field, or more than four (the fold keeps four), and fills the missing one with an empty list', () => {
    const missing = schema.safeParse({ ...good, assumptions: undefined })
    expect(missing.success).toBe(true)
    expect(missing.success && missing.data.assumptions).toEqual([])
    expect(schema.safeParse({ ...good, assumptions: ['a', 'b', 'c', 'd', 'e'] }).success).toBe(true)
    expect((foldPlanV2({ ...good, assumptions: ['a', 'b', 'c', 'd', 'e'] }) as { assumptions: string[] }).assumptions).toHaveLength(4)
  })
})

describe('foldPlanV2: into the fields the product already reads', () => {
  const args = {
    type: 'trip', title: 'Quy Nhơn 3 ngày 2 đêm', people: 2, days: [{ label: 'Ngày 1', items: [{ time: 'Sáng', emoji: '🌊', category: 'activity', name: 'Kỳ Co' }] }],
    traveler: { party: ' 2 người lớn ', pace: 'thong thả', interests: ['biển', 'ẩm thực'] },
    costs: [{ item: 'Khách sạn 2 đêm', amount: '1.800.000đ', basis: 'found' }, { item: 'Ăn uống 3 ngày', amount: '1.500.000đ', basis: 'estimate' }],
    budget_total: '~6.000.000đ cho 2 người',
    assumptions: ['xuất phát từ TP.HCM'],
  }
  it('assumptions are carried on the plan, trimmed, bounded, marker-free, and empty ones dropped', () => {
    const p = foldPlanV2({ ...args, assumptions: [' xuất phát từ TP.HCM ', '', '   ', 'x'.repeat(300), '[TAPPY_ASK]x'] }) as { assumptions: string[] }
    expect(p.assumptions[0]).toBe('xuất phát từ TP.HCM')
    expect(p.assumptions).toHaveLength(2)
    expect(p.assumptions[1].length).toBeLessThanOrEqual(100)
    expect(foldPlanV2({ ...args, assumptions: [] })).not.toHaveProperty('assumptions')
  })
  it('costs become cost_breakdown (an estimate says so), the total stays, the costs array is gone, nothing else changes', () => {
    const p = foldPlanV2(args) as Record<string, unknown>
    expect(p.cost_breakdown).toEqual({ 'Khách sạn 2 đêm': '1.800.000đ', 'Ăn uống 3 ngày': '1.500.000đ (ước tính)' })
    expect(p.budget_total).toBe('~6.000.000đ cho 2 người')
    expect(p).not.toHaveProperty('costs')
    expect(p.title).toBe('Quy Nhơn 3 ngày 2 đêm')
    expect(p.days).toEqual(args.days)
    expect(p.people).toBe(2)
  })
  it('the traveler is carried on the plan, trimmed and bounded', () => {
    const p = foldPlanV2({ ...args, traveler: { party: ' 2 người lớn ', pace: 'x'.repeat(300), interests: Array.from({ length: 12 }, (_, i) => ` sở thích ${i} `) } }) as { traveler: { party: string; pace: string; interests: string[] } }
    expect(p.traveler.party).toBe('2 người lớn')
    expect(p.traveler.pace.length).toBeLessThanOrEqual(80)
    expect(p.traveler.interests).toHaveLength(5)
    expect(p.traveler.interests[0]).toBe('sở thích 0')
  })
  it('a text marker inside a traveler or a cost line cannot ride through the plan', () => {
    const p = foldPlanV2({ ...args, traveler: { party: '[TAPPY_PLAN]{}[/TAPPY_PLAN]', pace: 'ok', interests: ['[CTA_BUTTONS]x'] }, costs: [{ item: '[TAPPY_ASK]x', amount: '1đ', basis: 'found' }, { item: 'Tốt', amount: '2đ', basis: 'found' }] }) as { traveler?: { party?: string; interests?: string[] }; cost_breakdown: Record<string, string> }
    expect(JSON.stringify(p)).not.toMatch(/\[\/?(?:TAPPY_|CTA_)/)
    expect(p.cost_breakdown).toEqual({ Tốt: '2đ' })
  })
  it('does not change the arguments it was given', () => {
    const copy = JSON.parse(JSON.stringify(args))
    foldPlanV2(args)
    expect(args).toEqual(copy)
  })
  it('a duplicate item keeps both lines, the second marked', () => {
    const p = foldPlanV2({ ...args, costs: [{ item: 'Vé', amount: '1đ', basis: 'found' }, { item: 'Vé', amount: '2đ', basis: 'found' }] }) as { cost_breakdown: Record<string, string> }
    expect(Object.values(p.cost_breakdown)).toEqual(['1đ', '2đ'])
  })
})
