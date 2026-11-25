import { describe, it, expect } from 'vitest'
import { ASSET, OWNER, makeAsset, memoryBucket, memoryDeliveryStore } from './__fixtures__/memoryDeliveryStore'
import { DELIVERY_PLAYLIST_CACHE_CONTROL, DELIVERY_SEGMENT_CACHE_CONTROL, deliveryObjectMeta, isDeliverableName, promoteVideoAsset } from './promote'

const STG = `vstg/${OWNER}/${ASSET}/`
const DEL = `vdel/${OWNER}/${ASSET}/`
/** What the Transcoder leaves in the staging folder: the HLS ladder, plus moderation evidence that must NEVER reach viewers. */
const STAGING_FILES = [
  'manifest.m3u8', 'hls720.m3u8', 'hls480.m3u8', 'hls720-0000000000.ts', 'hls720-0000000001.ts', 'hls480-0000000000.ts', 'hls480-0000000001.ts',
  'audio.mp4', 'frames0000000000.jpeg',
].map(n => STG + n)

function setup(over: { asset?: Parameters<typeof makeAsset>[0] } = {}) {
  const db = memoryDeliveryStore([makeAsset(over.asset)])
  const source = memoryBucket('tappy-video-source', STAGING_FILES)
  const delivery = memoryBucket('tappy-video-delivery')
  const deps = { store: db.store, source: { provider: source.provider, bucket: source.bucket }, delivery: { provider: delivery.provider, bucket: delivery.bucket } }
  return { db, source, delivery, deps }
}

describe('isDeliverableName / deliveryObjectMeta', () => {
  it('only HLS playlists and segments are deliverable; the audio-only file and the moderation frames are not', () => {
    for (const ok of ['manifest.m3u8', 'hls720.m3u8', 'hls720-0000000000.ts', 'init.m4s']) expect(isDeliverableName(ok), ok).toBe(true)
    for (const no of ['audio.mp4', 'frames0000000000.jpeg', 'download.mp4', 'x.json', '.m3u8x']) expect(isDeliverableName(no), no).toBe(false)
  })
  it('playlists are cached briefly, segments for the cookie lifetime, both public to the CDN (the spike left private,max-age=0 which defeats it)', () => {
    expect(deliveryObjectMeta('manifest.m3u8')).toEqual({ contentType: 'application/vnd.apple.mpegurl', cacheControl: DELIVERY_PLAYLIST_CACHE_CONTROL })
    expect(deliveryObjectMeta('a.ts')).toEqual({ contentType: 'video/mp2t', cacheControl: DELIVERY_SEGMENT_CACHE_CONTROL })
    expect(DELIVERY_PLAYLIST_CACHE_CONTROL).toMatch(/^public, max-age=\d+$/)
    expect(DELIVERY_SEGMENT_CACHE_CONTROL).toMatch(/^public, max-age=\d+$/)
    expect(Number(/\d+/.exec(DELIVERY_SEGMENT_CACHE_CONTROL)![0])).toBeLessThanOrEqual(600)
  })
})

