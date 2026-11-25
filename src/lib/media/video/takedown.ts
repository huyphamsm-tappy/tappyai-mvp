// Explore video: TAKEDOWN. Whenever a video leaves `published` (rejected, review_required after a report, deleted) or its post stops being public (hidden, held, deleted),
// its delivery copy is removed from the delivery bucket and the CDN is told to forget the path. Order, per video:
//   1. list `vdel/<owner>/<asset>/`, delete every object, LIST AGAIN: anything left is a failure (a delete that did not take is never reported as done);
//   2. invalidate `/vdel/<owner>/<asset>/*` on the CDN (the 05/11 spike: ~5 s, and the edge answers 404 right after);
//   3. only then record `delivery_removed_at` (the playback route refuses a video with that mark, whatever its state says).
// A failure at any step is recorded as a short code (never a provider message or a key) and counted; the sweep retries until MAX_TAKEDOWN_ATTEMPTS, after which the video is no
// longer listed and needs a person (the count stays on the row). Everything is idempotent: running it again on a clean video just invalidates again and records it.
//
// Cookies already handed out stay valid until they expire (10 minutes at most); with the object gone and the cache cleared they no longer fetch anything.

import { videoAssetDeliveryPrefix } from '../key'
import type { MediaProvider } from '../types'
import type { CdnInvalidator } from './cdnInvalidate'
import { decidePlayback } from './playbackAccess'
import type { DeliveryAssetRow, VideoDeliveryStore } from './deliveryStore'

export const MAX_TAKEDOWN_ATTEMPTS = 8
const ACTOR = 'service:video-takedown'

export interface TakedownDeps {
  store: VideoDeliveryStore
  /** A provider bound to the delivery bucket, or null when it is not configured. */
  delivery: MediaProvider | null
  /** null when the CDN invalidation is not configured (the takedown then stays retryable: it is never recorded as done). */
  cdn: CdnInvalidator | null
}

export type TakedownResult = 'removed' | 'failed' | 'unavailable'

/** Removes ONE video's delivery copy and invalidates its CDN path. Never decides WHETHER to: the callers do (the sweep, or takedownVideoAsset). */
export async function takedownVideoDelivery(asset: Pick<DeliveryAssetRow, 'id' | 'owner_id'>, deps: TakedownDeps): Promise<TakedownResult> {
  const prefix = videoAssetDeliveryPrefix(asset.owner_id, asset.id)
  const provider = deps.delivery
  if (!provider) return 'unavailable'
  if (!provider.listObjects || !provider.deleteObject) return fail(asset.id, deps, 'provider_incomplete')

  let keys: string[]
  try {
    keys = await provider.listObjects(prefix)
  } catch {
    return fail(asset.id, deps, 'list_failed')
  }
  for (const key of keys) {
    try { await provider.deleteObject(key) } catch { return fail(asset.id, deps, 'delete_failed') }
  }
  try {
    if ((await provider.listObjects(prefix)).length > 0) return fail(asset.id, deps, 'objects_remain')
  } catch {
    return fail(asset.id, deps, 'list_failed')
  }

  if (!deps.cdn) return fail(asset.id, deps, 'cdn_unconfigured')
  try {
    await deps.cdn.invalidate(`/vdel/${asset.owner_id}/${asset.id}/*`)
  } catch {
    return fail(asset.id, deps, 'cdn_failed')
  }

  await deps.store.recordTakedown(asset.id, { removed: true, error: null })
  return 'removed'
}

async function fail(assetId: string, deps: TakedownDeps, code: string): Promise<'failed'> {
  await deps.store.recordTakedown(assetId, { removed: false, error: code })
  return 'failed'
}

/**
 * Takes a video down NOW, by id (a report handler, a moderator action, a post deletion calls this right after changing the state). Refuses to touch a video that is still public:
 * a mistaken call must never be able to break live content.
 */
export async function takedownVideoAsset(assetId: string, deps: TakedownDeps): Promise<TakedownResult | 'not_found' | 'still_public'> {
  const asset = await deps.store.get(assetId)
  if (!asset) return 'not_found'
  const review = asset.review_id ? await deps.store.getReview(asset.review_id) : null
  const stillPublic = decidePlayback({ asset: { ...asset, delivery_manifest_key: asset.delivery_manifest_key ?? 'x', delivery_removed_at: null }, review, viewerId: null })
  if (stillPublic.allow) return 'still_public'
  return takedownVideoDelivery(asset, deps)
}

export interface TakedownSweepDeps extends TakedownDeps {
  limit?: number
  maxAttempts?: number
  /** Stop starting new videos after this instant (ms, same clock as `now`). */
  deadline?: number
  now?: () => number
}

export interface TakedownSweepResult {
  skipped?: 'no_bucket'
  due: number
  removed: number
  failed: number
  /** Published videos whose post is no longer public, moved to review_required first. */
  demoted: number
  /** The video moved on between the list and the demotion; left for the next run. */
  deferred: number
}

/**
 * The takedown sweep the integrator schedules: every video whose delivery copy must go (database function video_assets_due_for_takedown). A `published` video whose POST
 * is hidden, held or deleted is first moved to review_required (the lifecycle is the source of truth, the post only applies it), then its copy is removed.
 */
export async function runVideoTakedownSweep(deps: TakedownSweepDeps): Promise<TakedownSweepResult> {
  const out: TakedownSweepResult = { due: 0, removed: 0, failed: 0, demoted: 0, deferred: 0 }
  if (!deps.delivery) return { ...out, skipped: 'no_bucket' }
  const now = deps.now ?? Date.now
  const deadline = deps.deadline ?? Number.POSITIVE_INFINITY

  const rows = await deps.store.listDueTakedown(deps.limit ?? 100, deps.maxAttempts ?? MAX_TAKEDOWN_ATTEMPTS)
  out.due = rows.length
  for (const row of rows) {
    if (now() >= deadline) break
    if (row.state === 'published') {
      try {
        await deps.store.transition(row.id, 'review_required', { eventType: 'post_not_public', actor: ACTOR, reason: row.takedown_reason })
        out.demoted++
      } catch (e) {
        // 23514: the asset moved on (another path changed it after the list was read). Not ours to take down this run.
        if ((e as { code?: string })?.code === '23514') { out.deferred++; continue }
        out.failed++
        continue
      }
    }
    try {
      const r = await takedownVideoDelivery(row, deps)
      if (r === 'removed') out.removed++
      else out.failed++
    } catch {
      out.failed++
    }
  }
  return out
}
