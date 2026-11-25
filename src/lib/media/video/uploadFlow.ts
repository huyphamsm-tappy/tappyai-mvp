// Explore video, part 2: the original upload into the PRIVATE source bucket (ADR rev.1; plan VID-01 / VID-05).
//
// Two steps, both mediated by the server and both idempotent:
//   startVideoUpload     opens a client-direct resumable session for `vsrc/<owner>/<random>.<ext>` and records the asset (draft -> uploading);
//   completeVideoUpload  confirms the object really landed, is the right format and carries no location/device metadata, then records uploaded.
// The browser or app never sees an object key, a bucket name or a public URL: the source is private and is reached only by the server.
//
// Written against two small interfaces (the asset store and the media provider) so the whole flow is tested without a database or a network; the routes wire
// the real ones. Everything here is OFF until the routes are enabled by EXPLORE_VIDEO_PIPELINE_ENABLED.
//
// Not done here (later parts of the plan): reading the real duration/size from the file's own header (part 2b), account deletion of the source bucket and the
// orphan sweep (part 3), starting the transcode (part 4).

import { MediaUploadRejectedError, resolveUploadTarget } from '../uploadPolicy'
import { CREATE_UPLOAD_SESSION_TYPE, createUploadSessionResponse } from '../uploadRoute'
import { COMPLETE_UPLOAD_TYPE, completeUploadResponse } from '../uploadCompletion'
import type { MediaProvider } from '../types'
import { isAcceptableVideoDuration } from '@/lib/config/product'
import type { ModerationState, VideoAssetState } from './assetState'
import { readMp4Info, type Mp4InfoResult } from './mp4Info'

export interface VideoAssetRow {
  id: string
  owner_id: string
  state: VideoAssetState
  moderation_state: ModerationState
  source_bucket: string | null
  source_object_key: string | null
  has_audio: boolean | null
  duration_ms: number | null
  width: number | null
  height: number | null
  transcode_job_id: string | null
  transcode_attempts: number
  staging_manifest_key: string | null
  /** How many times the automatic moderation step got no usable answer from the provider (VID-03). */
  moderation_attempts?: number
  /** ISO timestamp of the last change: how long a job has been running is read from it. */
  updated_at: string
}

export interface TransitionEvent {
  eventType: string
  actor: string
  reason?: string | null
  correlation?: string | null
  moderation?: ModerationState | null
}

/** One automatic moderation decision, as the database records it (VID-03). The transcript and the evidence stay server-side. */
export interface AutoModerationRecord {
  decision: 'approve' | 'review_required' | 'reject'
  category: string | null
  confidence: number | null
  reasonCode: string
  priority: 'normal' | 'high' | 'urgent'
  provider: string
  model: string
  policyVersion: string
  /** References and per-kind status / scores (object keys, never bytes). */
  evidence: Record<string, unknown>
  transcript: string | null
  /** A suspected child-safety case: the database also writes the `csam_suspected` event and sets the legal hold (`holdUntil`, ISO). */
  csam: boolean
  holdUntil: string | null
  actor: string
}

export interface VideoAssetStore {
  findByIdempotencyKey(ownerId: string, key: string): Promise<VideoAssetRow | null>
  /** Creates a draft. Must return the existing row when the (owner, key) pair was created concurrently. */
  create(ownerId: string, idempotencyKey: string): Promise<VideoAssetRow>
  get(id: string): Promise<VideoAssetRow | null>
  setSource(id: string, bucket: string, key: string): Promise<void>
  /** The duration and DISPLAY size the file's own header reported (never the client's claim). */
  setMediaInfo(id: string, info: { durationMs: number; width: number; height: number; hasAudio: boolean }): Promise<void>
  /** Records a started (or failed-to-start, jobName null) transcode attempt. A job name is stored only after the API returned it. */
  setTranscodeJob(id: string, rec: { jobName: string | null; attempts: number; error: string | null }): Promise<void>
  /** The transcoded playlist inside the private staging folder, once the job succeeded. */
  setStaging(id: string, manifestKey: string): Promise<void>
  /** Videos in `processing` whose last change is older than `olderThanMs`, oldest first (the reconciliation sweep). */
  listProcessing(olderThanMs: number, limit: number): Promise<VideoAssetRow[]>
  transition(id: string, to: VideoAssetState, ev: TransitionEvent): Promise<{ state: VideoAssetState; changed: boolean }>
  /** Videos in `moderating` whose last change is older than `olderThanMs`, oldest first (the reconciliation sweep). */
  listModerating(olderThanMs: number, limit: number): Promise<VideoAssetRow[]>
  /** Counts a moderation attempt that got no usable answer (and refreshes updated_at, which is the retry back-off clock). */
  setModerationAttempt(id: string, rec: { attempts: number; error: string | null }): Promise<void>
  /** Appends a history event once per type; false when the video already has one. */
  noteEventOnce(id: string, ev: { eventType: string; actor: string; reason: string }): Promise<boolean>
  /**
   * The automatic decision, in ONE database transaction: only a video still in `moderating` is decided (so running the step twice writes one decision); the result row is appended and
   * the video moves through the transition function. `changed` is false when somebody else already decided.
   */
  recordAutoModeration(id: string, rec: AutoModerationRecord): Promise<{ state: VideoAssetState; changed: boolean }>
}

