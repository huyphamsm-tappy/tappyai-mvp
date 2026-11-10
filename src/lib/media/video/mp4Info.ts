// What an MP4 / MOV file says about itself: duration, picture size, rotation, whether it has sound (Explore video part 2b; ADR rev.1 §2.2).
//
// The server reads the file's own `moov` header by ranged reads, so the length and size it enforces are the file's, never the client's claim, and no ffmpeg is needed on
// Vercel. Fail-closed: anything it cannot read with certainty (not a container, no moov, a moov too large or cut short, a fragmented file whose length is not in the header,
// a zero duration) is reported as such, never guessed. A storage read that THROWS is not caught here: the caller must be able to tell "could not read" from "not a video".
//
// Boxes used: mvhd (movie timescale + duration), per track tkhd (picture size as 16.16 fixed point, rotation from the 3x3 matrix) and mdia/hdlr (video or sound).

import { topLevelBoxes, type RangeReader } from '../clipMetadata'

export type Mp4InfoFailure = 'unreadable' | 'no_video' | 'no_duration'

export interface Mp4Info {
  durationMs: number
  /** The size as DISPLAYED: already swapped for a clip stored sideways with a 90 / 270 degree rotation. */
  width: number
  height: number
  rotation: 0 | 90 | 180 | 270
  hasAudio: boolean
}

export type Mp4InfoResult = { ok: true; info: Mp4Info } | { ok: false; reason: Mp4InfoFailure }

/** A moov larger than this is not read (a phone clip's is kilobytes; the metadata checker allows the same ceiling). */
const MAX_MOOV_BYTES = 32 * 1024 * 1024

const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3]
const i32 = (b: Uint8Array, o: number) => (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]
const u64 = (b: Uint8Array, o: number) => u32(b, o) * 2 ** 32 + u32(b, o + 4)
const typeAt = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3])

interface Child { type: string; start: number; end: number }

/** The boxes directly inside [start, end) of `buf`. Throws RangeError on a box that does not fit, which the caller reports as unreadable. */
function children(buf: Uint8Array, start: number, end: number): Child[] {
  const out: Child[] = []
  let p = start
  while (p + 8 <= end) {
    let size = u32(buf, p)
    const type = typeAt(buf, p + 4)
    let header = 8
    if (size === 1) { size = u64(buf, p + 8); header = 16 } else if (size === 0) size = end - p
    if (size < header || p + size > end) throw new RangeError('box does not fit')
    out.push({ type, start: p + header, end: p + size })
    p += size
  }
  return out
}
const find = (list: Child[], type: string) => list.find(c => c.type === type)

function rotationOf(a: number, b: number, c: number, d: number): 0 | 90 | 180 | 270 | null {
  if (a === 0x10000 && d === 0x10000 && b === 0 && c === 0) return 0
  if (a === 0 && d === 0 && b === 0x10000 && c === -0x10000) return 90
  if (a === -0x10000 && d === -0x10000 && b === 0 && c === 0) return 180
  if (a === 0 && d === 0 && b === -0x10000 && c === 0x10000) return 270
  return null // flipped or sheared: not a plain rotation
}

export async function readMp4Info(read: RangeReader, total: number): Promise<Mp4InfoResult> {
  const boxes = await topLevelBoxes(read, total)
  const moovBox = boxes?.find(b => b.type === 'moov')
  if (!moovBox || moovBox.size > MAX_MOOV_BYTES) return { ok: false, reason: 'unreadable' }

  const buf = await read(moovBox.offset, moovBox.size)
  if (buf.length < moovBox.size) return { ok: false, reason: 'unreadable' }

  try {
    const top = children(buf, moovBox.headerLen, buf.length)
    const mvhd = find(top, 'mvhd')
    if (!mvhd) return { ok: false, reason: 'unreadable' }
    const v1 = buf[mvhd.start] === 1
    const timescale = u32(buf, mvhd.start + (v1 ? 20 : 12))
    const movieDuration = v1 ? u64(buf, mvhd.start + 24) : u32(buf, mvhd.start + 16)

    let video: { width: number; height: number; rotation: 0 | 90 | 180 | 270 } | null = null
    let hasAudio = false
    for (const trak of top.filter(c => c.type === 'trak')) {
      const parts = children(buf, trak.start, trak.end)
      const tkhd = find(parts, 'tkhd')
      const mdia = find(parts, 'mdia')
      const hdlr = mdia ? find(children(buf, mdia.start, mdia.end), 'hdlr') : undefined
      if (!tkhd || !hdlr) continue
      const kind = typeAt(buf, hdlr.start + 8)
      if (kind === 'soun') hasAudio = true
      if (kind !== 'vide' || video) continue
      const tv1 = buf[tkhd.start] === 1
      const m = tkhd.start + (tv1 ? 52 : 40) // the 3x3 matrix; width and height (16.16) follow it
      const rotation = rotationOf(i32(buf, m), i32(buf, m + 4), i32(buf, m + 12), i32(buf, m + 16))
      const w = Math.round(u32(buf, m + 36) / 65536)
      const h = Math.round(u32(buf, m + 40) / 65536)
      if (rotation === null || w <= 0 || h <= 0) continue
      const sideways = rotation === 90 || rotation === 270
      video = { width: sideways ? h : w, height: sideways ? w : h, rotation }
    }

    if (!video) return { ok: false, reason: 'no_video' }
    if (timescale <= 0 || movieDuration <= 0) return { ok: false, reason: 'no_duration' }
    const durationMs = Math.round((movieDuration / timescale) * 1000)
    if (!Number.isFinite(durationMs) || durationMs <= 0) return { ok: false, reason: 'no_duration' }
    return { ok: true, info: { durationMs, ...video, hasAudio } }
  } catch (e) {
    if (e instanceof RangeError) return { ok: false, reason: 'unreadable' }
    throw e
  }
}
