import { describe, it, expect } from 'vitest'
import { readMp4Info } from './mp4Info'
import { cleanMp4, rangeReader, box, type Rotation } from './__fixtures__/videoFixtures'

const info = async (bytes: Uint8Array) => readMp4Info(rangeReader(bytes).read, bytes.length)

describe('readMp4Info — what the file itself says (never what the client claims)', () => {
  it('reads duration, size and audio from a plain portrait clip', async () => {
    const r = await info(cleanMp4({ durationSec: 61.5, width: 1080, height: 1920 }))
    expect(r).toEqual({ ok: true, info: { durationMs: 61_500, width: 1080, height: 1920, rotation: 0, hasAudio: true } })
  })

  it('reports no audio when there is no sound track', async () => {
    const r = await info(cleanMp4({ audio: false }))
    expect(r.ok && r.info.hasAudio).toBe(false)
  })

  it.each([[0, 1920, 1080], [90, 1080, 1920], [180, 1920, 1080], [270, 1080, 1920]] as Array<[Rotation, number, number]>)(
    'rotation %i: a track stored 1920x1080 is shown as %ix%i',
    async (rotation, w, h) => {
      const r = await info(cleanMp4({ width: 1920, height: 1080, rotation }))
      expect(r.ok && [r.info.width, r.info.height, r.info.rotation]).toEqual([w, h, rotation])
    },
  )

  it('reads a clip whose moov is at the END (a phone that finishes recording last), with a few small reads, never the whole file', async () => {
    const bytes = cleanMp4({ moovFirst: false, durationSec: 12 })
    const { read, reads } = rangeReader(bytes)
    const r = await readMp4Info(read, bytes.length)
    expect(r.ok && r.info.durationMs).toBe(12_000)
    expect(reads.length).toBeLessThan(10)
    expect(Math.max(...reads.map(([, n]) => n))).toBeLessThanOrEqual(bytes.length)
  })

  it('reads version-1 headers (64-bit durations) and other timescales', async () => {
    const r = await info(cleanMp4({ v1: true, timescale: 90_000, durationSec: 300 }))
    expect(r.ok && r.info.durationMs).toBe(300_000)
    const r2 = await info(cleanMp4({ timescale: 600, durationSec: 4.5 }))
    expect(r2.ok && r2.info.durationMs).toBe(4_500)
  })

  it('a clip with no video track is refused as such', async () => {
    expect(await info(cleanMp4({ video: false, audio: true }))).toEqual({ ok: false, reason: 'no_video' })
  })

  it('🚨 a fragmented file (length not in the header) and a zero timescale/duration are refused, never guessed', async () => {
    expect(await info(cleanMp4({ fragmented: true }))).toEqual({ ok: false, reason: 'no_duration' })
    expect(await info(cleanMp4({ durationSec: 0 }))).toEqual({ ok: false, reason: 'no_duration' })
    expect(await info(cleanMp4({ timescale: 0 }))).toEqual({ ok: false, reason: 'no_duration' })
  })

  it('a track with a zero width or height is refused', async () => {
    expect(await info(cleanMp4({ width: 0, height: 1080 }))).toEqual({ ok: false, reason: 'no_video' })
  })

  it('something that is not a video container is unreadable', async () => {
    for (const bytes of [new Uint8Array(0), new Uint8Array(7), Uint8Array.from('not a video at all, just text'.split(''), c => c.charCodeAt(0)), new Uint8Array(4096)]) {
      expect(await info(bytes)).toEqual({ ok: false, reason: 'unreadable' })
    }
  })

  it('a container with no moov is unreadable', async () => {
    const noMoov = new Uint8Array([...box('ftyp', Uint8Array.from('isom', c => c.charCodeAt(0)), new Uint8Array(4)), ...box('mdat', new Uint8Array(32))])
    expect(await info(noMoov)).toEqual({ ok: false, reason: 'unreadable' })
  })

  it('🚨 a truncated or corrupt moov is unreadable, and a huge declared moov is refused before it is read', async () => {
    const good = cleanMp4()
    expect(await info(good.slice(0, 60))).toEqual({ ok: false, reason: 'unreadable' })
    const corrupt = good.slice()
    corrupt.fill(0xff, 40, 90)
    expect((await info(corrupt)).ok).toBe(false)
    // a moov that claims to be 64 MB
    const huge = good.slice()
    const view = new DataView(huge.buffer)
    const moovAt = 8 + 4 + 4 + 4 + 8 // ftyp (8 header + 'isom' + minor + 'isomiso2mp41' => 8+4+4+12)
    const ftypSize = view.getUint32(0)
    view.setUint32(ftypSize, 64 * 1024 * 1024)
    expect(await info(huge)).toEqual({ ok: false, reason: 'unreadable' })
    void moovAt
  })

  it('a storage read that throws is not swallowed (the caller must be able to retry)', async () => {
    const bytes = cleanMp4()
    await expect(readMp4Info(async () => { throw new Error('network') }, bytes.length)).rejects.toThrow('network')
  })
})
