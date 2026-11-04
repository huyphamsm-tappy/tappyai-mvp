import { describe, it, expect, vi, beforeEach } from 'vitest'

// D7 (DR-4, 05/11/2026): reading is done by the database function `mark_notifications_read(p_ids)`. A collapsed "message" notification is the
// thread's unread pointer, so reading it also moves the chat cursor, in one transaction under the lock the emitter uses. The route sends only ids.
const h = vi.hoisted(() => {
  const state = { user: { id: 'u1' } as any, result: { data: 0, error: null } as any, rpcs: [] as Array<{ name: string; args: any }>, tables: [] as string[] }
  const builder: any = {}
  builder.from = (t: string) => { state.tables.push(t); return builder }
  builder.rpc = (name: string, args: any) => { state.rpcs.push({ name, args }); return Promise.resolve(state.result) }
  const getRequestUser = vi.fn(async () => ({ user: state.user, supabase: builder }))
  return { state, getRequestUser }
})

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: h.getRequestUser }))
import { POST } from './route'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

const req = (body?: unknown) =>
  new Request('http://localhost/api/notifications/read', {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  })

beforeEach(() => {
  vi.clearAllMocks()
  h.state.user = { id: 'u1' }
  h.state.result = { data: 0, error: null }
  h.state.rpcs = []
  h.state.tables = []
})

describe('POST /api/notifications/read — server-side read state', () => {
  it('401 when unauthenticated', async () => {
    h.state.user = null
    const res = await POST(req())
    expect(res.status).toBe(401)
    expect(h.state.rpcs).toHaveLength(0)
  })

  it('mark-all (no body) → 200, one call to mark_notifications_read with no id filter, and no direct write to the table', async () => {
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(h.state.rpcs).toEqual([{ name: 'mark_notifications_read', args: { p_ids: null } }])
    expect(h.state.tables).toEqual([])
  })

  it('an empty ids list is mark-all, as before', async () => {
    await POST(req({ ids: [] }))
    expect(h.state.rpcs).toEqual([{ name: 'mark_notifications_read', args: { p_ids: null } }])
  })

  it('mark specific ids → passes those uuids', async () => {
    const res = await POST(req({ ids: [A, B] }))
    expect(res.status).toBe(200)
    expect(h.state.rpcs).toEqual([{ name: 'mark_notifications_read', args: { p_ids: [A, B] } }])
  })

  it('drops ids that are not uuids; if NONE are valid it reads nothing (it must not fall back to mark-all)', async () => {
    await POST(req({ ids: [A, 'x', 5, 'not-a-uuid'] }))
    expect(h.state.rpcs).toEqual([{ name: 'mark_notifications_read', args: { p_ids: [A] } }])
    h.state.rpcs = []
    const res = await POST(req({ ids: ['x', 'y'] }))
    expect(res.status).toBe(200)
    expect(h.state.rpcs).toHaveLength(0)
  })

  it('db error → 500', async () => {
    h.state.result = { data: null, error: { message: 'boom' } }
    const res = await POST(req())
    expect(res.status).toBe(500)
  })
})
