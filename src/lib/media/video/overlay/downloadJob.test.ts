import { describe, it, expect } from 'vitest'
import { BRANDING_VERSION, buildDownloadJob, downloadCacheKey, downloadFrameSize, downloadInputKey, downloadObjectKey } from './downloadJob'

const OWNER = '4dcce7cf-5f49-4c58-9901-2d586e31352d'
const ASSET = '9a1b2c3d-5f49-4c58-9901-2d586e31352d'
const KEY = 'a'.repeat(64)

describe('downloadCacheKey', () => {
  const base = { assetId: ASSET, overlayVersion: 3, username: 'huy' }
  it('is a stable sha-256 hex of (asset, overlay version, username, branding version)', () => {
    expect(downloadCacheKey(base)).toMatch(/^[0-9a-f]{64}$/)
    expect(downloadCacheKey(base)).toBe(downloadCacheKey({ ...base }))
  })
  it('changes with each ingredient, and only with them', () => {
    const k = downloadCacheKey(base)
    expect(downloadCacheKey({ ...base, overlayVersion: 4 })).not.toBe(k)
    expect(downloadCacheKey({ ...base, username: 'huy2' })).not.toBe(k)
    expect(downloadCacheKey({ ...base, assetId: '9a1b2c3d-5f49-4c58-9901-2d586e31352e' })).not.toBe(k)
    expect(BRANDING_VERSION).toBeTruthy()
  })
  it('cannot be confused by ingredients that run together', () => {
    expect(downloadCacheKey({ assetId: ASSET, overlayVersion: 1, username: '2x' })).not.toBe(downloadCacheKey({ assetId: ASSET, overlayVersion: 12, username: 'x' }))
  })
  it('refuses nonsense', () => {
    expect(() => downloadCacheKey({ ...base, overlayVersion: -1 })).toThrow()
    expect(() => downloadCacheKey({ ...base, overlayVersion: 1.5 })).toThrow()
    expect(() => downloadCacheKey({ ...base, assetId: 'x/../y' })).toThrow()
  })
})

describe('object keys', () => {
  it('the output and the overlay inputs sit under vdl/<owner>/<asset>/<cacheKey>/', () => {
    expect(downloadObjectKey(OWNER, ASSET, KEY)).toBe(`vdl/${OWNER}/${ASSET}/${KEY}/download.mp4`)
    expect(downloadInputKey(OWNER, ASSET, KEY, 'text-a1')).toBe(`vdl/${OWNER}/${ASSET}/${KEY}/in/text-a1.png`)
  })
  it('refuses a cache key or file name that could climb out of the folder', () => {
    expect(() => downloadObjectKey(OWNER, ASSET, '../x')).toThrow()
    expect(() => downloadObjectKey(OWNER, ASSET, 'A'.repeat(64))).toThrow()
    expect(() => downloadInputKey(OWNER, ASSET, KEY, '../x')).toThrow()
    expect(() => downloadObjectKey('not-a-uuid', ASSET, KEY)).toThrow()
  })
})

describe('downloadFrameSize', () => {
  it('is at most 720 on the short side and never larger than the source', () => {
    expect(downloadFrameSize(1080, 1920)).toEqual({ width: 720, height: 1280 })
    expect(downloadFrameSize(1920, 1080)).toEqual({ width: 1280, height: 720 })
    expect(downloadFrameSize(540, 960)).toEqual({ width: 480, height: 854 })
    expect(downloadFrameSize(200, 300)).toEqual({ width: 200, height: 300 })
  })
})

