import { describe, it, expect } from 'vitest'
import { createInMemoryJobStore, unavailableJobStore, JobStoreUnavailable, inputFingerprint, jobView, JOB_POLL_AFTER_MS, JOB_TTL_MS, JOB_MAX_ATTEMPTS, JOB_ID_PATTERN } from './jobs'

const T0 = new Date('2026-11-11T03:00:00Z')
const clock = () => { let t = T0.getTime(); return { now: () => new Date(t), tick: (ms: number) => { t += ms } } }
const mk = () => { const c = clock(); return { c, s: createInMemoryJobStore(c.now) } }
const IN = { destination: 'Hue', days: 2 }
const mkJob = (s: ReturnType<typeof createInMemoryJobStore>, o = 'p1', input: Record<string, unknown> = IN) => s.create({ ownerPrincipalId: o, host: 'claude', installId: 'claude:c1', tool: 'create_itinerary', input })

describe('job store contract (reference semantics = in-memory; the SQL is written to match)', () => {
  it('creates an unpredictable id and returns the handle fields the R13 contract names', async () => {
    const { s } = mk()
    const a = await mkJob(s); const b = await mkJob(s, 'p1', { destination: 'Hue', days: 3 })
    expect(a.jobId).toMatch(JOB_ID_PATTERN); expect(a.jobId).not.toBe(b.jobId)
    expect(jobView(a, T0)).toEqual({ job_id: a.jobId, status: 'queued', created_at: T0.toISOString(), poll_after_ms: JOB_POLL_AFTER_MS, expires_at: new Date(T0.getTime() + JOB_TTL_MS).toISOString() })
  })
  it('duplicate submission by the same owner returns the same job; another owner gets its own; after expiry a new job is allowed', async () => {
    const { s, c } = mk()
    const a = await mkJob(s)
    expect((await mkJob(s, 'p1', { days: 2, destination: 'Hue' })).jobId).toBe(a.jobId)
    expect((await mkJob(s, 'p2')).jobId).not.toBe(a.jobId)
    expect(inputFingerprint('p1', IN)).toBe(inputFingerprint('p1', { days: 2, destination: 'Hue' }))
    c.tick(JOB_TTL_MS + 1)
    expect((await mkJob(s)).jobId).not.toBe(a.jobId)
  })
  it('a job is read only through its owner (no existence leak)', async () => {
    const { s } = mk(); const a = await mkJob(s)
    expect((await s.get(a.jobId, 'p1'))?.jobId).toBe(a.jobId)
    expect(await s.get(a.jobId, 'p2')).toBeNull()
    expect(await s.get('job_00000000-0000-0000-0000-000000000000', 'p1')).toBeNull()
  })
  it('cancel is owner-only; queued and running become cancelled, a finished job is left as it is', async () => {
    const { s } = mk(); const a = await mkJob(s)
    expect(await s.cancel(a.jobId, 'p2')).toBeNull()
    expect((await s.cancel(a.jobId, 'p1'))?.status).toBe('cancelled')
    expect((await s.cancel(a.jobId, 'p1'))?.status).toBe('cancelled')
    const b = await mkJob(s, 'p1', { destination: 'Hanoi', days: 1 }); await s.claim('w1', 60_000); await s.complete(b.jobId, 'w1', { days: [] })
    expect((await s.cancel(b.jobId, 'p1'))?.status).toBe('succeeded')
  })
  it('an unfinished job past its expiry reads as expired', async () => {
    const { s } = mk(); const a = await mkJob(s)
    expect(jobView(a, new Date(T0.getTime() + JOB_TTL_MS + 1)).status).toBe('expired')
  })
  it('the default store is unavailable and throws on every port, so the Gateway fails closed', async () => {
    const i = { ownerPrincipalId: 'p', host: 'claude' as const, installId: 'x', tool: 'create_itinerary' as const, input: {} }
    for (const f of [() => unavailableJobStore.create(i), () => unavailableJobStore.get('x', 'p'), () => unavailableJobStore.cancel('x', 'p'), () => unavailableJobStore.claim('w', 1), () => unavailableJobStore.isLive('x', 'w'), () => unavailableJobStore.complete('x', 'w', 1), () => unavailableJobStore.fail('x', 'w', 'c', true), () => unavailableJobStore.recover(), () => unavailableJobStore.purge()]) {
      await expect(f()).rejects.toBeInstanceOf(JobStoreUnavailable)
    }
  })
})

