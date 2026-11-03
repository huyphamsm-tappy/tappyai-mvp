import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  user: { id: 'u1', is_anonymous: false } as { id: string; is_anonymous?: boolean } | null,
  data: {
    user_blocks: [{ blocked_id: 'b', created_at: '2026-10-01T10:00:00Z' }, { blocked_id: 'c', created_at: '2026-09-30T10:00:00Z' }],
    chat_blocks: [{ blocked_id: 'c', created_at: '2026-09-29T10:00:00Z' }, { blocked_id: 'd', created_at: '2026-10-01T11:00:00Z' }],
  } as Record<string, Array<{ blocked_id: string; created_at: string }>>,
  error: null as unknown,
}))
vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: async () => ({
    user: h.user,
    supabase: { from: (t: string) => ({ select: () => ({ order: () => ({ limit: async () => ({ data: h.data[t], error: h.error }) }) }) }) },
  }),
}))

import { GET } from './route'
const call = () => GET(new Request('http://localhost/api/users/blocks') as never)

describe('GET /api/users/blocks', () => {
  const prev = process.env.USER_BLOCKS_ENABLED
  beforeEach(() => { process.env.USER_BLOCKS_ENABLED = 'true'; h.user = { id: 'u1', is_anonymous: false }; h.error = null })
  afterEach(() => { if (prev === undefined) delete process.env.USER_BLOCKS_ENABLED; else process.env.USER_BLOCKS_ENABLED = prev })

  it('flag OFF: 404, empty body', async () => {
    delete process.env.USER_BLOCKS_ENABLED
    const r = await call(); expect(r.status).toBe(404); expect(await r.text()).toBe('')
  })
  it('no session 401, anonymous 403', async () => {
    h.user = null; expect((await call()).status).toBe(401)
    h.user = { id: 'u1', is_anonymous: true }; expect((await call()).status).toBe(403)
  })
  it('the caller’s own list, user_blocks and the release chat merged, de-duplicated, newest first', async () => {
    const r = await call()
    expect((await r.json()).blocks.map((b: { blocked_id: string }) => b.blocked_id)).toEqual(['d', 'b', 'c'])
  })
  it('a failed read is a 500, never an empty list that looks like "nobody blocked"', async () => {
    h.error = { code: 'x' }
    expect((await call()).status).toBe(500)
  })
})
