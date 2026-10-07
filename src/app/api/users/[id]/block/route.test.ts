import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// User blocks — the two routes (owner 01/10). The database is the authority for what a block DOES (supabase/tests/user_blocks.test.ts);
// these pin the gate: flag off = 404, no session = 401, anonymous = 403, bad / own id = 400, 30 per minute, both tables
// written, no existence oracle, no half-block.

const h = vi.hoisted(() => ({
  user: { id: '11111111-1111-4111-8111-111111111111', is_anonymous: false } as { id: string; is_anonymous?: boolean } | null,
  insertErr: { user_blocks: null as null | { code: string }, chat_blocks: null as null | { code: string } },
  inserts: [] as Array<{ table: string; row: unknown }>,
  deletes: [] as Array<{ table: string; filters: Record<string, string> }>,
  adminDeletes: [] as string[],
  limit: { ok: true },
  limitKeys: [] as string[],
}))

vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: async () => ({
    user: h.user,
    supabase: {
      from: (table: 'user_blocks' | 'chat_blocks') => ({
        insert: async (row: unknown) => { h.inserts.push({ table, row }); return { error: h.insertErr[table] } },
        delete: () => {
          const filters: Record<string, string> = {}
          const b: { eq: (k: string, v: string) => typeof b; then: (r: (v: { error: null }) => unknown) => unknown } = {
            eq: (k, v) => { filters[k] = v; return b },
            then: (r) => { h.deletes.push({ table, filters }); return r({ error: null }) },
          }
          return b
        },
      }),
    },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ delete: () => ({ or: async (f: string) => { h.adminDeletes.push(f); return { error: null } } }) }) }),
}))
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: (k: string) => { h.limitKeys.push(k); return { ok: h.limit.ok, retryAfter: 0 } } }))

import { POST, DELETE } from './route'

const ME = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const call = (fn: typeof POST, id: string) => fn(new Request(`http://localhost/api/users/${id}/block`, { method: 'POST' }) as never, { params: { id } })

describe('POST/DELETE /api/users/[id]/block', () => {
  const prev = process.env.USER_BLOCKS_ENABLED
  beforeEach(() => {
    process.env.USER_BLOCKS_ENABLED = 'true'
    h.user = { id: ME, is_anonymous: false }; h.insertErr = { user_blocks: null, chat_blocks: null }
    h.inserts = []; h.deletes = []; h.adminDeletes = []; h.limit = { ok: true }; h.limitKeys = []
  })
  afterEach(() => { if (prev === undefined) delete process.env.USER_BLOCKS_ENABLED; else process.env.USER_BLOCKS_ENABLED = prev })

  it('flag OFF (the default): 404 with an empty body, nothing is written', async () => {
    delete process.env.USER_BLOCKS_ENABLED
    for (const fn of [POST, DELETE]) { const r = await call(fn, OTHER); expect(r.status).toBe(404); expect(await r.text()).toBe('') }
    process.env.USER_BLOCKS_ENABLED = 'yes'
    expect((await call(POST, OTHER)).status).toBe(404) // only the exact value «true» turns it on
    expect(h.inserts).toEqual([])
  })

  it('no session 401; anonymous session 403; invalid or own id 400', async () => {
    h.user = null
    expect((await call(POST, OTHER)).status).toBe(401)
    h.user = { id: ME, is_anonymous: true }
    expect((await call(POST, OTHER)).status).toBe(403)
    h.user = { id: ME, is_anonymous: false }
    expect((await call(POST, 'not-a-uuid')).status).toBe(400)
    expect((await call(POST, ME)).status).toBe(400)
    expect(h.inserts).toEqual([])
  })

  it('a block writes BOTH tables as the caller, then clears follows in both directions', async () => {
    const r = await call(POST, OTHER)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, blocked: true })
    expect(h.inserts).toEqual([
      { table: 'user_blocks', row: { blocker_id: ME, blocked_id: OTHER } },
      { table: 'chat_blocks', row: { blocker_id: ME, blocked_id: OTHER } },
    ])
    expect(h.adminDeletes).toHaveLength(1)
    expect(h.adminDeletes[0]).toContain(`follower_id.eq.${ME},following_id.eq.${OTHER}`)
    expect(h.adminDeletes[0]).toContain(`follower_id.eq.${OTHER},following_id.eq.${ME}`)
  })

  it('blocking twice is a success (23505); a target that does not exist answers exactly like success (23503): no oracle', async () => {
    h.insertErr = { user_blocks: { code: '23505' }, chat_blocks: { code: '23505' } }
    expect(await (await call(POST, OTHER)).json()).toEqual({ ok: true, blocked: true })
    h.insertErr = { user_blocks: { code: '23503' }, chat_blocks: { code: '23503' } }
    expect(await (await call(POST, OTHER)).json()).toEqual({ ok: true, blocked: true })
  })

  it('no half-block: if the chat row fails, the product-wide row is taken back and the answer is 500', async () => {
    h.insertErr = { user_blocks: null, chat_blocks: { code: '42P01' } }
    const r = await call(POST, OTHER)
    expect(r.status).toBe(500)
    expect(h.deletes).toEqual([{ table: 'user_blocks', filters: { blocker_id: ME, blocked_id: OTHER } }])
    h.insertErr = { user_blocks: { code: '42501' }, chat_blocks: null }
    expect((await call(POST, OTHER)).status).toBe(500)
  })

  it('30 per minute per account: the 31st is 429 and writes nothing', async () => {
    h.limit = { ok: false }
    const r = await call(POST, OTHER)
    expect(r.status).toBe(429)
    expect(h.limitKeys).toEqual([`user-block:${ME}`])
    expect(h.inserts).toEqual([])
  })

  it('DELETE removes the caller’s row in both tables and reports blocked:false', async () => {
    const r = await call(DELETE, OTHER)
    expect(await r.json()).toEqual({ ok: true, blocked: false })
    expect(h.deletes.map((d) => d.table).sort()).toEqual(['chat_blocks', 'user_blocks'])
    for (const d of h.deletes) expect(d.filters).toEqual({ blocker_id: ME, blocked_id: OTHER })
  })
})
