import { describe, it, expect, vi, beforeEach } from 'vitest'
import { advanceVideoAsset as advanceMaybe, reconcileProcessing, MAX_TRANSCODE_ATTEMPTS, JOB_TIMEOUT_MS, START_GRACE_MS, type AdvanceDeps } from './processing'
import { memoryStore, uuidIds } from './__fixtures__/memoryStore'
import { TranscoderError, type TranscoderClient, type TranscoderJobState } from './transcoder'
import type { VideoAssetRow } from './uploadFlow'

const OWNER = '4dcce7cf-5f49-4c58-9901-2d586e31352d'
const BUCKET = 'tappyai-video-source-test'
const NAME = (n: number) => `projects/1023373437508/locations/asia-southeast1/jobs/job-${n}`

/** The step for an asset that exists (the unknown-asset case uses advanceMaybe directly). */
const advanceVideoAsset = async (id: string, d: AdvanceDeps) => (await advanceMaybe(id, d))!

let clock: { now: number }
let mem: ReturnType<typeof memoryStore>
beforeEach(() => { clock = { now: Date.parse('2026-11-05T10:00:00Z') }; mem = memoryStore(clock, uuidIds) })

function fakeTranscoder(plan: { states?: Array<TranscoderJobState | Error>; createFails?: number } = {}) {
  let created = 0
  let polls = 0
  const createJob = vi.fn(async (job: object) => {
    if (created < (plan.createFails ?? 0)) { created++; throw new TranscoderError('create', 403) }
    created++
    void job
    return { name: NAME(created) }
  })
  const getJob = vi.fn(async () => {
    const s = (plan.states ?? ['RUNNING'])[Math.min(polls++, (plan.states ?? ['RUNNING']).length - 1)]
    if (s instanceof Error) throw s
    return s === 'FAILED' ? { state: s, errorCode: 3 } : { state: s }
  })
  const client: TranscoderClient = { location: 'asia-southeast1', createJob, getJob }
  return { client, createJob, getJob }
}

/** A video that finished uploading, with what the header said about it. */
async function uploaded(over: { hasAudio?: boolean; width?: number; height?: number } = {}): Promise<VideoAssetRow> {
  const row = await mem.store.create(OWNER, 'processing-key-0001')
  await mem.store.setSource(row.id, BUCKET, `vsrc/${OWNER}/abcdefghijklmnopqrstuvwx.mp4`)
  await mem.store.transition(row.id, 'uploading', { eventType: 'upload_session_created', actor: `user:${OWNER}` })
  await mem.store.setMediaInfo(row.id, { durationMs: 60_000, width: over.width ?? 1080, height: over.height ?? 1920, hasAudio: over.hasAudio ?? true })
  await mem.store.transition(row.id, 'uploaded', { eventType: 'upload_verified', actor: `user:${OWNER}` })
  return (await mem.store.get(row.id))!
}
const deps = (t: TranscoderClient | null) => ({ store: mem.store, transcoder: t, bucket: BUCKET, now: () => clock.now })

