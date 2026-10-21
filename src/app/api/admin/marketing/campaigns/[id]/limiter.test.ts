// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { bindFreshGraph, configureNoStore, configureSharedStore, resetLimiterEnv } from '@/lib/security/__tests__/sharedLimiterHarness'

// SEC4 slice 5c (docs/phase8/SEC4-ROUTE-MATRIX.md): PATCH /api/admin/marketing/campaigns/[id] was the one admin route without the shared limiter. It now has
// `distributedRateLimit` like its siblings: 60 edits per hour per admin (the sibling `create` numbers; a documented proposal). Admin semantics: FAIL CLOSED — no store configured
// or a store that does not answer refuses the edit (the C10 contract). The limiter is REAL here; only authentication, the campaign store and the audit log are stubbed.

const h = vi.hoisted(() => ({ admin: 'admin-1', sameOrigin: true, permissionError: null as Error | null, store: 0, audits: 0 }))
vi.mock('@/lib/admin/permissions', () => ({
  PERMISSIONS: { MARKETING_CAMPAIGNS_READ: 'r', MARKETING_CAMPAIGNS_UPDATE: 'u' },
  requirePermission: vi.fn(async () => { if (h.permissionError) throw h.permissionError; return { user: { id: h.admin }, actor: { userId: h.admin } } }),
}))
vi.mock('@/lib/admin/permissions/decisionAudit', () => ({ auditActorRole: () => 'owner' }))
vi.mock('@/lib/admin/audit', () => ({ writeAuditLog: () => { h.audits++ } }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/marketing/campaignStore', () => ({
  getCampaign: async () => { h.store++; return { id: 'c1', status: 'draft', title: 't', body: 'b', link: null } },
  updateDraft: async () => { h.store++; return { id: 'c1', status: 'draft', title: 'x', body: 'y', link: null } },
}))
vi.mock('@/lib/admin/rbac', async (orig) => ({ ...(await orig<typeof import('@/lib/admin/rbac')>()), isSameOrigin: () => h.sameOrigin }))

const LIMIT = 60
const WINDOW = 3_600_000
async function fresh() {
  vi.resetModules()
  await bindFreshGraph()
  return (await import('./route')).PATCH
}
const call = (patch: Awaited<ReturnType<typeof fresh>>) =>
  patch(new Request('http://localhost/api/admin/marketing/campaigns/c1', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Tiêu đề', body: 'Nội dung' }) }), { params: Promise.resolve({ id: 'c1' }) })
const refused = (r: Response) => r.status === 429
const logs = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((c) => { try { return JSON.parse(String(c[0])) } catch { return null } }).filter((x) => x && x.type === 'tappyai_rate_limit')

beforeEach(() => { h.admin = 'admin-1'; h.sameOrigin = true; h.permissionError = null; h.store = 0; h.audits = 0; vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-10T03:00:00Z')) })
afterEach(() => { vi.useRealTimers(); resetLimiterEnv() })

describe('PATCH /api/admin/marketing/campaigns/[id] — limiter (admin, fail closed)', () => {
  it('admits 60 edits per hour per admin, then 429 RATE_LIMITED with Retry-After and a quota-breach reason, before the body is parsed or the store is read', async () => {
    configureSharedStore()
    const patch = await fresh()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (let i = 0; i < LIMIT; i++) expect(refused(await call(patch)), `edit ${i + 1}`).toBe(false)
    h.store = 0; h.audits = 0
    const res = await call(patch)
    expect(refused(res)).toBe(true)
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect(res.headers.get('X-RateLimit-Reason')).toBe('limit_exceeded')
    expect(h.store).toBe(0); expect(h.audits).toBe(0)
    const l = logs(warn)
    expect(l).toHaveLength(1)
    expect(l[0]).toEqual({ type: 'tappyai_rate_limit', limit: 'admin_campaign_update', scope: 'distributed', reason: 'limit_exceeded' })
    warn.mockRestore()
  })

  it('keying: another admin has their own bucket', async () => {
    configureSharedStore()
    const patch = await fresh()
    for (let i = 0; i < LIMIT; i++) await call(patch)
    expect(refused(await call(patch))).toBe(true)
    h.admin = 'admin-2'
    expect(refused(await call(patch))).toBe(false)
  })

  it('shared across instances, and the window is an hour (refused at 30 min, admitted after 60)', async () => {
    const store = configureSharedStore()
    const a = await fresh(); const b = await fresh()
    for (let i = 0; i < 30; i++) await call(a)
    for (let i = 30; i < LIMIT; i++) await call(b)
    expect(refused(await call(a))).toBe(true)
    expect(store.calls()).toBe(LIMIT + 1)
    vi.setSystemTime(Date.now() + WINDOW / 2)
    expect(refused(await call(b))).toBe(true)
    vi.setSystemTime(Date.now() + WINDOW / 2 + 1_000)
    expect(refused(await call(b))).toBe(false)
  })

  it('FAIL CLOSED: store configured but not answering → 429 reason store_unavailable, nothing written; recovers when the store answers', async () => {
    const store = configureSharedStore()
    const patch = await fresh()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    store.failNext('throw')
    const down = await call(patch)
    expect(refused(down)).toBe(true)
    expect(down.headers.get('X-RateLimit-Reason')).toBe('store_unavailable')
    expect(h.store).toBe(0); expect(h.audits).toBe(0)
    expect(logs(warn).map((x) => x.reason)).toEqual(['store_unavailable'])
    store.failNext(null)
    expect(refused(await call(patch))).toBe(false)
    warn.mockRestore()
  })

  it('FAIL CLOSED also when NO store is configured (the C10 admin contract — unlike the public routes there is no in-process fallback)', async () => {
    configureNoStore()
    const patch = await fresh()
    const res = await call(patch)
    expect(refused(res)).toBe(true)
    expect(res.headers.get('X-RateLimit-Reason')).toBe('store_unavailable')
    expect(h.store).toBe(0)
  })

  it('order of checks: a permission failure and a cross-origin request are refused without spending any allowance', async () => {
    const store = configureSharedStore()
    const patch = await fresh()
    h.permissionError = Object.assign(new Error('forbidden'), { status: 403 })
    expect((await call(patch)).status).not.toBe(200)
    h.permissionError = null
    h.sameOrigin = false
    expect((await call(patch)).status).toBe(403)
    expect(store.calls()).toBe(0)
  })
})