export interface VideoUploadDeps {
  store: VideoAssetStore
  /** A provider pointed at the PRIVATE source bucket. */
  provider: MediaProvider
  bucket: string
  /** Reads the stored file's header. Replaceable so a test can make the read fail; defaults to readMp4Info. */
  readInfo?: (read: (offset: number, length: number) => Promise<Uint8Array>, total: number) => Promise<Mp4InfoResult>
}

export interface FlowOutcome {
  status: number
  body: Record<string, unknown>
}

const KIND = 'videoSource' as const
const ALLOWED = [KIND] as const
/** The client generates one per upload attempt (a uuid fits). Letters, digits, `_` and `-` only, so it is safe everywhere it is logged or stored. */
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{8,128}$/
/** States a video reaches after its upload was verified: a repeated `complete` answers from here without touching storage. */
const PAST_UPLOAD: readonly VideoAssetState[] = ['uploaded', 'processing', 'moderating', 'review_required', 'ready', 'published']

export interface StartVideoUploadInput {
  ownerId: string
  idempotencyKey: string
  contentType: string
  size: number
  origin?: string | null
}

export async function startVideoUpload(input: StartVideoUploadInput, deps: VideoUploadDeps): Promise<FlowOutcome> {
  if (typeof input.idempotencyKey !== 'string' || !IDEMPOTENCY_KEY_RE.test(input.idempotencyKey)) {
    return { status: 400, body: { error: 'invalid_idempotency_key' } }
  }

  // The policy is judged BEFORE anything is created, so a refused request leaves no asset behind.
  try {
    resolveUploadTarget({ kind: KIND, contentType: input.contentType, sizeBytes: input.size, ownerId: input.ownerId }, ALLOWED)
  } catch (e) {
    if (e instanceof MediaUploadRejectedError) return { status: e.status, body: { error: e.message } }
    throw e
  }

  const asset = (await deps.store.findByIdempotencyKey(input.ownerId, input.idempotencyKey)) ?? (await deps.store.create(input.ownerId, input.idempotencyKey))

  if (asset.state === 'deleted') return { status: 409, body: { error: 'asset_deleted' } }
  // A refused upload is final: the client starts a new attempt with a NEW idempotency key.
  if (asset.state === 'failed' || asset.state === 'rejected') return { status: 409, body: { error: 'asset_failed' } }
  if (asset.state !== 'draft' && asset.state !== 'uploading') {
    return { status: 200, body: { assetId: asset.id, state: asset.state, reused: true } }
  }

  const opened = await createUploadSessionResponse(
    { type: CREATE_UPLOAD_SESSION_TYPE, kind: KIND, contentType: input.contentType, size: input.size },
    { ownerId: input.ownerId, allowedKinds: ALLOWED, origin: input.origin ?? null },
    deps.provider,
  )
  if (opened.status !== 200) return { status: opened.status, body: { error: opened.body.error } }

  await deps.store.setSource(asset.id, deps.bucket, String(opened.body.key))
  if (asset.state === 'draft') {
    await deps.store.transition(asset.id, 'uploading', { eventType: 'upload_session_created', actor: `user:${input.ownerId}` })
  }

  // Only what the client needs to PUT the bytes. No key, no bucket, no public URL: the source is private.
  return { status: 200, body: { assetId: asset.id, state: 'uploading', uploadUrl: opened.body.uploadUrl, contentType: opened.body.contentType } }
}