describe('promoteVideoAsset', () => {
  it('copies exactly the HLS files into vdel/<owner>/<asset>/, the master manifest LAST, and records the delivery manifest', async () => {
    const { db, delivery, source, deps } = setup()
    const r = await promoteVideoAsset(ASSET, deps)
    expect(r).toEqual({ status: 'promoted', manifestKey: `${DEL}manifest.m3u8` })
    expect([...delivery.objects.keys()].sort()).toEqual(
      ['manifest.m3u8', 'hls720.m3u8', 'hls480.m3u8', 'hls720-0000000000.ts', 'hls720-0000000001.ts', 'hls480-0000000000.ts', 'hls480-0000000001.ts'].map(n => DEL + n).sort(),
    )
    expect(delivery.log.copies.at(-1)!.to).toBe(`${DEL}manifest.m3u8`)
    // each copy reads from the PRIVATE source bucket's staging folder
    for (const c of delivery.log.copies) expect(c.from.startsWith(`tappy-video-source/${STG}`)).toBe(true)
    expect(delivery.log.copies.find(c => c.to.endsWith('.ts'))).toMatchObject({ contentType: 'video/mp2t', cacheControl: DELIVERY_SEGMENT_CACHE_CONTROL })
    expect(delivery.log.copies.find(c => c.to.endsWith('manifest.m3u8'))).toMatchObject({ contentType: 'application/vnd.apple.mpegurl', cacheControl: DELIVERY_PLAYLIST_CACHE_CONTROL })
    expect(db.rows.get(ASSET)!.delivery_manifest_key).toBe(`${DEL}manifest.m3u8`)
    // the source is only read, never touched
    expect(source.log.deletes).toEqual([])
    expect(source.objects.size).toBe(STAGING_FILES.length)
  })

  it('is idempotent: a second call copies nothing', async () => {
    const { delivery, deps } = setup()
    await promoteVideoAsset(ASSET, deps)
    const n = delivery.log.copies.length
    expect(await promoteVideoAsset(ASSET, deps)).toEqual({ status: 'already', manifestKey: `${DEL}manifest.m3u8` })
    expect(delivery.log.copies.length).toBe(n)
  })

  it('🚨 refuses anything that is not ready (or published) AND approved, and copies nothing', async () => {
    for (const asset of [
      { state: 'moderating' as const, moderation_state: 'pending' as const },
      { state: 'review_required' as const, moderation_state: 'review_required' as const },
      { state: 'rejected' as const, moderation_state: 'rejected' as const },
      { state: 'processing' as const, moderation_state: 'pending' as const },
      { state: 'failed' as const, moderation_state: 'pending' as const },
      { state: 'deleted' as const, moderation_state: 'approved' as const, deleted_at: '2026-11-05T00:00:00Z' },
      { state: 'ready' as const, moderation_state: 'pending' as const },
    ]) {
      const { delivery, deps, db } = setup({ asset })
      expect(await promoteVideoAsset(ASSET, deps), JSON.stringify(asset)).toEqual({ status: 'not_ready' })
      expect(delivery.log.copies).toEqual([])
      expect(db.rows.get(ASSET)!.delivery_manifest_key).toBeNull()
    }
  })

  it('an unknown asset is not_found', async () => {
    const { deps } = setup()
    expect(await promoteVideoAsset('44444444-4444-4444-8444-444444444444', deps)).toEqual({ status: 'not_found' })
  })

  it('a staging folder without a master manifest or without segments is incomplete and nothing is copied', async () => {
    for (const files of [[STG + 'hls720.m3u8', STG + 'hls720-0000000000.ts'], [STG + 'manifest.m3u8', STG + 'hls720.m3u8']]) {
      const { deps, delivery } = setup()
      for (const k of [...(deps.source.provider.listObjects ? await deps.source.provider.listObjects(STG) : [])]) await deps.source.provider.deleteObject!(k)
      const src = memoryBucket('tappy-video-source', files)
      expect(await promoteVideoAsset(ASSET, { ...deps, source: { provider: src.provider, bucket: src.bucket } })).toEqual({ status: 'incomplete' })
      expect(delivery.log.copies).toEqual([])
    }
  })

  it('a failed copy leaves NOTHING behind in the delivery bucket and records no manifest (the promotion can simply be retried)', async () => {
    const { db, delivery, source, deps } = setup()
    source.objects.set(STG + 'hls480-0000000001.ts', {})
    delivery.opts.failCopy.add(STG + 'hls480-0000000001.ts')
    expect(await promoteVideoAsset(ASSET, deps)).toEqual({ status: 'failed' })
    expect(delivery.objects.size).toBe(0)
    expect(db.rows.get(ASSET)!.delivery_manifest_key).toBeNull()
    delivery.opts.failCopy.clear()
    expect((await promoteVideoAsset(ASSET, deps)).status).toBe('promoted')
  })

  it('verifies the delivery folder after copying: a file that did not land is a failure', async () => {
    const { db, delivery, deps } = setup()
    const original = delivery.provider.copyObject!.bind(delivery.provider)
    delivery.provider.copyObject = async (src, dest, o) => { if (!dest.endsWith('hls480-0000000000.ts')) await original(src, dest, o) }
    expect(await promoteVideoAsset(ASSET, deps)).toEqual({ status: 'failed' })
    expect(db.rows.get(ASSET)!.delivery_manifest_key).toBeNull()
  })

  it('re-promotes a re-approved video whose delivery copy was taken down, and clears the takedown mark', async () => {
    const { db, delivery, deps } = setup({ asset: { delivery_manifest_key: `${DEL}manifest.m3u8`, delivery_removed_at: '2026-11-05T09:00:00Z', delivery_takedown_attempts: 2 } })
    expect((await promoteVideoAsset(ASSET, deps)).status).toBe('promoted')
    expect(delivery.objects.size).toBeGreaterThan(0)
    expect(db.rows.get(ASSET)!.delivery_removed_at).toBeNull()
    expect(db.rows.get(ASSET)!.delivery_takedown_attempts).toBe(0)
  })

  it('the folders come from the asset\'s own owner and id, never from a stored key', async () => {
    const { deps, delivery } = setup({ asset: { staging_manifest_key: 'vstg/someone-else/other/manifest.m3u8' } })
    await promoteVideoAsset(ASSET, deps)
    for (const c of delivery.log.copies) expect(c.to.startsWith(DEL)).toBe(true)
  })

  it('stops starting new copies past its deadline and reports retry (nothing recorded)', async () => {
    const { db, deps } = setup()
    let t = 0
    const r = await promoteVideoAsset(ASSET, { ...deps, deadline: 5, now: () => t++, concurrency: 1 })
    expect(r.status).toBe('retry')
    expect(db.rows.get(ASSET)!.delivery_manifest_key).toBeNull()
  })

  it('refuses to run when the delivery bucket is the source bucket', async () => {
    const { deps } = setup()
    expect(await promoteVideoAsset(ASSET, { ...deps, delivery: { ...deps.delivery, bucket: deps.source.bucket } })).toEqual({ status: 'failed' })
  })
})
