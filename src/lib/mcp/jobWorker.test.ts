import { describe, it, expect, vi, beforeEach } from 'vitest'
import { composeItinerary, assembleItinerary } from './itineraryComposer'
import { runJobWorker } from './jobWorker'
import { createInMemoryJobStore, JOB_MAX_ATTEMPTS, JOB_TTL_MS, type JobRecord } from './jobs'
import { createSpendPool } from './spendPool'
import { NO_ADAPTERS, type ServiceAdapter, type ServiceAdapters } from './serviceMap'
import { __resetKvCounters } from '@/lib/security/kvCounter'

const T0 = new Date('2026-11-11T03:00:00Z')
const clock = () => { let t = T0.getTime(); return { now: () => new Date(t), tick: (ms: number) => { t += ms } } }
const CAPS = { MCP_POOL_DAILY_USD: '1', MCP_POOL_HOST_USD: '1', MCP_POOL_INSTALL_USD: '1', MCP_POOL_PRINCIPAL_USD: '0.5', MCP_POOL_TOOL_USD: '1', MCP_POOL_REQUEST_USD: '1' }
const place = (n: string, extra: Record<string, unknown> = {}) => ({ name: n, address: 'Huế', place_id: `id-${n}`, maps_link: `https://maps.example/${encodeURIComponent(n)}`, _tappy_ranking: { score: 1 }, lat: 16.46, ...extra })
const attractions = Array.from({ length: 8 }, (_, i) => place(`Điểm ${i + 1}`))
const restaurants = Array.from({ length: 6 }, (_, i) => place(`Quán ${i + 1}`))
const placesAdapter = (): ServiceAdapter => vi.fn(async c => ({ rows: c.placeType === 'restaurant' ? restaurants : attractions }))
const adapters = (o: Partial<ServiceAdapters> = {}): ServiceAdapters => ({ ...NO_ADAPTERS, 'places.search': placesAdapter(), ...o })
const JOB: JobRecord = { jobId: 'job_11111111-2222-4333-8444-555555555555', ownerPrincipalId: 'u:abc', host: 'claude', installId: 'claude:c1', tool: 'create_itinerary', status: 'running', attempts: 1, createdAt: T0.toISOString(), expiresAt: new Date(T0.getTime() + JOB_TTL_MS).toISOString(), input: { destination: 'Huế', days: 2 } }
const live = async () => true

beforeEach(() => __resetKvCounters())

describe('assembleItinerary (deterministic, no model, nothing invented)', () => {
  it('spreads distinct attractions and restaurants over the days and never repeats a place', () => {
    const r = assembleItinerary(2, { attractions: attractions.map(a => ({ name: a.name, url: a.maps_link })), restaurants: restaurants.map(a => ({ name: a.name })), hotels: [] })
    expect(r.days.length).toBe(2)
    const titles = r.days.flatMap(d => d.items.map(i => i.title))
    expect(new Set(titles).size).toBe(titles.length)
    for (const d of r.days) { expect(d.items.some(i => i.kind === 'attraction')).toBe(true); expect(d.items.some(i => i.kind === 'restaurant')).toBe(true); expect(d.items.length).toBeLessThanOrEqual(12) }
  })
  it('with too few results it returns fewer items, never filler', () => {
    const r = assembleItinerary(3, { attractions: [{ name: 'Chỉ một' }], restaurants: [], hotels: [] })
    expect(r.days.flatMap(d => d.items).map(i => i.title)).toEqual(['Chỉ một'])
    expect(r.days.length).toBe(3)
  })
  it('puts the first hotel on day 1 only when one was found', () => {
    expect(assembleItinerary(2, { attractions: [], restaurants: [], hotels: [{ name: 'KS A' }, { name: 'KS B' }] }).days.map(d => d.items.map(i => i.kind))).toEqual([['hotel'], []])
  })
})

