import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * POST /api/messaging/messages/[id]/report — report a message (owner 04/11/2026). A third target of user_reports, written by the same handler as comment and
 * user reports (lib/safety/userReports.ts). What matters here: only a message the caller can SEE (RLS) is reported, a miss is a silent success (no oracle for
 * "this message exists"), your own message is refused, the stored row holds ids, a reason and a note — never the text of the message — and the reviewers are pinged.
 */

const h = vi.hoisted(() => {
  const state = {
    user: { id: 'u1', is_anonymous: false } as Record<string, unknown> | null,
    message: { data: null as unknown, error: null as unknown },
    recent: { count: 0 as number | null, error: null as unknown },
    insertError: null as { code?: string; message: string } | null,
    inserted: [] as Array<Record<string, unknown>>,
    messageQuery: [] as string[],
    /** The in-memory limiter (per serverless instance): true = under the limit. */
    memoryOk: true,
  }
  // the caller's own client (RLS applies): chat_messages lookup
  const own: Record<string, unknown> = {}
  own.from = (t: string) => { state.messageQuery.push(`from:${t}`); return own }
  own.select = () => own
  own.eq = (c: string, v: unknown) => { state.messageQuery.push(`eq:${c}:${String(v)}`); return own }
  own.maybeSingle = () => Promise.resolve(state.message)
  const getRequestUser = vi.fn(async () => ({ user: state.user, supabase: own }))
  // the service-role writer: the persistent rate-limit count, then the insert
  const writer = {
    from: (_t: string) => ({
      select: () => ({ eq: () => ({ gte: () => Promise.resolve(state.recent) }) }),
      insert: (row: Record<string, unknown>) => { state.inserted.push(row); return Promise.resolve({ error: state.insertError }) },
    }),
  }
  const alertModerators = vi.fn(async (..._a: unknown[]) => {})
  return { state, getRequestUser, writer, alertModerators }
})

vi.mock('@/lib/auth/getRequestUser', () => ({ getRequestUser: h.getRequestUser }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.writer }))
// The real in-memory limiter accumulates across the tests of this file (one user); each test controls it instead.
vi.mock('@/lib/security/rateLimit', () => ({ rateLimit: () => ({ ok: h.state.memoryOk }) }))
vi.mock('@/lib/safety/operatorAlert', () => ({ alertModerators: h.alertModerators, isUrgentReason: (r: string) => r === 'self_harm' || r === 'violence' }))

import { POST } from './route'

const MID = '11111111-1111-4111-8111-111111111111'
const call = (body: unknown = { reason: 'harassment' }, id = MID) =>
  POST(new Request(`http://localhost/api/messaging/messages/${id}/report`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) as never, { params: { id } } as never)

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('REPORTS_ENABLED', 'true')
  h.state.user = { id: 'u1', is_anonymous: false }
  h.state.message = { data: { id: MID, sender_id: 'u2', thread_id: 't1' }, error: null }
  h.state.recent = { count: 0, error: null }
  h.state.insertError = null
  h.state.inserted = []
  h.state.messageQuery = []
  h.state.memoryOk = true
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllEnvs() })

describe('who may report, and when', () => {
  it('404 with an empty body while REPORTS_ENABLED is off (the route is invisible)', async () => {
    vi.stubEnv('REPORTS_ENABLED', '')
    const res = await call()
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('')
    expect(h.state.inserted).toHaveLength(0)
  })

  it('401 when signed out; 403 for an anonymous session', async () => {
    h.state.user = null
    expect((await call()).status).toBe(401)
    h.state.user = { id: 'anon', is_anonymous: true }
    expect((await call()).status).toBe(403)
    expect(h.state.inserted).toHaveLength(0)
  })

  it('400 for an unknown reason, a missing reason or an id that is not a uuid — before anything is read', async () => {
    expect((await call({ reason: 'because' })).status).toBe(400)
    expect((await call({})).status).toBe(400)
    expect((await call({ reason: 'spam' }, 'not-a-uuid')).status).toBe(400)
    expect(h.state.messageQuery).toHaveLength(0)
    expect(h.state.inserted).toHaveLength(0)
  })
})

