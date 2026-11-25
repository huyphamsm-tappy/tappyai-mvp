import { describe, it, expect } from 'vitest'
import { TranscoderError, type TranscoderClient, type TranscoderJobState } from '../transcoder'
import type { VideoAssetRow } from '../uploadFlow'
import type { MediaProvider } from '../../types'
import { memoryOverlayStore, memoryRenderStore } from './__fixtures__/overlayMemory'
import {
  MAX_RENDER_ATTEMPTS, RENDER_GRACE_SECONDS, RENDER_TIMEOUT_MS, downloadContentDisposition, openDownloadStream, pollDownload, requestDownload, type DownloadDeps, type Renderers,
} from './downloadFlow'
import { OverlayGlyphError, renderTextLayerPng, renderWatermarkPng } from './renderPng'
import { defaultTextLayer, validateOverlayDoc } from './schema'
import { downloadCacheKey, downloadObjectKey } from './downloadJob'

const OWNER = '4dcce7cf-5f49-4c58-9901-2d586e31352d'
const OTHER = '11111111-1111-4111-8111-111111111111'
const ASSET = '9a1b2c3d-5f49-4c58-9901-2d586e31352d'
const BUCKET = 'tappyai-video-source'
const PNG = new Uint8Array([137, 80, 78, 71])

function asset(over: Partial<VideoAssetRow> = {}): VideoAssetRow {
  return {
    id: ASSET, owner_id: OWNER, state: 'published', moderation_state: 'approved', source_bucket: BUCKET, source_object_key: `vsrc/${OWNER}/orig.mp4`, has_audio: true,
    duration_ms: 6000, width: 1080, height: 1920, transcode_job_id: null, transcode_attempts: 1, staging_manifest_key: null, updated_at: '2026-11-05T09:00:00Z', ...over,
  }
}

function setup(opts: { asset?: Partial<VideoAssetRow>; withTranscoder?: boolean; renderers?: Renderers } = {}) {
  const clock = { now: Date.parse('2026-11-05T10:00:00Z') }
  const row = asset(opts.asset)
  const overlays = memoryOverlayStore({ [ASSET]: OWNER })
  const renders = memoryRenderStore(clock)
  const puts: string[] = []
  const files = new Map<string, Uint8Array>()
  const jobs: Array<{ name: string; body: Record<string, unknown>; state: TranscoderJobState }> = []
  const knob = { createFails: false, getFails: null as null | number, putFails: false, statFails: false }

  const provider: MediaProvider = {
    id: 'gcs',
    async put(key) { if (knob.putFails) throw new Error('put failed'); puts.push(key); return { url: 'x', key } },
    publicUrl: () => 'x',
    async statObject(key) { if (knob.statFails) throw new Error('stat'); const f = files.get(key); return f ? { size: f.length, contentType: 'video/mp4' } : null },
    async readRange(key, offset, length) { return (files.get(key) as Uint8Array).slice(offset, offset + length) },
  }
  const transcoder: TranscoderClient = {
    location: 'asia-southeast1',
    async createJob(body) {
      if (knob.createFails) throw new TranscoderError('create', 500)
      const name = `projects/1/locations/asia-southeast1/jobs/job-${jobs.length + 1}`
      jobs.push({ name, body: body as Record<string, unknown>, state: 'RUNNING' })
      return { name }
    },
    async getJob(name) {
      if (knob.getFails !== null) throw new TranscoderError('get', knob.getFails)
      const j = jobs.find(x => x.name === name)
      if (!j) throw new TranscoderError('get', 404)
      return { state: j.state }
    },
  }
  const stub: Renderers = {
    text: (async () => Buffer.from(PNG)) as unknown as Renderers['text'],
    watermark: (async () => Buffer.from(PNG)) as unknown as Renderers['watermark'],
  }
  const deps: DownloadDeps = {
    assets: { get: async (id: string) => (id === ASSET ? { ...row } : null) },
    overlays: overlays.store, renders: renders.store, provider, transcoder: opts.withTranscoder === false ? null : transcoder, bucket: BUCKET,
    now: () => clock.now, renderers: opts.renderers ?? stub,
  }
  const input = { ownerId: OWNER, assetId: ASSET, username: 'huy' }
  const finish = (index = jobs.length - 1) => { jobs[index].state = 'SUCCEEDED'; files.set(downloadObjectKey(OWNER, ASSET, downloadCacheKey({ assetId: ASSET, overlayVersion: overlays.docs.get(ASSET)?.version ?? 0, username: input.username })), new Uint8Array(10)) }
  return { deps, input, overlays, renders, puts, files, jobs, clock, knob, finish, row }
}

