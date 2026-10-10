import { describe, it, expect, vi, beforeEach } from 'vitest'

// POST /api/reviews/[id]/report — the post/clip report (App Review 1.2). What is pinned: auth, the reason whitelist, the answers to the database's
// outcomes (duplicate, unknown post, the 20261010 flood guard), and that the moderators are alerted ONLY for a report that was really stored.

const h = vi.hoisted(() => ({
  user: { id: '11111111-1111-4111-8111-111111111111', is_anonymous: false } as { id: string; is_anonymous?: boolean } | null,
  insertError: null as null | { code: string },
  inserted: [] as Array<Record<string, unknown>>,
  alert: vi.fn(),
}))

vi.mock('@/lib/auth/getRequestUser', () => ({
  getRequestUser: async () => ({
    user: h.user,
    supabase: { from: () => ({ insert: async (row: Record<string, unknown>) => { h.inserted.push(row); return { error: h.insertError } } }) },
  }),
}))
vi.mock('@/lib/auth/socialWriteAccess', () => ({ refuseAnonymousSocialWrite: () => null }))
vi.mock('@/lib/safety/operatorAlert', async (orig) => ({ ...((await orig()) as Record<string, unknown>), alertModerators: h.alert }))

import { POST } from './route'

const call = (reason: unknown) =>
  POST(new Request('https://www.tappyai.com/api/reviews/x/report', { method: 'POST', body: JSON.stringify({ reason }) }) as never, { params: { id: '22222222-2222-4222-8222-222222222222' } })

beforeEach(() => {
  h.user = { id: '11111111-1111-4111-8111-111111111111', is_anonymous: false }
  h.insertError = null; h.inserted = []; h.alert.mockReset(); h.alert.mockResolvedValue({ recipients: 0, sent: 0, skipped: 0, failed: 0 })
})

describe('POST /api/reviews/[id]/report', () => {
  it('no session: 401, nothing stored, nobody alerted', async () => {
    h.user = null
    expect((await call('spam')).status).toBe(401)
    expect(h.inserted).toHaveLength(0); expect(h.alert).not.toHaveBeenCalled()
  })

  it('a reason outside the whitelist: 400, nothing stored', async () => {
    expect((await call('my own reason')).status).toBe(400)
    expect(h.inserted).toHaveLength(0); expect(h.alert).not.toHaveBeenCalled()
  })

  it('stores exactly the allowed columns, with the caller\'s opaque reporter id (never the raw uid)', async () => {
    expect((await call('spam')).status).toBe(200)
    const row = h.inserted[0]
    expect(Object.keys(row).sort()).toEqual(['content_id', 'reason', 'reporter_source_id'])
    expect(String(row.reporter_source_id)).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(row)).not.toContain(h.user!.id)
  })

  it('a stored report alerts the moderators: urgent for a severe reason, routine otherwise (a native reason is mapped first)', async () => {
    await call('violence'); expect(h.alert).toHaveBeenLastCalledWith('report', { urgent: true })
    await call('spam'); expect(h.alert).toHaveBeenLastCalledWith('report', { urgent: false })
    await call('self_harm'); expect(h.alert).toHaveBeenLastCalledWith('report', { urgent: true })    // → violence
    await call('sexual'); expect(h.alert).toHaveBeenLastCalledWith('report', { urgent: true })       // → inappropriate
  })

  it('a duplicate report is a quiet success: stored once, no second alert', async () => {
    h.insertError = { code: '23505' }
    const r = await call('spam')
    expect(r.status).toBe(200); expect(await r.json()).toMatchObject({ ok: true, alreadyReported: true })
    expect(h.alert).not.toHaveBeenCalled()
  })

  it('an unknown post is 404 and alerts nobody', async () => {
    h.insertError = { code: '23503' }
    expect((await call('spam')).status).toBe(404)
    expect(h.alert).not.toHaveBeenCalled()
  })

  it('the flood guard (SQLSTATE 53400) is a 429, not a 500, and alerts nobody', async () => {
    h.insertError = { code: '53400' }
    const r = await call('spam')
    expect(r.status).toBe(429); expect((await r.json()).error).toBe('rate_limit')
    expect(h.alert).not.toHaveBeenCalled()
  })

  it('any other database error is a 500 and is never reported as sent', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    h.insertError = { code: 'XX000' }
    const r = await call('spam')
    expect(r.status).toBe(500); expect((await r.json()).error).toBe('report_failed')
    expect(h.alert).not.toHaveBeenCalled()
    err.mockRestore()
  })
})
