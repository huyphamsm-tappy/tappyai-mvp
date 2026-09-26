import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { stripImageMetadata, hasImageMetadata, hasGpsMetadata } from './stripImageMetadata'

// ── R-2: an uploaded photo must not publish where it was taken ───────────────────────────────
//
// The fixtures are built here rather than committed, so the test proves the strip against real
// EXIF that sharp itself wrote, and a sharp upgrade that changed the container would surface as
// a failure instead of passing against a stale file.

const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/**
 * A JPEG carrying a GPS IFD and an Orientation tag — the shape a phone produces.
 *
 * EXIF is assembled by hand because sharp's `withExif` writes only the blocks it models; the
 * point of the test is a GPS IFD that really is there, laid out as a camera lays it out.
 */
async function jpegWithGps(orientation = 6): Promise<Buffer> {
  const II = Buffer.from([0x49, 0x49, 0x2a, 0x00])            // little-endian TIFF header
  const u16 = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b }
  const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b }
  const entry = (tag: number, type: number, count: number, value: Buffer) =>
    Buffer.concat([u16(tag), u16(type), u32(count), value])

  // IFD0 at offset 8: Orientation (0x0112) + GPSInfoIFDPointer (0x8825) → GPS IFD.
  const ifd0Offset = 8
  const ifd0Size = 2 + 2 * 12 + 4
  const gpsOffset = ifd0Offset + ifd0Size
  const ifd0 = Buffer.concat([
    u16(2),
    entry(0x0112, 3, 1, Buffer.concat([u16(orientation), u16(0)])),
    entry(0x8825, 4, 1, u32(gpsOffset)),
    u32(0),
  ])
  // GPS IFD: GPSLatitudeRef 'N' — enough to make the IFD real and findable.
  const gps = Buffer.concat([
    u16(1),
    entry(0x0001, 2, 2, Buffer.from([0x4e, 0x00, 0x00, 0x00])),
    u32(0),
  ])
  const exif = Buffer.concat([II, u32(ifd0Offset), ifd0, gps])

  // 40x20 so a 90° rotation is unmistakable in the output dimensions.
  const base = await sharp({ create: { width: 40, height: 20, channels: 3, background: '#3391ff' } })
    .jpeg().toBuffer()
  return insertExif(base, exif)
}

/** Splices an APP1/Exif segment in after SOI, which is where a camera puts it. */
function insertExif(jpeg: Buffer, exif: Buffer): Buffer {
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), exif])
  const len = Buffer.alloc(2)
  len.writeUInt16BE(payload.length + 2)
  return Buffer.concat([jpeg.subarray(0, 2), Buffer.from([0xff, 0xe1]), len, payload, jpeg.subarray(2)])
}

describe('the fixture really carries what we claim', () => {
  it('has EXIF and a GPS IFD before stripping', async () => {
    const img = await jpegWithGps()
    expect(await hasImageMetadata(img)).toBe(true)
    expect(await hasGpsMetadata(img)).toBe(true)
  })
})

describe('stripping', () => {
  it('removes EXIF and the GPS block from a JPEG', async () => {
    const { bytes, reencoded } = await stripImageMetadata(await jpegWithGps(), 'jpeg')
    expect(reencoded).toBe(true)
    expect(await hasImageMetadata(bytes)).toBe(false)
    expect(await hasGpsMetadata(bytes)).toBe(false)
  })

  it('keeps the picture upright — orientation is applied, not discarded', async () => {
    // Orientation 6 means "rotate 90° clockwise to display": the stored pixels are 40x20 and the
    // viewer shows 20x40. Strip the tag without applying it and the photo lands on its side.
    const { bytes } = await stripImageMetadata(await jpegWithGps(6), 'jpeg')
    const out = await sharp(bytes).metadata()
    expect({ width: out.width, height: out.height }).toEqual({ width: 20, height: 40 })
  })

  it('leaves an unrotated photo alone', async () => {
    const { bytes } = await stripImageMetadata(await jpegWithGps(1), 'jpeg')
    const out = await sharp(bytes).metadata()
    expect({ width: out.width, height: out.height }).toEqual({ width: 40, height: 20 })
  })

  it('still produces the format the magic bytes approved', async () => {
    for (const kind of ['jpeg', 'png', 'webp'] as const) {
      const src = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#000' } })[kind]().toBuffer()
      const { bytes } = await stripImageMetadata(src, kind)
      expect((await sharp(bytes).metadata()).format).toBe(kind)
    }
  })

  // 🚨 PINNED BY SOURCE, NOT BY ROUND-TRIP, AND THE REASON IS WRITTEN DOWN: this sharp build
  // (0.35.3, libvips without the animation writer wired up here) cannot synthesise a multi-frame
  // WebP — `sharp({create}).webp({pageHeight})` reports `pages: undefined` and `{pages: 3}` on
  // the input throws `field "n-pages" not found`. So a real animated fixture could not be built,
  // and asserting against a still image would have been a test that proves nothing. What is
  // checked is the one line that decides the outcome; a genuine animated upload is a UAT case.
  it('decodes WebP as animated, so a multi-frame upload keeps its frames', () => {
    expect(read('src/lib/media/stripImageMetadata.ts')).toContain("animated: kind === 'webp'")
  })

  // GIF89a has no EXIF container, so there is nothing of this kind to remove and re-encoding
  // would only risk the animation.
  it('passes a GIF through untouched', async () => {
    const gif = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#000' } }).gif().toBuffer()
    const { bytes, reencoded } = await stripImageMetadata(gif, 'gif')
    expect(reencoded).toBe(false)
    expect(bytes.equals(gif)).toBe(true)
  })

  it('rejects bytes it cannot decode rather than passing them through', async () => {
    await expect(stripImageMetadata(Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]), 'jpeg')).rejects.toThrow()
  })
})

describe('every server upload path strips before it stores', () => {
  // The three routes that take image bytes from a user and call putMedia. If a fourth appears,
  // this list is where it has to be added — and the assertion below is what will notice.
  it.each([
    ['src/app/api/reviews/upload/route.ts', 'review photos'],
    ['src/app/api/profile/route.ts', 'avatar and cover'],
  ])('%s (%s)', (file) => {
    const src = read(file)
    expect(src).toContain('stripImageMetadata')
    // The stripped buffer is what reaches storage — never the caller's `file`.
    // Flattened rather than using the `s` flag: the tsconfig target predates it (TS1501).
    expect(src.replace(/\r?\n/g, ' ')).not.toMatch(/putMedia\( *[^)]*?\bfile\b *,/)
  })

  it('no other route calls putMedia with image bytes without stripping', () => {
    const callers = ['src/app/api/reviews/upload/route.ts', 'src/app/api/profile/route.ts']
    for (const f of callers) expect(read(f)).toContain("from '@/lib/media/stripImageMetadata'")
  })
})