const saveOverlay = async (s: ReturnType<typeof setup>, texts = ['Xin chào'], expected = 0) => {
  const layers = texts.map((t, i) => ({ ...defaultTextLayer(`l${i}`), text: t, start_ms: 1000, end_ms: 4000 }))
  const doc = validateOverlayDoc({ schema_version: 1, layers })
  if (!doc.ok) throw new Error('bad test doc')
  return s.overlays.store.save(ASSET, OWNER, expected, doc.doc)
}

describe('requestDownload — guards', () => {
  it('someone else\'s asset and an unknown asset answer the same 404 and start nothing', async () => {
    const s = setup()
    const other = await requestDownload({ ...s.input, ownerId: OTHER }, s.deps)
    const missing = await requestDownload({ ...s.input, assetId: '99999999-9999-4999-8999-999999999999' }, s.deps)
    expect(other).toEqual({ status: 404, body: { error: 'not_found' } })
    expect(missing).toEqual(other)
    expect(s.jobs).toHaveLength(0)
    expect(s.renders.calls.claim).toBe(0)
  })

  it.each(['draft', 'uploading', 'uploaded', 'processing', 'moderating', 'review_required', 'rejected', 'failed', 'deleted'] as const)('🚨 a video in state %s cannot be downloaded', async (state) => {
    const s = setup({ asset: { state, moderation_state: 'pending' } })
    expect((await requestDownload(s.input, s.deps)).status).toBe(409)
    expect(s.jobs).toHaveLength(0)
  })

  it('🚨 a ready or published video that is not approved cannot be downloaded', async () => {
    // The database forbids this combination; the flow still refuses it, in case a row ever carries it.
    const s = setup({ asset: { state: 'ready', moderation_state: 'review_required' } })
    expect((await requestDownload(s.input, s.deps)).body.error).toBe('not_ready')
  })

  it('both `ready` and `published` (approved) are allowed', async () => {
    for (const state of ['ready', 'published'] as const) {
      const s = setup({ asset: { state } })
      expect((await requestDownload(s.input, s.deps)).body.status).toBe('rendering')
    }
  })

  it('without a transcoder it says so (503) and records nothing; polling still answers', async () => {
    const s = setup({ withTranscoder: false })
    expect(await requestDownload(s.input, s.deps)).toEqual({ status: 503, body: { error: 'download_unavailable' } })
    expect(s.renders.calls.claim).toBe(0)
    expect((await pollDownload(s.input, s.deps)).body).toEqual({ status: 'none' })
  })

  it('a saved overlay that no longer validates is refused (422), not burned in blindly', async () => {
    const s = setup()
    s.overlays.docs.set(ASSET, { version: 1, doc: { schema_version: 1, layers: [{ text: 'x' }] } })
    expect(await requestDownload(s.input, s.deps)).toEqual({ status: 422, body: { error: 'overlay_invalid' } })
    expect(s.jobs).toHaveLength(0)
  })
})

