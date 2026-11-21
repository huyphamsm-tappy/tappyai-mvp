// The Google Transcoder job for one video (Explore video part 4; spike 04–05/11/2026 measured this shape on real jobs).
//
// Output, all under the video's PRIVATE staging folder: an HLS ladder (short side 720 / 480 / 360, NEVER larger than the source, aspect kept, even dimensions, H.264, AAC 128 kbps),
// one `manifest.m3u8`, a sprite sheet of six frames for moderation, and (when the clip has sound) an audio-only `audio.mp4` for speech-to-text.
//
// Pure: it only builds the request body. Which rungs exist is decided from the size the file's own header reported (part 2b), because the Transcoder itself never drops a rung.
// Known limits, kept honest: the frame rate is capped at 30 (a 60 fps source is downsampled); the source's own fps is not read yet.

export interface TranscodeJobInput {
  /** gs://<bucket>/<source key> */
  inputUri: string
  /** gs://<bucket>/vstg/<owner>/<asset>/ — must end with a slash. */
  outputUri: string
  /** The DISPLAY size from the file's header (already swapped for a rotated clip). */
  width: number
  height: number
  hasAudio: boolean
}

export interface Rung { w: number; h: number }

const SHORT_SIDES = [720, 480, 360] as const
// 21/11/2026 (owner: "nén clip"): lowered from 2.5 / 1.1 / 0.6 Mbit/s. A real 3 min 54 s clip of 19 MB (852x576, already ~0.66 Mbit/s) produced 38 MB at 480 and 23 MB at 360, so the ladder was
// BIGGER than the source. Phone clips are 8-20 Mbit/s, where any rung is a saving; for an already-light clip the lower targets keep the ladder near the source instead of 3-4 times above it.
const BITRATE: Record<number, number> = { 720: 2_000_000, 480: 800_000, 360: 400_000 }
const AUDIO_BPS = 128_000
const FRAME_RATE = 30
const MIN_SIDE = 16

const evenDown = (n: number) => Math.floor(n / 2) * 2
const evenRound = (n: number) => Math.round(n / 2) * 2

/** The rungs a source of this size may have: only those whose short side fits inside it; a source below 360 gets one rung at its own size. */
export function ladderFor(width: number, height: number): Rung[] {
  const short = Math.min(width, height)
  const long = Math.max(width, height)
  const portrait = height > width
  const rungs = SHORT_SIDES.filter(r => r <= short).map(r => {
    const l = Math.min(evenRound((long * r) / short), long % 2 === 0 ? long : evenDown(long))
    return portrait ? { w: r, h: l } : { w: l, h: r }
  })
  if (rungs.length > 0) return rungs
  return [{ w: evenDown(width), h: evenDown(height) }]
}

const isGsUri = (u: unknown): u is string => typeof u === 'string' && /^gs:\/\/[a-z0-9][a-z0-9._-]{2,62}\/.+/.test(u)

export function buildTranscodeJob(input: TranscodeJobInput) {
  const { width, height } = input
  if (![width, height].every(n => Number.isInteger(n) && n >= MIN_SIDE)) throw new RangeError('transcode: bad picture size')
  if (!isGsUri(input.inputUri) || !isGsUri(input.outputUri) || !input.outputUri.endsWith('/')) throw new RangeError('transcode: bad storage uri')

  const rungs = ladderFor(width, height)
  const elementaryStreams: Array<{
    key: string
    videoStream?: { h264: { widthPixels: number; heightPixels: number; frameRate: number; bitrateBps: number } }
    audioStream?: { codec: 'aac'; bitrateBps: number; channelCount: number; sampleRateHertz: number }
  }> = rungs.map(r => {
    const side = Math.min(r.w, r.h)
    return { key: `v${side}`, videoStream: { h264: { widthPixels: r.w, heightPixels: r.h, frameRate: FRAME_RATE, bitrateBps: BITRATE[side] ?? BITRATE[360] } } }
  })
  if (input.hasAudio) elementaryStreams.push({ key: 'aud', audioStream: { codec: 'aac', bitrateBps: AUDIO_BPS, channelCount: 2, sampleRateHertz: 48_000 } })

  const muxStreams: Array<{ key: string; container: 'ts' | 'mp4'; fileName?: string; elementaryStreams: string[] }> = rungs.map(r => {
    const side = Math.min(r.w, r.h)
    return { key: `hls${side}`, container: 'ts', elementaryStreams: input.hasAudio ? [`v${side}`, 'aud'] : [`v${side}`] }
  })
  const hlsKeys = muxStreams.map(m => m.key)
  if (input.hasAudio) muxStreams.push({ key: 'audio', container: 'mp4', fileName: 'audio.mp4', elementaryStreams: ['aud'] })

  const landscape = width >= height

  return {
    inputUri: input.inputUri,
    outputUri: input.outputUri,
    config: {
      elementaryStreams,
      muxStreams,
      manifests: [{ fileName: 'manifest.m3u8', type: 'HLS' as const, muxStreams: hlsKeys }],
      spriteSheets: [{ filePrefix: 'frames', spriteWidthPixels: landscape ? 320 : 180, spriteHeightPixels: landscape ? 180 : 320, columnCount: 3, rowCount: 2, totalCount: 6 }],
    },
  }
}