describe('composeItinerary through the fixed allowlist and the spend pool', () => {
  it('queries attractions and restaurants (no writer, no direct provider), assembles, and returns only DTO fields', async () => {
    const a = adapters()
    const out = await composeItinerary(JOB, { adapters: a, pool: createSpendPool({ env: CAPS }), isLive: live })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    const calls = (a['places.search'] as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0].placeType)
    expect(calls.sort()).toEqual(['attraction', 'restaurant'])
    const json = JSON.stringify(out.result)
    for (const leak of ['_tappy_ranking', '16.46', 'score']) expect(json).not.toContain(leak)
    expect(out.result.days.length).toBe(2)
  })
  it('hotels are queried only when a hotel adapter exists', async () => {
    const hotels = vi.fn(async () => ({ rows: [{ name: 'KS A', link: 'https://h.example/a' }] }))
    const out = await composeItinerary(JOB, { adapters: adapters({ 'hotels.prices': hotels }), pool: createSpendPool({ env: CAPS }), isLive: live })
    expect(hotels).toHaveBeenCalledTimes(1)
    expect(out.ok && out.result.days[0].items[0]).toMatchObject({ kind: 'hotel', title: 'KS A' })
    const none = await composeItinerary(JOB, { adapters: adapters(), pool: createSpendPool({ env: CAPS }), isLive: live })
    expect(none.ok && none.result.days.flatMap(d => d.items).some(i => i.kind === 'hotel')).toBe(false)
  })
  it('an unwired places service fails the job without spending anything', async () => {
    const out = await composeItinerary(JOB, { adapters: { ...NO_ADAPTERS }, pool: createSpendPool({ env: CAPS }), isLive: live })
    expect(out).toEqual({ ok: false, code: 'unwired', retryable: false })
  })
  it('no budget: fails closed, the provider is not called', async () => {
    const a = adapters()
    const out = await composeItinerary(JOB, { adapters: a, pool: createSpendPool({ env: {} }), isLive: live })
    expect(out).toMatchObject({ ok: false, code: 'budget_exceeded' })
    expect(a['places.search']).not.toHaveBeenCalled()
  })
  it('a provider error is retryable and keeps the reservation (unknown outcome)', async () => {
    const out = await composeItinerary(JOB, { adapters: adapters({ 'places.search': async () => { throw new Error('x') } }), pool: createSpendPool({ env: { ...CAPS, MCP_POOL_TOOL_USD: '0.015' } }), isLive: live })
    expect(out).toEqual({ ok: false, code: 'provider_unavailable', retryable: true })
  })
  it('cooperative cancel: when the job is no longer live it stops before the next query and spends nothing more', async () => {
    const a = adapters()
    let n = 0
    const out = await composeItinerary(JOB, { adapters: a, pool: createSpendPool({ env: CAPS }), isLive: async () => (n++ < 1) })
    expect(out).toEqual({ ok: false, code: 'cancelled', retryable: false })
    expect((a['places.search'] as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
  })
  it('charges the job owner\'s Host allocation, not the Web/App pool: reservations use the mcp: keys of the job\'s host and install', async () => {
    const keys: string[] = []
    const pool = createSpendPool({ env: CAPS, incr: async (k, by) => { keys.push(k); return { count: by, scope: 'instance' as const } } })
    await composeItinerary(JOB, { adapters: adapters(), pool, isLive: live })
    expect(keys.every(k => k.startsWith('mcp:'))).toBe(true)
    expect(keys.some(k => k.includes('mcp:host:claude:'))).toBe(true); expect(keys.some(k => k.includes('claude_c1') || k.includes('claude:c1'))).toBe(true)
  })
})

describe('runJobWorker: durable loop over the store ports', () => {
  const setup = () => {
    const c = clock(); const store = createInMemoryJobStore(c.now)
    const create = (input: Record<string, unknown> = { destination: 'Huế', days: 2 }, owner = 'u:abc') => store.create({ ownerPrincipalId: owner, host: 'claude', installId: 'claude:c1', tool: 'create_itinerary', input })
    return { c, store, create }
  }
  const compose = (a: ServiceAdapters) => (job: JobRecord, isLive: () => Promise<boolean>) => composeItinerary(job, { adapters: a, pool: createSpendPool({ env: CAPS }), isLive })

  it('processes queued jobs to a stored result that the owner (and only the owner) can read', async () => {
    const { store, create } = setup(); const j = await create()
    const r = await runJobWorker({ store, compose: compose(adapters()), workerId: 'w1', leaseMs: 60_000, maxJobs: 5, log: () => {} })
    expect(r).toMatchObject({ processed: 1, succeeded: 1, failed: 0 })
    const done = await store.get(j.jobId, 'u:abc')
    expect(done?.status).toBe('succeeded'); expect((done?.result as { days: unknown[] }).days.length).toBe(2)
    expect(await store.get(j.jobId, 'u:other')).toBeNull()
  })
  it('a retryable failure requeues and a later run succeeds (retry); a permanent one fails once', async () => {
    const { store, create } = setup(); const j = await create()
    let first = true
    const flaky: ServiceAdapters = adapters({ 'places.search': async c => { if (first) { first = false; throw new Error('blip') } return { rows: c.placeType === 'restaurant' ? restaurants : attractions } } })
    const r1 = await runJobWorker({ store, compose: compose(flaky), workerId: 'w1', leaseMs: 60_000, maxJobs: 1, log: () => {} })
    expect(r1.requeued).toBe(1); expect((await store.get(j.jobId, 'u:abc'))?.status).toBe('queued')
    const r2 = await runJobWorker({ store, compose: compose(flaky), workerId: 'w1', leaseMs: 60_000, maxJobs: 1, log: () => {} })
    expect(r2.succeeded).toBe(1)
    const p = await create({ destination: 'Hà Nội', days: 1 })
    const r3 = await runJobWorker({ store, compose: compose({ ...NO_ADAPTERS }), workerId: 'w1', leaseMs: 60_000, maxJobs: 1, log: () => {} })
    expect(r3.failed).toBe(1); expect((await store.get(p.jobId, 'u:abc'))?.errorCode).toBe('unwired')
  })
  it('attempts are bounded: a job that keeps failing retryably ends failed', async () => {
    const { store, create } = setup(); const j = await create()
    const boom = adapters({ 'places.search': async () => { throw new Error('x') } })
    for (let i = 0; i < JOB_MAX_ATTEMPTS; i++) await runJobWorker({ store, compose: compose(boom), workerId: 'w', leaseMs: 60_000, maxJobs: 1, log: () => {} })
    expect((await store.get(j.jobId, 'u:abc'))?.status).toBe('failed')
  })
  it('a thrown composer is a retryable internal failure, never a crash of the loop', async () => {
    const { store, create } = setup(); await create(); await create({ destination: 'Hà Nội', days: 1 })
    const r = await runJobWorker({ store, compose: async () => { throw new Error('bug') }, workerId: 'w', leaseMs: 60_000, maxJobs: 2, log: () => {} })
    expect(r.processed).toBe(2); expect(r.requeued).toBe(2) // a requeued job goes BEHIND the others, so the second claim is the second job
  })
  it('RECOVERY: a job left running by a dead worker is requeued at the start of the next run and then completed', async () => {
    const { store, create, c } = setup(); const j = await create()
    await store.claim('dead', 30_000); c.tick(31_000)
    const r = await runJobWorker({ store, compose: compose(adapters()), workerId: 'w2', leaseMs: 60_000, maxJobs: 5, log: () => {} })
    expect(r.recovered).toBe(1); expect(r.succeeded).toBe(1)
    expect((await store.get(j.jobId, 'u:abc'))?.status).toBe('succeeded')
  })
  it('CANCEL while running: the worker stops, nothing is written, the job stays cancelled', async () => {
    const { store, create } = setup(); const j = await create()
    const cancelling = (job: JobRecord, isLive: () => Promise<boolean>) => { void store.cancel(job.jobId, 'u:abc'); return composeItinerary(job, { adapters: adapters(), pool: createSpendPool({ env: CAPS }), isLive }) }
    const r = await runJobWorker({ store, compose: cancelling, workerId: 'w', leaseMs: 60_000, maxJobs: 1, log: () => {} })
    expect(r.cancelled).toBe(1)
    const done = await store.get(j.jobId, 'u:abc'); expect(done?.status).toBe('cancelled'); expect(done?.result).toBeUndefined()
  })
  it('a cancel that lands AFTER the composer finished but before the write: the result is discarded and counted as lost, never as a success', async () => {
    const { store, create } = setup(); const j = await create()
    const lateCancel = async (job: JobRecord, isLive: () => Promise<boolean>) => { const out = await composeItinerary(job, { adapters: adapters(), pool: createSpendPool({ env: CAPS }), isLive }); await store.cancel(job.jobId, 'u:abc'); return out }
    const r = await runJobWorker({ store, compose: lateCancel, workerId: 'w', leaseMs: 60_000, maxJobs: 1, log: () => {} })
    expect(r).toMatchObject({ succeeded: 0, lost: 1 })
    const done = await store.get(j.jobId, 'u:abc'); expect(done?.status).toBe('cancelled'); expect(done?.result).toBeUndefined()
  })
  it('EXPIRY: an expired queued job is never processed, and purge removes old rows', async () => {
    const { store, create, c } = setup(); await create(); c.tick(JOB_TTL_MS + 3_600_001)
    const r = await runJobWorker({ store, compose: compose(adapters()), workerId: 'w', leaseMs: 60_000, maxJobs: 5, log: () => {} })
    expect(r.processed).toBe(0); expect(r.purged).toBe(1)
  })
  it('IDEMPOTENCY: the same request twice is one job and runs once', async () => {
    const { store, create } = setup(); const a = await create(); const b = await create()
    expect(b.jobId).toBe(a.jobId)
    const ad = adapters()
    const r = await runJobWorker({ store, compose: compose(ad), workerId: 'w', leaseMs: 60_000, maxJobs: 5, log: () => {} })
    expect(r.processed).toBe(1); expect((ad['places.search'] as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2)
  })
  it('a worker that lost its lease cannot overwrite the result of the one that took over (the lost run is counted, not written)', async () => {
    const { store, create, c } = setup(); const j = await create()
    const slow = async (job: JobRecord, isLive: () => Promise<boolean>) => { c.tick(61_000); await store.recover(); await store.claim('w2', 60_000); return composeItinerary(job, { adapters: adapters(), pool: createSpendPool({ env: CAPS }), isLive }) }
    const r = await runJobWorker({ store, compose: slow, workerId: 'w1', leaseMs: 60_000, maxJobs: 1, log: () => {} })
    expect(r.lost + r.cancelled).toBeGreaterThanOrEqual(1)
    expect((await store.get(j.jobId, 'u:abc'))?.status).toBe('running') // w2 still owns it
  })
})
