import { describe, it, expect } from 'vitest'
import { buildTranscodeJob, ladderFor, type TranscodeJobInput } from './transcodeConfig'

const base = { inputUri: 'gs://src/vsrc/o/k.mp4', outputUri: 'gs://src/vstg/o/a/', hasAudio: true }
const job = (w: number, h: number, over: Partial<TranscodeJobInput> = {}) => buildTranscodeJob({ ...base, width: w, height: h, ...over })
const videoSizes = (j: ReturnType<typeof job>) => j.config.elementaryStreams.flatMap(s => (s.videoStream ? [[s.videoStream.h264.widthPixels, s.videoStream.h264.heightPixels]] : []))

describe('ladderFor — never larger than the source, at most two rungs: 720 and 360 (480 only for a source between 480 and 719)', () => {
  it('portrait 1080x1920 gets 720 and 360 (short side), keeping the aspect', () => {
    expect(ladderFor(1080, 1920)).toEqual([{ w: 720, h: 1280 }, { w: 360, h: 640 }])
  })
  it('landscape 1920x1080 gets 1280x720 and 640x360', () => {
    expect(ladderFor(1920, 1080)).toEqual([{ w: 1280, h: 720 }, { w: 640, h: 360 }])
  })
  it('a source at exactly 720 keeps the 720 rung; one below it does not get one (no upscale)', () => {
    expect(ladderFor(720, 1280).map(r => r.w)).toEqual([720, 360])
    expect(ladderFor(700, 1244).map(r => r.w)).toEqual([480, 360])
  })
  it('a 480p source gets 480 and 360; a 360p source only 360', () => {
    expect(ladderFor(480, 854).map(r => r.w)).toEqual([480, 360])
    expect(ladderFor(360, 640).map(r => r.w)).toEqual([360])
  })
  it('a source below 360 gets ONE rung at its own size, rounded down to even numbers', () => {
    expect(ladderFor(320, 240)).toEqual([{ w: 320, h: 240 }])
    expect(ladderFor(241, 321)).toEqual([{ w: 240, h: 320 }])
  })
  it('🚨 no rung is ever larger than the source in either direction, for a range of shapes', () => {
    for (const [w, h] of [[1080, 1920], [1920, 1080], [3840, 2160], [2160, 3840], [1080, 1080], [1000, 563], [563, 1000], [480, 854], [300, 300], [123, 456]]) {
      for (const r of ladderFor(w, h)) {
        expect(r.w, `${w}x${h} rung ${r.w}x${r.h}`).toBeLessThanOrEqual(w)
        expect(r.h, `${w}x${h} rung ${r.w}x${r.h}`).toBeLessThanOrEqual(h)
        expect(r.w % 2).toBe(0)
        expect(r.h % 2).toBe(0)
        expect(Math.min(r.w, r.h)).toBeLessThanOrEqual(720)
      }
    }
  })
  it('keeps the aspect ratio within rounding', () => {
    for (const r of ladderFor(1000, 563)) expect(Math.abs(r.w / r.h - 1000 / 563)).toBeLessThan(0.02)
  })
})

describe('buildTranscodeJob', () => {
  it('HLS ladder, one manifest, per-rung playlists, sprite frames and an audio-only file, all under the staging folder', () => {
    const j = job(1080, 1920)
    expect(j.inputUri).toBe(base.inputUri)
    expect(j.outputUri).toBe(base.outputUri)
    expect(videoSizes(j)).toEqual([[720, 1280], [360, 640]])
    expect(j.config.muxStreams.map(m => m.key)).toEqual(['hls720', 'hls360', 'audio'])
    expect(j.config.manifests).toEqual([{ fileName: 'manifest.m3u8', type: 'HLS', muxStreams: ['hls720', 'hls360'] }])
    expect(j.config.spriteSheets).toEqual([{ filePrefix: 'frames', spriteWidthPixels: 180, spriteHeightPixels: 320, columnCount: 3, rowCount: 2, totalCount: 6 }])
  })

  it('audio is AAC 128 kbps and goes into every HLS rung; the audio-only file is a separate mp4 named audio.mp4', () => {
    const j = job(1080, 1920)
    const aud = j.config.elementaryStreams.find(s => s.audioStream)!.audioStream!
    expect(aud).toMatchObject({ codec: 'aac', bitrateBps: 128000, sampleRateHertz: 48000 })
    for (const m of j.config.muxStreams.filter(x => x.key.startsWith('hls'))) expect(m.elementaryStreams).toContain('aud')
    expect(j.config.muxStreams.find(m => m.key === 'audio')).toMatchObject({ container: 'mp4', fileName: 'audio.mp4', elementaryStreams: ['aud'] })
  })

  it('a clip with NO sound gets no audio stream and no audio mux (asking for sound that is not there fails the job)', () => {
    const j = job(1080, 1920, { hasAudio: false })
    expect(j.config.elementaryStreams.some(s => s.audioStream)).toBe(false)
    expect(j.config.muxStreams.map(m => m.key)).toEqual(['hls720', 'hls360'])
    for (const m of j.config.muxStreams) expect(m.elementaryStreams).not.toContain('aud')
  })

  it('bitrates fall with the rung and are all positive; frame rate is capped at 30', () => {
    const rates = job(1080, 1920).config.elementaryStreams.flatMap(s => (s.videoStream ? [s.videoStream.h264.bitrateBps] : []))
    expect(rates).toEqual([2_000_000, 400_000])
    for (const s of job(1080, 1920).config.elementaryStreams) if (s.videoStream) expect(s.videoStream.h264.frameRate).toBe(30)
  })

  it('landscape sprite frames are wide, portrait ones are tall', () => {
    expect(job(1920, 1080).config.spriteSheets[0]).toMatchObject({ spriteWidthPixels: 320, spriteHeightPixels: 180 })
  })

  it('the request body has exactly the fields the API knows (an extra field would be rejected): inputUri, outputUri, config', () => {
    expect(Object.keys(job(1080, 1920)).sort()).toEqual(['config', 'inputUri', 'outputUri'])
    expect(Object.keys(job(1080, 1920).config).sort()).toEqual(['elementaryStreams', 'manifests', 'muxStreams', 'spriteSheets'])
  })

  it('never puts a key or uri anywhere but the two it was given', () => {
    expect(JSON.stringify(job(1080, 1920)).match(/gs:\/\/[^"]+/g)).toEqual([base.inputUri, base.outputUri])
  })

  it('refuses sizes that make no sense instead of building a broken job', () => {
    for (const [w, h] of [[0, 100], [100, 0], [-5, 100], [Number.NaN, 100], [1.5, 100]]) {
      expect(() => job(w, h), `${w}x${h}`).toThrow()
    }
    expect(() => buildTranscodeJob({ ...base, inputUri: 'http://x/y.mp4', width: 100, height: 100 })).toThrow()
    expect(() => buildTranscodeJob({ ...base, outputUri: 'gs://b/no-trailing-slash', width: 1080, height: 1920 })).toThrow()
  })
})