describe('the message', () => {
  it('is looked up with the CALLER\'s client (RLS decides what they can see), by id', async () => {
    await call()
    expect(h.state.messageQuery).toEqual(['from:chat_messages', `eq:id:${MID}`])
  })

  it('a message the caller cannot see (RLS returns nothing) answers like success and writes nothing — no oracle for its existence', async () => {
    h.state.message = { data: null, error: null }
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, reported: true })
    expect(h.state.inserted).toHaveLength(0)
    expect(h.alertModerators).not.toHaveBeenCalled()
  })

  it('reporting your OWN message is refused (400 invalid_target)', async () => {
    h.state.message = { data: { id: MID, sender_id: 'u1', thread_id: 't1' }, error: null }
    const res = await call()
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_target')
    expect(h.state.inserted).toHaveLength(0)
  })

  it('a database error while reading the message is a 500, not a made-up success', async () => {
    h.state.message = { data: null, error: { message: 'boom' } }
    expect((await call()).status).toBe(500)
  })

  it('a message whose author is gone (sender_id null) can still be reported', async () => {
    h.state.message = { data: { id: MID, sender_id: null, thread_id: 't1' }, error: null }
    expect((await call()).status).toBe(200)
    expect(h.state.inserted).toHaveLength(1)
  })
})

describe('what is stored', () => {
  it('one row: reporter from the SESSION, target_type "message", the message id, the reason and the note — and nothing of the message text or thread', async () => {
    const res = await call({ reason: 'harassment', note: '  threatened me  ' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, reported: true })
    expect(h.state.inserted).toEqual([{ reporter_id: 'u1', target_type: 'message', target_id: MID, reason: 'harassment', note: 'threatened me' }])
  })

  it('accepts the native apps\' "details" field and caps the note at 300 characters', async () => {
    await call({ reason: 'spam', details: 'x'.repeat(500) })
    expect((h.state.inserted[0]!.note as string).length).toBe(300)
  })

  it('a forged reporter id in the body is ignored', async () => {
    await call({ reason: 'spam', reporter_id: 'someone-else', target_type: 'user' })
    expect(h.state.inserted[0]).toMatchObject({ reporter_id: 'u1', target_type: 'message' })
  })

  it('pings the reviewers once, flagging urgent reasons', async () => {
    await call({ reason: 'spam' })
    expect(h.alertModerators).toHaveBeenCalledWith('report', { urgent: false })
    h.alertModerators.mockClear()
    await call({ reason: 'violence' })
    expect(h.alertModerators).toHaveBeenCalledWith('report', { urgent: true })
  })

  it('a second report of the same message by the same person is "already reported" (unique violation), not an error', async () => {
    h.state.insertError = { code: '23505', message: 'duplicate key' }
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, reported: true, alreadyReported: true })
    expect(h.alertModerators).not.toHaveBeenCalled()
  })

  it('any other insert failure is a 500 and pings nobody', async () => {
    h.state.insertError = { code: '42501', message: 'denied' }
    expect((await call()).status).toBe(500)
    expect(h.alertModerators).not.toHaveBeenCalled()
  })
})

describe('abuse limits', () => {
  it('the in-memory limiter (10 per 10 minutes per account) answers 429 before the message is even read', async () => {
    h.state.memoryOk = false
    expect((await call()).status).toBe(429)
    expect(h.state.messageQuery).toHaveLength(0)
    expect(h.state.inserted).toHaveLength(0)
  })

  it('10 reports in 10 minutes (counted in the table) → 429, nothing stored', async () => {
    h.state.recent = { count: 10, error: null }
    expect((await call()).status).toBe(429)
    expect(h.state.inserted).toHaveLength(0)
  })

  it('9 is still allowed', async () => {
    h.state.recent = { count: 9, error: null }
    expect((await call()).status).toBe(200)
  })

  it('a failing count is a 500 (it does not skip the limit)', async () => {
    h.state.recent = { count: null, error: { message: 'boom' } }
    expect((await call()).status).toBe(500)
    expect(h.state.inserted).toHaveLength(0)
  })
})
