import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { neutralizeClipMetadata, findIdentifyingMetadata, type RangeReader } from './clipMetadata'
import { androidMp4, iphoneMov, xmpMp4, ISO6709, MDAT_PAYLOAD } from './__fixtures__/clipFixtures'

// F-099 (P1, owner 2026-09-26): clips publish GPS / device / creation time unchanged (measured on the
// real upload path). Client neutralises in place; server refuses what is left.

const reader = (b: Uint8Array): RangeReader => async (o, n) => b.slice(o, o + n)
const bytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer())
const has = (b: Uint8Array, s: string) => new TextDecoder('latin1').decode(b).includes(s)
const indexOfSub = (hay: Uint8Array, needle: Uint8Array) => {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) { for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer; return i }
  return -1
}

describe('server check — what an unneutralised phone clip carries', () => {
  it('Android MP4: location, device, metadata boxes, creation time', async () => {
    const f = androidMp4()
    expect((await findIdentifyingMetadata(reader(f), f.length, 'video/mp4')).sort()).toEqual(['creation-time', 'device-or-author', 'location', 'metadata-box'])
  })
  it('iPhone MOV (moov after mdat): location, device, creation time', async () => {
    const f = iphoneMov()
    expect(await findIdentifyingMetadata(reader(f), f.length, 'video/quicktime')).toEqual(expect.arrayContaining(['location', 'device-or-author', 'creation-time']))
  })
  it('a top-level XMP packet is caught; a 64-bit mdat is walked past', async () => {
    const f = xmpMp4()
    expect(await findIdentifyingMetadata(reader(f), f.length, 'video/mp4')).toEqual(expect.arrayContaining(['xmp', 'creation-time']))
  })
  it('🚨 a client that only RETYPES the boxes to `free` (values left in the bytes) is still caught', async () => {
    const f = iphoneMov()
    const t = new TextDecoder('latin1').decode(f)
    const at = t.indexOf('meta', t.indexOf('moov'))
    f.set([0x66, 0x72, 0x65, 0x65], at) // 'free'
    expect(await findIdentifyingMetadata(reader(f), f.length, 'video/quicktime')).toEqual(expect.arrayContaining(['location', 'device-or-author']))
  })

  it('a file that is not ISO-BMFF under a video/mp4 type is refused as unreadable', async () => {
    const junk = new Uint8Array(64).fill(7)
    expect(await findIdentifyingMetadata(reader(junk), junk.length, 'video/mp4')).toEqual(['unreadable'])
  })
})

describe('client neutraliser — in place, same length, media data untouched', () => {
  for (const [name, make, type] of [
    ['Android MP4 (moov first)', () => androidMp4(), 'video/mp4'],
    ['Android MP4 (moov last)', () => androidMp4({ moovFirst: false }), 'video/mp4'],
    ['iPhone MOV', () => iphoneMov(), 'video/quicktime'],
    ['MP4 with XMP + 64-bit mdat', () => xmpMp4(), 'video/mp4'],
  ] as const) {
    it(`${name}: nothing identifying survives, the size and the sample data are unchanged`, async () => {
      const src = make()
      const out = await bytes(await neutralizeClipMetadata(new Blob([src], { type })))
      expect(out.length).toBe(src.length)
      // Not just hidden from parsers — gone from the bytes anyone can download.
      for (const s of [ISO6709, '10.7725', 'SYN-PHONE-A1', 'iPhone SYN', 'SyntheticMaker', 'Apple', '17.6', 'GPSLatitude', '2026-09-26T09:30']) {
        expect(has(out, s), s).toBe(false)
      }
      expect(await findIdentifyingMetadata(reader(out), out.length, type)).toEqual([])
      const at = indexOfSub(src, MDAT_PAYLOAD)
      expect(Array.from(out.slice(at, at + MDAT_PAYLOAD.length))).toEqual(Array.from(MDAT_PAYLOAD))
    })
  }

  it('keeps the blob type, and returns a non-ISO file (WebM) unchanged', async () => {
    const webm = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4, 5, 6, 7, 8])], { type: 'video/webm' })
    expect(await neutralizeClipMetadata(webm)).toBe(webm)
    const out = await neutralizeClipMetadata(new Blob([androidMp4()], { type: 'video/mp4' }))
    expect(out.type).toBe('video/mp4')
  })
})

describe('client-direct images (the canvas-drawn poster frame)', () => {
  it('a JPEG without EXIF passes; one with EXIF is refused', async () => {
    const clean = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#888' } }).jpeg().toBuffer()
    const dirty = await sharp(clean).withExif({ IFD0: { Make: 'SyntheticMaker' } }).toBuffer()
    expect(await findIdentifyingMetadata(reader(new Uint8Array(clean)), clean.length, 'image/jpeg')).toEqual([])
    expect(await findIdentifyingMetadata(reader(new Uint8Array(dirty)), dirty.length, 'image/jpeg')).toEqual(['image-metadata'])
  })
})
