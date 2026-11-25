import { describe, it, expect, vi } from 'vitest'
import { ASSET, OWNER, REVIEW, makeAsset, memoryBucket, memoryDeliveryStore } from './__fixtures__/memoryDeliveryStore'
import type { CdnInvalidator } from './cdnInvalidate'
import { MAX_TAKEDOWN_ATTEMPTS, runVideoTakedownSweep, takedownVideoAsset, takedownVideoDelivery } from './takedown'

const DEL = `vdel/${OWNER}/${ASSET}/`
const FILES = ['manifest.m3u8', 'hls720.m3u8', 'hls720-0000000000.ts', 'hls720-0000000001.ts'].map(n => DEL + n)
const MANIFEST = DEL + 'manifest.m3u8'

function cdnFake(fail = false) {
  const paths: string[] = []
  const cdn: CdnInvalidator = { async invalidate(p) { paths.push(p); if (fail) throw new Error('cdn down') } }
  return { cdn, paths }
}
function setup(asset = makeAsset({ state: 'rejected', moderation_state: 'rejected', delivery_manifest_key: MANIFEST }), opts: { cdnFail?: boolean; files?: string[] } = {}) {
  const db = memoryDeliveryStore([asset])
  const bucket = memoryBucket('tappy-video-delivery', opts.files ?? FILES)
  const other = memoryBucket('x', [`vdel/${OWNER}/44444444-4444-4444-8444-444444444444/manifest.m3u8`, `vdel/99999999-9999-4999-8999-999999999999/${ASSET}/manifest.m3u8`])
  const c = cdnFake(opts.cdnFail)
  return { db, bucket, other, c, deps: { store: db.store, delivery: bucket.provider, cdn: c.cdn } }
}

describe('takedownVideoDelivery', () => {
  it('removes every object of THIS video, verifies by listing again, invalidates the CDN path of THIS video, and records it', async () => {
    const { db, bucket, c, deps } = setup()
    expect(await takedownVideoDelivery(db.rows.get(ASSET)!, deps)).toBe('removed')
    expect(bucket.objects.size).toBe(0)
    expect(c.paths).toEqual([`/vdel/${OWNER}/${ASSET}/*`])
    expect(db.calls.recordTakedown).toEqual([{ id: ASSET, removed: true, error: null }])
    expect(db.rows.get(ASSET)!.delivery_removed_at).not.toBeNull()
  })

  it('only the owner-and-asset prefix is ever listed or deleted (another video or owner is untouched)', async () => {
    const { db, bucket, deps } = setup(undefined, { files: [...FILES, `vdel/${OWNER}/44444444-4444-4444-8444-444444444444/manifest.m3u8`] })
    await takedownVideoDelivery(db.rows.get(ASSET)!, deps)
    expect([...bucket.objects.keys()]).toEqual([`vdel/${OWNER}/44444444-4444-4444-8444-444444444444/manifest.m3u8`])
  })

  it('🚨 an object that is STILL THERE after the delete (relist) is a failure: nothing is recorded as removed and the CDN is not told it is done', async () => {
    const { db, bucket, c, deps } = setup()
    bucket.opts.stuck.add(FILES[2])
    expect(await takedownVideoDelivery(db.rows.get(ASSET)!, deps)).toBe('failed')
    expect(db.rows.get(ASSET)!.delivery_removed_at).toBeNull()
    expect(db.calls.recordTakedown).toEqual([{ id: ASSET, removed: false, error: 'objects_remain' }])
    expect(c.paths).toEqual([])
  })

  it('a failed delete or list is a failure with a code, retried later', async () => {
    const a = setup(); a.bucket.opts.failDelete.add(FILES[0])
    expect(await takedownVideoDelivery(a.db.rows.get(ASSET)!, a.deps)).toBe('failed')
    expect(a.db.calls.recordTakedown[0]).toMatchObject({ removed: false, error: 'delete_failed' })
    const b = setup(); b.bucket.opts.failList = true
    expect(await takedownVideoDelivery(b.db.rows.get(ASSET)!, b.deps)).toBe('failed')
    expect(b.db.calls.recordTakedown[0]).toMatchObject({ removed: false, error: 'list_failed' })
  })

  it('objects gone but the CDN call failed (or is not configured): NOT recorded as removed, so the next run invalidates again', async () => {
    const a = setup(undefined, { cdnFail: true })
    expect(await takedownVideoDelivery(a.db.rows.get(ASSET)!, a.deps)).toBe('failed')
    expect(a.bucket.objects.size).toBe(0)
    expect(a.db.calls.recordTakedown[0]).toMatchObject({ removed: false, error: 'cdn_failed' })
    expect(a.db.rows.get(ASSET)!.delivery_removed_at).toBeNull()

    const b = setup()
    expect(await takedownVideoDelivery(b.db.rows.get(ASSET)!, { ...b.deps, cdn: null })).toBe('failed')
    expect(b.db.calls.recordTakedown[0]).toMatchObject({ removed: false, error: 'cdn_unconfigured' })
  })

  it('is idempotent: a second run finds nothing to delete, still invalidates, and records removed', async () => {
    const { db, c, deps } = setup()
    await takedownVideoDelivery(db.rows.get(ASSET)!, deps)
    expect(await takedownVideoDelivery(db.rows.get(ASSET)!, deps)).toBe('removed')
    expect(c.paths.length).toBe(2)
  })

  it('without a delivery bucket there is nothing to remove and nothing is recorded', async () => {
    const { db, deps } = setup()
    expect(await takedownVideoDelivery(db.rows.get(ASSET)!, { ...deps, delivery: null })).toBe('unavailable')
    expect(db.calls.recordTakedown).toEqual([])
  })
})