describe('starting the transcode', () => {
  it('moves uploaded to processing ONCE and creates the job against the private staging folder of THIS video', async () => {
    const a = await uploaded()
    const f = fakeTranscoder()
    const r = await advanceVideoAsset(a.id, deps(f.client))
    expect(r).toMatchObject({ assetId: a.id, state: 'processing', action: 'started' })
    expect(f.createJob).toHaveBeenCalledTimes(1)
    const job = f.createJob.mock.calls[0][0] as { inputUri: string; outputUri: string; config: { elementaryStreams: unknown[] } }
    expect(job.inputUri).toBe(`gs://${BUCKET}/${a.source_object_key}`)
    expect(job.outputUri).toBe(`gs://${BUCKET}/vstg/${OWNER}/${a.id}/`)
    expect(mem.rows.get(a.id)).toMatchObject({ state: 'processing', transcode_job_id: NAME(1), transcode_attempts: 1 })
    expect(mem.events.at(-1)).toMatchObject({ from: 'uploaded', to: 'processing', eventType: 'transcode_requested', actor: 'service:video-pipeline' })
  })

  it('🚨 a second caller at the same moment does NOT create a second job (only the transition that changed the state starts it)', async () => {
    const a = await uploaded()
    const f = fakeTranscoder()
    const [r1, r2] = await Promise.all([advanceVideoAsset(a.id, deps(f.client)), advanceVideoAsset(a.id, deps(f.client))])
    expect(f.createJob).toHaveBeenCalledTimes(1)
    expect([r1.action, r2.action].sort()).toEqual(['started', 'waiting'])
  })

  it('the job asks for sound only when the file has sound, and for rungs no bigger than the source', async () => {
    const a = await uploaded({ hasAudio: false, width: 480, height: 854 })
    const f = fakeTranscoder()
    await advanceVideoAsset(a.id, deps(f.client))
    const job = f.createJob.mock.calls[0][0] as { config: { elementaryStreams: Array<{ key: string }> } }
    expect(job.config.elementaryStreams.map(s => s.key)).toEqual(['v480', 'v360'])
  })

  it('with no transcoder configured it says so and changes NOTHING (the video waits at uploaded)', async () => {
    const a = await uploaded()
    const r = await advanceVideoAsset(a.id, deps(null))
    expect(r).toMatchObject({ state: 'uploaded', action: 'unavailable' })
    expect(mem.rows.get(a.id)!.state).toBe('uploaded')
  })

  it('a create that fails leaves the video in processing WITHOUT a job id and counts the attempt; the sweep retries it', async () => {
    const a = await uploaded()
    const f = fakeTranscoder({ createFails: 1 })
    const r = await advanceVideoAsset(a.id, deps(f.client))
    expect(r.action).toBe('waiting')
    expect(mem.rows.get(a.id)).toMatchObject({ state: 'processing', transcode_job_id: null, transcode_attempts: 1 })
    clock.now += START_GRACE_MS + 1_000
    const again = await advanceVideoAsset(a.id, deps(f.client))
    expect(again.action).toBe('restarted')
    expect(mem.rows.get(a.id)).toMatchObject({ transcode_job_id: NAME(2), transcode_attempts: 2 })
  })

  it('does not retry a job-less video before the grace period (the first caller may still be creating it)', async () => {
    const a = await uploaded()
    await mem.store.transition(a.id, 'processing', { eventType: 'x', actor: 'a' })
    const f = fakeTranscoder()
    expect((await advanceVideoAsset(a.id, deps(f.client))).action).toBe('waiting')
    expect(f.createJob).not.toHaveBeenCalled()
  })

  it('a video whose header never gave its size cannot be transcoded: it FAILS with a code, not a guess', async () => {
    const row = await mem.store.create(OWNER, 'processing-key-0002')
    await mem.store.setSource(row.id, BUCKET, `vsrc/${OWNER}/zzzzzzzzzzzzzzzzzzzzzzzz.mp4`)
    await mem.store.transition(row.id, 'uploading', { eventType: 'e', actor: 'a' })
    await mem.store.transition(row.id, 'uploaded', { eventType: 'e', actor: 'a' })
    const f = fakeTranscoder()
    const r = await advanceVideoAsset(row.id, deps(f.client))
    expect(r).toMatchObject({ state: 'failed', action: 'failed' })
    expect(mem.events.at(-1)).toMatchObject({ to: 'failed', reason: 'missing_media_info' })
    expect(f.createJob).not.toHaveBeenCalled()
  })
})

