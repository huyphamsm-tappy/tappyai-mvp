// F-099 (P1, owner decision 2026-09-26) — clips must not publish where and with what they were filmed.
//
// Clips go client-direct to a publicly readable bucket, so the server never re-encodes them. Measured
// on the real upload path: an iPhone MOV / Android MP4 arrived byte-identical, with GPS (ISO-6709),
// make/model, software and creation time readable by anyone holding the URL.
//
// Two halves, one module (browser-safe: no Node APIs):
//   neutralizeClipMetadata(file)   CLIENT, before the PUT. Rewrites the metadata boxes IN PLACE:
//                                  `udta` / `meta` / XMP `uuid` boxes are retyped to `free` (same
//                                  length — no sample offset in stco/co64 moves, so nothing needs
//                                  re-muxing) and the mvhd/tkhd/mdhd creation/modification times
//                                  are zeroed. Reads only the box headers and the `moov` box, never
//                                  the media data, so a 150 MB clip costs a few hundred KB of reads.
//   findIdentifyingMetadata(read)  SERVER, at upload completion, over ranged reads of the stored
//                                  object. Any `udta`/`meta`/XMP left, or a non-zero creation time,
//                                  means the file did not come through the neutraliser → 422, the
//                                  object is deleted and no URL is ever returned.
// Images uploaded client-direct (the clip's canvas-drawn poster frame) must carry no EXIF/XMP at all.

import { imageMime, sniffImageType } from '../security/imageType'

export type RangeReader = (offset: number, length: number) => Promise<Uint8Array>

/** What the server refuses. Codes only — never values (they are the personal data). */
export type IdentifyingReason = 'location' | 'device-or-author' | 'metadata-box' | 'creation-time' | 'xmp' | 'image-metadata' | 'unreadable' | 'unrecognised-format'

const MAX_MOOV_BYTES = 32 * 1024 * 1024
const MAX_TOP_LEVEL_BOXES = 64
/** Adobe XMP in ISO-BMFF: uuid BE7ACFCB-97A9-42E8-9C71-999491E3AFAC. */
const XMP_UUID = [0xbe, 0x7a, 0xcf, 0xcb, 0x97, 0xa9, 0x42, 0xe8, 0x9c, 0x71, 0x99, 0x94, 0x91, 0xe3, 0xaf, 0xac]
/** Containers inside `moov` that may hold `udta` / `meta` or the time-bearing headers. */
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf'])
const METADATA_BOXES = new Set(['udta', 'meta'])
const TIME_BOXES = new Set(['mvhd', 'tkhd', 'mdhd'])

const typeAt = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3])
const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3]
const setType = (b: Uint8Array, o: number, t: string) => { for (let i = 0; i < 4; i++) b[o + i] = t.charCodeAt(i) }

interface TopBox { type: string; offset: number; size: number; headerLen: number; uuid?: number[] }

/** Walks the top-level boxes by reading only their headers. Null when the file is not ISO-BMFF. */
async function topLevelBoxes(read: RangeReader, total: number): Promise<TopBox[] | null> {
  const out: TopBox[] = []
  let p = 0
  while (p + 8 <= total && out.length < MAX_TOP_LEVEL_BOXES) {
    const h = await read(p, Math.min(32, total - p))
    if (h.length < 8) return null
    let size = u32(h, 0)
    const type = typeAt(h, 4)
    let headerLen = 8
    if (size === 1) {
      if (h.length < 16) return null
      const hi = u32(h, 8), lo = u32(h, 12)
      size = hi * 2 ** 32 + lo
      headerLen = 16
    } else if (size === 0) size = total - p
    if (!/^[\x20-\x7e\xa9]{4}$/.test(type) || size < headerLen || p + size > total) return p === 0 ? null : out
    const box: TopBox = { type, offset: p, size, headerLen }
    if (type === 'uuid' && h.length >= headerLen + 16) box.uuid = Array.from(h.slice(headerLen, headerLen + 16))
    out.push(box)
    p += size
  }
  return out.length && ['ftyp', 'wide', 'free', 'mdat', 'moov', 'skip', 'uuid', 'pnot'].includes(out[0].type) ? out : null
}