export async function completeVideoUpload(input: { ownerId: string; assetId: string }, deps: VideoUploadDeps): Promise<FlowOutcome> {
  const asset = await deps.store.get(input.assetId)
  // Someone else's asset and a missing one answer identically: no oracle for "this asset exists".
  if (!asset || asset.owner_id !== input.ownerId) return { status: 404, body: { error: 'not_found' } }

  if (asset.state !== 'uploading') {
    if (PAST_UPLOAD.includes(asset.state)) return { status: 200, body: { assetId: asset.id, state: asset.state } }
    return { status: 409, body: { error: 'upload_not_active' } }
  }
  const key = asset.source_object_key
  if (!key) return { status: 409, body: { error: 'upload_not_active' } }

  // Not landed yet is RETRYABLE; it is told apart here, before the format checks, so only a real refusal fails the asset.
  if (!deps.provider.statObject) return { status: 502, body: { error: 'storage_unavailable' } }
  let found: { size: number } | null
  try {
    found = await deps.provider.statObject(key)
  } catch {
    return { status: 502, body: { error: 'storage_unavailable' } }
  }
  if (!found || found.size <= 0) return { status: 422, body: { error: 'upload_incomplete' } }

  const done = await completeUploadResponse({ type: COMPLETE_UPLOAD_TYPE, kind: KIND, key }, { ownerId: input.ownerId, allowedKinds: ALLOWED }, deps.provider)

  if (done.status === 200) {
    // The file's OWN header decides its length and size (part 2b): the client's number is a claim, this is the fact. Anything it cannot say for certain is refused.
    if (!deps.provider.readRange) return { status: 502, body: { error: 'storage_unavailable' } }
    const readRange = deps.provider.readRange.bind(deps.provider)
    let probed: Mp4InfoResult
    try {
      probed = await (deps.readInfo ?? readMp4Info)((offset, length) => readRange(key, offset, length), found.size)
    } catch {
      // A failed READ says nothing about the file: ours to retry, the object stays.
      return { status: 502, body: { error: 'storage_unavailable' } }
    }
    if (!probed.ok) {
      return rejectUpload(deps, asset.id, key, input.ownerId, 'unreadable_video', 'Không đọc được thông tin video. Bạn xuất lại video thành MP4 hoặc MOV rồi thử lại nhé.')
    }
    if (!isAcceptableVideoDuration(probed.info.durationMs / 1000)) {
      return rejectUpload(deps, asset.id, key, input.ownerId, 'video_too_long', 'Clip dài tối đa 5 phút. Bạn cắt ngắn clip rồi thử lại nhé.')
    }
    await deps.store.setMediaInfo(asset.id, { durationMs: probed.info.durationMs, width: probed.info.width, height: probed.info.height, hasAudio: probed.info.hasAudio })
    await deps.store.transition(asset.id, 'uploaded', { eventType: 'upload_verified', actor: `user:${input.ownerId}` })
    return { status: 200, body: { assetId: asset.id, state: 'uploaded' } }
  }
  // Our own error (storage or credentials): nothing was decided about the file, the client may retry.
  if (done.status >= 500) return { status: done.status, body: { error: 'storage_unavailable' } }

  // A real refusal (wrong format, oversize, location/device data still inside): the asset FAILS with a machine-readable reason. Never returns a URL.
  const code = typeof done.body.error === 'string' && /^[a-z_]{3,40}$/.test(done.body.error) ? done.body.error : done.status === 413 ? 'too_large' : 'upload_rejected'
  await deps.store.transition(asset.id, 'failed', { eventType: 'upload_rejected', actor: `user:${input.ownerId}`, reason: code })
  const { url: _url, ...safe } = done.body
  void _url
  return { status: done.status, body: safe }
}

/** The upload is refused after it landed (its header says too long or unreadable): delete the object, fail the asset with the reason, answer 422. */
async function rejectUpload(deps: VideoUploadDeps, assetId: string, key: string, ownerId: string, code: string, message: string): Promise<FlowOutcome> {
  // A deletion that fails here is not fatal: the asset is `failed` below, so the clean-up cron removes the object later.
  try { await deps.provider.deleteObject?.(key) } catch { /* swept by the clean-up */ }
  await deps.store.transition(assetId, 'failed', { eventType: 'upload_rejected', actor: `user:${ownerId}`, reason: code })
  return { status: 422, body: { error: code, message } }
}
