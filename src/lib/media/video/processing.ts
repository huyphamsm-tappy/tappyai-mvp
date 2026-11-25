// Explore video part 4: carrying a verified upload through transcoding (ADR rev.2 §2.1: no Pub/Sub at first — whoever asks about a video, and a daily sweep, advance it).
//
//   uploaded  --(this step claims it)-->  processing  --(job SUCCEEDED)-->  moderating
//
// `advanceVideoAsset` is one idempotent step and is safe to call from anywhere, any number of times, concurrently: only the call whose state transition actually CHANGED the row
// creates the job. A job that FAILED, was lost (404) or ran past the timeout is replaced by a new one, up to MAX_TRANSCODE_ATTEMPTS, then the video fails with a code. A video
// that is `processing` with no job id (the first caller died between claiming it and creating the job) is picked up after START_GRACE_MS.
//
// The output goes to the video's PRIVATE staging folder (`vstg/<owner>/<asset>/`) in the source bucket; nothing here makes anything visible: the step ends at `moderating`,
// and only an approved video is ever promoted (a later part). Codes and counts only; never object keys in a message.

import { videoAssetStagingPrefix } from '../key'
import type { VideoAssetState } from './assetState'
import { buildTranscodeJob } from './transcodeConfig'
import { TranscoderError, type TranscoderClient } from './transcoder'
import type { VideoAssetRow, VideoAssetStore } from './uploadFlow'
import { moderateVideoAsset, type ModerationDeps } from './moderationStep'

export const MAX_TRANSCODE_ATTEMPTS = 3
/** A job older than this without a result is treated as failed. A clip is at most about five minutes; the spike measured ~9 s for six seconds. */
export const JOB_TIMEOUT_MS = 30 * 60_000
/** How long a `processing` video with no job id is left to the call that is still creating it. */
export const START_GRACE_MS = 2 * 60_000

const ACTOR = 'service:video-pipeline'

export interface AdvanceDeps {
  store: VideoAssetStore
  /** null when no transcoder service account is configured. */
  transcoder: TranscoderClient | null
  /** The private source bucket (input AND staging output live in it). */
  bucket: string
  /** The moderation step (VID-03). null/absent: a video in `moderating` is left where it is ('unavailable'). */
  moderation?: ModerationDeps | null
  now?: () => number
}

export type AdvanceAction = 'none' | 'started' | 'restarted' | 'completed' | 'failed' | 'waiting' | 'unavailable' | 'moderated' | 'no_consent'
export interface AdvanceResult { assetId: string; state: VideoAssetState; action: AdvanceAction }

const result = (assetId: string, state: VideoAssetState, action: AdvanceAction): AdvanceResult => ({ assetId, state, action })

export async function advanceVideoAsset(assetId: string, deps: AdvanceDeps): Promise<AdvanceResult | null> {
  const asset = await deps.store.get(assetId)
  if (!asset) return null
  const now = (deps.now ?? Date.now)()

  if (asset.state === 'uploaded') {
    if (!deps.transcoder) return result(asset.id, 'uploaded', 'unavailable')
    // The claim. Only the call that changes the state goes on to create the job; a concurrent caller sees changed=false and waits.
    const claimed = await deps.store.transition(asset.id, 'processing', { eventType: 'transcode_requested', actor: ACTOR })
    if (!claimed.changed) return result(asset.id, 'processing', 'waiting')
    return startJob({ ...asset, state: 'processing' }, deps, deps.transcoder, 'started')
  }

  if (asset.state === 'processing') {
    const transcoder = deps.transcoder
    if (!transcoder) return result(asset.id, 'processing', 'unavailable')

    if (!asset.transcode_job_id) {
      if (now - Date.parse(asset.updated_at) < START_GRACE_MS) return result(asset.id, 'processing', 'waiting')
      return startJob(asset, deps, transcoder, 'restarted')
    }

    let job
    try {
      job = await transcoder.getJob(asset.transcode_job_id)
    } catch (e) {
      // 404: the job is gone, so it will never finish; any other error is the API being unavailable and says nothing about the job.
      if (e instanceof TranscoderError && e.status === 404) return startJob(asset, deps, transcoder, 'restarted')
      return result(asset.id, 'processing', 'waiting')
    }

    if (job.state === 'SUCCEEDED') {
      await deps.store.setStaging(asset.id, `${videoAssetStagingPrefix(asset.owner_id, asset.id)}manifest.m3u8`)
      await deps.store.transition(asset.id, 'moderating', { eventType: 'transcode_succeeded', actor: ACTOR })
      return result(asset.id, 'moderating', 'completed')
    }
    if (job.state === 'FAILED') return startJob(asset, deps, transcoder, 'restarted')
    // PENDING, RUNNING or an unknown state: still going, unless it has been going far too long.
    if (now - Date.parse(asset.updated_at) > JOB_TIMEOUT_MS) return startJob(asset, deps, transcoder, 'restarted')
    return result(asset.id, 'processing', 'waiting')
  }

  if (asset.state === 'moderating') {
    // The decision itself (consent, evidence, the pure decision engine, the one recording call) is moderationStep.ts; this only routes to it.
    if (!deps.moderation) return result(asset.id, 'moderating', 'none')
    const m = await moderateVideoAsset(asset.id, { ...deps.moderation, now: deps.moderation.now ?? deps.now })
    if (!m) return null
    return result(m.assetId, m.state, m.action === 'decided' ? 'moderated' : m.action)
  }

  return result(asset.id, asset.state, 'none')
}

