import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// F-096 cron: the secret gate, the provider it needs, what it reports. The worker's behaviour is
// pinned in src/lib/account/deletionJobs.test.ts; the queue in supabase/tests/account_deletion_f096.test.ts.

const h = vi.hoisted(() => ({
  provider: { listObjects: undefined as unknown, deleteObject: undefined as unknown },
  result: { processed: 1, completed: 1, failed: 0, objectsDeleted: 3, tokensRevoked: 1 },
  throws: false,
  calls: 0,
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/media', () => ({ getMediaProvider: () => h.provider }))
vi.mock('@/lib/integrations/googleCalendar', () => ({ revokeGoogleToken: async () => true }))
vi.mock('@/lib/account/deletionJobs', () => ({
  processAccountDeletionJobs: async () => { h.calls++; if (h.throws) throw new Error('account_deletion_jobs read failed (42P01)'); return h.result },
}))

import { GET } from './route'

const call = (auth?: string) => GET(new Request('http://localhost/api/cron/account-deletion-jobs', { headers: auth ? { authorization: auth } : {} }))

describe('GET /api/cron/account-deletion-jobs', () => {
  const prev = process.env.CRON_SECRET
  beforeEach(() => {
    process.env.CRON_SECRET = 's3cret'; h.calls = 0; h.throws = false
    h.provider = { listObjects: async () => [], deleteObject: async () => true }
  })
  afterEach(() => { process.env.CRON_SECRET = prev })

  it('🚨 refuses without the secret, and with CRON_SECRET unset', async () => {
    expect((await call()).status).toBe(401)
    expect((await call('Bearer nope')).status).toBe(401)
    delete process.env.CRON_SECRET
    expect((await call('Bearer undefined')).status).toBe(401)
    expect(h.calls).toBe(0)
  })

  it('runs the worker and reports counts only', async () => {
    const res = await call('Bearer s3cret')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, processed: 1, completed: 1, failed: 0, objectsDeleted: 3, tokensRevoked: 1 })
  })

  it('a provider that cannot list/delete is a 500, not a silent success', async () => {
    h.provider = { listObjects: undefined, deleteObject: undefined }
    const res = await call('Bearer s3cret')
    expect(res.status).toBe(500)
    expect(h.calls).toBe(0)
  })

  it('a worker failure (e.g. the migration is not applied) is a 500', async () => {
    h.throws = true
    const res = await call('Bearer s3cret')
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ ok: false, error: 'deletion_jobs_failed' })
  })
})

describe('schedule', () => {
  it('vercel.json runs the deletion jobs daily (18:45 UTC = 01:45 VN) and the audit retention (19:00 UTC)', async () => {
    const { readFileSync } = await import('node:fs')
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons: Array<{ path: string; schedule: string }> }
    expect(vercel.crons).toContainEqual({ path: '/api/cron/account-deletion-jobs', schedule: '45 18 * * *' })
    expect(vercel.crons).toContainEqual({ path: '/api/cron/audit-retention', schedule: '0 19 * * *' })
  })
})
