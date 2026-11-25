// Synthetic ISO-BMFF clips WITH real mvhd / tkhd / hdlr headers (duration, size, rotation, audio), for the header reader and the upload flow. No personal data: creation and
// modification times are zero and there is no udta / meta box, so the identifying-metadata check passes them as clean. Invented values only.

const enc = (s: string) => Uint8Array.from(s, c => c.charCodeAt(0) & 0xff)
const cat = (...parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length } return out }
const u32 = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0); return b }
const i32 = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, n | 0); return b }
const u64 = (n: number) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(n)); return b }
export const box = (type: string, ...parts: Uint8Array[]) => { const body = cat(...parts); return cat(u32(8 + body.length), enc(type), body) }

export type Rotation = 0 | 90 | 180 | 270

export interface ClipOptions {
  durationSec?: number
  width?: number
  height?: number
  /** The rotation a phone records in the track matrix (a portrait clip is stored landscape with rotation 90). */
  rotation?: Rotation
  audio?: boolean
  video?: boolean
  moovFirst?: boolean
  timescale?: number
  /** Use version-1 headers (64-bit durations), as long clips from some encoders do. */
  v1?: boolean
  /** Write duration 0 and an mvex box: a fragmented file, whose length is not in the header. */
  fragmented?: boolean
}

const MATRIX: Record<Rotation, number[]> = {
  0: [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000],
  90: [0, 0x10000, 0, -0x10000, 0, 0, 0, 0, 0x40000000],
  180: [-0x10000, 0, 0, 0, -0x10000, 0, 0, 0, 0x40000000],
  270: [0, -0x10000, 0, 0x10000, 0, 0, 0, 0, 0x40000000],
}

function mvhd(o: Required<Pick<ClipOptions, 'timescale' | 'v1'>> & { duration: number }) {
  if (o.v1) return box('mvhd', cat(new Uint8Array([1, 0, 0, 0]), u64(0), u64(0), u32(o.timescale), u64(o.duration), new Uint8Array(80)))
  return box('mvhd', cat(new Uint8Array([0, 0, 0, 0]), u32(0), u32(0), u32(o.timescale), u32(o.duration), new Uint8Array(80)))
}

function tkhd(o: { v1: boolean; width: number; height: number; rotation: Rotation; duration: number; audio: boolean; id: number }) {
  const matrix = cat(...(o.audio ? MATRIX[0] : MATRIX[o.rotation]).map(i32))
  const dims = o.audio ? cat(u32(0), u32(0)) : cat(u32(o.width * 65536), u32(o.height * 65536))
  const tail = cat(new Uint8Array(8), new Uint8Array(8) /* layer, alt group, volume, reserved */, matrix, dims)
  if (o.v1) return box('tkhd', cat(new Uint8Array([1, 0, 0, 3]), u64(0), u64(0), u32(o.id), u32(0), u64(o.duration), tail))
  return box('tkhd', cat(new Uint8Array([0, 0, 0, 3]), u32(0), u32(0), u32(o.id), u32(0), u32(o.duration), tail))
}

function trak(kind: 'vide' | 'soun', t: Parameters<typeof tkhd>[0]) {
  const hdlr = box('hdlr', cat(new Uint8Array(4), new Uint8Array(4), enc(kind), new Uint8Array(12), enc('h\0')))
  return box('trak', tkhd(t), box('mdia', hdlr))
}

/** A clean clip: ftyp + moov + mdat (or mdat before moov when moovFirst is false, the way a phone that finishes recording last writes it). */
export function cleanMp4(opts: ClipOptions = {}): Uint8Array {
  const o = {
    durationSec: 60, width: 1080, height: 1920, rotation: 0 as Rotation, audio: true, video: true, moovFirst: true, timescale: 1000, v1: false, fragmented: false, ...opts,
  }
  const duration = o.fragmented ? 0 : Math.round(o.durationSec * o.timescale)
  const traks: Uint8Array[] = []
  if (o.video) traks.push(trak('vide', { v1: o.v1, width: o.width, height: o.height, rotation: o.rotation, duration, audio: false, id: 1 }))
  if (o.audio) traks.push(trak('soun', { v1: o.v1, width: 0, height: 0, rotation: 0, duration, audio: true, id: 2 }))
  const moov = box('moov', mvhd({ timescale: o.timescale, v1: o.v1, duration }), ...traks, ...(o.fragmented ? [box('mvex', box('trex', new Uint8Array(24)))] : []))
  const ftyp = box('ftyp', enc('isom'), u32(512), enc('isomiso2mp41'))
  const mdat = box('mdat', Uint8Array.from({ length: 64 }, (_, i) => (i * 37) & 0xff))
  return o.moovFirst ? cat(ftyp, moov, mdat) : cat(ftyp, mdat, moov)
}

/** The same bytes read the way storage serves them: any range, short at the end. */
export function rangeReader(bytes: Uint8Array) {
  const reads: Array<[number, number]> = []
  const read = async (offset: number, length: number) => { reads.push([offset, length]); return bytes.slice(offset, offset + length) }
  return { read, reads }
}