describe('takedownVideoAsset (immediate, by id)', () => {
  it('🚨 refuses to remove the copy of a video that is still public (a mistaken call cannot break a live video)', async () => {
    const asset = makeAsset({ state: 'published', review_id: REVIEW, delivery_manifest_key: MANIFEST })
    const db = memoryDeliveryStore([asset], [{ id: REVIEW, user_id: OWNER, is_hidden: false, publication_state: 'PUBLISHED' }])
    const bucket = memoryBucket('d', FILES)
    expect(await takedownVideoAsset(ASSET, { store: db.store, delivery: bucket.provider, cdn: cdnFake().cdn })).toBe('still_public')
    expect(bucket.objects.size).toBe(FILES.length)
  })

  it('removes the copy once the post is hidden, and an unknown asset is not_found', async () => {
    const asset = makeAsset({ state: 'published', review_id: REVIEW, delivery_manifest_key: MANIFEST })
    const db = memoryDeliveryStore([asset], [{ id: REVIEW, user_id: OWNER, is_hidden: true, publication_state: 'PUBLISHED' }])
    const bucket = memoryBucket('d', FILES)
    const deps = { store: db.store, delivery: bucket.provider, cdn: cdnFake().cdn }
    expect(await takedownVideoAsset(ASSET, deps)).toBe('removed')
    expect(bucket.objects.size).toBe(0)
    expect(await takedownVideoAsset('44444444-4444-4444-8444-444444444444', deps)).toBe('not_found')
  })
})

