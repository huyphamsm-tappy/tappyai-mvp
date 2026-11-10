import { describe, it, expect } from 'vitest'
import { ASSET, OTHER_USER, OWNER, REVIEW, makeAsset, memoryBucket, memoryDeliveryStore } from './__fixtures__/memoryDeliveryStore'
import { claimVideoForPost, inspectVideoForPost, parseVideoAssetId } from './publishPost'

const STG = `vstg/${OWNER}/${ASSET}/`
const NEW_REVIEW = '55555555-5555-4555-8555-555555555555'
const OTHER_REVIEW = '66666666-6666-4666-8666-666666666666'

function setup(asset = makeAsset(), reviews: Array<{ id: string; user_id: string; is_hidden: boolean; publication_state: string | null }> = []) {
  const db = memoryDeliveryStore([asset], reviews)
  const source = memoryBucket('tappy-video-source', ['manifest.m3u8', 'hls720.m3u8', 'hls720-0000000000.ts', 'audio.mp4'].map(n => STG + n))
  const delivery = memoryBucket('tappy-video-delivery')
  const deps = {
    store: db.store, cdnHost: 'media.example.com',
    source: { provider: source.provider, bucket: source.bucket }, delivery: { provider: delivery.provider, bucket: delivery.bucket },
    newId: () => NEW_REVIEW,
  }
  return { db, source, delivery, deps }
}

describe('parseVideoAssetId', () => {
  it('accepts a uuid only; absent means no video', () => {
    expect(parseVideoAssetId(undefined)).toEqual({ ok: true, id: null })
    expect(parseVideoAssetId(null)).toEqual({ ok: true, id: null })
    expect(parseVideoAssetId('')).toEqual({ ok: true, id: null })
    expect(parseVideoAssetId(ASSET.toUpperCase())).toEqual({ ok: true, id: ASSET })
    for (const bad of ['x', 12, {}, [ASSET], `${ASSET}/../x`]) expect(parseVideoAssetId(bad), String(bad)).toEqual({ ok: false })
  })
})

describe('inspectVideoForPost', () => {
  it('an unknown video and someone else\'s answer IDENTICALLY (404), so there is no oracle', async () => {
    const { deps } = setup()
    const a = await inspectVideoForPost({ assetId: ASSET, ownerId: OTHER_USER }, deps)
    const b = await inspectVideoForPost({ assetId: '44444444-4444-4444-8444-444444444444', ownerId: OWNER }, deps)
    expect(a).toEqual({ ok: false, status: 404, error: 'video_not_found' })
    expect(b).toEqual(a)
  })

  it('🚨 only a ready (or already published) AND approved video may be posted: every other state is 409 video_not_ready', async () => {
    for (const state of ['draft', 'uploading', 'uploaded', 'processing', 'moderating', 'review_required', 'rejected', 'failed', 'deleted'] as const) {
      const { deps } = setup(makeAsset({ state, moderation_state: 'pending', deleted_at: state === 'deleted' ? '2026-11-05T00:00:00Z' : null }))
      expect(await inspectVideoForPost({ assetId: ASSET, ownerId: OWNER }, deps), state).toEqual({ ok: false, status: 409, error: 'video_not_ready' })
    }
    const { deps } = setup(makeAsset({ moderation_state: 'review_required' }))
    expect(await inspectVideoForPost({ assetId: ASSET, ownerId: OWNER }, deps)).toMatchObject({ ok: false, status: 409 })
  })

  it('a ready video is fine and has no post yet', async () => {
    const { deps } = setup()
    expect(await inspectVideoForPost({ assetId: ASSET, ownerId: OWNER }, deps)).toEqual({ ok: true, reused: false, reviewId: null })
  })

  it('a published video whose post EXISTS is a retry: reused, nothing more to do', async () => {
    const { deps } = setup(makeAsset({ state: 'published', review_id: REVIEW, delivery_manifest_key: 'k' }), [{ id: REVIEW, user_id: OWNER, is_hidden: false, publication_state: 'PUBLISHED' }])
    expect(await inspectVideoForPost({ assetId: ASSET, ownerId: OWNER }, deps)).toEqual({ ok: true, reused: true, reviewId: REVIEW })
  })

  it('a published video whose post is MISSING (the first attempt died after the claim) resumes with the SAME post id', async () => {
    const { deps } = setup(makeAsset({ state: 'published', review_id: REVIEW, delivery_manifest_key: 'k' }))
    expect(await inspectVideoForPost({ assetId: ASSET, ownerId: OWNER }, deps)).toEqual({ ok: true, reused: false, reviewId: REVIEW })
  })
})

