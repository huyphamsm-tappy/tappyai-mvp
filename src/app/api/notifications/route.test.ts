import { describe, it, expect, vi, beforeEach } from 'vitest'

// A thenable supabase stub: every builder method returns itself; awaiting yields
// the next canned result in `state.results` (await order: list → profiles → count).
const h = vi.hoisted(() => {
  const state = { user: { id: 'u1' } as any, results: [] as any[], i: 0 }
  const builder: any = {}
  for (const m of ['from', 'select', 'eq', 'is', 'in', 'order', 'limit', 'lt']) builder[m] = () => builder
  builder.then = (res: any, rej: any) => Promise.resolve(state.results[state.i++]).then(res, rej)
  const getRequestUser = vi.fn(async () => ({ user: state.user, supabase: builder }))
  return { state, getRequestUser }
})

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: h.getRequestUser }))
import { GET } from './route'

const req = (qs = '') => new Request('http://localhost/api/notifications' + qs)

beforeEach(() => {
  vi.clearAllMocks()
  h.state.user = { id: 'u1' }
  h.state.results = []
  h.state.i = 0
})

describe('GET /api/notifications — table-backed contract v1', () => {
  it('anonymous → empty list + zero unread, no DB access', async () => {
    h.state.user = null
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ notifications: [], unread_count: 0 })
    expect(h.getRequestUser).toHaveBeenCalled()
  })

  it('maps rows to the DTO, resolves actor profiles, returns unread_count', async () => {
    h.state.results = [
      { data: [
        { id: 'n1', type: 'like', category: 'social', title: '❤️ Nam thích review của bạn', body: 'Phở', actor_id: 'a1', entity_url: '/reviews/r1', image_url: null, data: {}, read_at: null, created_at: '2026-07-26T00:00:00Z' },
        { id: 'n2', type: 'deal', category: 'deal', title: '🛍️ Deal', body: 'Giảm 20%', actor_id: null, entity_url: '/deals', image_url: null, data: {}, read_at: '2026-07-25T00:00:00Z', created_at: '2026-07-25T00:00:00Z' },
      ], error: null },
      { data: [{ id: 'a1', full_name: 'Trần Nam', avatar_url: 'x.png' }] },
      { count: 1 },
    ]
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.unread_count).toBe(1)
    expect(body.notifications).toHaveLength(2)
    expect(body.notifications[0].actor).toEqual({ id: 'a1', name: 'Trần Nam', avatar: 'x.png' })
    expect(body.notifications[1].actor).toBeNull()
    expect(body.notifications[1]).toMatchObject({ type: 'deal', category: 'deal', entity_url: '/deals' })
  })

  it('skips the profiles fetch when no row has an actor (count is the 2nd query)', async () => {
    h.state.results = [
      { data: [
        { id: 'n1', type: 'lunch', category: 'explore', title: '🍜', body: 'Ăn trưa', actor_id: null, entity_url: '/', image_url: null, data: {}, read_at: null, created_at: '2026-07-26T00:00:00Z' },
      ], error: null },
      { count: 1 }, // count, not profiles
    ]
    const res = await GET(req())
    const body = await res.json()
    expect(body.notifications[0].actor).toBeNull()
    expect(body.unread_count).toBe(1)
  })

  it('a read error → 500 with an empty envelope', async () => {
    h.state.results = [{ data: null, error: { message: 'boom' } }]
    const res = await GET(req())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ notifications: [], unread_count: 0 })
  })
})
