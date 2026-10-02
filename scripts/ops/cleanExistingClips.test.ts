import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { cleanExistingClips, type ClipBucket, type StoredClip } from './cleanExistingClips'
import { findIdentifyingMetadata } from '../../src/lib/media/clipMetadata'
import { androidMp4, iphoneMov, ISO6709 } from '../../src/lib/media/__fixtures__/clipFixtures'

// F-099 one-off clean-up (written, not run). An in-memory bucket stands in for GCS.

async function cleanMov() {
  const { neutralizeClipMetadata } = await import('../../src/lib/media/clipMetadata')
  return new Uint8Array(await (await neutralizeClipMetadata(new Blob([iphoneMov()]))).arrayBuffer())
}

function memoryBucket(objects: Record<string, { bytes: Uint8Array; contentType: string; cacheControl?: string }>) {
  const writes: string[] = []
  const bucket: ClipBucket = {
    async *list(prefix) { for (const [name, o] of Object.entries(objects)) if (name.startsWith(prefix)) yield { name, size: o.bytes.length, contentType: o.contentType, cacheControl: o.cacheControl } as StoredClip },
    async readRange(name, off, len) { return objects[name].bytes.slice(off, off + len) },
    async download(name) { return objects[name].bytes },
    async upload(name, bytes, contentType, cacheControl) { writes.push(`upload:${name}`); objects[name] = { bytes, contentType, cacheControl } },
    async patchCacheControl(name, cc) { writes.push(`patch:${name}`); objects[name].cacheControl = cc },
  }
  return { bucket, objects, writes }
}
const strip = async (b: Uint8Array) => new Uint8Array(await sharp(Buffer.from(b)).toBuffer())
const OLD_CC = 'public, max-age=31536000, immutable'

async function fixture() {
  const photo = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#555' } }).jpeg().withExif({ IFD0: { Make: 'SyntheticMaker' } }).toBuffer()
  return memoryBucket({
    'videos/u1/a.mp4': { bytes: androidMp4(), contentType: 'video/mp4', cacheControl: OLD_CC },
    'videos/u1/b.mov': { bytes: iphoneMov(), contentType: 'video/quicktime', cacheControl: OLD_CC },
    'videos/u2/c.mov': { bytes: await cleanMov(), contentType: 'video/quicktime', cacheControl: OLD_CC },
    'videos/u2/d.jpg': { bytes: new Uint8Array(photo), contentType: 'image/jpeg', cacheControl: OLD_CC },
    'avatars/u1-x.jpg': { bytes: new Uint8Array(photo), contentType: 'image/jpeg' },
  })
}

describe('cleanExistingClips', () => {
  it('DRY RUN (default) classifies every clip and writes nothing', async () => {
    const { bucket, writes } = await fixture()
    const r = await cleanExistingClips(bucket, { apply: false, fixCacheControl: false, stripImage: strip })
    expect(r).toMatchObject({ scanned: 4, clean: 1, identifying: 3, rewritten: 0, cacheControlFixed: 0, failed: 0 })
    expect(r.byReason.location).toBe(2)
    expect(writes).toEqual([])
  })

  it('APPLY rewrites only identifying files, same keys, and leaves them clean', async () => {
    const { bucket, objects, writes } = await fixture()
    const r = await cleanExistingClips(bucket, { apply: true, fixCacheControl: false, stripImage: strip })
    expect(r.rewritten).toBe(3)
    expect(writes.sort()).toEqual(['upload:videos/u1/a.mp4', 'upload:videos/u1/b.mov', 'upload:videos/u2/d.jpg'])
    for (const k of ['videos/u1/a.mp4', 'videos/u1/b.mov', 'videos/u2/d.jpg']) {
      const o = objects[k]
      expect(await findIdentifyingMetadata(async (off, n) => o.bytes.slice(off, off + n), o.bytes.length, o.contentType), k).toEqual([])
      expect(new TextDecoder('latin1').decode(o.bytes)).not.toContain(ISO6709)
      expect(o.cacheControl).toBe('private, max-age=86400, immutable')
    }
  })

  it('--fix-cache-control patches the clips it did not rewrite; never touches another prefix', async () => {
    const { bucket, objects, writes } = await fixture()
    const r = await cleanExistingClips(bucket, { apply: true, fixCacheControl: true, stripImage: strip })
    expect(r.cacheControlFixed).toBe(1)
    expect(writes).toContain('patch:videos/u2/c.mov')
    expect(writes.some(w => w.includes('avatars/'))).toBe(false)
    expect(objects['avatars/u1-x.jpg'].cacheControl).toBeUndefined()
  })
})
