// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// POST /api/admin/notifications/broadcast — the governed broadcast path.
//
// Contract: docs/controller-v2/V2.2_PHASE_C_BROADCAST_CONTRACT.md §3, §7, C-12.
//
// 🔑 Every test issues a REQUEST. A page that does not draw a button has never
// stopped anyone calling an endpoint, and a broadcast cannot be recalled.

const h = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  rateLimit: vi.fn(),
  sameOrigin: vi.fn(() => true),
  audience: vi.fn(),
  runCampaign: vi.fn(),
  audit: vi.fn(),
  broadcastEnabled: vi.fn(() => true),
}))

class FakeAdminError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code)
  }
}

vi.mock('@/lib/admin/permissions', async () => {
  const real = await vi.importActual<typeof import('@/lib/admin/permissions')>('@/lib/admin/permissions')
  return { ...real, requirePermission: h.requirePermission }
})
vi.mock('@/lib/admin/rbac', async () => {
  const real = await vi.importActual<typeof import('@/lib/admin/rbac')>('@/lib/admin/rbac')
  return {
    ...real,
    isSameOrigin: h.sameOrigin,
    adminErrorResponse: (e: unknown) =>
      e instanceof FakeAdminError
        ? Response.json({ error: { code: e.code } }, { status: e.status })
        : Response.json({ error: { code: 'INTERNAL_ERROR' } }, { status: 500 }),
  }
})
vi.mock('@/lib/security/distributedRateLimit', () => ({ distributedRateLimit: h.rateLimit }))
vi.mock('@/lib/admin/audit', async () => {
  const real = await vi.importActual<typeof import('@/lib/admin/audit')>('@/lib/admin/audit')
  return { ...real, writeAuditLog: h.audit }
})
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/config/env', async () => {
  const real = await vi.importActual<typeof import('@/lib/config/env')>('@/lib/config/env')
  return { ...real, serverEnv: { ...real.serverEnv, broadcastEnabled: h.broadcastEnabled } }
})
vi.mock('@/lib/notifications/broadcastAudience', () => ({ buildBroadcastAudience: h.audience }))
vi.mock('@/lib/notifications/broadcastCampaign', async () => {
  const real = await vi.importActual<typeof import('@/lib/notifications/broadcastCampaign')>(
    '@/lib/notifications/broadcastCampaign',
  )
  return { ...real, runBroadcastCampaign: h.runCampaign, campaignDeps: () => ({}) }
})

import { POST } from './route'
import { PERMISSIONS } from '@/lib/admin/permissions'

const post = (body: unknown, url = 'http://localhost/api/admin/notifications/broadcast') =>
  new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const VALID = { title: 'Hello', body: 'Everyone', dryRun: false }
const ids = (n: number) => Array.from({ length: n }, (_, i) => `u${String(i).padStart(4, '0')}`)

beforeEach(() => {
  vi.clearAllMocks()
  h.sameOrigin.mockReturnValue(true)
  h.broadcastEnabled.mockReturnValue(true)
  h.requirePermission.mockResolvedValue({
    user: { id: 'admin-1', email: 'admin@tappyai.com' },
    actor: { isOwner: false, highestRole: 'super_admin' },
  })
  h.rateLimit.mockResolvedValue({ ok: true, retryAfter: 0 })
  h.audience.mockResolvedValue({
    recipients: ids(3),
    candidates: 5,
    excluded: { banned: 1, suspended: 1, noProfile: 0 },
  })
  h.runCampaign.mockResolvedValue({
    campaignId: 'c1',
    audienceSize: 3,
    alreadyNotified: 0,
    attempted: 3,
    chunkCount: 1,
    chunks: [{ index: 0, size: 3, status: 'success', reason: null, accepted: 3, failed: 0, gone: 0, unreachable: 0, errored: 0 }],
    accepted: 3,
    failed: 0,
    gone: 0,
    unreachable: 0,
    errored: 0,
    status: 'completed',
  })
})

describe('authorization', () => {
  it('🚨 requires notifications.send.broadcast — NOT send.user', async () => {
    await POST(post(VALID))
    expect(h.requirePermission).toHaveBeenCalledWith(expect.anything(), PERMISSIONS.NOTIFICATIONS_SEND_BROADCAST)
    expect(h.requirePermission).not.toHaveBeenCalledWith(expect.anything(), PERMISSIONS.NOTIFICATIONS_SEND_USER)
  })

  it('🚨 a refused actor never reaches the audience or the campaign', async () => {
    h.requirePermission.mockRejectedValue(new FakeAdminError(403, 'FORBIDDEN'))
    const res = await POST(post(VALID))
    expect(res.status).toBe(403)
    expect(h.audience).not.toHaveBeenCalled()
    expect(h.runCampaign).not.toHaveBeenCalled()
  })

  it('🚨 a cross-origin request is refused before anything happens', async () => {
    h.sameOrigin.mockReturnValue(false)
    const res = await POST(post(VALID))
    expect(res.status).toBe(403)
    expect(h.runCampaign).not.toHaveBeenCalled()
  })
})