describe('buildDownloadJob', () => {
  const input = {
    inputUri: 'gs://src-bucket/vsrc/o/a.mp4',
    outputUri: `gs://src-bucket/vdl/${OWNER}/${ASSET}/${KEY}/`,
    width: 1080, height: 1920, hasAudio: true,
    overlays: [
      { uri: `gs://src-bucket/vdl/${OWNER}/${ASSET}/${KEY}/in/text-a1.png`, startMs: 1000, endMs: 4000 },
      { uri: `gs://src-bucket/vdl/${OWNER}/${ASSET}/${KEY}/in/watermark.png`, startMs: 0, endMs: null },
    ],
  }

  it('makes ONE mp4 (h264 + aac) from the original at <= 720p, with no HLS and no sprite sheet', () => {
    const job = buildDownloadJob(input)
    expect(job.inputUri).toBe(input.inputUri)
    expect(job.outputUri).toBe(input.outputUri)
    expect(job.config.manifests).toBeUndefined()
    expect(job.config.muxStreams).toEqual([{ key: 'mp4', container: 'mp4', fileName: 'download.mp4', elementaryStreams: ['video', 'audio'] }])
    const video = job.config.elementaryStreams.find(s => s.key === 'video')?.videoStream?.h264
    expect([video?.widthPixels, video?.heightPixels]).toEqual([720, 1280])
    expect(job.config.elementaryStreams.find(s => s.key === 'audio')?.audioStream?.codec).toBe('aac')
  })

  it('never upscales: a small source keeps its own size', () => {
    const job = buildDownloadJob({ ...input, width: 400, height: 300 })
    const video = job.config.elementaryStreams.find(s => s.key === 'video')?.videoStream?.h264
    expect([video?.widthPixels, video?.heightPixels]).toEqual([400, 300])
  })

  it('a silent clip has no audio stream', () => {
    const job = buildDownloadJob({ ...input, hasAudio: false })
    expect(job.config.elementaryStreams.map(s => s.key)).toEqual(['video'])
    expect(job.config.muxStreams[0].elementaryStreams).toEqual(['video'])
  })

  it('each overlay is a full-frame static image with its own start and end, in order (the watermark last, on top)', () => {
    const { overlays } = buildDownloadJob(input).config
    expect(overlays).toHaveLength(2)
    expect(overlays[0]).toEqual({
      image: { uri: input.overlays[0].uri, resolution: { x: 1, y: 1 }, alpha: 1 },
      animations: [{ animationStatic: { xy: { x: 0, y: 0 }, startTimeOffset: '1s' } }, { animationEnd: { startTimeOffset: '4s' } }],
    })
    // No end: visible to the end of the clip.
    expect(overlays[1].animations).toEqual([{ animationStatic: { xy: { x: 0, y: 0 }, startTimeOffset: '0s' } }])
  })

  it('milliseconds are written as exact decimal seconds', () => {
    const job = buildDownloadJob({ ...input, overlays: [{ uri: input.overlays[0].uri, startMs: 1500, endMs: 2250 }] })
    expect(job.config.overlays[0].animations).toEqual([{ animationStatic: { xy: { x: 0, y: 0 }, startTimeOffset: '1.5s' } }, { animationEnd: { startTimeOffset: '2.25s' } }])
  })

  it('refuses bad uris, bad sizes and an end that is not after the start', () => {
    expect(() => buildDownloadJob({ ...input, inputUri: 'https://x/y' })).toThrow(RangeError)
    expect(() => buildDownloadJob({ ...input, outputUri: 'gs://b/x' })).toThrow(RangeError) // no trailing slash
    expect(() => buildDownloadJob({ ...input, width: 8 })).toThrow(RangeError)
    expect(() => buildDownloadJob({ ...input, overlays: [{ uri: 'http://evil/x.png', startMs: 0, endMs: null }] })).toThrow(RangeError)
    expect(() => buildDownloadJob({ ...input, overlays: [{ uri: input.overlays[0].uri, startMs: 3000, endMs: 3000 }] })).toThrow(RangeError)
  })

  it('keeps the number of overlays bounded', () => {
    const many = Array.from({ length: 13 }, () => input.overlays[0])
    expect(() => buildDownloadJob({ ...input, overlays: many })).toThrow(RangeError)
  })
})