describe('following the job', () => {
  async function running() {
    const a = await uploaded()
    const f = fakeTranscoder({ states: ['RUNNING', 'SUCCEEDED'] })
    await advanceVideoAsset(a.id, deps(f.client))
    return { a, f }
  }

  it('RUNNING and PENDING change nothing', async () => {
    const { a, f } = await running()
    const r = await advanceVideoAsset(a.id, deps(f.client))
    expect(r).toMatchObject({ state: 'processing', action: 'waiting' })
  })

  it('SUCCEEDED records the staging playlist and moves on to moderating, once', async () => {
    const { a, f } = await running()
    await advanceVideoAsset(a.id, deps(f.client)) // RUNNING
    const done = await advanceVideoAsset(a.id, deps(f.client)) // SUCCEEDED
    expect(done).toMatchObject({ state: 'moderating', action: 'completed' })
    expect(mem.rows.get(a.id)!.staging_manifest_key).toBe(`vstg/${OWNER}/${a.id}/manifest.m3u8`)
    expect(mem.events.at(-1)).toMatchObject({ from: 'processing', to: 'moderating', eventType: 'transcode_succeeded' })
    // asking again does nothing more
    const again = await advanceVideoAsset(a.id, deps(f.client))
    expect(again).toMatchObject({ state: 'moderating', action: 'none' })
    expect(mem.events.filter(e => e.to === 'moderating')).toHaveLength(1)
  })

  it('🚨 a transcoded video is NEVER published or made ready by this step: it stops at moderating', async () => {
    const { a, f } = await running()
    await advanceVideoAsset(a.id, deps(f.client)); await advanceVideoAsset(a.id, deps(f.client))
    expect(mem.rows.get(a.id)).toMatchObject({ state: 'moderating', moderation_state: 'pending' })
  })

  it('a FAILED job is retried with a new job, up to the attempt limit, then the video fails with a code', async () => {
    const a = await uploaded()
    const f = fakeTranscoder({ states: ['FAILED'] })
    await advanceVideoAsset(a.id, deps(f.client)) // started, attempt 1
    for (let i = 1; i < MAX_TRANSCODE_ATTEMPTS; i++) {
      const r = await advanceVideoAsset(a.id, deps(f.client))
      expect(r.action, `attempt ${i + 1}`).toBe('restarted')
    }
    expect(f.createJob).toHaveBeenCalledTimes(MAX_TRANSCODE_ATTEMPTS)
    const last = await advanceVideoAsset(a.id, deps(f.client))
    expect(last).toMatchObject({ state: 'failed', action: 'failed' })
    expect(mem.events.at(-1)).toMatchObject({ to: 'failed', eventType: 'transcode_failed', reason: 'transcode_failed' })
    expect(f.createJob).toHaveBeenCalledTimes(MAX_TRANSCODE_ATTEMPTS)
  })

  it('a job that runs longer than the timeout counts as failed (and is retried like one)', async () => {
    const a = await uploaded()
    const f = fakeTranscoder({ states: ['RUNNING'] })
    await advanceVideoAsset(a.id, deps(f.client))
    clock.now += JOB_TIMEOUT_MS + 1_000
    const r = await advanceVideoAsset(a.id, deps(f.client))
    expect(r.action).toBe('restarted')
    expect(mem.rows.get(a.id)!.transcode_attempts).toBe(2)
  })

  it('a job that no longer exists (404) is treated as lost: a new attempt; a transient API error just waits', async () => {
    const a = await uploaded()
    const f = fakeTranscoder({ states: [new TranscoderError('get', 404)] })
    await advanceVideoAsset(a.id, deps(f.client))
    expect((await advanceVideoAsset(a.id, deps(f.client))).action).toBe('restarted')
    const b = fakeTranscoder({ states: [new TranscoderError('get', 503)] })
    const r = await advanceVideoAsset(a.id, deps(b.client))
    expect(r.action).toBe('waiting')
    expect(b.createJob).not.toHaveBeenCalled()
  })

  it('every other state is left alone', async () => {
    const a = await uploaded()
    await mem.store.transition(a.id, 'deleted', { eventType: 'x', actor: 'a' })
    const f = fakeTranscoder()
    expect((await advanceVideoAsset(a.id, deps(f.client))).action).toBe('none')
    expect(f.createJob).not.toHaveBeenCalled()
    expect(await advanceMaybe('99999999-9999-4999-8999-999999999999', deps(f.client))).toBeNull()
  })
})

describe('reconcileProcessing (the sweep)', () => {
  it('advances every video stuck in processing past the grace window, and only those', async () => {
    const a = await uploaded()
    const f = fakeTranscoder({ states: ['SUCCEEDED'] })
    await advanceVideoAsset(a.id, deps(f.client))
    const fresh = await reconcileProcessing(deps(f.client), { limit: 10 })
    expect(fresh).toEqual({ looked: 0, completed: 0, restarted: 0, failed: 0, errors: 0 })
    clock.now += START_GRACE_MS + 1_000
    const r = await reconcileProcessing(deps(f.client), { limit: 10 })
    expect(r).toMatchObject({ looked: 1, completed: 1 })
    expect(mem.rows.get(a.id)!.state).toBe('moderating')
  })

  it('one video that throws does not stop the others, and the error is only counted', async () => {
    const a = await uploaded()
    const b = await mem.store.create(OWNER, 'processing-key-0009')
    await mem.store.setSource(b.id, BUCKET, `vsrc/${OWNER}/bbbbbbbbbbbbbbbbbbbbbbbb.mp4`)
    await mem.store.transition(b.id, 'uploading', { eventType: 'e', actor: 'a' })
    await mem.store.setMediaInfo(b.id, { durationMs: 1000, width: 1080, height: 1920, hasAudio: true })
    await mem.store.transition(b.id, 'uploaded', { eventType: 'e', actor: 'a' })
    await mem.store.transition(a.id, 'processing', { eventType: 'e', actor: 'a' })
    await mem.store.transition(b.id, 'processing', { eventType: 'e', actor: 'a' })
    clock.now += START_GRACE_MS + 1_000
    const f = fakeTranscoder()
    let n = 0
    f.createJob.mockImplementation(async () => { if (n++ === 0) throw new Error('boom'); return { name: NAME(2) } })
    const r = await reconcileProcessing(deps(f.client), { limit: 10 })
    expect(r.looked).toBe(2)
    expect(r.restarted + r.errors).toBeGreaterThanOrEqual(1)
  })

  it('without a transcoder the sweep does nothing', async () => {
    expect(await reconcileProcessing(deps(null), { limit: 10 })).toEqual({ looked: 0, completed: 0, restarted: 0, failed: 0, errors: 0 })
  })
})
