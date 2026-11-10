import { describe, it, expect, vi, beforeEach } from 'vitest'
import { advanceVideoAsset, reconcileProcessing, START_GRACE_MS, type AdvanceDeps } from './processing'
import { memoryStore, uuidIds } from './__fixtures__/memoryStore'
import type { ModerationDeps } from './moderationStep'
import type { VideoAssetRow } from './uploadFlow'

// The wiring of VID-03: advanceVideoAsset (the status route, the reconciliation sweep) moves a video in `moderating` through the moderation step.
const OWNER = '4dcce7cf-5f49-4c58-9901-2d586e31352d'
const BUCKET = 'tappyai-video-source-test'
let clock: { now: number }
let mem: ReturnType<typeof memoryStore>
beforeEach(() => { clock = { now: Date.parse('2026-11-05T10:00:00Z') }; mem = memoryStore(clock, uuidIds) })

async function moderating(key = 'wire-key-000001'): Promise<VideoAssetRow> {
  const row = await mem.store.create(OWNER, key)
  await mem.store.setSource(row.id, BUCKET, `vsrc/${OWNER}/abcdefghijklmnopqrstuvwx.mp4`)
  await mem.store.transition(row.id, 'uploading', { eventType: 'e', actor: 'u' })
  await mem.store.setMediaInfo(row.id, { durationMs: 30_000, width: 720, height: 1280, hasAudio: false })
  for (const s of ['uploaded', 'processing', 'moderating'] as const) await mem.store.transition(row.id, s, { eventType: 'e', actor: 's' })
  return (await mem.store.get(row.id))!
}
const clean = { status: 'ok' as const, categories: {}, scores: { sexual: 0.001 } }
function modDeps(over: Partial<ModerationDeps> = {}): ModerationDeps {
  return {
    store: mem.store,
    reader: { read: vi.fn(async () => new Uint8Array([1])) },
    consent: { isAllowed: vi.fn(async () => true) },
    moderateImage: vi.fn(async () => clean),
    moderateText: vi.fn(async () => clean),
    transcribe: vi.fn(async () => ({ status: 'ok' as const, text: '' })),
    speechEnabled: false,
    autoRejectEnabled: false,
    ...over,
  }
}
const deps = (moderation: ModerationDeps | null | undefined): AdvanceDeps => ({ store: mem.store, transcoder: null, bucket: BUCKET, now: () => clock.now, moderation })

describe('advanceVideoAsset for a video in moderating', () => {
  it('runs the moderation step: ready + approved, action moderated', async () => {
    const a = await moderating()
    expect(await advanceVideoAsset(a.id, deps(modDeps()))).toEqual({ assetId: a.id, state: 'ready', action: 'moderated' })
    expect(mem.rows.get(a.id)).toMatchObject({ state: 'ready', moderation_state: 'approved' })
  })

  it('without moderation deps (not configured) the video is left alone: nothing is done', async () => {
    const a = await moderating()
    expect(await advanceVideoAsset(a.id, deps(null))).toEqual({ assetId: a.id, state: 'moderating', action: 'none' })
    expect(await advanceVideoAsset(a.id, deps(undefined))).toMatchObject({ action: 'none' })
    expect(mem.rows.get(a.id)?.state).toBe('moderating')
  })

  it('no AI consent is reported as no_consent and the state stays', async () => {
    const a = await moderating()
    const r = await advanceVideoAsset(a.id, deps(modDeps({ consent: { isAllowed: async () => false } })))
    expect(r).toEqual({ assetId: a.id, state: 'moderating', action: 'no_consent' })
  })

  it('a provider that is down is reported as waiting', async () => {
    const a = await moderating()
    const r = await advanceVideoAsset(a.id, deps(modDeps({ moderateImage: async () => ({ status: 'unavailable', reason: 'failed' }) })))
    expect(r).toMatchObject({ state: 'moderating', action: 'waiting' })
  })

  it('a decided video asked about again is none (no second decision)', async () => {
    const a = await moderating()
    await advanceVideoAsset(a.id, deps(modDeps()))
    expect(await advanceVideoAsset(a.id, deps(modDeps()))).toMatchObject({ state: 'ready', action: 'none' })
    expect(mem.moderationResults).toHaveLength(1)
  })
})

describe('the reconciliation sweep also moves moderating videos', () => {
  it('moderates those past the grace period, ignores fresh ones, and counts', async () => {
    const old = await moderating('wire-key-old001')
    clock.now += START_GRACE_MS + 1000
    const fresh = await moderating('wire-key-new001')
    const out = await reconcileProcessing(deps(modDeps()), { limit: 10 })
    expect(out).toMatchObject({ looked: 1, moderated: 1, errors: 0 })
    expect(mem.rows.get(old.id)?.state).toBe('ready')
    expect(mem.rows.get(fresh.id)?.state).toBe('moderating')
  })

  it('runs with no transcoder configured (moderation does not need one), and a failing video does not stop the rest', async () => {
    const a = await moderating('wire-key-bad001')
    const b = await moderating('wire-key-good01')
    clock.now += START_GRACE_MS + 1000
    const real = mem.store.recordAutoModeration
    let first = true
    vi.spyOn(mem.store, 'recordAutoModeration').mockImplementation(async (id, rec) => { if (first) { first = false; throw new Error('db down') } return real(id, rec) })
    const out = await reconcileProcessing(deps(modDeps()), { limit: 10 })
    expect(out.errors).toBe(1)
    expect(out.moderated).toBe(1)
    expect([mem.rows.get(a.id)?.state, mem.rows.get(b.id)?.state].sort()).toEqual(['moderating', 'ready'])
  })

  it('without moderation deps the moderating list is not even read', async () => {
    await moderating()
    clock.now += START_GRACE_MS + 1000
    const spy = vi.spyOn(mem.store, 'listModerating')
    expect(await reconcileProcessing(deps(null), { limit: 10 })).toEqual({ looked: 0, completed: 0, restarted: 0, failed: 0, errors: 0 })
    expect(spy).not.toHaveBeenCalled()
  })

  it('waiting videos (no consent) are counted, not failed', async () => {
    await moderating()
    clock.now += START_GRACE_MS + 1000
    const out = await reconcileProcessing(deps(modDeps({ consent: { isAllowed: async () => false } })), { limit: 10 })
    expect(out).toMatchObject({ moderated: 0, moderationWaiting: 1, errors: 0 })
  })
})
