import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ s: { authorized: true, target: { provider: { id: 'gcs' }, bucket: 'tappyai-video-source' } as { provider: unknown; bucket: string } | null, calls: [] as unknown[], result: { due: 0, removed: 0, failed: 0, deferred: 0, mismatched: 0 } as Record<string, unknown>, boom: false } }))

vi.mock('@/lib/security/cronAuth', () => ({ isAuthorizedCronRequest: () => h.s.authorized }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ tag: 'db' }) }))
vi.mock('@/lib/media/video/sourceStorage', () => ({ getVideoSourceProvider: () => h.s.target }))
vi.mock('@/lib/media/video/sourceCleanup', () => ({
  runVideoSourceCleanup: async (deps: unknown) => { h.s.calls.push(deps); if (h.s.boom) throw new Error('video source cleanup: list failed (57014)'); return h.s.result },
}))

import { GET } from './route'

beforeEach(() => { Object.assign(h.s, { authorized: true, target: { provider: { id: 'gcs' }, bucket: 'tappyai-video-source' }, calls: [], result: { due: 2, removed: 2, failed: 0, deferred: 0, mismatched: 0 }, boom: false }) })

describe('GET /api/cron/video-source-cleanup', () => {
  it('401 without the cron secret, and nothing runs', async () => {
    h.s.authorized = false
    expect((await GET(new Request('https://x/api/cron/video-source-cleanup'))).status).toBe(401)
    expect(h.s.calls).toEqual([])
  })

  it('runs the cleanup against the configured source bucket and returns counts only', async () => {
    const res = await GET(new Request('https://x/api/cron/video-source-cleanup'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, due: 2, removed: 2, failed: 0, deferred: 0, mismatched: 0 })
    expect(h.s.calls[0]).toMatchObject({ bucket: 'tappyai-video-source' })
  })

  it('🚨 is NOT gated by the pipeline flag: deletion keeps working when the feature is switched off', async () => {
    vi.stubEnv('EXPLORE_VIDEO_PIPELINE_ENABLED', '')
    expect((await GET(new Request('https://x/api/cron/video-source-cleanup'))).status).toBe(200)
    expect(h.s.calls).toHaveLength(1)
    vi.unstubAllEnvs()
  })

  it('with no source bucket configured it still answers 200 (the cleanup itself reports skipped)', async () => {
    h.s.target = null
    h.s.result = { due: 0, removed: 0, failed: 0, deferred: 0, mismatched: 0, skipped: 'no_bucket' }
    const res = await GET(new Request('https://x/api/cron/video-source-cleanup'))
    expect(res.status).toBe(200)
    expect(h.s.calls[0]).toMatchObject({ provider: null, bucket: null })
  })

  it('a real failure is a 500 that names no key and no database message', async () => {
    h.s.boom = true
    const res = await GET(new Request('https://x/api/cron/video-source-cleanup'))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).toBe('{"ok":false,"error":"cleanup_failed"}')
  })
})
