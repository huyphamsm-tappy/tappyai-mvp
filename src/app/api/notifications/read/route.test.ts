import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => {
  const state = { user: { id: 'u1' } as any, result: { error: null } as any, calls: [] as string[], ids: null as any }
  const builder: any = {}
  builder.from = (t: string) => { state.calls.push('from:' + t); return builder }
  builder.update = () => { state.calls.push('update'); return builder }
  builder.eq = () => builder
  builder.is = () => builder
  builder.in = (_c: string, ids: string[]) => { state.ids = ids; return builder }
  builder.then = (res: any, rej: any) => Promise.resolve(state.result).then(res, rej)
  const getRequestUser = vi.fn(async () => ({ user: state.user, supabase: builder }))
  return { state, getRequestUser }
})

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: h.getRequestUser }))
import { POST } from './route'

const req = (body?: unknown) =>
  new Request('http://localhost/api/notifications/read', {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  })

beforeEach(() => {
  vi.clearAllMocks()
  h.state.user = { id: 'u1' }
  h.state.result = { error: null }
  h.state.calls = []
  h.state.ids = null
})

describe('POST /api/notifications/read — server-side read state', () => {
  it('401 when unauthenticated', async () => {
    h.state.user = null
    const res = await POST(req())
    expect(res.status).toBe(401)
  })

  it('mark-all (no body) → 200, updates notifications', async () => {
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(h.state.calls).toContain('from:notifications')
    expect(h.state.calls).toContain('update')
    expect(h.state.ids).toBeNull() // no id filter → all unread
  })

  it('mark specific ids → applies an id filter', async () => {
    const res = await POST(req({ ids: ['a', 'b'] }))
    expect(res.status).toBe(200)
    expect(h.state.ids).toEqual(['a', 'b'])
  })

  it('db error → 500', async () => {
    h.state.result = { error: { message: 'boom' } }
    const res = await POST(req())
    expect(res.status).toBe(500)
  })
})
