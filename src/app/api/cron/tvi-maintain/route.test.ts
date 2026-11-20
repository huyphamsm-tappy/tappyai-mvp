import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// TVI maintenance cron: the secret gate, the flag, and that it reports counts only.

const h = vi.hoisted(() => ({ ran: 0 }))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({}), rpc: async () => ({}) }) }))
vi.mock('@/lib/tvi/maintain', async orig => ({
  ...(await orig<typeof import('@/lib/tvi/maintain')>()),
  runTviMaintenance: async () => { h.ran++; return { examined: 4, promoted: 3, held: 1, disputed: 0, expired: 0, conflicts: 0, failed: 0 } },
}))
vi.mock('@/lib/tvi/coverage', async orig => ({
  ...(await orig<typeof import('@/lib/tvi/coverage')>()),
  loadCoverageRows: async () => ({ entities: 2, rows: [{ factType: 'address', status: 'ACTIVE', verification: 'PARTIALLY_VERIFIED', retrievedAt: new Date().toISOString() }] }),
}))

import { GET } from './route'

const call = (auth?: string) => GET(new Request('http://localhost/api/cron/tvi-maintain', { headers: auth ? { authorization: auth } : {} }))

describe('GET /api/cron/tvi-maintain', () => {
  const prev = { s: process.env.CRON_SECRET, f: process.env.TVI_MAINTAIN }
  beforeEach(() => { process.env.CRON_SECRET = 's3cret'; process.env.TVI_MAINTAIN = '1'; h.ran = 0; vi.spyOn(console, 'log').mockImplementation(() => {}) })
  afterEach(() => { process.env.CRON_SECRET = prev.s; if (prev.f === undefined) delete process.env.TVI_MAINTAIN; else process.env.TVI_MAINTAIN = prev.f })

  it('refuses without the cron secret and runs nothing', async () => {
    expect((await call()).status).toBe(401)
    expect((await call('Bearer wrong')).status).toBe(401)
    expect(h.ran).toBe(0)
  })
  it('does nothing while the flag is off, but still answers', async () => {
    delete process.env.TVI_MAINTAIN
    const res = await call('Bearer s3cret')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, skipped: 'flag_off' })
    expect(h.ran).toBe(0)
  })
  it('runs one pass and reports counts and the coverage summary, nothing else', async () => {
    const res = await call('Bearer s3cret')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(h.ran).toBe(1)
    expect(body.ok).toBe(true)
    expect(body.maintain).toMatchObject({ promoted: 3 })
    expect(body.coverage).toMatchObject({ entities: 2, facts: 1, activeShare: 1 })
    expect(Object.keys(body).sort()).toEqual(['coverage', 'maintain', 'ok'])
    expect(Object.keys(body.coverage).sort()).toEqual(['activeShare', 'byStatus', 'byType', 'byVerification', 'entities', 'facts', 'freshness', 'staleByType'])
  })
})