describe('worker side: claim, lease, completion, retry, recovery, expiry', () => {
  it('claims the oldest queued job once, running under a lease, counting the attempt', async () => {
    const { s, c } = mk(); const a = await mkJob(s); c.tick(1000); const b = await mkJob(s, 'p1', { destination: 'Hanoi', days: 1 })
    const got = await s.claim('w1', 60_000)
    expect(got?.jobId).toBe(a.jobId); expect(got?.status).toBe('running'); expect(got?.attempts).toBe(1)
    expect((await s.claim('w2', 60_000))?.jobId).toBe(b.jobId)
    expect(await s.claim('w3', 60_000)).toBeNull()
  })
  it('never claims a cancelled or an expired job', async () => {
    const { s, c } = mk(); const a = await mkJob(s); await s.cancel(a.jobId, 'p1')
    expect(await s.claim('w', 60_000)).toBeNull()
    await mkJob(s, 'p1', { destination: 'Hanoi', days: 1 }); c.tick(JOB_TTL_MS + 1)
    expect(await s.claim('w', 60_000)).toBeNull()
  })
  it('only the worker that owns the running job can complete it; the owner then reads the result', async () => {
    const { s } = mk(); const a = await mkJob(s); await s.claim('w1', 60_000)
    expect(await s.complete(a.jobId, 'w2', { x: 1 })).toBe(false)
    expect(await s.complete(a.jobId, 'w1', { days: [] })).toBe(true)
    const r = await s.get(a.jobId, 'p1'); expect(r?.status).toBe('succeeded'); expect(r?.result).toEqual({ days: [] })
    expect(await s.complete(a.jobId, 'w1', { again: 1 })).toBe(false)
  })
  it('a cancel while running wins: the worker learns through isLive and its late result is discarded', async () => {
    const { s } = mk(); const a = await mkJob(s); await s.claim('w1', 60_000)
    expect(await s.isLive(a.jobId, 'w1')).toBe(true)
    await s.cancel(a.jobId, 'p1')
    expect(await s.isLive(a.jobId, 'w1')).toBe(false)
    expect(await s.complete(a.jobId, 'w1', { late: 1 })).toBe(false)
    const r = await s.get(a.jobId, 'p1'); expect(r?.status).toBe('cancelled'); expect(r?.result).toBeUndefined()
  })
  it('a retryable failure goes back to the queue until attempts run out; a permanent one is terminal at once', async () => {
    const { s } = mk(); const a = await mkJob(s)
    for (let i = 1; i < JOB_MAX_ATTEMPTS; i++) { await s.claim('w', 60_000); expect(await s.fail(a.jobId, 'w', 'provider_unavailable', true)).toBe(true); expect((await s.get(a.jobId, 'p1'))?.status).toBe('queued') }
    await s.claim('w', 60_000); await s.fail(a.jobId, 'w', 'provider_unavailable', true)
    expect((await s.get(a.jobId, 'p1'))?.status).toBe('failed')
    const b = await mkJob(s, 'p1', { destination: 'Hanoi', days: 1 }); await s.claim('w', 60_000); await s.fail(b.jobId, 'w', 'invalid', false)
    expect((await s.get(b.jobId, 'p1'))?.status).toBe('failed')
  })
  it('RECOVERY: a dead worker\'s expired lease puts the job back in the queue; after max attempts it fails as worker_lost', async () => {
    const { s, c } = mk(); const a = await mkJob(s)
    await s.claim('dead', 30_000)
    expect(await s.recover()).toBe(0)
    c.tick(31_000)
    expect(await s.recover()).toBe(1); expect((await s.get(a.jobId, 'p1'))?.status).toBe('queued')
    expect(await s.complete(a.jobId, 'dead', { x: 1 })).toBe(false) // the dead worker cannot come back and write
    for (let i = 1; i < JOB_MAX_ATTEMPTS; i++) { await s.claim('dead', 30_000); c.tick(31_000); await s.recover() }
    const r = await s.get(a.jobId, 'p1'); expect(r?.status).toBe('failed'); expect(r?.errorCode).toBe('worker_lost')
  })
  it('purge deletes jobs long past expiry, results included, and keeps live ones', async () => {
    const { s, c } = mk(); const a = await mkJob(s)
    expect(await s.purge()).toBe(0)
    c.tick(JOB_TTL_MS + 3_600_001)
    const fresh = await mkJob(s, 'p1', { destination: 'Hanoi', days: 1 })
    expect(await s.purge()).toBe(1)
    expect(await s.get(a.jobId, 'p1')).toBeNull(); expect(await s.get(fresh.jobId, 'p1')).not.toBeNull()
  })
})