describe('runVideoTakedownSweep', () => {
  it('takes down videos that left published (rejected, review_required, deleted) and leaves public and ready ones alone', async () => {
    const mk = (n: string, over: Parameters<typeof makeAsset>[0]) => makeAsset({ id: `4444444${n}-4444-4444-8444-444444444444`, delivery_manifest_key: `vdel/${OWNER}/4444444${n}-4444-4444-8444-444444444444/manifest.m3u8`, ...over })
    const rejected = mk('1', { state: 'rejected', moderation_state: 'rejected' })
    const review = mk('2', { state: 'review_required', moderation_state: 'review_required' })
    const deleted = mk('3', { state: 'deleted', deleted_at: '2026-11-05T00:00:00Z' })
    const ready = mk('4', { state: 'ready' })
    const pub = mk('5', { state: 'published', review_id: REVIEW })
    const db = memoryDeliveryStore([rejected, review, deleted, ready, pub], [{ id: REVIEW, user_id: OWNER, is_hidden: false, publication_state: 'PUBLISHED' }])
    const bucket = memoryBucket('d', [rejected, review, deleted, ready, pub].map(a => `vdel/${OWNER}/${a.id}/manifest.m3u8`))
    const out = await runVideoTakedownSweep({ store: db.store, delivery: bucket.provider, cdn: cdnFake().cdn })
    expect(out).toMatchObject({ due: 3, removed: 3, failed: 0 })
    expect([...bucket.objects.keys()].sort()).toEqual([`vdel/${OWNER}/${ready.id}/manifest.m3u8`, `vdel/${OWNER}/${pub.id}/manifest.m3u8`].sort())
  })

  it('a published video whose POST is no longer public is moved to review_required (history), then its copy is removed', async () => {
    const asset = makeAsset({ state: 'published', review_id: REVIEW, delivery_manifest_key: MANIFEST })
    const db = memoryDeliveryStore([asset], [{ id: REVIEW, user_id: OWNER, is_hidden: true, publication_state: 'PUBLISHED' }])
    const bucket = memoryBucket('d', FILES)
    const out = await runVideoTakedownSweep({ store: db.store, delivery: bucket.provider, cdn: cdnFake().cdn })
    expect(out).toMatchObject({ due: 1, removed: 1, demoted: 1 })
    expect(db.rows.get(ASSET)!.state).toBe('review_required')
    expect(db.events).toContainEqual(expect.objectContaining({ from: 'published', to: 'review_required', eventType: 'post_not_public' }))
    expect(bucket.objects.size).toBe(0)
  })

  it('a post that was DELETED (no row) also takes the video down', async () => {
    const asset = makeAsset({ state: 'published', review_id: REVIEW, delivery_manifest_key: MANIFEST })
    const db = memoryDeliveryStore([asset], [])
    const bucket = memoryBucket('d', FILES)
    expect((await runVideoTakedownSweep({ store: db.store, delivery: bucket.provider, cdn: cdnFake().cdn })).removed).toBe(1)
  })

  it('is bounded: a video that keeps failing is no longer listed after MAX_TAKEDOWN_ATTEMPTS, and one failure does not stop the others', async () => {
    const a = makeAsset({ id: '44444441-4444-4444-8444-444444444444', state: 'rejected', moderation_state: 'rejected', delivery_manifest_key: 'k' })
    const b = makeAsset({ id: '44444442-4444-4444-8444-444444444444', state: 'rejected', moderation_state: 'rejected', delivery_manifest_key: 'k' })
    const db = memoryDeliveryStore([a, b])
    const bucket = memoryBucket('d', [`vdel/${OWNER}/${a.id}/manifest.m3u8`, `vdel/${OWNER}/${b.id}/manifest.m3u8`])
    bucket.opts.failDelete.add(`vdel/${OWNER}/${a.id}/manifest.m3u8`)
    const deps = { store: db.store, delivery: bucket.provider, cdn: cdnFake().cdn }
    const first = await runVideoTakedownSweep(deps)
    expect(first).toMatchObject({ due: 2, removed: 1, failed: 1 })
    for (let i = 1; i < MAX_TAKEDOWN_ATTEMPTS; i++) await runVideoTakedownSweep(deps)
    const last = await runVideoTakedownSweep(deps)
    expect(last.due).toBe(0)
    expect(db.rows.get(a.id)!.delivery_takedown_attempts).toBe(MAX_TAKEDOWN_ATTEMPTS)
  })

  it('does nothing without a delivery bucket, and stops starting new videos after its deadline', async () => {
    const asset = makeAsset({ state: 'rejected', moderation_state: 'rejected', delivery_manifest_key: MANIFEST })
    const db = memoryDeliveryStore([asset])
    expect(await runVideoTakedownSweep({ store: db.store, delivery: null, cdn: null })).toMatchObject({ skipped: 'no_bucket', due: 0 })
    const bucket = memoryBucket('d', FILES)
    const out = await runVideoTakedownSweep({ store: db.store, delivery: bucket.provider, cdn: cdnFake().cdn, deadline: 0, now: () => 1 })
    expect(out).toMatchObject({ due: 1, removed: 0 })
    expect(bucket.objects.size).toBe(FILES.length)
  })

  it('a database error while listing is not swallowed', async () => {
    const db = memoryDeliveryStore([])
    db.store.listDueTakedown = vi.fn(async () => { throw new Error('db down') })
    await expect(runVideoTakedownSweep({ store: db.store, delivery: memoryBucket('d').provider, cdn: null })).rejects.toThrow('db down')
  })
})
