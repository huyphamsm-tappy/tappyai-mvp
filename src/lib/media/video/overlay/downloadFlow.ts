// VID-04: the watermarked, text-burned DOWNLOAD of a video, from request to bytes.
//
//   request  -> claim (exactly one caller wins) -> render each text layer and the watermark to a PNG -> upload them to the PRIVATE bucket (vdl/<owner>/<asset>/<key>/in/)
//            -> one Transcoder job from the ORIGINAL source -> vdl/<owner>/<asset>/<key>/download.mp4
//   status   -> asks the job; when it succeeded and the file is there, the render is `ready`
//   stream   -> the file is read through the server (ranged reads) and handed to the caller as an attachment; a bucket address is never produced
//
// Allowed only for a video that is `ready` or `published` AND approved. The cache key is a hash of (asset, overlay version, username, branding version): the same key reuses the
// file (no second render), a changed overlay version or username is a new render. Attempts are bounded; a permanent problem (a character the font cannot draw) is not retried.
// Written against small interfaces so the whole flow is tested with fakes. Codes only: never an object key, a bucket or a job name in anything returned.

import type { MediaProvider } from '../../types'
import type { VideoAssetRow } from '../uploadFlow'
import { TranscoderError, type TranscoderClient } from '../transcoder'
import { validateOverlayDoc, type OverlayDoc } from './schema'
import { buildDownloadJob, downloadCacheKey, downloadFolder, downloadFrameSize, downloadInputKey, downloadObjectKey } from './downloadJob'
import { OverlayFontMissingError, OverlayGlyphError, renderTextLayerPng, renderWatermarkPng } from './renderPng'
import type { DownloadRenderStore, OverlayStore, RenderRow } from './overlayStore'

export const MAX_RENDER_ATTEMPTS = 3
export const RENDER_GRACE_SECONDS = 120
export const RENDER_COOLDOWN_SECONDS = 3600
/** A job older than this without a result is treated as failed (the Transcoder measured ~9 s for a 6 s clip; a clip is at most about five minutes). */
export const RENDER_TIMEOUT_MS = 30 * 60_000
const DOWNLOADABLE_STATES: readonly string[] = ['ready', 'published']

export type DownloadStatus = 'none' | 'rendering' | 'ready' | 'failed'

export interface Renderers {
  text: typeof renderTextLayerPng
  watermark: typeof renderWatermarkPng
}

export interface DownloadDeps {
  assets: { get(id: string): Promise<VideoAssetRow | null> }
  overlays: OverlayStore
  renders: DownloadRenderStore
  /** A provider bound to the PRIVATE source bucket. */
  provider: MediaProvider
  /** null when no transcoder service account is configured. */
  transcoder: TranscoderClient | null
  bucket: string
  now?: () => number
  renderers?: Renderers
}

export interface DownloadInput { ownerId: string; assetId: string; username: string }

export interface DownloadOutcome {
  status: number
  body: { status?: DownloadStatus; error?: string; code?: string }
  /** Present only when the file is ready and was confirmed to exist: what the route streams. */
  file?: { key: string; size: number }
}

interface Context {
  asset: VideoAssetRow
  doc: OverlayDoc
  overlayVersion: number
  cacheKey: string
  input: DownloadInput
  deps: DownloadDeps
}

const refuse = (status: number, error: string): DownloadOutcome => ({ status, body: { error } })

/** Loads and checks everything a download depends on. Someone else's asset and a missing one answer identically. */
async function resolve(input: DownloadInput, deps: DownloadDeps): Promise<Context | DownloadOutcome> {
  const asset = await deps.assets.get(input.assetId)
  if (!asset || asset.owner_id !== input.ownerId) return refuse(404, 'not_found')
  if (!DOWNLOADABLE_STATES.includes(asset.state) || asset.moderation_state !== 'approved') return refuse(409, 'not_ready')
  if (!asset.width || !asset.height || !asset.source_object_key) return refuse(409, 'not_ready')

  const stored = await deps.overlays.get(asset.id)
  let doc: OverlayDoc = { schema_version: 1, layers: [] }
  if (stored) {
    const valid = validateOverlayDoc(stored.doc, { durationMs: asset.duration_ms ?? undefined })
    // A saved document that no longer validates is not burned in blindly, and not silently dropped either.
    if (!valid.ok) return refuse(422, 'overlay_invalid')
    doc = valid.doc
  }
  const overlayVersion = stored?.version ?? 0
  return { asset, doc, overlayVersion, cacheKey: downloadCacheKey({ assetId: asset.id, overlayVersion, username: input.username }), input, deps }
}
const isOutcome = (c: Context | DownloadOutcome): c is DownloadOutcome => 'body' in c

const ok = (status: DownloadStatus, code?: string | null): DownloadOutcome => ({ status: 200, body: code ? { status, code } : { status } })

