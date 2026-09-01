// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// V2.2-2 — campaign CRUD.
//
// 🔑 Every test issues a REQUEST. A page that does not draw a button has never
// stopped anyone calling an endpoint (M-22), and the assertions here are about
// what was WRITTEN or REFUSED, never about a 2xx alone.

const h = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  rateLimit: vi.fn(),
  sameOrigin: vi.fn(() => true),
  audit: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  updateDraft: vi.fn(),
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
    createCampaign: h.create,
    listCampaigns: h.list,
    getCampaign: h.get,
    updateDraft: h.updateDraft,
  }
})

import { GET as listRoute, POST } from './route'
import { GET as readRoute, PATCH } from './[id]/route'
import { PERMISSIONS } from '@/lib/admin/permissions'

const ID = '11111111-1111-4111-8111-111111111111'
const URL_ = 'https://www.tappyai.com/api/admin/marketing/campaigns'

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

const post = (body: unknown) =>
  new Request(URL_, { method: 'POST', body: JSON.stringify(body) })
const patch = (body: unknown) =>
  new Request(`${URL_}/${ID}`, { method: 'PATCH', body: JSON.stringify(body) })
const params = { params: Promise.resolve({ id: ID }) }

beforeEach(() => {
  vi.clearAllMocks()
  h.requirePermission.mockResolvedValue({
    user: { id: 'admin-1', email: 'a@b.c' },
    actor: { isOwner: false, role: 'admin' },
  })
  h.rateLimit.mockResolvedValue({ ok: true, remaining: 59 })
  h.sameOrigin.mockReturnValue(true)
  h.create.mockResolvedValue(DRAFT)
  h.list.mockResolvedValue([DRAFT])
  h.get.mockResolvedValue(DRAFT)
  h.updateDraft.mockResolvedValue({ ...DRAFT, title: 'Autumn' })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('authorization (M-21, M-22)', () => {
  it('list requires marketing.campaigns.read', async () => {
    await listRoute(new Request(URL_))
    expect(h.requirePermission.mock.calls[0][1]).toBe(PERMISSIONS.MARKETING_CAMPAIGNS_READ)
  })

  it('create requires marketing.campaigns.create', async () => {
    await POST(post({ title: 'x', body: 'y' }))
    expect(h.requirePermission.mock.calls[0][1]).toBe(PERMISSIONS.MARKETING_CAMPAIGNS_CREATE)
  })

  it('patch requires marketing.campaigns.update', async () => {
    await PATCH(patch({ title: 'x', body: 'y' }), params)
    expect(h.requirePermission.mock.calls[0][1]).toBe(PERMISSIONS.MARKETING_CAMPAIGNS_UPDATE)
  })

  it('🚨 NO campaign route asks for notifications.send.broadcast', async () => {
    // M-21: two authorities over one delivery mechanism is exactly the
    // confusion the seam's zero-authorization design prevents.
    await listRoute(new Request(URL_))
    await POST(post({ title: 'x', body: 'y' }))
    await PATCH(patch({ title: 'x', body: 'y' }), params)
    await readRoute(new Request(`${URL_}/${ID}`), params)

    const asked = h.requirePermission.mock.calls.map((c) => c[1])
    expect(asked).not.toContain(PERMISSIONS.NOTIFICATIONS_SEND_BROADCAST)
    expect(asked).not.toContain(PERMISSIONS.NOTIFICATIONS_SEND_USER)
    expect(asked.every((p) => String(p).startsWith('marketing.'))).toBe(true)
  })

  it('a refused permission means nothing is written', async () => {
    h.requirePermission.mockRejectedValue(new FakeAdminError(403, 'FORBIDDEN'))
    const res = await POST(post({ title: 'x', body: 'y' }))
    expect(res.status).toBe(403)
    expect(h.create).not.toHaveBeenCalled()
  })

  it('a cross-origin create is refused and writes nothing', async () => {
    h.sameOrigin.mockReturnValue(false)
    const res = await POST(post({ title: 'x', body: 'y' }))
    expect(res.status).toBe(403)
    expect(h.create).not.toHaveBeenCalled()
  })

  it('a cross-origin patch is refused and writes nothing', async () => {
    h.sameOrigin.mockReturnValue(false)
    const res = await PATCH(patch({ title: 'x', body: 'y' }), params)
    expect(res.status).toBe(403)
    expect(h.updateDraft).not.toHaveBeenCalled()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('POST — create a draft', () => {
  it('creates it, in draft, attributed to the caller', async () => {
    const res = await POST(post({ title: 'Spring', body: 'Hello there' }))
    expect(res.status).toBe(201)
    expect(h.create).toHaveBeenCalledWith({}, 'admin-1', {
      title: 'Spring',
      body: 'Hello there',
      link: null,
    })
  })

  it('🚨 a body-supplied `category` is ignored, not stored', async () => {
    // M-5: an author who could declare a campaign transactional would be exempt
    // from every cap, quiet-hours rule and consent check.
    await POST(post({ title: 'x', body: 'y', category: 'system' }))
    const input = h.create.mock.calls[0][2]
    expect(input).not.toHaveProperty('category')
  })

  it('🚨 a body-supplied `status` is ignored — no campaign is born active', async () => {
    // Accepting it would be a way around the dry-run gate entirely.
    await POST(post({ title: 'x', body: 'y', status: 'active' }))
    const input = h.create.mock.calls[0][2]
    expect(input).not.toHaveProperty('status')
  })

  it('rejects an absolute link and writes nothing', async () => {
    const res = await POST(post({ title: 'x', body: 'y', link: 'https://evil.example' }))
    expect(res.status).toBe(422)
    expect(h.create).not.toHaveBeenCalled()
  })

  it('rejects a protocol-relative link', async () => {
    const res = await POST(post({ title: 'x', body: 'y', link: '//evil.example' }))
    expect(res.status).toBe(422)
    expect(h.create).not.toHaveBeenCalled()
  })

  it('accepts a relative link — positive control', async () => {
    const res = await POST(post({ title: 'x', body: 'y', link: '/deals' }))
    expect(res.status).toBe(201)
    expect(h.create.mock.calls[0][2].link).toBe('/deals')
  })

  it('rejects an empty title and an over-long body', async () => {
    expect((await POST(post({ title: '   ', body: 'y' }))).status).toBe(422)
    expect((await POST(post({ title: 'x', body: 'y'.repeat(501) }))).status).toBe(422)
    expect(h.create).not.toHaveBeenCalled()
  })

  it('refuses when rate limited and writes nothing', async () => {
    h.rateLimit.mockResolvedValue({ ok: false, retryAfter: 30 })
    const res = await POST(post({ title: 'x', body: 'y' }))
    expect(res.status).toBe(429)
    expect(h.create).not.toHaveBeenCalled()
  })

  it('audits the creation without recording the message text', async () => {
    await POST(post({ title: 'Secret offer', body: 'Fifty percent off' }))
    const entry = h.audit.mock.calls[0][0]
    expect(entry.action).toBe('marketing.campaign.create')
    expect(entry.targetId).toBe(ID)
    expect(JSON.stringify(entry)).not.toContain('Secret offer')
    expect(JSON.stringify(entry)).not.toContain('Fifty percent off')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('PATCH — edit a draft only (M-16)', () => {
  it('updates a draft', async () => {
    const res = await PATCH(patch({ title: 'Autumn', body: 'Hello there' }), params)
    expect(res.status).toBe(200)
    expect(h.updateDraft).toHaveBeenCalled()
  })

  it('🚨 refuses to edit an ACTIVE campaign', async () => {
    // Editing mid-send means some people get one text and some another under a
    // single campaign id, and the audit record could not say which.
    h.get.mockResolvedValue({ ...DRAFT, status: 'active' })
    const res = await PATCH(patch({ title: 'x', body: 'y' }), params)
    expect(res.status).toBe(409)
    expect(h.updateDraft).not.toHaveBeenCalled()
  })

  it('🚨 refuses to edit a COMPLETED campaign', async () => {
    h.get.mockResolvedValue({ ...DRAFT, status: 'completed' })
    const res = await PATCH(patch({ title: 'x', body: 'y' }), params)
    expect(res.status).toBe(409)
    expect(h.updateDraft).not.toHaveBeenCalled()
  })

  it('🚨 a campaign activated BETWEEN the read and the write is refused', async () => {
    // The race. `updateDraft` repeats `status = draft` in its WHERE clause and
    // returns null when it matches nothing, so the loser does not rewrite the
    // text of a campaign that is already sending.
    h.get.mockResolvedValue(DRAFT) // looked like a draft...
    h.updateDraft.mockResolvedValue(null) // ...but the conditional write matched 0 rows
    const res = await PATCH(patch({ title: 'x', body: 'y' }), params)
    expect(res.status).toBe(409)
  })

  it('404s an unknown campaign without writing', async () => {
    h.get.mockResolvedValue(null)
    const res = await PATCH(patch({ title: 'x', body: 'y' }), params)
    expect(res.status).toBe(404)
    expect(h.updateDraft).not.toHaveBeenCalled()
  })

  it('validates before touching the database', async () => {
    const res = await PATCH(patch({ title: '', body: 'y' }), params)
    expect(res.status).toBe(422)
    expect(h.updateDraft).not.toHaveBeenCalled()
  })
})

// ═════════════════════════════════════════════════════════════════════════════
describe('reads', () => {
  it('lists campaigns', async () => {
    const res = await listRoute(new Request(URL_))
    expect(res.status).toBe(200)
    expect((await res.json()).data).toHaveLength(1)
  })

  it('reads one campaign', async () => {
    const res = await readRoute(new Request(`${URL_}/${ID}`), params)
    expect((await res.json()).data.id).toBe(ID)
  })

  it('404s an unknown campaign', async () => {
    h.get.mockResolvedValue(null)
    expect((await readRoute(new Request(`${URL_}/${ID}`), params)).status).toBe(404)
  })

  it('🔑 no campaign response exposes a `category` field to suggest it is a choice', async () => {
    const res = await readRoute(new Request(`${URL_}/${ID}`), params)
    expect((await res.json()).data).not.toHaveProperty('category')
  })
})
