// Synthetic ISO-BMFF clips in the shapes phones write (F-099). Invented values only; the location
// is a public landmark (Ben Thanh market, HCMC), never a person's home.
export const ISO6709 = '+10.7725+106.6980/'
const MAC_EPOCH = Date.UTC(1904, 0, 1) / 1000
const CREATED = Math.floor(Date.UTC(2026, 8, 26, 2, 30) / 1000) - MAC_EPOCH

const enc = (s: string) => Uint8Array.from(s, c => c.charCodeAt(0) & 0xff)
const u32 = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0); return b }
const cat = (...parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length } return out }
export const box = (type: string, ...parts: Uint8Array[]) => { const body = cat(...parts); return cat(u32(8 + body.length), enc(type), body) }
const fullBox = (type: string, ...parts: Uint8Array[]) => box(type, new Uint8Array(4), ...parts)

function timed(type: 'mvhd' | 'tkhd' | 'mdhd', len: number) {
  const b = new Uint8Array(len); const v = new DataView(b.buffer)
  v.setUint32(0, CREATED); v.setUint32(4, CREATED)
  return fullBox(type, b)
}
const trak = () => box('trak', timed('tkhd', 80), box('mdia', timed('mdhd', 20)), box('udta', box('©mak', enc('SyntheticMaker'))))

function appleMeta(entries: Array<[string, string]>) {
  const hdlr = fullBox('hdlr', u32(0), enc('mdta'), new Uint8Array(13))
  const keys = fullBox('keys', u32(entries.length), ...entries.map(([k]) => cat(u32(8 + k.length), enc('mdta'), enc(k))))
  const items = entries.map(([, v], i) => { const data = box('data', u32(1), u32(0), enc(v)); return cat(u32(8 + data.length), u32(i + 1), data) })
  return box('meta', hdlr, keys, box('ilst', ...items))
}

/** 64 bytes of stand-in media data with a recognisable pattern, so tests can prove it is untouched. */
export const MDAT_PAYLOAD = Uint8Array.from({ length: 64 }, (_, i) => (i * 37) & 0xff)

export function androidMp4({ moovFirst = true } = {}) {
  const xyz = (() => { const s = enc(ISO6709); const len = new Uint8Array([0, s.length]); return box('©xyz', len, new Uint8Array([0x15, 0xc7]), s) })()
  const moov = box('moov', timed('mvhd', 96), trak(), box('udta', xyz), appleMeta([['com.android.version', '14'], ['com.android.model', 'SYN-PHONE-A1']]))
  const ftyp = box('ftyp', enc('isom'), u32(512), enc('isomiso2mp41'))
  const mdat = box('mdat', MDAT_PAYLOAD)
  return moovFirst ? cat(ftyp, moov, mdat) : cat(ftyp, mdat, moov)
}

export function iphoneMov() {
  return cat(
    box('ftyp', enc('qt  '), u32(0), enc('qt  ')),
    box('wide'),
    box('mdat', MDAT_PAYLOAD),
    box('moov', timed('mvhd', 96), trak(), appleMeta([
      ['com.apple.quicktime.location.ISO6709', ISO6709],
      ['com.apple.quicktime.make', 'Apple'],
      ['com.apple.quicktime.model', 'iPhone SYN'],
      ['com.apple.quicktime.software', '17.6'],
      ['com.apple.quicktime.creationdate', '2026-09-26T09:30:00+0700'],
    ])),
  )
}

const XMP_UUID = new Uint8Array([0xbe, 0x7a, 0xcf, 0xcb, 0x97, 0xa9, 0x42, 0xe8, 0x9c, 0x71, 0x99, 0x94, 0x91, 0xe3, 0xaf, 0xac])
/** A clip with a top-level XMP packet carrying GPS, and a 64-bit-size mdat. */
export function xmpMp4() {
  const xmp = box('uuid', XMP_UUID, enc('<x:xmpmeta><exif:GPSLatitude>10,46.35N</exif:GPSLatitude></x:xmpmeta>'))
  const big = cat(u32(1), enc('mdat'), u32(0), u32(16 + MDAT_PAYLOAD.length), MDAT_PAYLOAD)
  return cat(box('ftyp', enc('isom'), u32(0)), xmp, big, box('moov', timed('mvhd', 96)))
}
