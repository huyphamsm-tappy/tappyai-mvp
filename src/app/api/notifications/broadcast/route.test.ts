// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// The retired legacy broadcast endpoint — §14.2 step 6, Owner decision O-4 = C.
//
// 🚨 WHAT THESE TESTS ARE FOR. The old handler resolved an audience and emitted
// a notification per user with no cap, no de-duplication and no audit record.
// Every assertion below is that it no longer does any of that — proved by
// spying on the collaborators it used to call, not by reading the source.

const h = vi.hoisted(() => ({
  audit: vi.fn(),
  rateLimit: vi.fn(),
  emit: vi.fn(),
  audience: vi.fn(),
}))

vi.mock('@/lib/admin/audit', async () => {
  const real = await vi.importActual<typeof import('@/lib/admin/audit')>('@/lib/admin/audit')
  return { ...real, writeAuditLog: h.audit }
})
vi.mock('@/lib/security/distributedRateLimit', () => ({ distributedRateLimit: h.rateLimit }))
// If the handler ever reaches for these again, the spies record it.
vi.mock('@/lib/notifications/emit', () => ({ emitNotification: h.emit }))
vi.mock('@/lib/notifications/send', () => ({ getAllSubscribedUserIds: h.audience }))

import { POST, LEGACY_BROADCAST_RETIRED_ACTION } from './route'

const post = (init: RequestInit = {}) =>
  new Request('http://localhost/api/notifications/broadcast', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    body: JSON.stringify({ title: 'T', body: 'B' }),
    ...init,
  })

beforeEach(() => {
  vi.clearAllMocks()
  h.rateLimit.mockResolvedValue({ ok: true, retryAfter: 0 })
})

describe('the endpoint is gone', () => {
  it('🚨 answers 410, not 404 and not 200', async () => {
    // 404 would be indistinguishable from a typo. 410 says "this existed and is
    // gone on purpose", which is what a stranded caller needs.
    const res = await POST(post())
    expect(res.status).toBe(410)
  })

  it('names the replacement so a caller can act on the answer', async () => {
    const body = await (await POST(post())).json()
    expect(body.error).toBe('gone')
    expect(body.message).toContain('/api/admin/notifications/broadcast')
  })

  it('🚨 MUTATION TARGET — a request carrying a valid-looking CRON_SECRET also gets 410', async () => {
    // A retired endpoint has nothing to authorize. If this ever returned
    // anything else for an authenticated caller, the route would be alive again.
    process.env.CRON_SECRET = 'test-secret-value'
    const res = await POST(post({ headers: { authorization: 'Bearer test-secret-value' } }))
    expect(res.status).toBe(410)
    delete process.env.CRON_SECRET
  })
})

describe('🚨 it no longer does ANY of what it used to do', () => {
  it('resolves no audience', async () => {
    await POST(post())
    expect(h.audience).not.toHaveBeenCalled()
  })

  it('writes no notification and dispatches no push', async () => {
    await POST(post())
    expect(h.emit).not.toHaveBeenCalled()
  })

  it('🚨 does not consume the broadcast rate limiter', async () => {
    // The evidence limiter is a different key with a different purpose. If the
    // campaign key ever appeared here, a scanner could exhaust the Controller's
    // daily broadcast budget from an unauthenticated endpoint.
    await POST(post())
    for (const [key] of h.rateLimit.mock.calls) {
      expect(String(key)).not.toContain('campaign')
      expect(String(key)).not.toContain('admin:broadcast')
    }
  })
})

describe('evidence for the retirement window', () => {
  it('🔑 records one audit row per hit, under a queryable action', async () => {
    await POST(post())
    expect(h.audit).toHaveBeenCalledTimes(1)
    expect(h.audit.mock.calls[0][0]).toMatchObject({
      action: LEGACY_BROADCAST_RETIRED_ACTION,
      targetType: 'notification_broadcast_legacy',
      actorRole: 'none',
    })
  })

  it('🚨 records WHETHER a credential was presented — never the credential', async () => {
    await POST(post({ headers: { authorization: 'Bearer super-secret-value' } }))
    const entry = h.audit.mock.calls[0][0]
    expect(entry.metadata.had_authorization_header).toBe(true)
    const serialized = JSON.stringify(entry)
    expect(serialized).not.toContain('super-secret-value')
    expect(serialized).not.toContain('Bearer')
  })

  it('a bare hit is recorded as such, so a scanner is distinguishable from a real caller', async () => {
    await POST(post())
    expect(h.audit.mock.calls[0][0].metadata.had_authorization_header).toBe(false)
  })

  it('🚨 the audit row carries no message text', async () => {
    await POST(
      new Request('http://localhost/api/notifications/broadcast', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'SECRET-TITLE', body: 'SECRET-BODY' }),
      }),
    )
    const serialized = JSON.stringify(h.audit.mock.calls[0][0])
    expect(serialized).not.toContain('SECRET-TITLE')
    expect(serialized).not.toContain('SECRET-BODY')
  })

  it('caps evidence rows so an anonymous scanner cannot fill audit_log', async () => {
    h.rateLimit.mockResolvedValue({ ok: false, retryAfter: 30 })
    await POST(post())
    expect(h.audit).not.toHaveBeenCalled()
  })
})

describe('🚨 the 410 never depends on infrastructure', () => {
  it('still 410 when the rate-limit store throws', async () => {
    h.rateLimit.mockRejectedValue(new Error('store unreachable'))
    const res = await POST(post())
    expect(res.status).toBe(410)
  })

  it('still 410 when the limiter refuses and no evidence is written', async () => {
    h.rateLimit.mockResolvedValue({ ok: false, retryAfter: 30 })
    expect((await POST(post())).status).toBe(410)
  })

  it('still 410 when the audit writer throws', async () => {
    // writeAuditLog is fire-and-forget and swallows its own errors; this proves
    // the handler survives even if that contract ever changed.
    h.audit.mockImplementation(() => { throw new Error('audit exploded') })
    expect((await POST(post())).status).toBe(410)
  })

  it('still 410 for a body that is not JSON at all', async () => {
    const res = await POST(
      new Request('http://localhost/api/notifications/broadcast', { method: 'POST', body: 'not json' }),
    )
    expect(res.status).toBe(410)
  })
})