const isXmp = (b: TopBox) => b.type === 'uuid' && !!b.uuid && b.uuid.every((v, i) => v === XMP_UUID[i])

/** Turns the box at `o` into a `free` box of the same size whose payload is all zeros. */
function blank(m: Uint8Array, o: number, size: number) {
  const header = u32(m, o) === 1 ? 16 : 8
  setType(m, o + 4, 'free')
  m.fill(0, o + header, o + size)
}

/** Visits every box inside a `moov` buffer. `fn` returns false to not descend. */
function walkMoov(m: Uint8Array, fn: (type: string, offset: number, size: number) => boolean | void) {
  const walk = (start: number, end: number) => {
    let p = start
    while (p + 8 <= end) {
      let size = u32(m, p)
      const type = typeAt(m, p + 4)
      let header = 8
      if (size === 1) { size = u32(m, p + 8) * 2 ** 32 + u32(m, p + 12); header = 16 }
      else if (size === 0) size = end - p
      if (size < header || p + size > end) return
      const descend = fn(type, p, size) !== false
      if (descend && CONTAINERS.has(type)) walk(p + header, p + size)
      p += size
    }
  }
  walk(0, m.length)
}

/** Offsets of the creation+modification time fields inside a time-bearing full box. */
function timeFields(m: Uint8Array, offset: number): Array<[number, number]> {
  const version = m[offset + 8]
  const base = offset + 12
  return version === 1 ? [[base, 8], [base + 8, 8]] : [[base, 4], [base + 4, 4]]
}

// ── client ──────────────────────────────────────────────────────────────────

/**
 * Returns a Blob of the same length with every metadata box retyped to `free` and every creation
 * time zeroed. Files that are not ISO-BMFF are returned unchanged — the server refuses them as an
 * unsupported format (F-102), so nothing unchecked is ever published.
 */
export async function neutralizeClipMetadata(file: Blob): Promise<Blob> {
  const read: RangeReader = async (o, n) => new Uint8Array(await file.slice(o, o + n).arrayBuffer())
  const boxes = await topLevelBoxes(read, file.size)
  if (!boxes) return file
  const parts: BlobPart[] = []
  let cursor = 0
  const patch = (offset: number, bytes: Uint8Array) => {
    parts.push(file.slice(cursor, offset), bytes as BlobPart)
    cursor = offset + bytes.length
  }
  for (const b of boxes) {
    if (b.type === 'moov' && b.size <= MAX_MOOV_BYTES) {
      const m = await read(b.offset, b.size)
      walkMoov(m, (type, o, size) => {
        // Retyping alone would HIDE the values from parsers but leave them in the bytes anyone can
        // download (measured by the test that caught it) — the payload is zeroed too.
        if (METADATA_BOXES.has(type)) { blank(m, o, size); return false }
        if (TIME_BOXES.has(type)) for (const [at, len] of timeFields(m, o)) m.fill(0, at, at + len)
      })
      patch(b.offset, m)
    } else if ((METADATA_BOXES.has(b.type) || isXmp(b)) && b.size <= MAX_MOOV_BYTES) {
      const m = await read(b.offset, b.size)
      blank(m, 0, b.size)
      patch(b.offset, m)
    }
  }
  parts.push(file.slice(cursor))
  return new Blob(parts, { type: file.type })
}

// ── server ──────────────────────────────────────────────────────────────────

const LOCATION_RE = /location|©xyz|©xyz|iso6709/i
/** An ISO-6709 coordinate value itself, e.g. "+10.7725+106.6980/". */
const ISO6709_VALUE_RE = /[+-]\d{1,2}\.\d{2,}[+-]\d{1,3}\.\d{2,}/
const DEVICE_RE = /make|model|software|serial|author|artist|creator|©mak|©mod|©swr|©aut|©ART/i

