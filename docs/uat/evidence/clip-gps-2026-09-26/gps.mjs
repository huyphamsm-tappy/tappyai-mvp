// Synthetic media carrying a location AND device identifiers, and a reader that finds them — for the
// clip-metadata investigation (owner P1, 2026-09-26). Everything is SYNTHETIC: the coordinates are a
// public landmark (Ben Thanh market, HCMC: +10.7725 +106.6980), the device fields are invented
// values in the SHAPE phones write them. Never a real user's file.
//
// Formats — the three a phone produces:
//   JPEG  EXIF: IFD0 Make/Model/Software/Artist, Exif IFD DateTimeOriginal/BodySerialNumber/LensModel,
//         GPS IFD latitude/longitude                                      — phone photos
//   MP4   moov/udta/©xyz (ISO-6709) + mvhd creation time                  — Android camera video
//   MOV   moov/meta keys: com.apple.quicktime.{location.ISO6709, make, model, software, creationdate}
//         + mvhd creation time                                             — iPhone video
import sharp from 'sharp'

export const LAT = 10.7725, LON = 106.698
const ISO6709 = '+10.7725+106.6980/'
const CREATED = new Date('2026-09-26T02:30:00Z')
const MAC_EPOCH = Date.UTC(1904, 0, 1) / 1000

const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b }
const box = (type, ...parts) => { const body = Buffer.concat(parts); return Buffer.concat([u32(8 + body.length), Buffer.from(type, 'latin1'), body]) }
const fullBox = (type, version, flags, ...parts) => box(type, Buffer.from([version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255]), ...parts)

function mvhd() {
  const b = Buffer.alloc(96)
  const t = Math.floor(CREATED.getTime() / 1000) - MAC_EPOCH
  b.writeUInt32BE(t, 0); b.writeUInt32BE(t, 4) // creation / modification time (seconds since 1904)
  b.writeUInt32BE(1000, 8); b.writeUInt32BE(3000, 12); b.writeUInt32BE(0x00010000, 16); b.writeUInt16BE(0x0100, 20)
  ;[0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000].forEach((v, i) => b.writeUInt32BE(v, 32 + i * 4))
  b.writeUInt32BE(2, 92)
  return fullBox('mvhd', 0, 0, b)
}

function appleMeta(entries) {
  const hdlr = fullBox('hdlr', 0, 0, u32(0), Buffer.from('mdta', 'latin1'), Buffer.alloc(12), Buffer.from([0]))
  const keyBoxes = entries.map(([k]) => Buffer.concat([u32(8 + k.length), Buffer.from('mdta', 'latin1'), Buffer.from(k, 'latin1')]))
  const keys = fullBox('keys', 0, 0, u32(entries.length), ...keyBoxes)
  const items = entries.map(([, v], i) => { const data = box('data', u32(1), u32(0), Buffer.from(v, 'utf8')); return Buffer.concat([u32(8 + data.length), u32(i + 1), data]) })
  return box('meta', hdlr, keys, box('ilst', ...items))
}

/** Android-style: udta/©xyz + Android keys, creation time in mvhd. */
export function syntheticAndroidMp4() {
  const s = Buffer.from(ISO6709, 'latin1')
  const len = Buffer.alloc(2); len.writeUInt16BE(s.length)
  const xyz = box('©xyz', len, Buffer.from([0x15, 0xc7]), s)
  return Buffer.concat([
    box('ftyp', Buffer.from('isom', 'latin1'), u32(512), Buffer.from('isomiso2mp41', 'latin1')),
    box('moov', mvhd(), box('udta', xyz), appleMeta([
      ['com.android.version', '14'],
      ['com.android.manufacturer', 'SyntheticMaker'],
      ['com.android.model', 'SYN-PHONE-A1'],
    ])),
    box('mdat', Buffer.alloc(64)),
  ])
}

/** iPhone-style: moov/meta keys with location, make, model, software, creation date. */
export function syntheticIphoneMov() {
  return Buffer.concat([
    box('ftyp', Buffer.from('qt  ', 'latin1'), u32(0), Buffer.from('qt  ', 'latin1')),
    box('moov', mvhd(), appleMeta([
      ['com.apple.quicktime.location.ISO6709', ISO6709],
      ['com.apple.quicktime.make', 'Apple'],
      ['com.apple.quicktime.model', 'iPhone SYN'],
      ['com.apple.quicktime.software', '17.6'],
      ['com.apple.quicktime.creationdate', '2026-09-26T09:30:00+0700'],
    ])),
    box('mdat', Buffer.alloc(64)),
  ])
}

