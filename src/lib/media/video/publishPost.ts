// Explore video: PUBLISHING a video into an Explore post (POST /api/reviews with a `videoAssetId`). Two steps, both idempotent, around the route's own checks:
//
//   inspectVideoForPost  BEFORE the route's duplicate check: is this the caller's own video, ready (or already published) and approved? Is the post already there (a retry)?
//   claimVideoForPost    AFTER every other check passed, just before the post is written: promote the HLS copy to the delivery bucket, then move the video ready -> published
//                        through the database function video_asset_publish, which stamps the post id in the same transaction.
//
// The post id is minted HERE (or resumed from the video's own review_id), so a retry after a crash writes the SAME post: a video can never carry two posts (the database has a unique
// index on video_assets.review_id), and a retry can never create a duplicate. The video becomes public only when it is `published` AND its post exists and is public (decidePlayback);
// a `published` video without a post plays for nobody, and the takedown sweep cleans an orphan up after a grace period.
//
// Every "no" about someone else's or an unknown video is the same 404 (no oracle). Codes only.

import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { cdnVideoScope, videoCdnConfig } from './cdnCookie'
import { supabaseVideoDeliveryStore, type VideoDeliveryStore } from './deliveryStore'
import { getVideoDeliveryProvider } from './deliveryStorage'
import { promoteVideoAsset } from './promote'
import { getVideoSourceProvider } from './sourceStorage'
import type { MediaProvider } from '../types'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** How long one request may spend copying files before it answers "try again" (the copy is idempotent, a retry resumes). */
const PROMOTE_BUDGET_MS = 40_000

export type VideoPostFailure = { ok: false; status: 404 | 409 | 503; error: 'video_not_found' | 'video_not_ready' | 'video_in_use' | 'video_unavailable' | 'video_promoting' }
const fail = (status: VideoPostFailure['status'], error: VideoPostFailure['error']): VideoPostFailure => ({ ok: false, status, error })

/** The `videoAssetId` of a request body: absent -> no video; a uuid -> that video; anything else -> refused. */
export function parseVideoAssetId(raw: unknown): { ok: true; id: string | null } | { ok: false } {
  if (raw === undefined || raw === null || raw === '') return { ok: true, id: null }
  if (typeof raw !== 'string' || !UUID.test(raw)) return { ok: false }
  return { ok: true, id: raw.toLowerCase() }
}

export interface VideoPostDeps {
  store: VideoDeliveryStore
  /** The CDN host (VIDEO_CDN_HOST), or null when delivery is not configured. */
  cdnHost: string | null
  source: { provider: MediaProvider; bucket: string } | null
  delivery: { provider: MediaProvider; bucket: string } | null
  newId?: () => string
  now?: () => number
}

/** The real dependencies of this deployment. Nothing is configured by default: any missing piece answers "unavailable" instead of guessing. */
export function videoPostDepsFromEnv(req: Pick<Request, 'headers'>, env: Readonly<Record<string, string | undefined>> = process.env): VideoPostDeps {
  return {
    store: supabaseVideoDeliveryStore(createAdminClient()),
    cdnHost: videoCdnConfig(env)?.host ?? null,
    source: getVideoSourceProvider(env, req),
    delivery: getVideoDeliveryProvider(env, req),
  }
}

export type InspectOutcome = { ok: true; reused: boolean; reviewId: string | null } | VideoPostFailure

export async function inspectVideoForPost(input: { assetId: string; ownerId: string }, deps: Pick<VideoPostDeps, 'store'>): Promise<InspectOutcome> {
  const asset = await deps.store.get(input.assetId)
  // Someone else's video and a missing one answer identically.
  if (!asset || asset.owner_id !== input.ownerId) return fail(404, 'video_not_found')
  if (asset.deleted_at !== null || asset.moderation_state !== 'approved') return fail(409, 'video_not_ready')

  if (asset.state === 'published') {
    if (!asset.review_id) return fail(409, 'video_not_ready')
    const review = await deps.store.getReview(asset.review_id)
    // The post is there: this is a retry of a post that already exists.
    if (review && review.user_id === input.ownerId) return { ok: true, reused: true, reviewId: asset.review_id }
    // The claim happened but the post was never written: resume with the SAME id.
    return { ok: true, reused: false, reviewId: asset.review_id }
  }
  if (asset.state === 'ready') return { ok: true, reused: false, reviewId: asset.review_id }
  return fail(409, 'video_not_ready')
}

export type ClaimOutcome =
  | { ok: true; reused: false; reviewId: string; manifestUrl: string; durationSec: number | null }
  | { ok: true; reused: true; reviewId: string }
  | VideoPostFailure

export async function claimVideoForPost(input: { assetId: string; ownerId: string; resumeReviewId: string | null }, deps: VideoPostDeps): Promise<ClaimOutcome> {
  if (!deps.cdnHost || !deps.source || !deps.delivery) return fail(503, 'video_unavailable')

  const asset = await deps.store.get(input.assetId)
  if (!asset || asset.owner_id !== input.ownerId) return fail(404, 'video_not_found')

  const now = deps.now ?? Date.now
  const promoted = await promoteVideoAsset(asset.id, { store: deps.store, source: deps.source, delivery: deps.delivery, deadline: now() + PROMOTE_BUDGET_MS, now })
  if (promoted.status === 'retry') return fail(503, 'video_promoting')
  if (promoted.status === 'not_found' || promoted.status === 'not_ready') return fail(409, 'video_not_ready')
  if (promoted.status === 'incomplete' || promoted.status === 'failed') return fail(503, 'video_unavailable')

  const reviewId = input.resumeReviewId ?? (deps.newId ?? randomUUID)()
  let published: { state: string; reviewId: string | null; changed: boolean }
  try {
    published = await deps.store.publish(asset.id, input.ownerId, reviewId)
  } catch (e) {
    const code = (e as { code?: string } | null)?.code
    if (code === '23514') return fail(409, 'video_not_ready')
    if (code === '55000') return fail(503, 'video_unavailable')
    if (code === '42501' || code === 'P0002') return fail(404, 'video_not_found')
    throw e
  }

  if (published.reviewId !== reviewId) {
    // The video belongs to another post. It is handed back only if that post really exists.
    if (!published.reviewId) return fail(409, 'video_in_use')
    const other = await deps.store.getReview(published.reviewId)
    if (other && other.user_id === input.ownerId) return { ok: true, reused: true, reviewId: published.reviewId }
    return fail(409, 'video_in_use')
  }

  return {
    ok: true,
    reused: false,
    reviewId,
    // The URL comes from the row's own ids, never from a stored key.
    manifestUrl: cdnVideoScope(deps.cdnHost, asset.owner_id, asset.id).manifestUrl,
    durationSec: asset.duration_ms ? asset.duration_ms / 1000 : null,
  }
}