describe('requestDownload — starting and reusing', () => {
  it('uploads the layer PNGs and the watermark into the private input folder, creates ONE job from the ORIGINAL, and says rendering', async () => {
    const s = setup()
    await saveOverlay(s, ['Một', 'Hai'])
    const out = await requestDownload(s.input, s.deps)
    expect(out).toEqual({ status: 200, body: { status: 'rendering' } })

    const cacheKey = downloadCacheKey({ assetId: ASSET, overlayVersion: 1, username: 'huy' })
    const folder = `vdl/${OWNER}/${ASSET}/${cacheKey}/`
    expect(s.puts.sort()).toEqual([`${folder}in/text-l0.png`, `${folder}in/text-l1.png`, `${folder}in/watermark.png`].sort())

    expect(s.jobs).toHaveLength(1)
    const body = s.jobs[0].body as { inputUri: string; outputUri: string; config: { overlays: Array<{ image: { uri: string }; animations: unknown[] }>; manifests?: unknown } }
    expect(body.inputUri).toBe(`gs://${BUCKET}/vsrc/${OWNER}/orig.mp4`) // the original, not the HLS
    expect(body.outputUri).toBe(`gs://${BUCKET}/${folder}`)
    expect(body.config.manifests).toBeUndefined()
    expect(body.config.overlays.map(o => o.image.uri)).toEqual([`gs://${BUCKET}/${folder}in/text-l0.png`, `gs://${BUCKET}/${folder}in/text-l1.png`, `gs://${BUCKET}/${folder}in/watermark.png`])
    expect(body.config.overlays[0].animations).toEqual([{ animationStatic: { xy: { x: 0, y: 0 }, startTimeOffset: '1s' } }, { animationEnd: { startTimeOffset: '4s' } }])
    expect(body.config.overlays[2].animations).toEqual([{ animationStatic: { xy: { x: 0, y: 0 }, startTimeOffset: '0s' } }]) // watermark: the whole clip
    const row = s.renders.rows.get(`${ASSET}|${cacheKey}`)
    expect(row).toMatchObject({ state: 'rendering', attempts: 1 })
  })

  it('a layer that runs to the end of the clip has no end marker', async () => {
    const s = setup()
    const doc = validateOverlayDoc({ schema_version: 1, layers: [{ ...defaultTextLayer('a'), start_ms: 0, end_ms: 6000 }] })
    if (!doc.ok) throw new Error('x')
    await s.overlays.store.save(ASSET, OWNER, 0, doc.doc)
    await requestDownload(s.input, s.deps)
    const first = (s.jobs[0].body as { config: { overlays: Array<{ animations: unknown[] }> } }).config.overlays[0]
    expect(first.animations).toHaveLength(1)
  })

  it('with no overlay at all the download still gets the watermark (and only that)', async () => {
    const s = setup()
    await requestDownload(s.input, s.deps)
    expect(s.puts.filter(p => p.endsWith('.png'))).toHaveLength(1)
    expect(s.puts[0]).toMatch(/in\/watermark\.png$/)
  })

  it('🚨 a second request with the same key reuses the render: no second job, no second upload', async () => {
    const s = setup()
    await requestDownload(s.input, s.deps)
    const puts = s.puts.length
    expect((await requestDownload(s.input, s.deps)).body.status).toBe('rendering')
    expect(s.jobs).toHaveLength(1)
    expect(s.puts).toHaveLength(puts)
  })

  it('🚨 concurrent requests create exactly ONE job', async () => {
    const s = setup()
    const all = await Promise.all(Array.from({ length: 6 }, () => requestDownload(s.input, s.deps)))
    expect(s.jobs).toHaveLength(1)
    expect(all.every(o => o.body.status === 'rendering')).toBe(true)
  })

  it('a changed overlay version, or a changed username, renders again; the old render is left alone', async () => {
    const s = setup()
    await saveOverlay(s)
    await requestDownload(s.input, s.deps)
    expect(s.jobs).toHaveLength(1)
    await saveOverlay(s, ['Đổi chữ'], 1)
    await requestDownload(s.input, s.deps)
    expect(s.jobs).toHaveLength(2)
    await requestDownload({ ...s.input, username: 'huy2' }, s.deps)
    expect(s.jobs).toHaveLength(3)
    expect(s.renders.rows.size).toBe(3)
  })

  it('the real renderers work end to end (Vietnamese text, watermark): valid PNGs are uploaded', async () => {
    const puts: Array<{ key: string; bytes: number }> = []
    const s = setup({ renderers: { text: renderTextLayerPng, watermark: renderWatermarkPng } })
    s.deps.provider.put = async (key, body) => { puts.push({ key, bytes: (body as Uint8Array).length }); return { url: 'x', key } }
    await saveOverlay(s, ['Xin chào Đà Nẵng!'])
    expect((await requestDownload(s.input, s.deps)).body.status).toBe('rendering')
    expect(puts).toHaveLength(2)
    expect(puts.every(p => p.bytes > 200)).toBe(true)
  })
})