describe('the feature switch (C-26) and kill switch (C-13)', () => {
  it('🚨 with sending disabled, a real send is REFUSED and nothing is dispatched', async () => {
    h.broadcastEnabled.mockReturnValue(false)
    const res = await POST(post(VALID))
    expect(res.status).toBe(403)
    expect(h.runCampaign).not.toHaveBeenCalled()
  })

  it('🔑 a DRY RUN still works while sending is disabled', async () => {
    // Being able to verify the audience on production WITHOUT enabling sends is
    // the entire point of shipping this inert.
    h.broadcastEnabled.mockReturnValue(false)
    const res = await POST(post({ title: 'T', body: 'B', dryRun: true }))
    expect(res.status).toBe(200)
    expect(h.runCampaign).not.toHaveBeenCalled()
  })

  it('🚨 the switch is passed INTO the campaign so a run can be halted mid-flight', async () => {
    await POST(post(VALID))
    const arg = h.runCampaign.mock.calls[0][0]
    expect(typeof arg.shouldContinue).toBe('function')
    h.broadcastEnabled.mockReturnValue(false)
    expect(arg.shouldContinue()).toBe(false)
  })
})

describe('🚨 dryRun DEFAULTS TO TRUE', () => {
  it('a body with no dryRun flag sends NOTHING', async () => {
    // The safe reading of an ambiguous request is the one that cannot be undone.
    const res = await POST(post({ title: 'T', body: 'B' }))
    expect(res.status).toBe(200)
    expect(h.runCampaign).not.toHaveBeenCalled()
    expect((await res.json()).data.sent).toBe(false)
  })
})

describe('the dry run resolves everything and sends nothing (C-12)', () => {
  it('🔑 reports audience size, exclusions by reason, and chunk boundaries', async () => {
    const res = await POST(post({ title: 'T', body: 'B', dryRun: true }))
    const { data } = await res.json()
    expect(data.audienceSize).toBe(3)
    expect(data.candidates).toBe(5)
    expect(data.excluded).toEqual({ banned: 1, suspended: 1, noProfile: 0 })
    expect(data.chunkCount).toBe(1)
    expect(data.chunkSizes).toEqual([3])
    expect(data.dryRun).toBe(true)
    expect(data.sent).toBe(false)
  })

  it('🚨 writes an audit record even though it sent nothing', async () => {
    await POST(post({ title: 'T', body: 'B', dryRun: true }))
    expect(h.audit).toHaveBeenCalledTimes(1)
    expect(h.audit.mock.calls[0][0]).toMatchObject({
      action: 'notification.broadcast.dry_run',
      targetType: 'notification_broadcast',
      metadata: expect.objectContaining({ dry_run: true, audience_size: 3 }),
    })
  })

  it('🔑 reports a fingerprint that proves ORDER without exposing anyone', async () => {
    const first = await (await POST(post({ title: 'T', body: 'B', dryRun: true }))).json()
    const second = await (await POST(post({ title: 'T', body: 'B', dryRun: true }))).json()
    expect(first.data.audienceFingerprint).toBe(second.data.audienceFingerprint)
    expect(first.data.audienceFingerprint).toMatch(/^[0-9a-f]{16}$/)

    h.audience.mockResolvedValue({ recipients: ids(3).reverse(), candidates: 5, excluded: { banned: 1, suspended: 1, noProfile: 0 } })
    const reordered = await (await POST(post({ title: 'T', body: 'B', dryRun: true }))).json()
    expect(reordered.data.audienceFingerprint).not.toBe(first.data.audienceFingerprint)
  })
})

describe('rate limiting is per CAMPAIGN and refuses BEFORE the first chunk (C-11a)', () => {
  it('🚨 an over-limit campaign never reaches the audience or a dispatch', async () => {
    // A limiter that stopped a campaign halfway would leave part of the platform
    // notified and part not — the worst of both outcomes.
    h.rateLimit.mockResolvedValue({ ok: false, retryAfter: 3600 })
    const res = await POST(post(VALID))
    expect(res.status).toBe(429)
    expect(h.audience).not.toHaveBeenCalled()
    expect(h.runCampaign).not.toHaveBeenCalled()
  })

  it('🚨 ONE limiter call per campaign — not one per chunk', async () => {
    await POST(post(VALID))
    expect(h.rateLimit).toHaveBeenCalledTimes(1)
    const [key, limit, window] = h.rateLimit.mock.calls[0]
    expect(key).toContain('campaign')
    expect(limit).toBeLessThanOrEqual(10)
    expect(window).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000)
  })

  it('a dry run uses a separate, looser budget so verifying does not consume sends', async () => {
    await POST(post({ title: 'T', body: 'B', dryRun: true }))
    expect(h.rateLimit.mock.calls[0][0]).toContain('dryrun')
  })
})

