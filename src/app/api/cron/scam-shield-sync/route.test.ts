import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'

// The weekly Scam Shield sync: the CRON secret is required (401 without it, and closed when CRON_SECRET is not configured), and the
// schedule is registered in vercel.json. The crawl itself is tested in src/lib/scam-shield/sync/__tests__.
const h = vi.hoisted(() => ({ listApproved: vi.fn(), fetchPublicPage: vi.fn() }))
vi.mock('@/lib/scam-shield/knowledge/versionStore', () => ({
  supabaseVersionStore: () => ({ listApproved: h.listApproved, hasHash: async () => false, insert: async () => true, touchVerified: async () => {} }),
}))
vi.mock('@/lib/security/safePageFetch', () => ({ fetchPublicPage: h.fetchPublicPage }))

import { GET } from './route'

const call = (headers: Record<string, string> = {}) => GET(new Request('https://www.tappyai.com/api/cron/scam-shield-sync', { headers }))

describe('GET /api/cron/scam-shield-sync', () => {
  beforeEach(() => { h.listApproved.mockReset(); h.listApproved.mockResolvedValue([]); h.fetchPublicPage.mockReset() })

  it('401 without the secret, with a wrong one, and when CRON_SECRET is not configured — and nothing is fetched', async () => {
    const prev = process.env.CRON_SECRET
    try {
      process.env.CRON_SECRET = 'weekly-secret'
      expect((await call()).status).toBe(401)
      expect((await call({ authorization: 'Bearer nope' })).status).toBe(401)
      delete process.env.CRON_SECRET
      expect((await call({ authorization: 'Bearer undefined' })).status).toBe(401)
      expect(h.fetchPublicPage).not.toHaveBeenCalled()
      expect(h.listApproved).not.toHaveBeenCalled()
    } finally { if (prev === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = prev }
  })

  it('with the secret it runs, reading only through the safe fetcher with the TappyAI user agent (listing unreachable = reported, not thrown)', async () => {
    const prev = process.env.CRON_SECRET
    try {
      process.env.CRON_SECRET = 'weekly-secret'
      h.fetchPublicPage.mockResolvedValue({ ok: false, reason: 'connect_timeout' })
      const res = await call({ authorization: 'Bearer weekly-secret' })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.errors).toEqual(['bocongan-canh-bao-toi-pham: listing_connect_timeout'])
      expect(h.fetchPublicPage).toHaveBeenCalledTimes(1)
      const [url, opts] = h.fetchPublicPage.mock.calls[0]
      expect(url).toBe('https://bocongan.gov.vn/chuyen-muc/canh-bao-toi-pham-1750063351')
      expect(opts).toMatchObject({ allowHttp: false, userAgent: 'TappyAI/1.0 https://www.tappyai.com', decodeCompressed: true })
    } finally { if (prev === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = prev }
  })

  it('503 when the table is not there (migration not applied): the job reports it instead of pretending', async () => {
    const prev = process.env.CRON_SECRET
    try {
      process.env.CRON_SECRET = 'weekly-secret'
      h.listApproved.mockRejectedValue(new Error('relation does not exist'))
      const res = await call({ authorization: 'Bearer weekly-secret' })
      expect(res.status).toBe(503)
      expect((await res.json()).errors).toContain('store_unavailable')
      expect(h.fetchPublicPage).not.toHaveBeenCalled()
    } finally { if (prev === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = prev }
  })

  it('is scheduled weekly in vercel.json (Monday 03:00 UTC = 10:00 Vietnam)', () => {
    const cfg = JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons: Array<{ path: string; schedule: string }> }
    expect(cfg.crons.filter(c => c.path === '/api/cron/scam-shield-sync')).toEqual([{ path: '/api/cron/scam-shield-sync', schedule: '0 3 * * 1' }])
  })
})