describe('progress, completion and caching', () => {
  it('GET: none before any request; rendering while the job runs; ready once it succeeded and the file is there', async () => {
    const s = setup()
    expect((await pollDownload(s.input, s.deps)).body).toEqual({ status: 'none' })
    await requestDownload(s.input, s.deps)
    expect((await pollDownload(s.input, s.deps)).body).toEqual({ status: 'rendering' })
    s.finish()
    const done = await pollDownload(s.input, s.deps)
    expect(done.body).toEqual({ status: 'ready' })
    expect(done.file).toEqual({ key: downloadObjectKey(OWNER, ASSET, downloadCacheKey({ assetId: ASSET, overlayVersion: 0, username: 'huy' })), size: 10 })
  })

  it('🚨 once ready, another request reuses the file: no job, no upload', async () => {
    const s = setup()
    await requestDownload(s.input, s.deps)
    s.finish()
    await pollDownload(s.input, s.deps)
    const jobs = s.jobs.length, puts = s.puts.length
    const again = await requestDownload(s.input, s.deps)
    expect(again.body.status).toBe('ready')
    expect(again.file?.size).toBe(10)
    expect([s.jobs.length, s.puts.length]).toEqual([jobs, puts])
  })

  it('the response body never carries a key, a bucket, a job name or a uri', async () => {
    const s = setup()
    await saveOverlay(s)
    const bodies = [await requestDownload(s.input, s.deps), await pollDownload(s.input, s.deps)]
    s.finish()
    bodies.push(await pollDownload(s.input, s.deps))
    for (const b of bodies) expect(JSON.stringify(b.body)).not.toMatch(/vdl|vsrc|gs:|projects\/|job|tappyai-video/i)
  })

  it('a job that succeeded but left no file is treated as failed and retried', async () => {
    const s = setup()
    await requestDownload(s.input, s.deps)
    s.jobs[0].state = 'SUCCEEDED' // no file written
    expect((await pollDownload(s.input, s.deps)).body.status).toBe('rendering')
    expect(s.jobs).toHaveLength(2)
  })

  it('a record that says ready while the file is gone becomes failed (file_missing); the next request renders again', async () => {
    const s = setup()
    await requestDownload(s.input, s.deps)
    s.finish()
    await pollDownload(s.input, s.deps)
    s.files.clear()
    expect((await pollDownload(s.input, s.deps)).body).toEqual({ status: 'failed', code: 'file_missing' })
    expect((await requestDownload(s.input, s.deps)).body.status).toBe('rendering')
    expect(s.jobs).toHaveLength(2)
  })

  it('storage being unreachable never changes the state (polling again is safe)', async () => {
    const s = setup()
    await requestDownload(s.input, s.deps)
    s.finish()
    s.knob.statFails = true
    expect((await pollDownload(s.input, s.deps)).body.status).toBe('rendering')
    s.knob.statFails = false
    expect((await pollDownload(s.input, s.deps)).body.status).toBe('ready')
  })

  it('the Transcoder API being down says nothing about the job', async () => {
    const s = setup()
    await requestDownload(s.input, s.deps)
    s.knob.getFails = 503
    expect((await pollDownload(s.input, s.deps)).body.status).toBe('rendering')
    expect(s.jobs).toHaveLength(1)
  })
})

