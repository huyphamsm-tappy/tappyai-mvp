// Explore video: PROMOTION. When a video is `ready` (transcoded, moderated, approved) its HLS output is copied, server-side, from the private staging folder
// (`vstg/<owner>/<asset>/` in the source bucket) into the DELIVERY bucket (`vdel/<owner>/<asset>/`), which Cloud CDN serves with signed cookies. Nothing is visible yet: a copy
// in the delivery bucket is unreachable without a cookie, and a cookie is only handed out for a `published` video (playbackAccess.ts). Publishing is a separate step.
//
// Only the HLS playlists and segments are copied. The audio-only file (speech evidence), the sprite frames (moderation evidence) and anything else in the staging
// folder stay private. Order: every segment and variant playlist first, the MASTER manifest last, so a manifest never names a file that is not there yet. The copy is
// verified by listing the delivery folder; a failed or partial copy is removed again and reported as `failed` (retryable: the whole call is idempotent).
//
// Codes only, never object keys: they carry the owner id.

import { videoAssetDeliveryPrefix, videoAssetStagingPrefix } from '../key'
import type { MediaProvider } from '../types'
import type { VideoDeliveryStore } from './deliveryStore'

/** Cloud CDN only caches what is `public`; the spike's `private,max-age=0` defeated it. Playlists are short-lived, segments live as long as a viewer's cookie (10 minutes). */
export const DELIVERY_PLAYLIST_CACHE_CONTROL = 'public, max-age=60'
export const DELIVERY_SEGMENT_CACHE_CONTROL = 'public, max-age=600'

const DELIVERABLE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(m3u8|ts|m4s)$/
const MANIFEST = 'manifest.m3u8'

export function isDeliverableName(name: string): boolean {
  return DELIVERABLE.test(name)
}

export function deliveryObjectMeta(name: string): { contentType: string; cacheControl: string } {
  if (name.endsWith('.m3u8')) return { contentType: 'application/vnd.apple.mpegurl', cacheControl: DELIVERY_PLAYLIST_CACHE_CONTROL }
  if (name.endsWith('.m4s')) return { contentType: 'video/iso.segment', cacheControl: DELIVERY_SEGMENT_CACHE_CONTROL }
  return { contentType: 'video/mp2t', cacheControl: DELIVERY_SEGMENT_CACHE_CONTROL }
}

export type PromoteResult =
  | { status: 'promoted'; manifestKey: string }
  | { status: 'already'; manifestKey: string }
  | { status: 'not_found' | 'not_ready' | 'incomplete' | 'failed' | 'retry' }

export interface PromoteDeps {
  store: VideoDeliveryStore
  /** The PRIVATE source bucket (the staging folder lives in it). */
  source: { provider: MediaProvider; bucket: string }
  /** The delivery bucket. Must be a different bucket from the source. */
  delivery: { provider: MediaProvider; bucket: string }
  concurrency?: number
  /** Stop starting new copies after this instant (ms, same clock as `now`). */
  deadline?: number
  now?: () => number
}

export async function promoteVideoAsset(assetId: string, deps: PromoteDeps): Promise<PromoteResult> {
  const asset = await deps.store.get(assetId)
  if (!asset) return { status: 'not_found' }
  if (asset.deleted_at !== null || asset.moderation_state !== 'approved') return { status: 'not_ready' }

  const hasLiveCopy = asset.delivery_manifest_key !== null && asset.delivery_removed_at === null
  if (asset.state === 'published') return hasLiveCopy ? { status: 'already', manifestKey: asset.delivery_manifest_key! } : { status: 'not_ready' }
  if (asset.state !== 'ready') return { status: 'not_ready' }
  if (hasLiveCopy) return { status: 'already', manifestKey: asset.delivery_manifest_key! }

  if (deps.delivery.bucket === deps.source.bucket) return { status: 'failed' }
  const { listObjects, deleteObject } = deps.delivery.provider
  const copy = deps.delivery.provider.copyObject
  if (!deps.source.provider.listObjects || !listObjects || !deleteObject || !copy) return { status: 'failed' }

  // The folders come from the asset's own ids (validated as uuids), never from a stored key.
  const srcPrefix = videoAssetStagingPrefix(asset.owner_id, asset.id)
  const destPrefix = videoAssetDeliveryPrefix(asset.owner_id, asset.id)

  let names: string[]
  try {
    names = (await deps.source.provider.listObjects(srcPrefix)).map(k => k.slice(srcPrefix.length)).filter(n => isDeliverableName(n))
  } catch {
    return { status: 'failed' }
  }
  if (!names.includes(MANIFEST) || !names.some(n => !n.endsWith('.m3u8'))) return { status: 'incomplete' }
  const rest = names.filter(n => n !== MANIFEST)

  const now = deps.now ?? Date.now
  const deadline = deps.deadline ?? Number.POSITIVE_INFINITY
  const copied: string[] = []
  let failed = false
  let timedOut = false

  const copyOne = async (name: string): Promise<void> => {
    if (failed) return
    if (now() >= deadline) { timedOut = true; return }
    try {
      await copy.call(deps.delivery.provider, { bucket: deps.source.bucket, key: srcPrefix + name }, destPrefix + name, deliveryObjectMeta(name))
      copied.push(destPrefix + name)
    } catch {
      failed = true
    }
  }

  const queue = [...rest]
  const workers = Array.from({ length: Math.max(1, Math.min(deps.concurrency ?? 6, 16)) }, async () => {
    for (let n = queue.shift(); n !== undefined; n = queue.shift()) await copyOne(n)
  })
  await Promise.all(workers)
  if (!failed && !timedOut) await copyOne(MANIFEST)

  const cleanup = async () => {
    for (const key of copied) { try { await deleteObject.call(deps.delivery.provider, key) } catch { /* the next promotion or the takedown sweep removes it */ } }
  }
  if (failed || timedOut) {
    await cleanup()
    return { status: failed ? 'failed' : 'retry' }
  }

  // Verify: every file named above is really in the delivery folder.
  try {
    const present = new Set(await listObjects.call(deps.delivery.provider, destPrefix))
    if (!names.every(n => present.has(destPrefix + n))) { await cleanup(); return { status: 'failed' } }
  } catch {
    await cleanup()
    return { status: 'failed' }
  }

  const manifestKey = destPrefix + MANIFEST
  await deps.store.setDeliveryManifest(asset.id, manifestKey)
  return { status: 'promoted', manifestKey }
}
