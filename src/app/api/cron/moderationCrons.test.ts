import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The two moderation crons (owner 02/10): flag off = 404, the CRON secret is required, counts only, quiet when the queue is empty.
const h = vi.hoisted(() => ({ authorized: true, rows: [] as Array<{ priority: number; created_at: string }>, emit: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/security/cronAuth', () => ({ isAuthorizedCronRequest: () => h.authorized }))
vi.mock('@/lib/notifications/emit', () => ({ emitNotification: h.emit }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ in: () => ({ limit: async () => ({ data: h.rows, error: null }) }) }) }),
    rpc: h.rpc,
  }),
}))
import { GET as DIGEST } from './moderation-digest/route'
import { GET as PURGE } from './moderation-snapshot-purge/route'

const call = (fn: (r: Request) => Promise<Response>) => fn(new Request('https://www.tappyai.com/api/cron/x'))
const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()

describe('moderation crons', () => {
  const prev = { f: process.env.MODERATION_ADMIN_ENABLED, r: process.env.MODERATION_DIGEST_USER_IDS }
  beforeEach(() => {
    process.env.MODERATION_ADMIN_ENABLED = 'true'; process.env.MODERATION_DIGEST_USER_IDS = 'u1, u2'
    h.authorized = true; h.rows = []; h.emit.mockReset(); h.emit.mockResolvedValue({ id: 'n' }); h.rpc.mockReset(); h.rpc.mockResolvedValue({ data: 3, error: null })
  })
  afterEach(() => { for (const [k, v] of [['MODERATION_ADMIN_ENABLED', prev.f], ['MODERATION_DIGEST_USER_IDS', prev.r]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v } })

  it('flag OFF: 404 and nothing happens; without the cron secret: 401', async () => {
    delete process.env.MODERATION_ADMIN_ENABLED
    for (const fn of [DIGEST, PURGE]) { const r = await call(fn); expect(r.status).toBe(404); expect(await r.text()).toBe('') }
    process.env.MODERATION_ADMIN_ENABLED = 'true'; h.authorized = false
    for (const fn of [DIGEST, PURGE]) expect((await call(fn)).status).toBe(401)
    expect(h.emit).not.toHaveBeenCalled(); expect(h.rpc).not.toHaveBeenCalled()
  })

  it('digest: an empty queue sends nothing; a queue sends counts to each named reviewer and nothing about the reports', async () => {
    expect(await (await call(DIGEST)).json()).toMatchObject({ sent: 0, counts: { open: 0 } })
    h.rows = [{ priority: 3, created_at: ago(30) }, { priority: 1, created_at: ago(2) }, { priority: 2, created_at: ago(80) }]
    const out = await (await call(DIGEST)).json()
    expect(out).toMatchObject({ sent: 2, counts: { open: 3, new_24h: 1, urgent: 1, overdue: 2 } })
    expect(h.emit).toHaveBeenCalledTimes(2)
    const n = h.emit.mock.calls[0][0] as { userId: string; title: string; body: string; entityUrl: string }
    expect(n.userId).toBe('u1'); expect(n.entityUrl).toBe('/admin/moderation'); expect(n.title).toMatch(/quá hạn/i); expect(n.body).toContain('3 đang chờ')
    expect(JSON.stringify(n)).not.toMatch(/reported_by|reason|target/)
  })

  it('digest with no recipients configured sends nobody (and says so)', async () => {
    delete process.env.MODERATION_DIGEST_USER_IDS; h.rows = [{ priority: 1, created_at: ago(1) }]
    expect(await (await call(DIGEST)).json()).toMatchObject({ sent: 0, recipients: 0 })
  })

  it('snapshot purge calls the ledger function with 60 days', async () => {
    const out = await (await call(PURGE)).json()
    expect(out).toEqual({ ok: true, purged: 3 })
    expect(h.rpc).toHaveBeenCalledWith('moderation_purge_snapshots', { p_older_than_days: 60 })
  })
})