describe('failures are bounded', () => {
  it('🚨 a job that keeps failing is retried up to the limit, then reported failed (no endless loop)', async () => {
    const s = setup()
    await requestDownload(s.input, s.deps)
    let last = ''
    for (let i = 0; i < 10; i++) {
      s.jobs.forEach(j => { j.state = 'FAILED' })
      last = String((await pollDownload(s.input, s.deps)).body.status)
      if (last === 'failed') break
    }
    expect(last).toBe('failed')
    expect(s.jobs).toHaveLength(MAX_RENDER_ATTEMPTS)
    // Asking again does not start another one inside the cool-down.
    expect((await requestDownload(s.input, s.deps)).body.status).toBe('failed')
    expect(s.jobs).toHaveLength(MAX_RENDER_ATTEMPTS)
  })

  it('a lost job (404) and a job running past the timeout are replaced', async () => {
    const s = setup()
    await requestDownload(s.input, s.deps)
    s.jobs.length = 0 // the job disappeared at the provider
    await pollDownload(s.input, s.deps)
    expect(s.jobs).toHaveLength(1)
    s.clock.now += RENDER_TIMEOUT_MS + 1000
    await pollDownload(s.input, s.deps)
    expect(s.jobs).toHaveLength(2)
  })

  it('🚨 a character the font cannot draw fails at once with a code and is never retried', async () => {
    const s = setup({ renderers: { text: async () => { throw new OverlayGlyphError(['日']) }, watermark: renderWatermarkPng } })
    await saveOverlay(s)
    expect((await requestDownload(s.input, s.deps)).body).toEqual({ status: 'failed', code: 'unsupported_glyph' })
    expect((await requestDownload(s.input, s.deps)).body).toEqual({ status: 'failed', code: 'unsupported_glyph' })
    expect(s.jobs).toHaveLength(0)
  })

  it('a job that cannot be created counts an attempt, is picked up again after the grace period, and fails after the limit', async () => {
    const s = setup()
    s.knob.createFails = true
    expect((await requestDownload(s.input, s.deps)).body.status).toBe('rendering')
    expect((await requestDownload(s.input, s.deps)).body.status).toBe('rendering') // inside the grace period: nobody else starts it
    expect(s.jobs).toHaveLength(0)
    let status = ''
    for (let i = 0; i < 6 && status !== 'failed'; i++) {
      s.clock.now += (RENDER_GRACE_SECONDS + 5) * 1000
      status = String((await requestDownload(s.input, s.deps)).body.status)
    }
    expect(status).toBe('failed')
    const row = [...s.renders.rows.values()][0]
    expect(row.attempts).toBe(MAX_RENDER_ATTEMPTS)
    // Recovery: once the provider is back, the cool-down passes and it renders.
    s.knob.createFails = false
    s.clock.now += 3601 * 1000
    expect((await requestDownload(s.input, s.deps)).body.status).toBe('rendering')
    expect(s.jobs).toHaveLength(1)
  })

  it('an upload to the private bucket that fails is a counted attempt, never a half-started job', async () => {
    const s = setup()
    s.knob.putFails = true
    expect((await requestDownload(s.input, s.deps)).body.status).toBe('rendering')
    expect(s.jobs).toHaveLength(0)
    expect([...s.renders.rows.values()][0]).toMatchObject({ attempts: 1, job_name: null, error_code: 'create_failed' })
  })
})

describe('streaming and names', () => {
  it('streams the file in ranged chunks and reproduces it exactly', async () => {
    const bytes = new Uint8Array(1000).map((_, i) => i % 251)
    const reads: Array<[number, number]> = []
    const provider = { id: 'gcs', put: async () => ({ url: '', key: '' }), publicUrl: () => '', readRange: async (_k: string, o: number, l: number) => { reads.push([o, l]); return bytes.slice(o, o + l) } } as unknown as MediaProvider
    const out = new Uint8Array(await new Response(openDownloadStream(provider, 'k', 1000, 400)).arrayBuffer())
    expect(Array.from(out)).toEqual(Array.from(bytes))
    expect(reads).toEqual([[0, 400], [400, 400], [800, 200]])
  })

  it('an empty read from storage errors the stream rather than looping', async () => {
    const provider = { id: 'gcs', put: async () => ({ url: '', key: '' }), publicUrl: () => '', readRange: async () => new Uint8Array(0) } as unknown as MediaProvider
    await expect(new Response(openDownloadStream(provider, 'k', 100)).arrayBuffer()).rejects.toThrow()
  })

  it('Content-Disposition: an ASCII fallback and the UTF-8 form for a Vietnamese name; nothing that can break the header', () => {
    const h = downloadContentDisposition('Phạm Quốc Huy')
    expect(h).toBe(`attachment; filename="TappyAI - Pham Quoc Huy.mp4"; filename*=UTF-8''TappyAI%20-%20Ph%E1%BA%A1m%20Qu%E1%BB%91c%20Huy.mp4`)
    expect(downloadContentDisposition(null)).toBe(`attachment; filename="TappyAI.mp4"; filename*=UTF-8''TappyAI.mp4`)
    const evil = downloadContentDisposition('a"b\r\nSet-Cookie: x=1/../../c')
    expect(evil).not.toMatch(/[\r\n]/)
    expect(evil.split(';')[1]).not.toContain('"b')
    expect(evil).not.toContain('/')
    expect(downloadContentDisposition('日本')).toMatch(/^attachment; filename="[\x20-\x7e]+"; filename\*=UTF-8''/)
  })
})
