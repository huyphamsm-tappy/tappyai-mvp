import { describe, it, expect } from 'vitest'
import { createInMemoryJobStore, unavailableJobStore, JobStoreUnavailable, inputFingerprint, jobView, JOB_POLL_AFTER_MS, JOB_TTL_MS } from './jobs'

const NOW = new Date('2026-11-11T03:00:00Z')

describe('job store contract (in-memory fake; the durable store is not chosen yet)', () => {
  it('creates an unpredictable job id and returns the handle fields the R13 contract names', async () => {
    const s = createInMemoryJobStore(() => NOW)
    const a = await s.create({ ownerPrincipalId: 'p1', tool: 'create_itinerary', input: { destination: 'Hue', days: 2 } })
    const b = await s.create({ ownerPrincipalId: 'p1', tool: 'create_itinerary', input: { destination: 'Hue', days: 3 } })
    expect(a.jobId).toMatch(/^job_[0-9a-f-]{36}$/); expect(a.jobId).not.toBe(b.jobId)
    expect(jobView(a, NOW)).toEqual({ job_id: a.jobId, status: 'queued', created_at: NOW.toISOString(), poll_after_ms: JOB_POLL_AFTER_MS, expires_at: new Date(NOW.getTime() + JOB_TTL_MS).toISOString() })
  })
  it('duplicate submission by the same principal returns the same job; another principal gets its own', async () => {
    const s = createInMemoryJobStore(() => NOW)
    const input = { destination: 'Hue', days: 2 }
    const a = await s.create({ ownerPrincipalId: 'p1', tool: 'create_itinerary', input })
    const dup = await s.create({ ownerPrincipalId: 'p1', tool: 'create_itinerary', input: { days: 2, destination: 'Hue' } })
    const other = await s.create({ ownerPrincipalId: 'p2', tool: 'create_itinerary', input })
    expect(dup.jobId).toBe(a.jobId); expect(other.jobId).not.toBe(a.jobId)
    expect(inputFingerprint('p1', input)).toBe(inputFingerprint('p1', { days: 2, destination: 'Hue' }))
  })
  it('a job is read only through its owner: get(jobId, principal) is null for anyone else (no existence leak)', async () => {
    const s = createInMemoryJobStore(() => NOW)
    const a = await s.create({ ownerPrincipalId: 'p1', tool: 'create_itinerary', input: { destination: 'Hue', days: 2 } })
    expect((await s.get(a.jobId, 'p1'))?.jobId).toBe(a.jobId)
    expect(await s.get(a.jobId, 'p2')).toBeNull()
    expect(await s.get('job_00000000-0000-0000-0000-000000000000', 'p1')).toBeNull()
  })
  it('cancel is owner-only and cooperative: queued becomes cancelled, a terminal job is left as it is', async () => {
    const s = createInMemoryJobStore(() => NOW)
    const a = await s.create({ ownerPrincipalId: 'p1', tool: 'create_itinerary', input: { destination: 'Hue', days: 2 } })
    expect(await s.cancel(a.jobId, 'p2')).toBeNull()
    expect((await s.cancel(a.jobId, 'p1'))?.status).toBe('cancelled')
    expect((await s.cancel(a.jobId, 'p1'))?.status).toBe('cancelled')
  })
  it('an expired job reads as expired', async () => {
    const s = createInMemoryJobStore(() => NOW)
    const a = await s.create({ ownerPrincipalId: 'p1', tool: 'create_itinerary', input: { destination: 'Hue', days: 2 } })
    const later = new Date(NOW.getTime() + JOB_TTL_MS + 1)
    expect(jobView(a, later).status).toBe('expired')
  })
  it('the default store is unavailable and throws, so the Gateway fails closed', async () => {
    await expect(unavailableJobStore.create({ ownerPrincipalId: 'p', tool: 'create_itinerary', input: {} })).rejects.toBeInstanceOf(JobStoreUnavailable)
    await expect(unavailableJobStore.get('x', 'p')).rejects.toBeInstanceOf(JobStoreUnavailable)
    await expect(unavailableJobStore.cancel('x', 'p')).rejects.toBeInstanceOf(JobStoreUnavailable)
  })
})
