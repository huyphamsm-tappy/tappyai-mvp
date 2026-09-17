/**
 * GET /api/reviews/mine — the only reader of an author's hidden posts, and it is
 * self-scoped BY CONSTRUCTION: the identity comes from the verified session, never
 * from the request. The Explore profile's "Đã ẩn" tab reads through here, so this is
 * the test that a visitor cannot obtain someone else's hidden posts by pointing the
 * same route at another user id.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => {
  const state = {
    user: null as any,
    rows: [] as Record<string, unknown>[],
    eqs: [] as [string, unknown][],
  }
  const builder = (table: string) => {
    const preds: ((r: Record<string, unknown>) => boolean)[] = []
    const b: any = {
      select: () => b, order: () => b, limit: () => b, in: () => b,
      eq: (col: string, val: unknown) => { if (table === 'reviews') { state.eqs.push([col, val]); preds.push(r => r[col] === val) } return b },
      then: (res: any) => {
        const data = table === 'reviews' ? state.rows.filter(r => preds.every(p => p(r))) : []
        return Promise.resolve({ data, error: null }).then(res)
      },
    }
    return b
  }
  return { state, client: { from: (t: string) => builder(t) } }
})

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: () => Promise.resolve({ user: h.state.user, supabase: h.client }) }))
vi.mock('@/lib/media/servableMedia', () => ({ stripUnservableMedia: (r: unknown) => r }))
vi.mock('@/lib/safety/gate/authorNotice', () => ({ authorModerationPayload: () => null }))

import { GET } from './route'

const req = (query = '') => new Request(`http://t/api/reviews/mine${query}`, { headers: { 'accept-language': 'vi' } }) as any

beforeEach(() => {
  h.state.eqs.length = 0
  h.state.rows = [
    { id: 'mine-hidden', user_id: 'me', is_hidden: true, publication_state: 'PUBLISHED', safety_state: null },
    { id: 'mine-public', user_id: 'me', is_hidden: false, publication_state: 'PUBLISHED', safety_state: null },
    { id: 'theirs-hidden', user_id: 'them', is_hidden: true, publication_state: 'PUBLISHED', safety_state: null },
  ]
})

describe('self scope', () => {
  it('401 without a session', async () => {
    h.state.user = null
    expect((await GET(req())).status).toBe(401)
  })

  it('returns the session user\'s own rows — hidden included — and nobody else\'s', async () => {
    h.state.user = { id: 'me' }
    const body = await (await GET(req())).json()
    expect(body.reviews.map((r: any) => r.id).sort()).toEqual(['mine-hidden', 'mine-public'])
    expect(h.state.eqs).toEqual([['user_id', 'me']])
  })

  it('a ?userId= of another user changes nothing: the scope is the session, not the query', async () => {
    h.state.user = { id: 'me' }
    const body = await (await GET(req('?userId=them&lang=vi'))).json()
    expect(body.reviews.map((r: any) => r.id)).not.toContain('theirs-hidden')
    expect(h.state.eqs).toEqual([['user_id', 'me']])
  })

  it('the moderation columns never reach the client', async () => {
    h.state.user = { id: 'me' }
    const body = await (await GET(req())).json()
    for (const r of body.reviews) {
      expect('publication_state' in r).toBe(false)
      expect('safety_state' in r).toBe(false)
    }
  })
})
