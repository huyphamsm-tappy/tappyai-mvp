// An in-memory stand-in for the delivery side of video_assets (promotion, publishing, takedown) plus a fake delivery/source bucket. It enforces the SAME transition table as
// the database (canTransition) and the same rules as video_asset_publish, so the flows are tested without a database or a network.

import { canTransition, type ModerationState, type VideoAssetState } from '../assetState'
import type { DeliveryAssetRow, ReviewVisibility, TakedownCandidate, VideoDeliveryStore } from '../deliveryStore'
import type { MediaProvider } from '../../types'

export const OWNER = '11111111-1111-4111-8111-111111111111'
export const ASSET = '22222222-2222-4222-8222-222222222222'
export const OTHER_USER = '99999999-9999-4999-8999-999999999999'
export const REVIEW = '33333333-3333-4333-8333-333333333333'

export function makeAsset(over: Partial<DeliveryAssetRow> = {}): DeliveryAssetRow {
  return {
    id: ASSET, owner_id: OWNER, state: 'ready', moderation_state: 'approved', deleted_at: null, review_id: null, duration_ms: 12_000,
    staging_manifest_key: `vstg/${OWNER}/${ASSET}/manifest.m3u8`, delivery_manifest_key: null, delivery_removed_at: null, delivery_takedown_attempts: 0,
    updated_at: '2026-11-05T10:00:00.000Z', ...over,
  }
}

export function memoryDeliveryStore(initial: DeliveryAssetRow[] = [makeAsset()], reviews: ReviewVisibility[] = []) {
  const rows = new Map<string, DeliveryAssetRow>(initial.map(r => [r.id, { ...r }]))
  const reviewRows = new Map<string, ReviewVisibility>(reviews.map(r => [r.id, { ...r }]))
  const events: Array<{ id: string; from: VideoAssetState; to: VideoAssetState; eventType: string; reason?: string | null }> = []
  const calls = { publish: 0, recordTakedown: [] as Array<{ id: string; removed: boolean; error: string | null }> }

  const store: VideoDeliveryStore = {
    async get(id) { const r = rows.get(id); return r ? { ...r } : null },
    async getReview(id) { const r = reviewRows.get(id); return r ? { ...r } : null },
    async setDeliveryManifest(id, key) {
      const r = rows.get(id)!
      r.delivery_manifest_key = key; r.delivery_removed_at = null; r.delivery_takedown_attempts = 0
    },
    async transition(id, to, ev) {
      const r = rows.get(id)!
      if (r.state === to) return { state: r.state, changed: false }
      if (!canTransition(r.state, to)) throw Object.assign(new Error('illegal'), { code: '23514' })
      events.push({ id, from: r.state, to, eventType: ev.eventType, reason: ev.reason })
      r.state = to
      if (ev.moderation) r.moderation_state = ev.moderation as ModerationState
      if (to === 'deleted') r.deleted_at = r.deleted_at ?? '2026-11-05T11:00:00.000Z'
      return { state: r.state, changed: true }
    },
    async publish(id, ownerId, reviewId) {
      calls.publish++
      const r = rows.get(id)
      if (!r) throw Object.assign(new Error('not found'), { code: 'P0002' })
      if (r.owner_id !== ownerId) throw Object.assign(new Error('owner'), { code: '42501' })
      // The same rules, in the same order, as video_asset_publish (20261116).
      if (r.state === 'published') return { state: r.state, reviewId: r.review_id, changed: false }
      if (r.state !== 'ready' || r.moderation_state !== 'approved') throw Object.assign(new Error('not ready'), { code: '23514' })
      if (r.review_id && r.review_id !== reviewId) return { state: r.state, reviewId: r.review_id, changed: false }
      if (!r.delivery_manifest_key || r.delivery_removed_at) throw Object.assign(new Error('not promoted'), { code: '55000' })
      events.push({ id, from: 'ready', to: 'published', eventType: 'post_published' })
      r.state = 'published'; r.review_id = reviewId
      return { state: 'published', reviewId, changed: true }
    },
    async recordTakedown(id, rec) {
      calls.recordTakedown.push({ id, ...rec })
      const r = rows.get(id)!
      r.delivery_takedown_attempts += 1
      if (rec.removed) r.delivery_removed_at = '2026-11-05T12:00:00.000Z'
    },
    async listDueTakedown(limit, maxAttempts): Promise<TakedownCandidate[]> {
      const out: TakedownCandidate[] = []
      for (const r of rows.values()) {
        if (!r.delivery_manifest_key || r.delivery_removed_at || r.delivery_takedown_attempts >= maxAttempts) continue
        if (r.state !== 'ready' && r.state !== 'published') out.push({ ...r, takedown_reason: 'state' })
        else if (r.state === 'published') {
          const rev = r.review_id ? reviewRows.get(r.review_id) : undefined
          if (!rev || rev.is_hidden === true || (rev.publication_state !== null && rev.publication_state !== 'PUBLISHED')) out.push({ ...r, takedown_reason: 'post_not_public' })
        }
      }
      return out.slice(0, limit)
    },
  }
  return { store, rows, reviews: reviewRows, events, calls }
}

/** A fake bucket-bound provider holding object names in memory. `failCopy` / `failDelete` make a named key fail; `stuck` keeps a key alive after delete (a delete that did not take). */
export function memoryBucket(bucket: string, initial: string[] = []) {
  const objects = new Map<string, { contentType?: string; cacheControl?: string }>(initial.map(k => [k, {}]))
  const log = { copies: [] as Array<{ from: string; to: string; contentType?: string; cacheControl?: string }>, deletes: [] as string[] }
  const opts = { failCopy: new Set<string>(), failDelete: new Set<string>(), stuck: new Set<string>(), failList: false }
  const provider: MediaProvider = {
    id: 'gcs',
    publicUrl: (k: string) => `https://storage.googleapis.com/${bucket}/${k}`,
    async put() { throw new Error('not used') },
    async listObjects(prefix: string) {
      if (opts.failList) throw new Error('list failed')
      return [...objects.keys()].filter(k => k.startsWith(prefix)).sort()
    },
    async deleteObject(key: string) {
      log.deletes.push(key)
      if (opts.failDelete.has(key)) throw new Error('delete failed')
      if (opts.stuck.has(key)) return true
      return objects.delete(key)
    },
    async copyObject(src, destKey, o) {
      if (opts.failCopy.has(src.key)) throw new Error('copy failed')
      log.copies.push({ from: `${src.bucket}/${src.key}`, to: destKey, ...o })
      objects.set(destKey, { ...o })
    },
  }
  return { provider, objects, log, opts, bucket }
}
