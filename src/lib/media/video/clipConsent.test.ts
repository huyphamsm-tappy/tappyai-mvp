import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { VIDEO_CLIP_CONSENT_VERSION, hasClipConsent, recordClipConsent, withdrawClipConsent } from './clipConsent'

const U = '4dcce7cf-5f49-4c58-9901-2d586e31352d'

/** A recording stand-in for the table: one row per user, read/upsert/update like the real client. */
function fakeAdmin(initial: { user_id: string; version: number; withdrawn_at: string | null } | null, opts: { readError?: boolean; writeError?: boolean } = {}) {
  let row = initial
  const log: Array<[string, unknown]> = []
  const admin = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => (opts.readError ? { data: null, error: { code: 'XX000' } } : { data: row, error: null }) }) }),
      upsert: async (v: { user_id: string; version: number; withdrawn_at: string | null }) => { log.push(['upsert', v]); if (opts.writeError) return { error: { code: 'XX000' } }; row = { user_id: v.user_id, version: v.version, withdrawn_at: v.withdrawn_at }; return { error: null } },
      update: (v: { withdrawn_at: string }) => ({ eq: async () => { log.push(['update', v]); if (opts.writeError) return { error: { code: 'XX000' } }; if (row) row = { ...row, withdrawn_at: v.withdrawn_at }; return { error: null } } }),
    }),
  } as unknown as SupabaseClient
  return { admin, log, current: () => row }
}

describe('hasClipConsent — every account must have accepted the CURRENT wording', () => {
  it('false with no record (a web-only account is NOT assumed to agree)', async () => {
    expect(await hasClipConsent(fakeAdmin(null).admin, U)).toBe(false)
  })
  it('true only for the current version that was not withdrawn', async () => {
    expect(await hasClipConsent(fakeAdmin({ user_id: U, version: VIDEO_CLIP_CONSENT_VERSION, withdrawn_at: null }).admin, U)).toBe(true)
    expect(await hasClipConsent(fakeAdmin({ user_id: U, version: VIDEO_CLIP_CONSENT_VERSION, withdrawn_at: '2026-11-06T00:00:00Z' }).admin, U)).toBe(false)
    expect(await hasClipConsent(fakeAdmin({ user_id: U, version: VIDEO_CLIP_CONSENT_VERSION - 1, withdrawn_at: null }).admin, U)).toBe(false)
    expect(await hasClipConsent(fakeAdmin({ user_id: U, version: VIDEO_CLIP_CONSENT_VERSION + 1, withdrawn_at: null }).admin, U)).toBe(false)
  })
  it('🚨 a read that fails counts as NOT accepted (a state that cannot be verified is not assumed to agree)', async () => {
    expect(await hasClipConsent(fakeAdmin({ user_id: U, version: VIDEO_CLIP_CONSENT_VERSION, withdrawn_at: null }, { readError: true }).admin, U)).toBe(false)
  })
  it('a malformed user id is refused without a query', async () => {
    expect(await hasClipConsent(fakeAdmin({ user_id: U, version: VIDEO_CLIP_CONSENT_VERSION, withdrawn_at: null }).admin, 'x%y')).toBe(false)
  })
})

describe('recordClipConsent / withdrawClipConsent', () => {
  it('records the current version, clears any withdrawal, and then hasClipConsent is true', async () => {
    const f = fakeAdmin({ user_id: U, version: 0, withdrawn_at: '2026-11-01T00:00:00Z' })
    await recordClipConsent(f.admin, U)
    expect(f.log[0]).toEqual(['upsert', { user_id: U, version: VIDEO_CLIP_CONSENT_VERSION, accepted_at: expect.any(String), withdrawn_at: null }])
    expect(await hasClipConsent(f.admin, U)).toBe(true)
  })
  it('withdrawing makes hasClipConsent false again', async () => {
    const f = fakeAdmin({ user_id: U, version: VIDEO_CLIP_CONSENT_VERSION, withdrawn_at: null })
    await withdrawClipConsent(f.admin, U)
    expect(await hasClipConsent(f.admin, U)).toBe(false)
  })
  it('a write that fails throws (the caller must not tell the person it was saved)', async () => {
    await expect(recordClipConsent(fakeAdmin(null, { writeError: true }).admin, U)).rejects.toThrow()
    await expect(withdrawClipConsent(fakeAdmin(null, { writeError: true }).admin, U)).rejects.toThrow()
  })
  it('a malformed user id never reaches the database', async () => {
    const f = fakeAdmin(null)
    await expect(recordClipConsent(f.admin, 'x%y')).rejects.toThrow()
    expect(f.log).toEqual([])
  })
})