/** Identifying metadata left in a stored clip, read through ranged reads. [] = clean. */
export async function findIdentifyingMetadata(read: RangeReader, total: number, contentType: string): Promise<IdentifyingReason[]> {
  // F-102 (owner 2026-09-26): the DECLARED type is the uploader's claim, not evidence. The parser is
  // chosen by the bytes, and bytes that are not what the declared type says are refused outright —
  // otherwise a GPS-carrying MP4 labelled as some unchecked type walks straight past this check.
  const head = await read(0, Math.min(total, 16))
  if (contentType.startsWith('image/')) {
    const sniffed = sniffImageType(head)
    // SVG is text (deal logos only): no EXIF container exists to check.
    if (!sniffed) return contentType === 'image/svg+xml' ? [] : ['unrecognised-format']
    if (imageMime(sniffed) !== contentType) return ['unrecognised-format']
    return findImageMetadata(read, total, contentType)
  }
  // Only ISO-BMFF (MP4 / MOV) is accepted — the one container this module can inspect and clean.
  if (contentType !== 'video/mp4' && contentType !== 'video/quicktime') return ['unrecognised-format']
  const boxes = await topLevelBoxes(read, total)
  if (!boxes || !boxes.some(b => b.type === 'moov')) return ['unrecognised-format']
  const reasons = new Set<IdentifyingReason>()
  for (const b of boxes) {
    if (isXmp(b)) reasons.add('xmp')
    if (METADATA_BOXES.has(b.type)) reasons.add('metadata-box')
    if ((b.type === 'free' || b.type === 'skip') && b.size <= 1024 * 1024) {
      const text = new TextDecoder('latin1').decode(await read(b.offset + b.headerLen, b.size - b.headerLen))
      if (ISO6709_VALUE_RE.test(text) || LOCATION_RE.test(text)) reasons.add('location')
      if (DEVICE_RE.test(text)) reasons.add('device-or-author')
    }
    if (b.type !== 'moov') continue
    if (b.size > MAX_MOOV_BYTES) { reasons.add('unreadable'); continue }
    const m = await read(b.offset, b.size)
    walkMoov(m, (type, o, size) => {
      if (METADATA_BOXES.has(type)) {
        reasons.add('metadata-box')
        const text = new TextDecoder('latin1').decode(m.subarray(o, o + size))
        if (LOCATION_RE.test(text) || ISO6709_VALUE_RE.test(text)) reasons.add('location')
        if (DEVICE_RE.test(text)) reasons.add('device-or-author')
        return false
      }
      // A client that only RETYPED the boxes leaves the values in the bytes: padding must not carry them.
      if (type === 'free' || type === 'skip') {
        const text = new TextDecoder('latin1').decode(m.subarray(o + 8, o + size))
        if (ISO6709_VALUE_RE.test(text) || LOCATION_RE.test(text)) reasons.add('location')
        if (DEVICE_RE.test(text)) reasons.add('device-or-author')
      }
      if (TIME_BOXES.has(type) && timeFields(m, o).some(([at, len]) => m.subarray(at, at + len).some(x => x !== 0))) reasons.add('creation-time')
    })
  }
  return [...reasons]
}

/** A client-direct image (the clip's poster frame, drawn from a <canvas>) must carry no EXIF/XMP. */
async function findImageMetadata(read: RangeReader, total: number, contentType: string): Promise<IdentifyingReason[]> {
  const head = await read(0, Math.min(total, 256 * 1024))
  const text = new TextDecoder('latin1').decode(head)
  if (contentType === 'image/jpeg') {
    // APP1 carrying Exif or XMP, anywhere in the marker segments before the scan.
    for (let p = 2; p + 4 <= head.length && head[p] === 0xff;) {
      const marker = head[p + 1]
      if (marker === 0xda) break
      const len = (head[p + 2] << 8) + head[p + 3]
      if (marker === 0xe1) {
        const sig = new TextDecoder('latin1').decode(head.subarray(p + 4, p + 34))
        if (sig.startsWith('Exif') || sig.startsWith('http://ns.adobe.com/xap/')) return ['image-metadata']
      }
      p += 2 + len
    }
    return []
  }
  if (contentType === 'image/png') return /eXIf|iTXtXML:com\.adobe\.xmp/.test(text) ? ['image-metadata'] : []
  if (contentType === 'image/webp') return /EXIF|XMP /.test(text.slice(12, 64 * 1024)) ? ['image-metadata'] : []
  return []
}
