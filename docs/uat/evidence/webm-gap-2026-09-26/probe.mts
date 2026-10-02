// Does the F-099 server check cover WebM? Synthetic files only, no network.
//   npx tsx docs/uat/evidence/webm-gap-2026-09-26/probe.mts
import { findIdentifyingMetadata } from '../../../../src/lib/media/clipMetadata'
import { syntheticAndroidMp4 } from '../clip-gps-2026-09-26/gps.mjs'

// Minimal EBML/Matroska: EBML header (DocType webm) + Segment{ Info{DateUTC}, Tags{Tag{SimpleTag LOCATION / DEVICE}} }.
// This is the shape ffmpeg writes when it remuxes a phone clip's metadata into WebM/MKV.
const vint = (n: number) => { if (n < 0x7f) return Buffer.from([0x80 | n]); if (n < 0x3fff) return Buffer.from([0x40 | (n >> 8), n & 255]); throw new Error('size') }
const el = (id: number[], ...parts: Buffer[]) => { const body = Buffer.concat(parts); return Buffer.concat([Buffer.from(id), vint(body.length), body]) }
const str = (id: number[], s: string) => el(id, Buffer.from(s, 'utf8'))
const simpleTag = (name: string, value: string) => el([0x67, 0xc8], str([0x45, 0xa3], name), str([0x44, 0x87], value))
const dateUtc = Buffer.alloc(8); dateUtc.writeBigInt64BE(843_700_000_000_000_000n) // ns since 2001-01-01 ≈ 2027
const webm = Buffer.concat([
  el([0x1a, 0x45, 0xdf, 0xa3], str([0x42, 0x82], 'webm')),
  el([0x18, 0x53, 0x80, 0x67],
    el([0x15, 0x49, 0xa9, 0x66], el([0x44, 0x61], dateUtc), str([0x57, 0x41], 'SynOS camera 14')),
    el([0x12, 0x54, 0xc3, 0x67], el([0x73, 0x73],
      simpleTag('LOCATION', '+10.7725+106.6980/'),
      simpleTag('COM.ANDROID.MANUFACTURER', 'SyntheticMaker'),
      simpleTag('COM.ANDROID.MODEL', 'SYN-PHONE-A1')))),
])
const reader = (b: Buffer) => async (o: number, n: number) => new Uint8Array(b.subarray(o, o + n))
const mp4 = syntheticAndroidMp4()
const out = {
  webmCarriesLocationText: webm.includes(Buffer.from('+10.7725+106.6980')),
  'webm declared video/webm': await findIdentifyingMetadata(reader(webm), webm.length, 'video/webm'),
  'same webm declared video/mp4': await findIdentifyingMetadata(reader(webm), webm.length, 'video/mp4'),
  'GPS mp4 declared video/mp4': await findIdentifyingMetadata(reader(mp4), mp4.length, 'video/mp4'),
  'SAME GPS mp4 declared video/webm': await findIdentifyingMetadata(reader(mp4), mp4.length, 'video/webm'),
}
console.log(JSON.stringify(out, null, 1))