describe('claimVideoForPost', () => {
  it('promotes the copy, publishes ready -> published for this post, and returns the manifest on the CDN host and the REAL duration', async () => {
    const { db, delivery, deps } = setup()
    const out = await claimVideoForPost({ assetId: ASSET, ownerId: OWNER, resumeReviewId: null }, deps)
    expect(out).toEqual({ ok: true, reused: false, reviewId: NEW_REVIEW, manifestUrl: `https://media.example.com/vdel/${OWNER}/${ASSET}/manifest.m3u8`, durationSec: 12 })
    expect(db.rows.get(ASSET)).toMatchObject({ state: 'published', review_id: NEW_REVIEW })
    expect([...delivery.objects.keys()].every(k => k.startsWith(`vdel/${OWNER}/${ASSET}/`))).toBe(true)
    expect(db.events.map(e => e.eventType)).toEqual(['post_published'])
  })

  it('is idempotent: claiming again for the same post (a retry) changes nothing and copies nothing', async () => {
    const { db, delivery, deps } = setup()
    await claimVideoForPost({ assetId: ASSET, ownerId: OWNER, resumeReviewId: null }, deps)
    const copies = delivery.log.copies.length
    const again = await claimVideoForPost({ assetId: ASSET, ownerId: OWNER, resumeReviewId: NEW_REVIEW }, deps)
    expect(again).toMatchObject({ ok: true, reviewId: NEW_REVIEW })
    expect(delivery.log.copies.length).toBe(copies)
    expect(db.events).toHaveLength(1)
  })

  it('🚨 a video already carried by ANOTHER post is never given to a second one: reused when that post exists, 409 when it does not', async () => {
    const taken = setup(makeAsset({ state: 'published', review_id: OTHER_REVIEW, delivery_manifest_key: `vdel/${OWNER}/${ASSET}/manifest.m3u8` }), [{ id: OTHER_REVIEW, user_id: OWNER, is_hidden: false, publication_state: 'PUBLISHED' }])
    expect(await claimVideoForPost({ assetId: ASSET, ownerId: OWNER, resumeReviewId: null }, taken.deps)).toEqual({ ok: true, reused: true, reviewId: OTHER_REVIEW })
    const orphan = setup(makeAsset({ state: 'published', review_id: OTHER_REVIEW, delivery_manifest_key: `vdel/${OWNER}/${ASSET}/manifest.m3u8` }))
    expect(await claimVideoForPost({ assetId: ASSET, ownerId: OWNER, resumeReviewId: null }, orphan.deps)).toMatchObject({ ok: false, status: 409 })
  })

  it('a failed promotion publishes NOTHING: the video stays ready and the caller may retry', async () => {
    const { db, delivery, deps } = setup()
    delivery.opts.failCopy.add(STG + 'hls720-0000000000.ts')
    const out = await claimVideoForPost({ assetId: ASSET, ownerId: OWNER, resumeReviewId: null }, deps)
    expect(out).toMatchObject({ ok: false, status: 503 })
    expect(db.rows.get(ASSET)!.state).toBe('ready')
    expect(db.calls.publish).toBe(0)
  })

  it('without the CDN host, the source bucket or the delivery bucket: 503, nothing copied, nothing published', async () => {
    for (const patch of [{ cdnHost: null }, { source: null }, { delivery: null }]) {
      const { db, deps } = setup()
      const out = await claimVideoForPost({ assetId: ASSET, ownerId: OWNER, resumeReviewId: null }, { ...deps, ...patch })
      expect(out, JSON.stringify(patch)).toEqual({ ok: false, status: 503, error: 'video_unavailable' })
      expect(db.calls.publish).toBe(0)
      expect(db.rows.get(ASSET)!.state).toBe('ready')
    }
  })

  it('maps the database\'s refusals: a video that stopped being ready between inspect and claim is 409, someone else\'s is 404', async () => {
    const { db, deps } = setup()
    await deps.store.transition(ASSET, 'review_required', { eventType: 'reported', actor: 'service:test' })
    expect(await claimVideoForPost({ assetId: ASSET, ownerId: OWNER, resumeReviewId: null }, deps)).toMatchObject({ ok: false, status: 409, error: 'video_not_ready' })
    const other = setup()
    expect(await claimVideoForPost({ assetId: ASSET, ownerId: OTHER_USER, resumeReviewId: null }, other.deps)).toMatchObject({ ok: false, status: 404 })
    expect(db.calls.publish).toBe(0)
  })
})
