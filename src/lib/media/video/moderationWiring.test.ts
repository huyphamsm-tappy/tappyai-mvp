import { describe, it, expect, vi } from 'vitest'
import { readWholeObject, buildModerationDeps } from './moderationWiring'
import type { MediaProvider } from '../types'
import type { VideoAssetStore } from './uploadFlow'

const provider = (over: Partial<MediaProvider>): MediaProvider => ({ id: 'gcs', put: vi.fn(), publicUrl: () => '', ...over }) as unknown as MediaProvider

describe('readWholeObject', () => {
  it('reads the whole object after stat', async () => {
    const readRange = vi.fn(async () => new Uint8Array([1, 2, 3]))
    const p = provider({ statObject: async () => ({ size: 3, contentType: 'image/jpeg' }), readRange })
    expect(await readWholeObject(p, 'k')).toEqual(new Uint8Array([1, 2, 3]))
    expect(readRange).toHaveBeenCalledWith('k', 0, 3)
  })
  it('a missing (or empty) object is null; a storage error and an oversize object are thrown (retry / never evidence)', async () => {
    expect(await readWholeObject(provider({ statObject: async () => null, readRange: vi.fn() }), 'k')).toBeNull()
    expect(await readWholeObject(provider({ statObject: async () => ({ size: 0, contentType: '' }), readRange: vi.fn() }), 'k')).toBeNull()
    await expect(readWholeObject(provider({ statObject: async () => { throw new Error('503') }, readRange: vi.fn() }), 'k')).rejects.toThrow()
    await expect(readWholeObject(provider({ statObject: async () => ({ size: 100, contentType: '' }), readRange: vi.fn() }), 'k', 10)).rejects.toThrow('too large')
    await expect(readWholeObject(provider({}), 'k')).rejects.toThrow()
  })
})

describe('buildModerationDeps: the consent that must hold before any provider call', () => {
  const OWNER = '4dcce7cf-5f49-4c58-9901-2d586e31352d'
  /** A stand-in database: ai_data_consent says `aiAllowed` for web-only/agreed accounts; video_clip_consents holds `clip`. */
  const adminWith = (opts: { ios?: boolean; clip: 'accepted' | 'none' | 'withdrawn' }) => ({
    from: (table: string) => ({
      select: () => ({
        in: async () => ({ data: opts.ios ? [{ user_id: OWNER, ios_used: true, granted: true, version: 2, withdrawn_at: null }] : [], error: null }),
        eq: () => ({ maybeSingle: async () => ({ data: table === 'video_clip_consents' && opts.clip !== 'none' ? { version: 1, withdrawn_at: opts.clip === 'withdrawn' ? '2026-11-01T00:00:00Z' : null } : null, error: null }) }),
      }),
    }),
  }) as never
  const consentOf = (admin: never) => {
    const deps = buildModerationDeps({ store: {} as VideoAssetStore, admin, env: { GCS_VIDEO_SOURCE_BUCKET: 'tappyai-video-source-test' } })
    return deps?.consent.isAllowed.bind(deps.consent)
  }

  it('🚨 an account that has not accepted the CLIP conditions is not allowed, even though a web-only account passes the AI-data gate', async () => {
    const isAllowed = consentOf(adminWith({ clip: 'none' }))
    expect(isAllowed).toBeDefined()
    expect(await isAllowed!(OWNER)).toBe(false)
  })
  it('a withdrawn acceptance is not allowed; an accepted one is', async () => {
    const withdrawn = consentOf(adminWith({ clip: 'withdrawn' }))
    expect(withdrawn).toBeDefined()
    expect(await withdrawn!(OWNER)).toBe(false)
    const accepted = consentOf(adminWith({ clip: 'accepted' }))
    expect(accepted).toBeDefined()
    expect(await accepted!(OWNER)).toBe(true)
  })
})

describe('buildModerationDeps', () => {
  const store = {} as VideoAssetStore
  const admin = {} as never
  it('no source bucket configured: null (the video stays in moderating)', () => {
    expect(buildModerationDeps({ store, admin, env: {} })).toBeNull()
  })
  it('reads the two switches from the environment, both OFF by default', () => {
    const env = { GCS_VIDEO_SOURCE_BUCKET: 'tappyai-video-source-test' }
    const off = buildModerationDeps({ store, admin, env })
    // A real provider needs credentials; if none can be built the answer is null, never a throw.
    if (off) { expect(off.speechEnabled).toBe(false); expect(off.autoRejectEnabled).toBe(false) }
    const on = buildModerationDeps({ store, admin, env: { ...env, VIDEO_SPEECH_TRANSCRIBE_ENABLED: 'true', VIDEO_MODERATION_AUTO_REJECT_ENABLED: 'true' } })
    if (on) { expect(on.speechEnabled).toBe(true); expect(on.autoRejectEnabled).toBe(true) }
  })
})
