import { describe, it, expect, vi, beforeEach } from 'vitest'
import { startVideoUpload, completeVideoUpload } from './uploadFlow'
import type { MediaProvider } from '../types'
import { iphoneMov } from '../__fixtures__/clipFixtures'
import { cleanMp4 } from './__fixtures__/videoFixtures'
import { memoryStore } from './__fixtures__/memoryStore'

const OWNER = '4dcce7cf-5f49-4c58-9901-2d586e31352d'
const OTHER = '9a1b2c3d-5f49-4c58-9901-2d586e31352d'
const BUCKET = 'tappyai-video-source-test'
const IDEM = 'client-generated-key-0001'

/** An in-memory stand-in for the database that enforces the SAME transition table as the trigger. */
function fakeProvider(over: Partial<MediaProvider> & { bytes?: Uint8Array; contentType?: string; missing?: boolean } = {}) {
  const createUploadSession = vi.fn(async (req: { key: string; contentType: string; sizeBytes: number }) => ({
    uploadUrl: 'https://storage.googleapis.com/upload/session/abc',
    url: `https://storage.googleapis.com/${BUCKET}/${req.key}`,
    key: req.key,
  }))
  const deleteObject = vi.fn(async () => true)
  const statObject = vi.fn(async () => (over.missing ? null : { size: over.bytes?.length ?? 1000, contentType: over.contentType ?? 'video/mp4' }))
  const readRange = vi.fn(async (_k: string, o: number, len: number) => (over.bytes ?? new Uint8Array()).slice(o, o + len))
  const p = { id: 'gcs', publicUrl: (k: string) => `https://storage.googleapis.com/${BUCKET}/${k}`, createUploadSession, statObject, readRange, deleteObject, ...over } as unknown as MediaProvider
  return { p, createUploadSession, deleteObject, statObject, readRange }
}

let mem: ReturnType<typeof memoryStore>
beforeEach(() => { mem = memoryStore() })

const input = (over: Partial<Parameters<typeof startVideoUpload>[0]> = {}) => ({
  ownerId: OWNER, idempotencyKey: IDEM, contentType: 'video/mp4', size: 5_000_000, origin: 'https://www.tappyai.com', ...over,
})

