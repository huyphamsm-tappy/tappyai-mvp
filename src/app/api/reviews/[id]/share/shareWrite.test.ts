/**
 * POST /api/reviews/[id]/share — the persistent share record. Pinned: 401 signed out, 403 for an
 * anonymous session (B17 — the same gate like/save use), 404 for a review that is gone, the row
 * is pinned to the BEARER (never a user id from the body), the channel is validated, and every
 * call inserts a NEW row (history, not a toggle).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = Record<string, any>

const h = vi.hoisted(() => {
  const state = {
    user: null as Row | null,
    review: null as Row | null,
    inserted: [] as Row[],
    insertError: null as Row | null,
  }
  const builder = (table: string): any => {
    const b: any = {
      select: () => b,
      eq: () => b,
      maybeSingle: () => Promise.resolve({ data: table === 'reviews' ? state.review : null, error: null }),
      insert: (row: Row) => {
        state.inserted.push(row)
        return {
          select: () => ({
            single: () =>
              Promise.resolve(
                state.insertError
                  ? { data: null, error: state.insertError }
                  : { data: { id: `s${state.inserted.length}`, created_at: '2026-09-15T00:00:00Z' }, error: null },
              ),
          }),
        }
      },
    }
    return b
  }
  const client = { from: (table: string) => builder(table) }
  return { state, client }
})

vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: async () => ({ user: h.state.user, supabase: h.client }),
}))
vi.mock('@/lib/i18n/requestLocale', () => ({ requestLocale: () => 'vi' }))
vi.mock('@/lib/i18n/serverMessages', () => ({ serverMessage: (k: string) => `msg:${k}` }))

import { POST } from './route'

async function post(body: unknown, id = 'rev-1') {
  const init: RequestInit = { method: 'POST' }
  if (body !== undefined) Object.assign(init, { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
  const res = await POST(new Request(`https://x/api/reviews/${id}/share`, init) as any, { params: { id } })
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  h.state.user = { id: 'me', is_anonymous: false }
  h.state.review = { id: 'rev-1' }
  h.state.inserted = []
  h.state.insertError = null
})

describe('POST /api/reviews/[id]/share', () => {
  it('401 when signed out; nothing written', async () => {
    h.state.user = null
    expect((await post({ channel: 'copy' })).status).toBe(401)
    expect(h.state.inserted).toEqual([])
  })

  it('403 account_required for an anonymous session — the B17 social-write gate', async () => {
    h.state.user = { id: 'anon', is_anonymous: true }
    const { status, body } = await post({ channel: 'copy' })
    expect(status).toBe(403)
    expect(body.error).toBe('account_required')
    expect(h.state.inserted).toEqual([])
  })

  it('404 when the review no longer exists', async () => {
    h.state.review = null
    expect((await post({ channel: 'copy' })).status).toBe(404)
    expect(h.state.inserted).toEqual([])
  })

  it('pins the row to the bearer and the review, with the validated channel', async () => {
    const { status, body } = await post({ channel: 'facebook', user_id: 'someone-else' })
    expect(status).toBe(200)
    expect(body).toMatchObject({ shared: true, id: 's1' })
    expect(h.state.inserted).toEqual([{ review_id: 'rev-1', user_id: 'me', channel: 'facebook' }])
  })

  it('falls back to "unknown" for a missing or malformed channel', async () => {
    await post(undefined)
    await post({ channel: 'not a channel!' })
    expect(h.state.inserted.map((r) => r.channel)).toEqual(['unknown', 'unknown'])
  })

  it('is history, not a toggle: a second share of the same post is a second row', async () => {
    await post({ channel: 'copy' })
    await post({ channel: 'zalo' })
    expect(h.state.inserted).toHaveLength(2)
  })

  it('500 share_failed when the insert is refused', async () => {
    h.state.insertError = { message: 'rls' }
    expect((await post({ channel: 'copy' })).status).toBe(500)
  })
})
