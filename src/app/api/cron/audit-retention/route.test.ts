import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// F-096 audit retention cron: the secret gate, the two RPCs with the owner's numbers (90 days,
// 12 months), and a refused prune surfacing as 500. The SQL is pinned in
// supabase/tests/audit_log_pii_retention.test.ts.

const h = vi.hoisted(() => ({
  calls: [] as Array<{ fn: string; args: unknown }>,
  results: {} as Record<string, { data: unknown; error: null | { code?: string } }>,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: unknown) => { h.calls.push({ fn, args }); return h.results[fn] ?? { data: 0, error: null } },
  }),
}))

import { GET } from './route'

const call = (auth?: string) => GET(new Request('http://localhost/api/cron/audit-retention', { headers: auth ? { authorization: auth } : {} }))

describe('GET /api/cron/audit-retention', () => {
  const prev = process.env.CRON_SECRET
  beforeEach(() => { process.env.CRON_SECRET = 's3cret'; h.calls.length = 0; h.results = {} })
  afterEach(() => { process.env.CRON_SECRET = prev })

  it('🚨 refuses without the secret and makes no call', async () => {
    expect((await call()).status).toBe(401)
    delete process.env.CRON_SECRET
    expect((await call('Bearer undefined')).status).toBe(401)
    expect(h.calls).toHaveLength(0)
  })

  it('sweeps IP/UA at 90 days and prunes the chain at 12 months', async () => {
    h.results = { audit_log_client_sweep: { data: 4, error: null }, audit_log_prune: { data: 0, error: null } }
    const res = await call('Bearer s3cret')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, clientRowsDeleted: 4, chainRowsPruned: 0, sweepError: null, pruneError: null })
    expect(h.calls).toEqual([
      { fn: 'audit_log_client_sweep', args: { p_days: 90 } },
      { fn: 'audit_log_prune', args: { p_months: 12 } },
    ])
  })

  it('a prune refused because the chain does not verify is a 500 with its code', async () => {
    h.results = { audit_log_prune: { data: null, error: { code: '55000' } } }
    const res = await call('Bearer s3cret')
    expect(res.status).toBe(500)
    expect((await res.json()).pruneError).toBe('55000')
  })
})
