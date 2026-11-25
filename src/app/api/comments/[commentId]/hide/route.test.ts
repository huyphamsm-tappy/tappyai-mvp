// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// POST /api/comments/[commentId]/hide: only the OWNER of the post hides / shows a comment under it; only their own hide can be undone here; a hide by the system or a moderator needs a moderator.

const OWNER = '11111111-1111-4111-8111-111111111111'
const AUTHOR = '22222222-2222-4222-8222-222222222222'
const STRANGER = '33333333-3333-4333-8333-333333333333'
const CID = '44444444-4444-4444-8444-444444444444'
const RID = '55555555-5555-4555-8555-555555555555'

const h = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  comment: null as Record<string, unknown> | null,
  ownerOfPost: '11111111-1111-4111-8111-111111111111' as string | null,
  updates: [] as Array<Record<string, unknown>>,
}))
vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: async () => ({ user: h.user, supabase: {} }) }))
vi.mock('@/lib/security/publicRateLimit', () => ({ publicRateLimit: async () => ({ ok: true }) }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const b: Record<string, unknown> = {}
      b.select = () => b; b.eq = () => b; b.is = () => b
      b.maybeSingle = async () => table === 'review_comments' ? { data: h.comment, error: null } : { data: h.ownerOfPost ? { user_id: h.ownerOfPost } : null, error: null }
      b.update = (v: Record<string, unknown>) => { h.updates.push(v); return b }
      b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(res)
      return b
    },
  }),
}))

import { POST } from './route'
const call = (hidden: unknown, id = CID) => POST(new Request('http://localhost/api/x', { method: 'POST', body: JSON.stringify({ hidden }) }) as never, { params: { commentId: id } } as never)

beforeEach(() => {
  h.user = { id: OWNER, is_anonymous: false }
  h.comment = { id: CID, review_id: RID, user_id: AUTHOR, hidden_at: null, hidden_by: null }
  h.ownerOfPost = OWNER
  h.updates = []
})

describe('hide a comment', () => {
  it('the owner of the post hides it: the row is marked hidden_by owner (not deleted)', async () => {
    const r = await call(true)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, hidden: true })
    expect(h.updates).toHaveLength(1)
    expect(h.updates[0]).toMatchObject({ hidden_by: 'owner' })
    expect(typeof h.updates[0].hidden_at).toBe('string')
  })
  it('a stranger (not the owner of the post) gets 404 and nothing changes', async () => {
    h.user = { id: STRANGER, is_anonymous: false }
    expect((await call(true)).status).toBe(404)
    expect(h.updates).toEqual([])
  })
  it('the author of the comment cannot hide it this way (they delete it), even if they own the post', async () => {
    h.comment = { ...h.comment, user_id: OWNER }
    expect((await call(true)).status).toBe(400)
    expect(h.updates).toEqual([])
  })
  it('signed out = 401; an anonymous identity is refused; a bad body is 400; a bad id is 404', async () => {
    h.user = null
    expect((await call(true)).status).toBe(401)
    h.user = { id: OWNER, is_anonymous: true }
    expect((await call(true)).status).toBeGreaterThanOrEqual(400)
    h.user = { id: OWNER, is_anonymous: false }
    expect((await call('yes')).status).toBe(400)
    expect((await call(true, 'not-a-uuid')).status).toBe(404)
    expect(h.updates).toEqual([])
  })
})

describe('show it again', () => {
  it('the owner undoes their own hide', async () => {
    h.comment = { ...h.comment, hidden_at: '2026-11-21T00:00:00Z', hidden_by: 'owner' }
    const r = await call(false)
    expect(await r.json()).toEqual({ ok: true, hidden: false })
    expect(h.updates[0]).toEqual({ hidden_at: null, hidden_by: null })
  })
  it('a hide by the system (reports) or by a moderator cannot be undone by the owner: 409, nothing changes', async () => {
    for (const by of ['auto', 'moderator']) {
      h.comment = { ...h.comment, hidden_at: '2026-11-21T00:00:00Z', hidden_by: by }
      expect((await call(false)).status).toBe(409)
    }
    expect(h.updates).toEqual([])
  })
})
