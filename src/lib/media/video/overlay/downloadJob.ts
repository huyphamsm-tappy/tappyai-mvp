// The Transcoder job for the DOWNLOAD of one video (VID-04): a single MP4 (H.264 + AAC, 720 on the short side at most, never larger than the source) with the text layers
// and the watermark burned in. It is built from the ORIGINAL source, not from the HLS ladder, so the picture is compressed once, not twice.
//
// Pure: builds the request body and the names. The overlay PNGs are full-frame (see renderPng.ts), so every overlay is positioned at 0,0 at size 1x1 and only carries its
// time window (a static image shown from `startMs` until `endMs`, or to the end of the clip when `endMs` is null). Array order is the stacking order: the watermark goes last.

import { createHash } from 'node:crypto'
import { videoAssetDownloadPrefix } from '../../key'
import { ladderFor } from '../transcodeConfig'

/** Bump to re-render every download (a new watermark design, a new font). Part of the cache key. */
export const BRANDING_VERSION = 'b1'
export const MAX_DOWNLOAD_OVERLAYS = 12
const VIDEO_BPS = 2_500_000
const AUDIO_BPS = 128_000
const FRAME_RATE = 30
const MIN_SIDE = 16
const CACHE_KEY_RE = /^[0-9a-f]{64}$/
const FILE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export interface DownloadCacheInput { assetId: string; overlayVersion: number; username: string }

/** Stable hash of (asset id, overlay version, username, branding version). The same four give the same key, so a second request reuses the rendered file; any change re-renders. */
export function downloadCacheKey(input: DownloadCacheInput): string {
  if (!UUID_RE.test(input.assetId) || !Number.isInteger(input.overlayVersion) || input.overlayVersion < 0 || typeof input.username !== 'string') throw new RangeError('download: bad cache key input')
  // JSON gives every ingredient an unambiguous boundary (12 + "x" can never equal 1 + "2x").
  return createHash('sha256').update(JSON.stringify(['dl', input.assetId, input.overlayVersion, input.username, BRANDING_VERSION])).digest('hex')
}

function assertCacheKey(key: string) {
  if (!CACHE_KEY_RE.test(key)) throw new RangeError('download: bad cache key')
}

/** `vdl/<owner>/<asset>/<cacheKey>/download.mp4` (private bucket). The owner and asset are validated as uuids by the key helper, the cache key as 64 hex characters. */
export function downloadObjectKey(ownerId: string, assetId: string, cacheKey: string): string {
  assertCacheKey(cacheKey)
  return `${videoAssetDownloadPrefix(ownerId, assetId)}${cacheKey}/download.mp4`
}

/** The folder the job writes into (the Transcoder output uri): `vdl/<owner>/<asset>/<cacheKey>/`. */
export function downloadFolder(ownerId: string, assetId: string, cacheKey: string): string {
  assertCacheKey(cacheKey)
  return `${videoAssetDownloadPrefix(ownerId, assetId)}${cacheKey}/`
}

/** An overlay PNG the job reads: `vdl/<owner>/<asset>/<cacheKey>/in/<name>.png`. */
export function downloadInputKey(ownerId: string, assetId: string, cacheKey: string, name: string): string {
  if (!FILE_RE.test(name)) throw new RangeError('download: bad input name')
  return `${downloadFolder(ownerId, assetId, cacheKey)}in/${name}.png`
}

/** The pixel size of the download: the largest rung of the playback ladder (<= 720 short side), never above the source. */
export function downloadFrameSize(width: number, height: number): { width: number; height: number } {
  const top = ladderFor(width, height)[0]
  return { width: top.w, height: top.h }
}

export interface DownloadOverlayInput {
  uri: string
  startMs: number
  /** null: until the end of the clip. */
  endMs: number | null
}
export interface DownloadJobInput {
  inputUri: string
  /** gs://<bucket>/vdl/<owner>/<asset>/<cacheKey>/ — must end with a slash. */
  outputUri: string
  width: number
  height: number
  hasAudio: boolean
  overlays: DownloadOverlayInput[]
}

const isGsUri = (u: unknown): u is string => typeof u === 'string' && /^gs:\/\/[a-z0-9][a-z0-9._-]{2,62}\/.+/.test(u)
/** Exact decimal seconds for a whole number of milliseconds: 1500 -> "1.5s". */
const seconds = (ms: number) => `${ms / 1000}s`

export function buildDownloadJob(input: DownloadJobInput) {
  const { width, height } = input
  if (![width, height].every(n => Number.isInteger(n) && n >= MIN_SIDE)) throw new RangeError('download: bad picture size')
  if (!isGsUri(input.inputUri) || !isGsUri(input.outputUri) || !input.outputUri.endsWith('/')) throw new RangeError('download: bad storage uri')
  if (!Array.isArray(input.overlays) || input.overlays.length > MAX_DOWNLOAD_OVERLAYS) throw new RangeError('download: too many overlays')
  for (const o of input.overlays) {
    if (!isGsUri(o.uri) || !Number.isInteger(o.startMs) || o.startMs < 0) throw new RangeError('download: bad overlay')
    if (o.endMs !== null && (!Number.isInteger(o.endMs) || o.endMs <= o.startMs)) throw new RangeError('download: bad overlay window')
  }

  const size = downloadFrameSize(width, height)
  const elementaryStreams: Array<{
    key: string
    videoStream?: { h264: { widthPixels: number; heightPixels: number; frameRate: number; bitrateBps: number } }
    audioStream?: { codec: 'aac'; bitrateBps: number; channelCount: number; sampleRateHertz: number }
  }> = [{ key: 'video', videoStream: { h264: { widthPixels: size.width, heightPixels: size.height, frameRate: FRAME_RATE, bitrateBps: VIDEO_BPS } } }]
  if (input.hasAudio) elementaryStreams.push({ key: 'audio', audioStream: { codec: 'aac', bitrateBps: AUDIO_BPS, channelCount: 2, sampleRateHertz: 48_000 } })

  const overlays = input.overlays.map(o => ({
    image: { uri: o.uri, resolution: { x: 1, y: 1 }, alpha: 1 },
    animations: [
      { animationStatic: { xy: { x: 0, y: 0 }, startTimeOffset: seconds(o.startMs) } },
      ...(o.endMs === null ? [] : [{ animationEnd: { startTimeOffset: seconds(o.endMs) } }]),
    ] as Array<Record<string, unknown>>,
  }))

  return {
    inputUri: input.inputUri,
    outputUri: input.outputUri,
    config: {
      elementaryStreams,
      muxStreams: [{ key: 'mp4', container: 'mp4' as const, fileName: 'download.mp4', elementaryStreams: elementaryStreams.map(s => s.key) }],
      overlays,
    } as {
      elementaryStreams: typeof elementaryStreams
      muxStreams: Array<{ key: string; container: 'mp4'; fileName: string; elementaryStreams: string[] }>
      manifests?: undefined
      overlays: typeof overlays
    },
  }
}