describe('startVideoUpload', () => {
  it('creates ONE asset, opens a session in the private source bucket, records it, and answers without any public URL or key', async () => {
    const { p, createUploadSession } = fakeProvider()
    const out = await startVideoUpload(input(), { store: mem.store, provider: p, bucket: BUCKET })
    expect(out.status).toBe(200)
    expect(out.body).toMatchObject({ assetId: 'asset-1', state: 'uploading', contentType: 'video/mp4', uploadUrl: 'https://storage.googleapis.com/upload/session/abc' })
    expect(out.body.url).toBeUndefined()
    expect(out.body.key).toBeUndefined()
    expect(JSON.stringify(out.body)).not.toContain(BUCKET)
    const sessionReq = createUploadSession.mock.calls[0][0]
    expect(sessionReq.key).toMatch(new RegExp(`^vsrc/${OWNER}/[A-Za-z0-9]{24}\\.mp4$`))
    expect(sessionReq.sizeBytes).toBe(5_000_000)
    expect(mem.rows.get('asset-1')).toMatchObject({ state: 'uploading', source_bucket: BUCKET, source_object_key: sessionReq.key })
    expect(mem.events).toEqual([{ id: 'asset-1', from: 'draft', to: 'uploading', eventType: 'upload_session_created', actor: `user:${OWNER}`, reason: undefined }])
  })

  it('a retry with the same idempotency key reuses the asset (no duplicate) and opens a fresh session', async () => {
    const { p, createUploadSession } = fakeProvider()
    const deps = { store: mem.store, provider: p, bucket: BUCKET }
    const first = await startVideoUpload(input(), deps)
    const second = await startVideoUpload(input(), deps)
    expect(mem.calls.create).toBe(1)
    expect(second.body.assetId).toBe(first.body.assetId)
    expect(createUploadSession).toHaveBeenCalledTimes(2)
    expect(mem.events).toHaveLength(1) // one state change, not two
    expect(mem.rows.get('asset-1')!.source_object_key).toBe(createUploadSession.mock.calls[1][0].key)
  })

  it('a different owner with the same key gets a separate asset', async () => {
    const { p } = fakeProvider()
    const deps = { store: mem.store, provider: p, bucket: BUCKET }
    const a = await startVideoUpload(input(), deps)
    const b = await startVideoUpload(input({ ownerId: OTHER }), deps)
    expect(a.body.assetId).not.toBe(b.body.assetId)
  })

  it('an asset already past upload is reported, never given a new session', async () => {
    const { p, createUploadSession } = fakeProvider()
    const deps = { store: mem.store, provider: p, bucket: BUCKET }
    await startVideoUpload(input(), deps)
    mem.rows.get('asset-1')!.state = 'processing'
    createUploadSession.mockClear()
    const out = await startVideoUpload(input(), deps)
    expect(out.status).toBe(200)
    expect(out.body).toMatchObject({ assetId: 'asset-1', state: 'processing', reused: true })
    expect(out.body.uploadUrl).toBeUndefined()
    expect(createUploadSession).not.toHaveBeenCalled()
  })

  it('a deleted asset is a conflict', async () => {
    const { p } = fakeProvider()
    const deps = { store: mem.store, provider: p, bucket: BUCKET }
    await startVideoUpload(input(), deps)
    mem.rows.get('asset-1')!.state = 'deleted'
    expect((await startVideoUpload(input(), deps)).status).toBe(409)
  })

  it('refuses a bad idempotency key before touching anything', async () => {
    const { p, createUploadSession } = fakeProvider()
    for (const bad of ['', 'short', 'x'.repeat(129), 'has space in it 12', 'slash/in/key-12345', 'ünïcode-key-12345']) {
      const out = await startVideoUpload(input({ idempotencyKey: bad }), { store: mem.store, provider: p, bucket: BUCKET })
      expect(out.status, bad).toBe(400)
    }
    expect(mem.calls.create).toBe(0)
    expect(createUploadSession).not.toHaveBeenCalled()
  })

  it('refuses a format or size the policy rejects WITHOUT creating an asset', async () => {
    const { p, createUploadSession } = fakeProvider()
    const deps = { store: mem.store, provider: p, bucket: BUCKET }
    expect((await startVideoUpload(input({ contentType: 'video/webm' }), deps)).status).toBe(415)
    expect((await startVideoUpload(input({ contentType: 'image/jpeg' }), deps)).status).toBe(415)
    expect((await startVideoUpload(input({ size: 151 * 1024 * 1024 }), deps)).status).toBe(413)
    expect((await startVideoUpload(input({ size: 0 }), deps)).status).toBe(400)
    expect(mem.calls.create).toBe(0)
    expect(createUploadSession).not.toHaveBeenCalled()
  })

  it('a provider that cannot open a session fails closed: 502, nothing leaked, the asset stays a draft with no source', async () => {
    const { p } = fakeProvider({ createUploadSession: async () => { throw Object.assign(new Error('sts boom'), { stage: 'sts', status: 403 }) } } as never)
    const out = await startVideoUpload(input(), { store: mem.store, provider: p, bucket: BUCKET })
    expect(out.status).toBe(502)
    expect(JSON.stringify(out.body)).not.toMatch(/sts|boom|403/)
    expect(mem.rows.get('asset-1')).toMatchObject({ state: 'draft', source_object_key: null })
    expect(mem.events).toEqual([])
  })

  it('a provider with no session support fails closed', async () => {
    const { p } = fakeProvider()
    ;(p as { createUploadSession?: unknown }).createUploadSession = undefined
    expect((await startVideoUpload(input(), { store: mem.store, provider: p, bucket: BUCKET })).status).toBe(502)
  })
})

