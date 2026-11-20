import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({ ran: 0 }))

vi.mock('@/lib/tvi/ingestOfficial', async orig => ({
  ...(await orig<typeof import('@/lib/tvi/ingestOfficial')>()),
  ingestOfficialTargets: async () => { h.ran++; return { targets: 0, skipped: 0, totals: { fetched: 0, facts: 0, created: 0, staged: 0, unchanged: 0, evidence: 0, failed: 0 }, reasons: {} } },
}))

import { GET } from './route'

const call = (auth?: string) => GET(new Request('http://localhost/api/cron/tvi-ingest', { headers: auth ? { authorization: auth } : {} }))

describe('GET /api/cron/tvi-ingest', () => {
  const prev = { s: process.env.CRON_SECRET, f: process.env.TVI_INGEST }
  beforeEach(() => { process.env.CRON_SECRET = 's3cret'; process.env.TVI_INGEST = '1'; h.ran = 0; vi.spyOn(console, 'log').mockImplementation(() => {}) })
  afterEach(() => { process.env.CRON_SECRET = prev.s; if (prev.f === undefined) delete process.env.TVI_INGEST; else process.env.TVI_INGEST = prev.f })

  it('refuses without the cron secret and runs nothing', async () => {
    expect((await call()).status).toBe(401)
    expect(h.ran).toBe(0)
  })
  it('does nothing while the flag is off', async () => {
    delete process.env.TVI_INGEST
    expect(await (await call('Bearer s3cret')).json()).toEqual({ ok: true, skipped: 'flag_off' })
    expect(h.ran).toBe(0)
  })
  it('runs one pass over the curated list and reports counts', async () => {
    const body = await (await call('Bearer s3cret')).json()
    expect(h.ran).toBe(1)
    expect(body).toMatchObject({ ok: true, run: { targets: 0 } })
  })
})
