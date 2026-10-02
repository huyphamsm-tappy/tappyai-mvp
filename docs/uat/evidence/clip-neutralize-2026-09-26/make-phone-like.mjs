// Turns the browser-recorded synthetic MP4 into a "phone-like" one: moov gains the metadata phones
// write (Android udta/©xyz + iPhone QuickTime keys: location, make, model, software, creation date)
// and non-zero creation times. Synthetic values; location = Ben Thanh market (public landmark).
import { readFileSync, writeFileSync } from 'node:fs'
const src = readFileSync(new URL('./playable-plain.mp4', import.meta.url))
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b }
const box = (t, ...p) => { const body = Buffer.concat(p); return Buffer.concat([u32(8 + body.length), Buffer.from(t, 'latin1'), body]) }
const full = (t, ...p) => box(t, Buffer.alloc(4), ...p)
const ISO = '+10.7725+106.6980/'
const xyz = box('\u00a9xyz', Buffer.from([0, ISO.length, 0x15, 0xc7]), Buffer.from(ISO, 'latin1'))
const keysList = [['com.apple.quicktime.location.ISO6709', ISO], ['com.apple.quicktime.make', 'Apple'], ['com.apple.quicktime.model', 'iPhone SYN'], ['com.apple.quicktime.software', '17.6'], ['com.apple.quicktime.creationdate', '2026-09-26T09:30:00+0700']]
const meta = box('meta', full('hdlr', u32(0), Buffer.from('mdta'), Buffer.alloc(13)),
  full('keys', u32(keysList.length), ...keysList.map(([k]) => Buffer.concat([u32(8 + k.length), Buffer.from('mdta'), Buffer.from(k, 'latin1')]))),
  box('ilst', ...keysList.map(([, v], i) => { const d = box('data', u32(1), u32(0), Buffer.from(v, 'utf8')); return Buffer.concat([u32(8 + d.length), u32(i + 1), d]) })))
const moovAt = 36, moovSize = src.readUInt32BE(moovAt)
if (src.toString('latin1', moovAt + 4, moovAt + 8) !== 'moov') throw new Error('moov not at 36')
const moov = Buffer.from(src.subarray(moovAt, moovAt + moovSize))
const t = Math.floor(Date.UTC(2026, 8, 26, 2, 30) / 1000) + 2082844800
// mvhd at moov+8, tkhd at moov+136 (Chrome writes both as version 1: 64-bit creation + modification)
for (const box of [8, 136]) {
  const v = moov[box + 8]
  if (v === 1) { moov.writeBigUInt64BE(BigInt(t), box + 12); moov.writeBigUInt64BE(BigInt(t), box + 20) }
  else { moov.writeUInt32BE(t, box + 12); moov.writeUInt32BE(t, box + 16) }
}
const extra = Buffer.concat([box('udta', xyz), meta])
const newMoov = Buffer.concat([moov, extra]); newMoov.writeUInt32BE(moovSize + extra.length, 0)
const out = Buffer.concat([src.subarray(0, moovAt), newMoov, src.subarray(moovAt + moovSize)])
writeFileSync(new URL('./playable-phone-like.mp4', import.meta.url), out)
console.log('phone-like bytes', out.length, 'added', extra.length)