/** POST: starts the render, or reuses what exists. Idempotent; concurrent callers create ONE job. */
export async function requestDownload(input: DownloadInput, deps: DownloadDeps): Promise<DownloadOutcome> {
  const ctx = await resolve(input, deps)
  if (isOutcome(ctx)) return ctx
  if (!deps.transcoder) return refuse(503, 'download_unavailable')

  const claim = await deps.renders.claim(ctx.asset.id, ctx.cacheKey, { maxAttempts: MAX_RENDER_ATTEMPTS, graceSeconds: RENDER_GRACE_SECONDS, cooldownSeconds: RENDER_COOLDOWN_SECONDS })
  if (claim.claimed) return startRender(ctx, deps.transcoder, claim.render.attempts)
  const render = await deps.renders.get(ctx.asset.id, ctx.cacheKey)
  return render ? advance(ctx, render, true) : ok('rendering')
}

/** GET: where is the render for the CURRENT overlay version and username? Polling advances a running job; it starts nothing that a POST did not ask for, except the retry of a job the Transcoder failed. */
export async function pollDownload(input: DownloadInput, deps: DownloadDeps): Promise<DownloadOutcome> {
  const ctx = await resolve(input, deps)
  if (isOutcome(ctx)) return ctx
  const render = await deps.renders.get(ctx.asset.id, ctx.cacheKey)
  if (!render) return ok('none')
  return advance(ctx, render, true)
}

async function advance(ctx: Context, render: RenderRow, mayRestart: boolean): Promise<DownloadOutcome> {
  const { deps, asset, cacheKey } = ctx
  const now = (deps.now ?? Date.now)()
  const key = downloadObjectKey(asset.owner_id, asset.id, cacheKey)

  if (render.state === 'failed') return ok('failed', render.error_code)

  if (render.state === 'ready') {
    // The record says ready; the file must really be there. If it vanished, the render is failed (attempts reset) so the next request renders it again.
    const found = await statQuiet(deps.provider, key)
    if (found === 'error') return ok('rendering')
    if (!found) {
      await deps.renders.markFailed(asset.id, cacheKey, 'file_missing', 0)
      return ok('failed', 'file_missing')
    }
    return { status: 200, body: { status: 'ready' }, file: { key, size: found.size } }
  }

  // rendering
  if (!render.job_name) return ok('rendering') // the claiming caller is still creating the job; the claim takes it over after the grace period
  if (!deps.transcoder) return ok('rendering')

  let job
  try {
    job = await deps.transcoder.getJob(render.job_name)
  } catch (e) {
    // 404: the job is gone and will never finish. Any other error is the API being unavailable and says nothing about the job.
    if (e instanceof TranscoderError && e.status === 404) return retryOrFail(ctx, render, mayRestart)
    return ok('rendering')
  }

  if (job.state === 'SUCCEEDED') {
    const found = await statQuiet(deps.provider, key)
    if (found === 'error') return ok('rendering')
    if (!found) return retryOrFail(ctx, render, mayRestart)
    await deps.renders.markReady(asset.id, cacheKey, key)
    return { status: 200, body: { status: 'ready' }, file: { key, size: found.size } }
  }
  if (job.state === 'FAILED') return retryOrFail(ctx, render, mayRestart)
  if (now - Date.parse(render.updated_at) > RENDER_TIMEOUT_MS) return retryOrFail(ctx, render, mayRestart)
  return ok('rendering')
}

/** The job failed, was lost, or ran past the timeout: mark it, and try once more through the claim (one winner) while attempts remain. */
async function retryOrFail(ctx: Context, render: RenderRow, mayRestart: boolean): Promise<DownloadOutcome> {
  const { deps, asset, cacheKey } = ctx
  await deps.renders.markFailed(asset.id, cacheKey, 'render_failed')
  if (!mayRestart || !deps.transcoder || render.attempts >= MAX_RENDER_ATTEMPTS) return ok('failed', 'render_failed')
  const claim = await deps.renders.claim(asset.id, cacheKey, { maxAttempts: MAX_RENDER_ATTEMPTS, graceSeconds: RENDER_GRACE_SECONDS, cooldownSeconds: RENDER_COOLDOWN_SECONDS })
  if (!claim.claimed) return ok(claim.render.state === 'failed' ? 'failed' : 'rendering', claim.render.error_code)
  return startRender(ctx, deps.transcoder, claim.render.attempts)
}

async function statQuiet(provider: MediaProvider, key: string): Promise<{ size: number } | null | 'error'> {
  if (!provider.statObject) return 'error'
  try {
    const info = await provider.statObject(key)
    return info && info.size > 0 ? { size: info.size } : null
  } catch {
    return 'error'
  }
}

