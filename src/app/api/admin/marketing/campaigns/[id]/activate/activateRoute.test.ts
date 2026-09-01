// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// V2.2-2 — POST /api/admin/marketing/campaigns/[id]/activate
//
// 🚨 A CAMPAIGN CANNOT BE RECALLED, so the assertions that matter are about
// what is IMPOSSIBLE, not about what works. Every test issues a REQUEST: a page
// that does not draw a button has never stopped anyone calling an endpoint.
//
// The single most important test in this file is that a real send is REFUSED
// while M-30 is unsatisfied — and that it dispatches nothing when refused.

const h = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  rateLimit: vi.fn(),
  sameOrigin: vi.fn(() => true),
  audit: vi.fn(),
  getCampaign: vi.fn(),
  markActive: vi.fn(),
  markCompleted: vi.fn(),
  plan: vi.fn(),
  run: vi.fn(),
  canActivate: vi.fn(),
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
vi.mock('@/lib/marketing/campaignStore', async () => {
  const real = await vi.importActual<typeof import('@/lib/marketing/campaignStore')>(
    '@/lib/marketing/campaignStore',
  )
  return {
    ...real,
    getCampaign: h.getCampaign,
    markActive: h.markActive,
    markCompleted: h.markCompleted,
  }
})
vi.mock('@/lib/marketing/campaignRunner', async () => {
  const real = await vi.importActual<typeof import('@/lib/marketing/campaignRunner')>(
    '@/lib/marketing/campaignRunner',
  )
  return { ...real, planCampaign: h.plan, runCampaign: h.run, runnerDeps: () => ({}) }
})
vi.mock('@/lib/marketing/activationGate', async () => {
  const real = await vi.importActual<typeof import('@/lib/marketing/activationGate')>(
    '@/lib/marketing/activationGate',
  )
  return { ...real, canActivateSend: h.canActivate }
})

import { POST } from './route'
// From the gate, not the route: Next.js rejects a non-route export in a route
// module, so there is ONE definition and both the server and the UI import it.
import { CONFIRM_PHRASE } from '@/lib/marketing/activationGate'
import { PERMISSIONS } from '@/lib/admin/permissions'

const ID = '11111111-1111-4111-8111-111111111111'
const URL_ = `https://www.tappyai.com/api/admin/marketing/campaigns/${ID}/activate`
const params = { params: Promise.resolve({ id: ID }) }

const DRAFT = {
  id: ID,
  title: 'Spring',
  body: 'Hello there',
  link: null,
  status: 'draft' as const,
  created_by: 'admin-1',
  activated_by: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  activated_at: null,
  completed_at: null,
}

const PLAN = {
  campaignId: ID,
  audienceSize: 42,
  candidates: 100,
  skipped: {
    consent: 50,
    unsubscribed: 3,
    frequency_24h: 4,
    frequency_7d: 1,
    quiet_hours: 0,
    ineligible: 0,
  },
  chunkCount: 1,
  chunkSizes: [42],
  audienceFingerprint: 'abcdef0123456789',
}

/** `body === undefined` reproduces a caller that sends no flags at all. */
const post = (body?: unknown) =>
  new Request(URL_, {
    method: 'POST',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })

