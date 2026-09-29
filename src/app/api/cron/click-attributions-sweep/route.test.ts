import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// R21 cron route: the secret gate, the one RPC it may make, and what it reports.

const h = vi.hoisted(() => ({ calls: [] as Array<{ fn: string; args: unknown }>, result: { data: 7 as unknown, error: null as null | { code?: string } } }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: unknown) => { h.calls.push({ fn, args }); return h.result },
    from: () => { throw new Error('the sweep route must not touch tables directly') },
  }),
}))

import { GET } from './route'

const call = (auth?: string) => GET(new Request('http://localhost/api/cron/click-attributions-sweep', { headers: auth ? { authorization: auth } : {} }))

describe('GET /api/cron/click-attributions-sweep (R21)', () => {
  const prev = process.env.CRON_SECRET
  beforeEach(() => { process.env.CRON_SECRET = 's3cret'; h.calls.length = 0; h.result = { data: 7, error: null } })
  afterEach(() => { process.env.CRON_SECRET = prev })

  it('refuses without the cron secret and makes no call', async () => {
    expect((await call()).status).toBe(401)
    expect((await call('Bearer wrong')).status).toBe(401)
    delete process.env.CRON_SECRET
    expect((await call('Bearer ')).status).toBe(401)
    expect(h.calls).toHaveLength(0)
  })

  it('calls commerce_click_attributions_sweep once, bounded, and reports the count', async () => {
    const res = await call('Bearer s3cret')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, deleted: 7, more: false })
    expect(h.calls).toEqual([{ fn: 'commerce_click_attributions_sweep', args: { p_limit: 5000 } }])
  })

  it('reports a failure as 500 without detail', async () => {
    h.result = { data: null, error: { code: '42501' } }
    const res = await call('Bearer s3cret')
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ ok: false, error: 'sweep_failed' })
  })

  it('is scheduled daily in vercel.json', async () => {
    const { readFileSync } = await import('node:fs')
    const v = JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons: Array<{ path: string; schedule: string }> }
    const c = v.crons.find(x => x.path === '/api/cron/click-attributions-sweep')
    expect(c?.schedule).toMatch(/^\d+ \d+ \* \* \*$/)
  })
})
