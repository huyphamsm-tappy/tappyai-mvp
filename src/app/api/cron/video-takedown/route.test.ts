import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  s: {
    authorized: true,
    target: { provider: { id: 'gcs' }, bucket: 'tappy-video-delivery' } as { provider: unknown; bucket: string } | null,
    cdn: { tag: 'cdn' } as unknown,
    calls: [] as Array<Record<string, unknown>>,
    result: { due: 0, removed: 0, failed: 0, demoted: 0, deferred: 0 } as Record<string, unknown>,
    boom: false,
  },
}))

vi.mock('@/lib/security/cronAuth', () => ({ isAuthorizedCronRequest: () => h.s.authorized }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ tag: 'db' }) }))
vi.mock('@/lib/media/video/deliveryStorage', () => ({ getVideoDeliveryProvider: () => h.s.target }))
vi.mock('@/lib/media/video/deliveryStore', () => ({ supabaseVideoDeliveryStore: () => ({ tag: 'store' }) }))
vi.mock('@/lib/media/video/cdnInvalidate', () => ({ getCdnInvalidator: () => h.s.cdn }))
vi.mock('@/lib/media/video/takedown', () => ({
  runVideoTakedownSweep: async (deps: Record<string, unknown>) => { h.s.calls.push(deps); if (h.s.boom) throw new Error('db said OWNER-ID-123'); return h.s.result },
}))

import { GET } from './route'

beforeEach(() => {
  Object.assign(h.s, { authorized: true, target: { provider: { id: 'gcs' }, bucket: 'tappy-video-delivery' }, cdn: { tag: 'cdn' }, calls: [], result: { due: 2, removed: 2, failed: 0, demoted: 1, deferred: 0 }, boom: false })
})

describe('GET /api/cron/video-takedown', () => {
  it('401 without the cron secret, and nothing runs', async () => {
    h.s.authorized = false
    expect((await GET(new Request('https://x/api/cron/video-takedown'))).status).toBe(401)
    expect(h.s.calls).toEqual([])
  })

  it('runs the sweep against the delivery bucket and the CDN client, returning counts only', async () => {
    const res = await GET(new Request('https://x/api/cron/video-takedown'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, due: 2, removed: 2, failed: 0, demoted: 1, deferred: 0 })
    expect(h.s.calls[0]).toMatchObject({ store: { tag: 'store' }, delivery: { id: 'gcs' }, cdn: { tag: 'cdn' } })
    expect(typeof h.s.calls[0].deadline).toBe('number')
  })

  it('🚨 is NOT gated by the pipeline flag: taking content down keeps working when the feature is switched off', async () => {
    vi.stubEnv('EXPLORE_VIDEO_PIPELINE_ENABLED', '')
    expect((await GET(new Request('https://x/api/cron/video-takedown'))).status).toBe(200)
    expect(h.s.calls).toHaveLength(1)
    vi.unstubAllEnvs()
  })

  it('with no delivery bucket configured it still answers 200 (the sweep itself reports skipped)', async () => {
    h.s.target = null
    const res = await GET(new Request('https://x/api/cron/video-takedown'))
    expect(res.status).toBe(200)
    expect(h.s.calls[0]).toMatchObject({ delivery: null })
  })

  it('a real failure is a 500 that names no id and no database message', async () => {
    h.s.boom = true
    const res = await GET(new Request('https://x/api/cron/video-takedown'))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).toBe('{"ok":false,"error":"takedown_failed"}')
  })
})
