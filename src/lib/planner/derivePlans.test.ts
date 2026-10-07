import { describe, it, expect } from 'vitest'
import { derivePlans, plansInConversation, plannerFacets, type PlannerConversationRow } from './derivePlans'

// ── My Plans is DERIVED, and these are the claims that keeps honest ──────────
//
// The Planner has no table of its own. Everything it shows is read back out of
// `conversations.messages`, so the risk this suite exists to guard is not "does the list
// render" — it is "does the list assert anything the data did not say". The mockup that
// seeded this surface showed dates, statuses and cover art for plans that carry none of
// the three; the tests below pin the absence of each, because an absence is exactly the
// kind of property that silently comes back.

const plan = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: 'trip',
    title: 'Đà Lạt 2 ngày',
    people: 2,
    budget_total: '3 triệu',
    days: [
      { label: 'Ngày 1', items: [{ time: '08:00', emoji: '🏨', category: 'hotel', name: 'Khách sạn A', photo_url: 'https://cdn/a.jpg' }] },
      { label: 'Ngày 2', items: [{ time: '09:00', emoji: '🍜', category: 'food', name: 'Quán B' }] },
    ],
    ...over,
  })

const assistant = (body: string, prefix = 'Kế hoạch đây.\n') => ({
  role: 'assistant',
  content: `${prefix}[TAPPY_PLAN]${body}[/TAPPY_PLAN]\nChúc bạn đi vui!`,
})

const conv = (over: Partial<PlannerConversationRow> = {}): PlannerConversationRow => ({
  id: 'c1',
  title: 'Chuyến Đà Lạt',
  updated_at: '2026-09-01T10:00:00.000Z',
  messages: [{ role: 'user', content: 'Lên kế hoạch Đà Lạt' }, assistant(plan())],
  ...over,
})

describe('plans are read out of the conversation the user already has', () => {
  it('finds a plan inside a persisted assistant message', () => {
    const [p] = plansInConversation(conv())
    expect(p.title).toBe('Đà Lạt 2 ngày')
    expect(p.kind).toBe('trip')
    expect(p.conversationId).toBe('c1')
    // The plan opens where it lives. There is no /planner/[id] route because there is no plan row.
    expect(p.href).toBe('/chat/c1')
  })

  it('counts days and stops from the itinerary instead of trusting a summary field', () => {
    const [p] = plansInConversation(conv())
    expect(p.dayCount).toBe(2)
    expect(p.stopCount).toBe(2)
    expect(p.categories).toEqual(['hotel', 'food'])
  })

  it('a thread with two plans yields two cards, keyed by position so they stay distinct', () => {
    const rows = [conv({ messages: [assistant(plan()), assistant(plan({ title: 'Đà Lạt bản 2' }))] })]
    const plans = derivePlans(rows)
    expect(plans.map((p) => p.title)).toEqual(['Đà Lạt 2 ngày', 'Đà Lạt bản 2'])
    expect(new Set(plans.map((p) => p.id)).size).toBe(2)
  })

  it('ignores a marker the USER typed — pasting the text is not making a plan', () => {
    const rows = [conv({ messages: [{ role: 'user', content: `[TAPPY_PLAN]${plan()}[/TAPPY_PLAN]` }] })]
    expect(derivePlans(rows)).toEqual([])
  })

  it('ignores an unterminated block — a stream that died is not a plan the user has', () => {
    const rows = [conv({ messages: [{ role: 'assistant', content: `[TAPPY_PLAN]${plan().slice(0, 40)}` }] })]
    expect(derivePlans(rows)).toEqual([])
  })

  it('ignores a malformed payload rather than rendering a broken card', () => {
    const rows = [conv({ messages: [assistant('{not json')] })]
    expect(derivePlans(rows)).toEqual([])
  })

  it('survives a conversation whose messages column is not an array', () => {
    expect(derivePlans([conv({ messages: null })])).toEqual([])
    expect(derivePlans([conv({ messages: { a: 1 } })])).toEqual([])
  })
})

describe('nothing the contract does not carry is manufactured', () => {
  it('exposes no date, no status and no plan-level cover field', () => {
    const [p] = plansInConversation(conv())
    // 🚨 The mockup showed "05/06/2026 → 06/06/2026" and "Đã hoàn thành". A TappyPlan has neither
    // a date nor a lifecycle, and a derived object must not grow a place to put one.
    for (const forbidden of ['startDate', 'endDate', 'dateRange', 'status', 'progress']) {
      expect(p, `${forbidden} has no source in TappyPlan`).not.toHaveProperty(forbidden)
    }
  })

  it('the cover is a real stop photo, and null when no stop has one', () => {
    const [withPhoto] = plansInConversation(conv())
    expect(withPhoto.coverUrl).toBe('https://cdn/a.jpg')

    const bare = plan({ days: [{ label: 'Ngày 1', items: [{ name: 'Quán B', category: 'food' }] }] })
    const [withoutPhoto] = plansInConversation(conv({ messages: [assistant(bare)] }))
    expect(withoutPhoto.coverUrl, 'no placeholder art stands in for a missing photo').toBeNull()
  })

  it('omits people and budget when the model did not record them — no defaulting to 1', () => {
    const bare = plan({ people: undefined, budget_total: undefined })
    const [p] = plansInConversation(conv({ messages: [assistant(bare)] }))
    expect(p.people).toBeNull()
    expect(p.budgetTotal).toBeNull()
  })

  it('keeps budget_total a string — the wire contract says string on web, Android and iOS', () => {
    const [p] = plansInConversation(conv())
    expect(typeof p.budgetTotal).toBe('string')
    expect(p.budgetTotal).toBe('3 triệu')
  })

  it('reports an unrecognised type as unknown instead of coercing it to trip', () => {
    const [p] = plansInConversation(conv({ messages: [assistant(plan({ type: 'work' }))] }))
    expect(p.kind, 'there is no work plan in this product').toBeNull()
  })

  it('the timestamp is the thread\'s, and is the only time value in the object', () => {
    const [p] = plansInConversation(conv())
    expect(p.updatedAt).toBe('2026-09-01T10:00:00.000Z')
  })
})

describe('filters are built from what exists, not from a taxonomy', () => {
  it('offers no chips when every plan is the same kind — filtering a list into itself is not a feature', () => {
    expect(plannerFacets(derivePlans([conv()]))).toEqual([])
  })

  it('offers both kinds only once both are present', () => {
    const evening = plan({ type: 'evening', title: 'Tối nay ở Q1', days: [{ label: 'Tối nay', items: [] }] })
    const plans = derivePlans([conv(), conv({ id: 'c2', messages: [assistant(evening)] })])
    expect(plannerFacets(plans)).toEqual(['trip', 'evening'])
  })

  it('never offers a Work chip — nothing in this codebase can emit one', () => {
    const plans = derivePlans([conv(), conv({ id: 'c2', messages: [assistant(plan({ type: 'work' }))] })])
    expect(plannerFacets(plans)).not.toContain('work')
  })
})
