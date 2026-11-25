import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ s: { authorized: true, bucket: 'tappyai-video-source' as string | null, calls: [] as unknown[], boom: false, result: { looked: 2, completed: 1, restarted: 1, failed: 0, errors: 0 } } }))

vi.mock('@/lib/security/cronAuth', () => ({ isAuthorizedCronRequest: () => h.s.authorized }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/media/video/assetStore', () => ({ supabaseVideoAssetStore: () => ({ tag: 'store' }) }))
vi.mock('@/lib/media/video/sourceStorage', () => ({ videoSourceBucket: () => h.s.bucket }))
vi.mock('@/lib/media/video/transcoder', () => ({ getTranscoderClient: () => ({ tag: 'transcoder' }) }))
vi.mock('@/lib/media/video/processing', () => ({
  reconcileProcessing: async (deps: unknown, opts: unknown) => { h.s.calls.push({ deps, opts }); if (h.s.boom) throw new Error('db exploded with row {"k":"vsrc/x"}'); return h.s.result },
}))

import { GET } from './route'

const req = () => new Request('https://x/api/cron/video-reconcile')
beforeEach(() => { vi.unstubAllEnvs(); Object.assign(h.s, { authorized: true, bucket: 'tappyai-video-source', calls: [], boom: false }) })
const on = () => vi.stubEnv('EXPLORE_VIDEO_PIPELINE_ENABLED', 'true')

describe('GET /api/cron/video-reconcile', () => {
  it('401 without the cron secret, and nothing runs', async () => {
    on(); h.s.authorized = false
    expect((await GET(req())).status).toBe(401)
    expect(h.s.calls).toEqual([])
  })

  it('🚨 while the feature is off it does nothing and says so (200, skipped)', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, skipped: 'feature_off' })
    expect(h.s.calls).toEqual([])
  })

  it('with no source bucket configured it skips', async () => {
    on(); h.s.bucket = null
    expect(await (await GET(req())).json()).toEqual({ ok: true, skipped: 'no_bucket' })
    expect(h.s.calls).toEqual([])
  })

  it('reconciles a bounded batch and returns counts only', async () => {
    on()
    const res = await GET(req())
    expect(await res.json()).toEqual({ ok: true, looked: 2, completed: 1, restarted: 1, failed: 0, errors: 0 })
    expect((h.s.calls[0] as { opts: { limit: number } }).opts.limit).toBe(50)
    expect((h.s.calls[0] as { deps: { bucket: string } }).deps.bucket).toBe('tappyai-video-source')
  })

  it('a real failure is a 500 that carries no database message and no key', async () => {
    on(); h.s.boom = true
    const res = await GET(req())
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).toBe('{"ok":false,"error":"reconcile_failed"}')
  })
})