/** Creates (or re-creates) the job for a video in `processing`, counting the attempt; past the limit, or without the facts it needs, the video FAILS. */
async function startJob(asset: VideoAssetRow, deps: AdvanceDeps, transcoder: TranscoderClient, action: 'started' | 'restarted'): Promise<AdvanceResult> {
  if (asset.transcode_attempts >= MAX_TRANSCODE_ATTEMPTS) return fail(asset, deps, 'transcode_failed')
  if (!asset.width || !asset.height || !asset.source_object_key) return fail(asset, deps, 'missing_media_info')

  let job
  try {
    job = buildTranscodeJob({
      inputUri: `gs://${deps.bucket}/${asset.source_object_key}`,
      outputUri: `gs://${deps.bucket}/${videoAssetStagingPrefix(asset.owner_id, asset.id)}`,
      width: asset.width,
      height: asset.height,
      hasAudio: asset.has_audio === true,
    })
  } catch {
    // A size or id that cannot make a valid job: no request is made, and retrying would not change that.
    return fail(asset, deps, 'missing_media_info')
  }

  const attempts = asset.transcode_attempts + 1
  try {
    const { name } = await transcoder.createJob(job)
    await deps.store.setTranscodeJob(asset.id, { jobName: name, attempts, error: null })
    return result(asset.id, 'processing', action)
  } catch {
    // The attempt is counted (so a permanent refusal cannot loop for ever) and the sweep tries again after the grace period.
    await deps.store.setTranscodeJob(asset.id, { jobName: null, attempts, error: 'create_failed' })
    return result(asset.id, 'processing', 'waiting')
  }
}

async function fail(asset: VideoAssetRow, deps: AdvanceDeps, code: string): Promise<AdvanceResult> {
  await deps.store.setTranscodeJob(asset.id, { jobName: asset.transcode_job_id, attempts: asset.transcode_attempts, error: code })
  await deps.store.transition(asset.id, 'failed', { eventType: 'transcode_failed', actor: ACTOR, reason: code })
  return result(asset.id, 'failed', 'failed')
}

/** `moderated` / `moderationWaiting` are present only when the sweep was given the moderation step. */
export interface ReconcileResult { looked: number; completed: number; restarted: number; failed: number; errors: number; moderated?: number; moderationWaiting?: number }

/**
 * The daily sweep: advance every video that has sat in `processing` past the grace period (lost callbacks, a caller that died, a job that never reported), and every video that has
 * sat in `moderating` (a provider that was down, a retry nobody asked for). `limit` applies to each of the two lists.
 */
export async function reconcileProcessing(deps: AdvanceDeps, opts: { limit: number }): Promise<ReconcileResult> {
  const out: ReconcileResult = { looked: 0, completed: 0, restarted: 0, failed: 0, errors: 0 }
  if (deps.transcoder) {
    const rows = await deps.store.listProcessing(START_GRACE_MS, opts.limit)
    out.looked += rows.length
    for (const row of rows) {
      try {
        const r = await advanceVideoAsset(row.id, deps)
        if (r?.action === 'completed') out.completed++
        else if (r?.action === 'restarted') out.restarted++
        else if (r?.action === 'failed') out.failed++
      } catch {
        out.errors++
      }
    }
  }
  if (deps.moderation) {
    out.moderated = 0
    out.moderationWaiting = 0
    const rows = await deps.store.listModerating(START_GRACE_MS, opts.limit)
    out.looked += rows.length
    for (const row of rows) {
      try {
        const r = await advanceVideoAsset(row.id, deps)
        if (r?.action === 'moderated') out.moderated++
        else if (r?.action === 'waiting' || r?.action === 'no_consent') out.moderationWaiting++
      } catch {
        out.errors++
      }
    }
  }
  return out
}