describe('validation', () => {
  it('rejects an absolute link — a broadcast reaches everyone at once', async () => {
    const res = await POST(post({ ...VALID, link: 'https://evil.example' }))
    expect(res.status).toBe(422)
    expect(h.runCampaign).not.toHaveBeenCalled()
  })

  it('rejects a protocol-relative link', async () => {
    expect((await POST(post({ ...VALID, link: '//evil.example' }))).status).toBe(422)
  })

  it('accepts a relative path', async () => {
    expect((await POST(post({ ...VALID, link: '/deals' }))).status).toBe(200)
  })

  it('rejects an empty title or body', async () => {
    expect((await POST(post({ ...VALID, title: '  ' }))).status).toBe(422)
    expect((await POST(post({ ...VALID, body: '' }))).status).toBe(422)
  })
})

describe('the campaign id is the idempotency key (C-7)', () => {
  it('🚨 a supplied campaignId is used verbatim, so a retry resumes', async () => {
    const campaignId = '99999999-9999-4999-8999-999999999999'
    await POST(post({ ...VALID, campaignId }))
    expect(h.runCampaign.mock.calls[0][0].campaignId).toBe(campaignId)
  })

  it('one is minted when absent — a fresh uuid per campaign, not a constant', async () => {
    await POST(post(VALID))
    await POST(post(VALID))
    const first = h.runCampaign.mock.calls[0][0].campaignId
    const second = h.runCampaign.mock.calls[1][0].campaignId
    expect(first).toMatch(/^[0-9a-f-]{36}$/)
    // A constant would make every campaign a resume of the first one, and the
    // second broadcast would silently reach nobody.
    expect(second).not.toBe(first)
  })

  it('the minted id is echoed back so a retry can reuse it', async () => {
    const { data } = await (await POST(post({ title: 'T', body: 'B', dryRun: true }))).json()
    expect(data.campaignId).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('audit — one record per campaign (C-15), no recipient identity (C-16)', () => {
  it('🔑 records campaign identity, audience size, chunk count, per-chunk status, final status', async () => {
    await POST(post(VALID))
    const entry = h.audit.mock.calls[0][0]
    expect(entry.metadata).toMatchObject({
      dry_run: false,
      audience_size: 3,
      chunk_count: 1,
      chunk_status: ['success'],
      status: 'completed',
    })
    expect(entry.metadata.campaign_id).toBeTruthy()
  })

  it('🚨 the audit record contains NO recipient id, email, endpoint or message text', async () => {
    await POST(post({ ...VALID, title: 'SECRET-TITLE', body: 'SECRET-BODY' }))
    const serialized = JSON.stringify(h.audit.mock.calls[0][0].metadata)
    for (const forbidden of ['SECRET-TITLE', 'SECRET-BODY', 'u0000', 'endpoint', 'p256dh', 'auth_key']) {
      expect(serialized, `audit leaked ${forbidden}`).not.toContain(forbidden)
    }
  })

  it('exactly ONE campaign record, however many chunks ran', async () => {
    h.runCampaign.mockResolvedValue({
      ...(await h.runCampaign.mock.results[0]?.value ?? {}),
      campaignId: 'c1', audienceSize: 1200, alreadyNotified: 0, attempted: 1200,
      chunkCount: 3, chunks: [], accepted: 1200, failed: 0, gone: 0, unreachable: 0, errored: 0,
      status: 'completed',
    })
    await POST(post(VALID))
    expect(h.audit).toHaveBeenCalledTimes(1)
  })
})

describe('the response reports honestly', () => {
  it('🚨 never uses the word "delivered"', async () => {
    const res = await POST(post(VALID))
    expect(JSON.stringify(await res.json()).toLowerCase()).not.toContain('delivered')
  })

  it('carries the campaign result and the exclusion breakdown', async () => {
    const { data } = await (await POST(post(VALID))).json()
    expect(data.status).toBe('completed')
    expect(data.accepted).toBe(3)
    expect(data.excluded).toEqual({ banned: 1, suspended: 1, noProfile: 0 })
    expect(data.dryRun).toBe(false)
  })
})

describe('🚨 this route is NOT the legacy CRON_SECRET path (O-4 = C)', () => {
  it('a bearer CRON_SECRET grants nothing here — the permission guard is the only way in', async () => {
    h.requirePermission.mockRejectedValue(new FakeAdminError(401, 'UNAUTHORIZED'))
    const req = new Request('http://localhost/api/admin/notifications/broadcast', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer any-cron-secret' },
      body: JSON.stringify(VALID),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    expect(h.runCampaign).not.toHaveBeenCalled()
  })
})
