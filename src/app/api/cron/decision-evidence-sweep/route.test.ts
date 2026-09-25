import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// F-097 cron route: the secret gate, the one RPC it may make, and what it reports. The SQL
// contract (only expired rows, service_role only) is pinned in supabase/tests/decision_evidence_sweep.test.ts.

const h = vi.hoisted(() => ({ calls: [] as Array<{ fn: string; args: unknown }>, result: { data: 3 as unknown, error: null as null | { code?: string } } }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: unknown) => { h.calls.push({ fn, args }); return h.result },
    from: () => { throw new Error('the sweep route must not touch tables directly') },
  }),
}))

import { GET } from './route'

const call = (auth?: string) => GET(new Request('http://localhost/api/cron/decision-evidence-sweep', { headers: auth ? { authorization: auth } : {} }))

describe('GET /api/cron/decision-evidence-sweep', () => {
  const prev = process.env.CRON_SECRET
  beforeEach(() => { process.env.CRON_SECRET = 's3cret'; h.calls.length = 0; h.result = { data: 3, error: null } })
  afterEach(() => { process.env.CRON_SECRET = prev })

  it('🚨 refuses without the cron secret and makes no call', async () => {
    expect((await call()).status).toBe(401)
    expect((await call('Bearer wrong')).status).toBe(401)
    expect(h.calls).toHaveLength(0)
  })

  it('🚨 refuses when CRON_SECRET is unset, even with an empty bearer', async () => {
    delete process.env.CRON_SECRET
    expect((await call('Bearer ')).status).toBe(401)
    expect((await call('Bearer undefined')).status).toBe(401)
    expect(h.calls).toHaveLength(0)
  })

  it('calls decision_evidence_sweep once, bounded, and reports the count', async () => {
    const res = await call('Bearer s3cret')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, deleted: 3, more: false })
    expect(h.calls).toEqual([{ fn: 'decision_evidence_sweep', args: { p_limit: 5000 } }])
  })

  it('a failed sweep answers 500 (e.g. the migration is not applied yet)', async () => {
    h.result = { data: null, error: { code: 'PGRST202' } }
    const res = await call('Bearer s3cret')
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ ok: false, error: 'sweep_failed' })
  })
})

describe('schedule', () => {
  it('vercel.json runs the sweep daily (18:15 UTC = 01:15 VN)', async () => {
    const { readFileSync } = await import('node:fs')
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons: Array<{ path: string; schedule: string }> }
    expect(vercel.crons).toContainEqual({ path: '/api/cron/decision-evidence-sweep', schedule: '15 18 * * *' })
  })
})