const dms = (deg) => { const d = Math.floor(deg); const mF = (deg - d) * 60; const m = Math.floor(mF); const s = Math.round((mF - m) * 60 * 100); return `${d}/1 ${m}/1 ${s}/100` }
export async function syntheticGpsJpeg() {
  return sharp({ create: { width: 16, height: 16, channels: 3, background: { r: 200, g: 120, b: 40 } } })
    .jpeg()
    .withExif({
      IFD0: { Make: 'SyntheticMaker', Model: 'SYN-PHONE-A1', Software: 'SynOS 14', Artist: 'Synthetic Author' },
      IFD2: { DateTimeOriginal: '2026:09:26 09:30:00', BodySerialNumber: 'SYN0000SERIAL', LensModel: 'SYN back camera 6mm f/1.8' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: dms(LAT), GPSLongitudeRef: 'E', GPSLongitude: dms(LON) },
    })
    .toBuffer()
}

// ── readers ──────────────────────────────────────────────────────────────────
/** Every identifying field in an ISO-BMFF file: ©xyz, Apple/Android keys, mvhd creation time. */
export function mp4Metadata(buf) {
  const found = {}
  const containers = new Set(['moov', 'udta', 'trak', 'mdia', 'minf', 'stbl'])
  const walk = (start, end, keys) => {
    let p = start
    while (p + 8 <= end) {
      let size = buf.readUInt32BE(p); const type = buf.toString('latin1', p + 4, p + 8)
      if (size === 1) size = Number(buf.readBigUInt64BE(p + 8))
      if (size < 8 || p + size > end) break
      if (type === '©xyz') found['udta ©xyz (location)'] = buf.toString('latin1', p + 12, p + 12 + buf.readUInt16BE(p + 8))
      else if (type === 'mvhd') {
        const v = buf[p + 8]
        const t = v === 1 ? Number(buf.readBigUInt64BE(p + 12)) : buf.readUInt32BE(p + 12)
        if (t > 0) { const d = new Date((t + MAC_EPOCH) * 1000); found['mvhd creation time'] = isNaN(d.getTime()) ? `raw ${t}` : d.toISOString() }
      } else if (type === 'keys') {
        const n = buf.readUInt32BE(p + 12); let q = p + 16
        for (let i = 0; i < n; i++) { const ks = buf.readUInt32BE(q); keys.push(buf.toString('latin1', q + 8, q + ks)); q += ks }
      } else if (type === 'meta') {
        const inner = buf.toString('latin1', p + 12, p + 16) === 'hdlr' ? p + 8 : p + 12
        walk(inner, p + size, keys)
      } else if (type === 'ilst') {
        let q = p + 8
        while (q + 8 <= p + size) {
          const isz = buf.readUInt32BE(q); const idx = buf.readUInt32BE(q + 4); const dsz = buf.readUInt32BE(q + 8)
          if (buf.toString('latin1', q + 12, q + 16) === 'data') found[keys[idx - 1] ?? `key#${idx}`] = buf.toString('utf8', q + 24, q + 8 + dsz)
          q += isz
        }
      } else if (containers.has(type)) walk(p + 8, p + size, keys)
      p += size
    }
  }
  walk(0, buf.length, [])
  return found
}

const TAGS = { 0x010f: 'Make', 0x0110: 'Model', 0x0131: 'Software', 0x013b: 'Artist', 0x9003: 'DateTimeOriginal', 0xa431: 'BodySerialNumber', 0xa434: 'LensModel' }
/** Every identifying EXIF field in a JPEG (IFD0, Exif IFD, GPS), or {} when there is no EXIF. */
export async function jpegMetadata(buf) {
  const exif = (await sharp(buf).metadata()).exif
  if (!exif) return {}
  const t = exif.indexOf(Buffer.from('Exif\0\0', 'latin1')) === 0 ? 6 : 0
  const le = exif.toString('latin1', t, t + 2) === 'II'
  const r16 = (o) => le ? exif.readUInt16LE(t + o) : exif.readUInt16BE(t + o)
  const r32 = (o) => le ? exif.readUInt32LE(t + o) : exif.readUInt32BE(t + o)
  const ifd = (off) => { const n = r16(off); const out = {}; for (let i = 0; i < n; i++) { const e = off + 2 + i * 12; out[r16(e)] = { type: r16(e + 2), count: r32(e + 4), val: r32(e + 8), at: e + 8 } } return out }
  const str = (e) => { const o = e.count > 4 ? e.val : e.at; return exif.toString('latin1', t + o, t + o + e.count).replace(/\0+$/, '') }
  const out = {}
  const ifd0 = ifd(r32(4))
  const collect = (d) => { for (const [tag, e] of Object.entries(d)) { const name = TAGS[Number(tag)]; if (name && e.type === 2) out[name] = str(e) } }
  collect(ifd0)
  if (ifd0[0x8769]) collect(ifd(ifd0[0x8769].val))
  if (ifd0[0x8825]) {
    const g = ifd(ifd0[0x8825].val)
    const rat3 = (tag) => { if (!g[tag]) return null; const o = g[tag].val; let v = 0; for (let i = 0; i < 3; i++) v += (r32(o + i * 8) / r32(o + i * 8 + 4)) / [1, 60, 3600][i]; return +v.toFixed(4) }
    out.GPS = { lat: rat3(2), lon: rat3(4) }
  }
  return out
}