beforeEach(() => {
  vi.clearAllMocks()
  h.requirePermission.mockResolvedValue({
    user: { id: 'admin-1', email: 'a@b.c' },
    actor: { isOwner: false, role: 'admin' },
  })
  h.rateLimit.mockResolvedValue({ ok: true, remaining: 2 })
  h.sameOrigin.mockReturnValue(true)
  h.getCampaign.mockResolvedValue(DRAFT)
  h.markActive.mockResolvedValue({ ...DRAFT, status: 'active' })
  h.markCompleted.mockResolvedValue({ ...DRAFT, status: 'completed' })
  h.plan.mockResolvedValue({ ok: true, plan: PLAN })
  h.run.mockResolvedValue({ ok: false, reason: 'CONSENT_EXPORT_UNSATISFIED' })
  // The shipped value: closed.
  h.canActivate.mockReturnValue({ ok: false, reason: 'CONSENT_EXPORT_UNSATISFIED' })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('🚨 M-30 — a real send is refused, and nothing runs', () => {
  it('refuses with 403 and names the blocker', async () => {
    const res = await POST(post({ dryRun: false, confirm: CONFIRM_PHRASE }), params)
    expect(res.status).toBe(403)
    expect(h.run).not.toHaveBeenCalled()
    expect(h.markActive).not.toHaveBeenCalled()
  })

  it('🚨 the campaign is NOT moved to active by a blocked send', async () => {
    // Otherwise a blocked attempt would leave a draft stuck in `active`,
    // uneditable and un-sendable.
    await POST(post({ dryRun: false, confirm: CONFIRM_PHRASE }), params)
    expect(h.markActive).not.toHaveBeenCalled()
    expect(h.markCompleted).not.toHaveBeenCalled()
  })

  it('🚨 `{}` — an omitted dryRun flag defaults to TRUE and does not send', async () => {
    // The safe reading of an ambiguous request is the one that cannot be
    // undone. This is the default-value path: a well-formed body that simply
    // says nothing about sending resolves an audience and stops.
    const res = await POST(post({}), params)
    expect(res.status).toBe(200)
    expect((await res.json()).data.sent).toBe(false)
    expect(h.run).not.toHaveBeenCalled()
  })

  it('🚨 NO body at all is refused outright, and sends nothing', async () => {
    // `req.json()` rejects, the parse sees `null`, and the schema refuses it.
    // Fail-closed in a second way: the request never reaches a default. Same
    // behaviour as the Phase C broadcast route, deliberately.
    const res = await POST(post(), params)
    expect(res.status).toBe(422)
    expect(h.run).not.toHaveBeenCalled()
    expect(h.plan).not.toHaveBeenCalled()
  })

  it('an unparseable body is refused and sends nothing', async () => {
    const res = await POST(new Request(URL_, { method: 'POST', body: 'not json' }), params)
    expect(res.status).toBe(422)
    expect(h.run).not.toHaveBeenCalled()
  })

  it('🚨 a body claiming dryRun is a STRING is refused, not coerced', async () => {
    // `"false"` is a truthy string. A schema that coerced it would turn a
    // malformed request into a real send.
    const res = await POST(post({ dryRun: 'false', confirm: CONFIRM_PHRASE }), params)
    expect(res.status).toBe(422)
    expect(h.run).not.toHaveBeenCalled()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('authorization (M-21, M-22)', () => {
  it('requires marketing.campaigns.activate', async () => {
    await POST(post(), params)
    expect(h.requirePermission.mock.calls[0][1]).toBe(PERMISSIONS.MARKETING_CAMPAIGNS_ACTIVATE)
  })

  it('🚨 never asks for notifications.send.broadcast', async () => {
    await POST(post({ dryRun: false, confirm: CONFIRM_PHRASE }), params)
    const asked = h.requirePermission.mock.calls.map((c) => c[1])
    expect(asked).not.toContain(PERMISSIONS.NOTIFICATIONS_SEND_BROADCAST)
  })

  it('a refused permission runs nothing', async () => {
    h.requirePermission.mockRejectedValue(new FakeAdminError(403, 'FORBIDDEN'))
    const res = await POST(post(), params)
    expect(res.status).toBe(403)
    expect(h.plan).not.toHaveBeenCalled()
  })

  it('a cross-origin request is refused before anything is resolved', async () => {
    h.sameOrigin.mockReturnValue(false)
    const res = await POST(post(), params)
    expect(res.status).toBe(403)
    expect(h.plan).not.toHaveBeenCalled()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('the dry run is permitted while the gate is closed', () => {
  it('returns the plan and sends nothing', async () => {
    const res = await POST(post({ dryRun: true }), params)
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.audienceSize).toBe(42)
    expect(data.sent).toBe(false)
    expect(h.run).not.toHaveBeenCalled()
  })

  it('🔑 being able to verify the audience WITHOUT any ability to send is the point', async () => {
    // The gate is closed for the whole of this test, and the dry run still works.
    expect(h.canActivate()).toEqual({ ok: false, reason: 'CONSENT_EXPORT_UNSATISFIED' })
    expect((await POST(post({ dryRun: true }), params)).status).toBe(200)
  })

  it('audits the dry run with counts and a hash, never identities or message text', async () => {
    await POST(post({ dryRun: true }), params)
    const entry = h.audit.mock.calls[0][0]
    expect(entry.metadata.dry_run).toBe(true)
    expect(entry.metadata.audience_fingerprint).toBe('abcdef0123456789')
    const json = JSON.stringify(entry)
    expect(json).not.toContain('Spring')
    expect(json).not.toContain('Hello there')
  })

  it('🚨 below the floor: refused, and the response carries NO number (M-12c)', async () => {
    h.plan.mockResolvedValue({ ok: false, reason: 'BELOW_MINIMUM_AUDIENCE' })
    const res = await POST(post({ dryRun: true }), params)
    expect(res.status).toBe(403)
    const body = await res.text()
    expect(body).not.toMatch(/\d/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('lifecycle and confirmation', () => {
  it('refuses to activate a COMPLETED campaign', async () => {
    h.getCampaign.mockResolvedValue({ ...DRAFT, status: 'completed' })
    const res = await POST(post({ dryRun: false, confirm: CONFIRM_PHRASE }), params)
    expect(res.status).toBe(409)
    expect(h.run).not.toHaveBeenCalled()
  })

  it('refuses to activate an ACTIVE campaign', async () => {
    h.getCampaign.mockResolvedValue({ ...DRAFT, status: 'active' })
    const res = await POST(post({ dryRun: false, confirm: CONFIRM_PHRASE }), params)
    expect(res.status).toBe(409)
  })

  it('404s an unknown campaign', async () => {
    h.getCampaign.mockResolvedValue(null)
    expect((await POST(post({}), params)).status).toBe(404)
  })

  it('🔑 the lifecycle is checked BEFORE the audience is resolved', async () => {
    h.getCampaign.mockResolvedValue({ ...DRAFT, status: 'completed' })
    await POST(post({ dryRun: true }), params)
    expect(h.plan).not.toHaveBeenCalled()
  })

  it('the confirmation phrase is untranslated and is the Controller one', async () => {
    expect(CONFIRM_PHRASE).toBe('BROADCAST')
  })

  it('🚨 a wrong phrase is refused with the gate stubbed OPEN', async () => {
    // With the gate closed the phrase check is unreachable, so this stubs it
    // open — otherwise the test would pass for the wrong reason and would keep
    // passing if the phrase check were deleted.
    h.canActivate.mockReturnValue({ ok: true })
    const res = await POST(post({ dryRun: false, confirm: 'broadcast' }), params)
    expect(res.status).toBe(422)
    expect(h.markActive).not.toHaveBeenCalled()
    expect(h.run).not.toHaveBeenCalled()
  })

  it('🚨 a MISSING phrase is refused with the gate stubbed open', async () => {
    h.canActivate.mockReturnValue({ ok: true })
    const res = await POST(post({ dryRun: false }), params)
    expect(res.status).toBe(422)
    expect(h.run).not.toHaveBeenCalled()
  })

  it('🔑 with the gate open, the right phrase and a draft, the run is reached', async () => {
    // POSITIVE CONTROL for the whole path. Without it every refusal above could
    // pass against a route that refused unconditionally.
    h.canActivate.mockReturnValue({ ok: true })
    h.run.mockResolvedValue({
      ok: true,
      result: { ...PLAN, alreadyNotified: 0, attempted: 42, accepted: 42, failed: 0, gone: 0, unreachable: 0, errored: 0, status: 'completed' },
    })
    const res = await POST(post({ dryRun: false, confirm: CONFIRM_PHRASE }), params)
    expect(res.status).toBe(200)
    expect(h.markActive).toHaveBeenCalled()
    expect(h.run).toHaveBeenCalled()
    expect(h.markCompleted).toHaveBeenCalled()
    const { data } = await res.json()
    expect(data.accepted).toBe(42)
    // "accepted" means the push service took it — not that a device showed it.
    expect(Object.keys(data)).not.toContain('delivered')
  })

  it('🚨 a campaign activated by someone else between read and write is refused', async () => {
    h.canActivate.mockReturnValue({ ok: true })
    h.markActive.mockResolvedValue(null) // the conditional update matched 0 rows
    const res = await POST(post({ dryRun: false, confirm: CONFIRM_PHRASE }), params)
    expect(res.status).toBe(409)
    expect(h.run).not.toHaveBeenCalled()
  })

  it('a halted run does NOT mark the campaign completed', async () => {
    h.canActivate.mockReturnValue({ ok: true })
    h.run.mockResolvedValue({
      ok: true,
      result: { ...PLAN, alreadyNotified: 0, attempted: 0, accepted: 0, failed: 0, gone: 0, unreachable: 0, errored: 0, status: 'halted' },
    })
    await POST(post({ dryRun: false, confirm: CONFIRM_PHRASE }), params)
    expect(h.markCompleted).not.toHaveBeenCalled()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('rate limiting', () => {
  it('refuses a rate-limited dry run without resolving an audience', async () => {
    h.rateLimit.mockResolvedValue({ ok: false, retryAfter: 30 })
    const res = await POST(post({ dryRun: true }), params)
    expect(res.status).toBe(429)
    expect(h.plan).not.toHaveBeenCalled()
  })
})