describe('completeVideoUpload', () => {
  async function uploadingAsset(ext: 'mp4' | 'mov' = 'mp4') {
    const f = fakeProvider({ contentType: ext === 'mp4' ? 'video/mp4' : 'video/quicktime' })
    await startVideoUpload(input({ contentType: ext === 'mp4' ? 'video/mp4' : 'video/quicktime' }), { store: mem.store, provider: f.p, bucket: BUCKET })
    return f
  }
  const clean = async () => cleanMp4()

  it('a landed, clean upload moves to uploaded, with an event, and answers with no URL', async () => {
    await uploadingAsset()
    const bytes = await clean()
    const { p } = fakeProvider({ bytes })
    const out = await completeVideoUpload({ ownerId: OWNER, assetId: 'asset-1' }, { store: mem.store, provider: p, bucket: BUCKET })
    expect(out.status).toBe(200)
    expect(out.body).toEqual({ assetId: 'asset-1', state: 'uploaded' })
    expect(mem.rows.get('asset-1')!.state).toBe('uploaded')
    expect(mem.events.at(-1)).toMatchObject({ from: 'uploading', to: 'uploaded', eventType: 'upload_verified', actor: `user:${OWNER}` })
  })

  it('is idempotent: completing twice changes nothing and does not touch storage the second time', async () => {
    await uploadingAsset()
    const f = fakeProvider({ bytes: await clean() })
    const deps = { store: mem.store, provider: f.p, bucket: BUCKET }
    await completeVideoUpload({ ownerId: OWNER, assetId: 'asset-1' }, deps)
    f.statObject.mockClear()
    const again = await completeVideoUpload({ ownerId: OWNER, assetId: 'asset-1' }, deps)
    expect(again.status).toBe(200)
    expect(again.body).toEqual({ assetId: 'asset-1', state: 'uploaded' })
    expect(f.statObject).not.toHaveBeenCalled()
    expect(mem.events.filter(e => e.to === 'uploaded')).toHaveLength(1)
  })

  it('someone else\'s asset and an unknown asset look the same: 404', async () => {
    await uploadingAsset()
    const { p } = fakeProvider({ bytes: await clean() })
    const deps = { store: mem.store, provider: p, bucket: BUCKET }
    const other = await completeVideoUpload({ ownerId: OTHER, assetId: 'asset-1' }, deps)
    const missing = await completeVideoUpload({ ownerId: OWNER, assetId: 'nope' }, deps)
    expect(other.status).toBe(404)
    expect(missing.status).toBe(404)
    expect(other.body).toEqual(missing.body)
    expect(mem.rows.get('asset-1')!.state).toBe('uploading')
  })

  it('an asset whose upload never started cannot be completed', async () => {
    const row = await mem.store.create(OWNER, 'another-key-123456')
    const { p } = fakeProvider()
    const out = await completeVideoUpload({ ownerId: OWNER, assetId: row.id }, { store: mem.store, provider: p, bucket: BUCKET })
    expect(out.status).toBe(409)
  })

  it('an object that has not landed yet is retryable: 422, the asset stays uploading', async () => {
    await uploadingAsset()
    const { p, deleteObject } = fakeProvider({ missing: true })
    const out = await completeVideoUpload({ ownerId: OWNER, assetId: 'asset-1' }, { store: mem.store, provider: p, bucket: BUCKET })
    expect(out.status).toBe(422)
    expect(mem.rows.get('asset-1')!.state).toBe('uploading')
    expect(deleteObject).not.toHaveBeenCalled()
  })

  it('a storage error is ours: 502, the asset stays uploading so the client can retry', async () => {
    await uploadingAsset()
    const { p } = fakeProvider({ statObject: async () => { throw new Error('network') } } as never)
    const out = await completeVideoUpload({ ownerId: OWNER, assetId: 'asset-1' }, { store: mem.store, provider: p, bucket: BUCKET })
    expect(out.status).toBe(502)
    expect(mem.rows.get('asset-1')!.state).toBe('uploading')
  })

  it('a clip that still carries location or device data is refused, its object deleted, and the asset FAILED with a reason', async () => {
    await uploadingAsset('mov')
    const { p, deleteObject } = fakeProvider({ bytes: iphoneMov(), contentType: 'video/quicktime' })
    const out = await completeVideoUpload({ ownerId: OWNER, assetId: 'asset-1' }, { store: mem.store, provider: p, bucket: BUCKET })
    expect(out.status).toBe(422)
    expect(out.body.error).toBe('identifying_metadata')
    expect(out.body.url).toBeUndefined()
    expect(deleteObject).toHaveBeenCalledTimes(1)
    expect(mem.rows.get('asset-1')!.state).toBe('failed')
    expect(mem.events.at(-1)).toMatchObject({ from: 'uploading', to: 'failed', eventType: 'upload_rejected', reason: 'identifying_metadata' })
  })

  describe('the file\'s own header decides length and size (never the client)', () => {
    const complete = async (bytes: Uint8Array) => {
      await uploadingAsset()
      const f = fakeProvider({ bytes })
      const out = await completeVideoUpload({ ownerId: OWNER, assetId: 'asset-1' }, { store: mem.store, provider: f.p, bucket: BUCKET })
      return { out, f }
    }

    it('records the real duration, display size and nothing else from the header', async () => {
      const { out } = await complete(cleanMp4({ durationSec: 95.2, width: 1920, height: 1080, rotation: 90 }))
      expect(out.status).toBe(200)
      expect(mem.media.get('asset-1')).toEqual({ durationMs: 95_200, width: 1080, height: 1920, hasAudio: true })
      expect(mem.rows.get('asset-1')!.state).toBe('uploaded')
    })

    it('accepts a clip of exactly five minutes and anything inside the shared tolerance (5:05)', async () => {
      for (const sec of [300, 300.04, 304.9]) {
        mem = memoryStore()
        expect((await complete(cleanMp4({ durationSec: sec }))).out.status, String(sec)).toBe(200)
      }
    })

    it('🚨 refuses a clip longer than the shared rule: 422, the object DELETED, the asset FAILED with the reason, nothing recorded as media', async () => {
      const { out, f } = await complete(cleanMp4({ durationSec: 306 }))
      expect(out.status).toBe(422)
      expect(out.body).toMatchObject({ error: 'video_too_long' })
      expect(typeof out.body.message).toBe('string')
      expect(f.deleteObject).toHaveBeenCalledTimes(1)
      expect(mem.rows.get('asset-1')!.state).toBe('failed')
      expect(mem.events.at(-1)).toMatchObject({ from: 'uploading', to: 'failed', eventType: 'upload_rejected', reason: 'video_too_long' })
      expect(mem.media.size).toBe(0)
    })

    it('🚨 a clip whose length is not in its header (fragmented, zero duration, no video) is refused, never guessed', async () => {
      for (const [i, bytes] of [cleanMp4({ fragmented: true }), cleanMp4({ video: false }), cleanMp4({ durationSec: 0 })].entries()) {
        mem = memoryStore()
        const { out, f } = await complete(bytes)
        expect(out.status, String(i)).toBe(422)
        expect(out.body.error, String(i)).toBe('unreadable_video')
        expect(f.deleteObject).toHaveBeenCalledTimes(1)
        expect(mem.rows.get('asset-1')!.state).toBe('failed')
      }
    })

    it('a header read that fails is OURS: 502, the asset stays uploading and the object is kept for the retry', async () => {
      await uploadingAsset()
      const f = fakeProvider({ bytes: cleanMp4() })
      const readInfo = async () => { throw new Error('network') }
      const out = await completeVideoUpload({ ownerId: OWNER, assetId: 'asset-1' }, { store: mem.store, provider: f.p, bucket: BUCKET, readInfo })
      expect(out.status).toBe(502)
      expect(out.body).toEqual({ error: 'storage_unavailable' })
      expect(mem.rows.get('asset-1')!.state).toBe('uploading')
      expect(f.deleteObject).not.toHaveBeenCalled()
      expect(mem.media.size).toBe(0)
    })
  })

  it('a refused upload is final for that idempotency key; a NEW key starts a fresh attempt', async () => {
    await uploadingAsset('mov')
    const bad = fakeProvider({ bytes: iphoneMov(), contentType: 'video/quicktime' })
    await completeVideoUpload({ ownerId: OWNER, assetId: 'asset-1' }, { store: mem.store, provider: bad.p, bucket: BUCKET })
    expect(mem.rows.get('asset-1')!.state).toBe('failed')
    const f = fakeProvider()
    const deps = { store: mem.store, provider: f.p, bucket: BUCKET }
    const same = await startVideoUpload(input(), deps)
    expect(same.status).toBe(409)
    expect(f.createUploadSession).not.toHaveBeenCalled()
    const fresh = await startVideoUpload(input({ idempotencyKey: 'client-generated-key-0002' }), deps)
    expect(fresh.status).toBe(200)
    expect(fresh.body).toMatchObject({ assetId: 'asset-2', state: 'uploading' })
  })

  it('completing before any bytes were verified never leaks the object key or a URL, whatever the outcome', async () => {
    await uploadingAsset()
    const { p } = fakeProvider({ bytes: await clean() })
    const out = await completeVideoUpload({ ownerId: OWNER, assetId: 'asset-1' }, { store: mem.store, provider: p, bucket: BUCKET })
    expect(JSON.stringify(out.body)).not.toMatch(/vsrc|storage\.googleapis|tappyai-video-source/)
  })
})