/** The caller holds the claim: draw the overlays, upload them, create the ONE job, record it. Every failure ends in a recorded state, never an unrecorded half-start. */
async function startRender(ctx: Context, transcoder: TranscoderClient, priorAttempts: number): Promise<DownloadOutcome> {
  const { deps, asset, doc, cacheKey } = ctx
  const attempts = priorAttempts + 1
  const render = deps.renderers ?? { text: renderTextLayerPng, watermark: renderWatermarkPng }
  const duration = asset.duration_ms ?? Number.MAX_SAFE_INTEGER

  try {
    const frame = downloadFrameSize(asset.width as number, asset.height as number)
    const overlays: Array<{ uri: string; startMs: number; endMs: number | null }> = []
    const uriOf = (key: string) => `gs://${deps.bucket}/${key}`

    for (const layer of doc.layers) {
      const png = await render.text(layer, frame)
      const inKey = downloadInputKey(asset.owner_id, asset.id, cacheKey, `text-${layer.id}`)
      await deps.provider.put(inKey, png, { contentType: 'image/png' })
      overlays.push({ uri: uriOf(inKey), startMs: layer.start_ms, endMs: layer.end_ms >= duration ? null : layer.end_ms })
    }
    // The watermark goes last, on top of everything, for the whole clip.
    const mark = await render.watermark(frame, ctx.input.username)
    const markKey = downloadInputKey(asset.owner_id, asset.id, cacheKey, 'watermark')
    await deps.provider.put(markKey, mark, { contentType: 'image/png' })
    overlays.push({ uri: uriOf(markKey), startMs: 0, endMs: null })

    const job = buildDownloadJob({
      inputUri: uriOf(asset.source_object_key as string),
      outputUri: uriOf(downloadFolder(asset.owner_id, asset.id, cacheKey)),
      width: asset.width as number,
      height: asset.height as number,
      hasAudio: asset.has_audio === true,
      overlays,
    })
    const { name } = await transcoder.createJob(job)
    await deps.renders.setJob(asset.id, cacheKey, { jobName: name, attempts, error: null })
    return ok('rendering')
  } catch (e) {
    // A problem retrying cannot fix: the attempt budget is spent at once so nothing loops.
    if (e instanceof OverlayGlyphError) { await deps.renders.markFailed(asset.id, cacheKey, 'unsupported_glyph', MAX_RENDER_ATTEMPTS); return ok('failed', 'unsupported_glyph') }
    if (e instanceof OverlayFontMissingError) { await deps.renders.markFailed(asset.id, cacheKey, 'font_unavailable', MAX_RENDER_ATTEMPTS); return ok('failed', 'font_unavailable') }
    if (e instanceof RangeError) { await deps.renders.markFailed(asset.id, cacheKey, 'missing_media_info', MAX_RENDER_ATTEMPTS); return ok('failed', 'missing_media_info') }
    // Storage or the Transcoder API: the attempt is counted (so a permanent refusal cannot loop for ever); the claim takes the render over again after the grace period.
    if (attempts >= MAX_RENDER_ATTEMPTS) { await deps.renders.markFailed(asset.id, cacheKey, 'create_failed', attempts); return ok('failed', 'create_failed') }
    await deps.renders.setJob(asset.id, cacheKey, { jobName: null, attempts, error: 'create_failed' })
    return ok('rendering')
  }
}

// ---- streaming ------------------------------------------------------------

export const STREAM_CHUNK_BYTES = 4 * 1024 * 1024

/** The file as a stream, read from the private bucket in ranged chunks (never more than one chunk in memory); the caller never sees where it lives. */
export function openDownloadStream(provider: MediaProvider, key: string, size: number, chunk = STREAM_CHUNK_BYTES): ReadableStream<Uint8Array> {
  if (!provider.readRange) throw new Error('download: storage cannot be read')
  const read = provider.readRange.bind(provider)
  let offset = 0
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (offset >= size) { controller.close(); return }
      const length = Math.min(chunk, size - offset)
      const bytes = await read(key, offset, length)
      if (bytes.length === 0) { controller.error(new Error('download: storage returned no data')); return }
      offset += bytes.length
      controller.enqueue(bytes)
    },
  })
}

/** `Content-Disposition` for a download with a name that may contain Vietnamese: an ASCII fallback plus the RFC 5987 UTF-8 form. Control characters, quotes and slashes never get through. */
export function downloadContentDisposition(displayName: string | null | undefined): string {
  const base = String(displayName ?? '').replace(/[\u0000-\u001f\u007f"\\/:*?<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
  const name = base ? `TappyAI - ${base}` : 'TappyAI'
  const ascii = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\x20-\x7e]/g, '').trim() || 'TappyAI'
  const utf8 = encodeURIComponent(`${name}.mp4`).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  return `attachment; filename="${ascii}.mp4"; filename*=UTF-8''${utf8}`
}
