import { describe, it, expect, vi, beforeEach } from 'vitest'

/** GET /api/messaging/unread: the two numbers behind the navigation badge, read with the caller's own client; any problem is zeros, never a wrong number. */

const h = vi.hoisted(() => {
  const state = {
    user: { id: 'u1', is_anonymous: false } as Record<string, unknown> | null,
    rpc: { data: [] as unknown, error: null as unknown },
    count: { count: 0 as number | null, error: null as unknown },
    filters: [] as string[],
  }
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.eq = (c: string, v: string) => { state.filters.push(`eq:${c}=${v}`); return q }
  q.is = (c: string, v: unknown) => { state.filters.push(`is:${c}=${String(v)}`); return q }
  ;(q as { then: unknown }).then = (res: (v: unknown) => unknown) => Promise.resolve(state.count).then(res)
  const supabase = { rpc: async () => state.rpc, from: (t: string) => { state.filters.push(`from:${t}`); return q } }
  return { state, getRequestUser: vi.fn(async () => ({ user: state.user, supabase })) }
})
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: h.getRequestUser }))

import { GET, dynamic, fetchCache } from './unread/route'

const call = async () => (await GET(new Request('http://localhost/api/messaging/unread') as never)).json()

beforeEach(() => {
  h.state.user = { id: 'u1', is_anonymous: false }
  h.state.rpc = { data: [], error: null }
  h.state.count = { count: 0, error: null }
  h.state.filters = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /api/messaging/unread', () => {
  it('REGRESSION (found in the live check): no database read may come from Next\'s data cache — a GET-only route that is not marked no-store answered a second call with the first call\'s count', () => {
    expect(dynamic).toBe('force-dynamic')
    expect(fetchCache).toBe('force-no-store')
  })

  it('sums the unread of every conversation and reports how many unread notifications are message notifications', async () => {
    h.state.rpc = { data: [{ unread_count: 2 }, { unread_count: 0 }, { unread_count: 5 }], error: null }
    h.state.count = { count: 2, error: null }
    expect(await call()).toEqual({ messages: 7, messageNotifications: 2 })
    expect(h.state.filters).toEqual(expect.arrayContaining(['from:notifications', 'eq:user_id=u1', 'eq:type=message', 'is:read_at=null']))
  })

  it('signed out or anonymous: zeros, nothing read', async () => {
    h.state.user = null
    expect(await call()).toEqual({ messages: 0, messageNotifications: 0 })
    h.state.user = { id: 'a', is_anonymous: true }
    expect(await call()).toEqual({ messages: 0, messageNotifications: 0 })
    expect(h.state.filters).toEqual([])
  })

  it('ignores junk in a row (negative, missing, not a number) instead of producing a wrong total', async () => {
    h.state.rpc = { data: [{ unread_count: -4 }, {}, { unread_count: 'x' }, { unread_count: 3 }], error: null }
    expect((await call()).messages).toBe(3)
  })

  it('a failed conversation read is zeros; a failed notification count only leaves that number at 0', async () => {
    h.state.rpc = { data: null, error: { message: 'boom' } }
    expect(await call()).toEqual({ messages: 0, messageNotifications: 0 })
    h.state.rpc = { data: [{ unread_count: 4 }], error: null }
    h.state.count = { count: null, error: { message: 'boom' } }
    expect(await call()).toEqual({ messages: 4, messageNotifications: 0 })
  })
})
