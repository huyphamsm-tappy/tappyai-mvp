import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRpcJobStore } from './jobsRpc'
import { JobStoreUnavailable, JOB_MAX_ATTEMPTS, inputFingerprint } from './jobs'

const ROW = { job_id: 'job_11111111-2222-4333-8444-555555555555', owner: 'u:abc', host: 'claude', install_id: 'claude:c1', tool: 'create_itinerary', input: { destination: 'Hue', days: 2 }, status: 'queued', attempts: 0, created_at: '2026-11-11T03:00:00Z', expires_at: '2026-11-11T04:00:00Z', result: null, error_code: null }
const store = (impl: (fn: string, args?: Record<string, unknown>) => unknown) => { const rpc = vi.fn(async (fn: string, args?: Record<string, unknown>) => ({ data: impl(fn, args), error: null })); return { s: createRpcJobStore({ rpc }), rpc } }

describe('RPC job store adapter (exercised against a fake rpc only)', () => {
  it('create sends the owner, the install, an unpredictable id, the fingerprint and the TTL, and maps the row', async () => {
    const { s, rpc } = store(() => [ROW])
    const rec = await s.create({ ownerPrincipalId: 'u:abc', host: 'claude', installId: 'claude:c1', tool: 'create_itinerary', input: { destination: 'Hue', days: 2 } })
    expect(rec).toMatchObject({ jobId: ROW.job_id, ownerPrincipalId: 'u:abc', host: 'claude', status: 'queued', createdAt: '2026-11-11T03:00:00.000Z' })
    const [fn, args] = rpc.mock.calls[0]
    expect(fn).toBe('mcp_job_create')
    expect(args).toMatchObject({ p_owner: 'u:abc', p_host: 'claude', p_install: 'claude:c1', p_tool: 'create_itinerary', p_fingerprint: inputFingerprint('u:abc', { destination: 'Hue', days: 2 }), p_ttl_seconds: 3600 })
    expect(args?.p_job_id).toMatch(/^job_[0-9a-f-]{36}$/)
  })
  it('every read and cancel carries the owner; an empty answer is a job that does not exist for that owner', async () => {
    const { s, rpc } = store(() => [])
    expect(await s.get(ROW.job_id, 'u:other')).toBeNull(); expect(await s.cancel(ROW.job_id, 'u:other')).toBeNull()
    expect(rpc.mock.calls.map(c => [c[0], c[1]])).toEqual([['mcp_job_get', { p_job_id: ROW.job_id, p_owner: 'u:other' }], ['mcp_job_cancel', { p_job_id: ROW.job_id, p_owner: 'u:other' }]])
  })
  it('worker calls map to the migration functions with bounded lease and the attempt ceiling', async () => {
    const { s, rpc } = store(fn => (fn === 'mcp_job_claim' ? [{ ...ROW, status: 'running', attempts: 1 }] : fn === 'mcp_job_recover' || fn === 'mcp_job_purge' ? 2 : true))
    expect((await s.claim('w1', 60_000))?.status).toBe('running')
    await s.claim('w1', 10_000_000)
    expect(await s.isLive(ROW.job_id, 'w1')).toBe(true); expect(await s.complete(ROW.job_id, 'w1', { days: [] })).toBe(true)
    expect(await s.fail(ROW.job_id, 'w1', 'provider_unavailable', true)).toBe(true)
    expect(await s.recover()).toBe(2); expect(await s.purge()).toBe(2)
    const byFn = Object.fromEntries(rpc.mock.calls.map(c => [c[0], c[1]]))
    expect(byFn.mcp_job_claim).toMatchObject({ p_lease_seconds: 900 })
    expect(byFn.mcp_job_fail).toMatchObject({ p_max_attempts: JOB_MAX_ATTEMPTS, p_retryable: true })
    expect(byFn.mcp_job_complete).toMatchObject({ p_worker: 'w1', p_result: { days: [] } })
  })
  it('a transport error, an rpc error, a thrown rpc or an unreadable row is JobStoreUnavailable (fail closed), never "not found"', async () => {
    const err = createRpcJobStore({ rpc: async () => ({ data: null, error: { message: 'boom SERPER_KEY=x' } }) })
    const thrown = createRpcJobStore({ rpc: async () => { throw new Error('net') } })
    const bad = store(() => [{ ...ROW, status: 'weird' }]).s
    const bad2 = store(() => [{ ...ROW, job_id: 'job_1' }]).s
    for (const s of [err, thrown]) await expect(s.get(ROW.job_id, 'u:abc')).rejects.toBeInstanceOf(JobStoreUnavailable)
    await expect(bad.get(ROW.job_id, 'u:abc')).rejects.toBeInstanceOf(JobStoreUnavailable)
    await expect(bad2.get(ROW.job_id, 'u:abc')).rejects.toBeInstanceOf(JobStoreUnavailable)
    await expect(store(() => 'yes').s.isLive('x', 'w')).rejects.toBeInstanceOf(JobStoreUnavailable)
    await expect(store(() => 'n').s.recover()).rejects.toBeInstanceOf(JobStoreUnavailable)
  })
  it('the error message of the database never reaches the caller', async () => {
    const s = createRpcJobStore({ rpc: async () => ({ data: null, error: { message: 'secret detail' } }) })
    await expect(s.get(ROW.job_id, 'u:abc')).rejects.toThrow('job_store_unavailable')
  })
})

describe('the migration file (static checks; it has not been applied anywhere)', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261121_mcp_jobs.sql'), 'utf8')
  const FNS = ['mcp_job_create', 'mcp_job_get', 'mcp_job_cancel', 'mcp_job_claim', 'mcp_job_is_live', 'mcp_job_complete', 'mcp_job_fail', 'mcp_job_recover', 'mcp_job_purge']
  it('defines every function the adapter calls, each SECURITY DEFINER with a pinned search_path, revoked from anon and authenticated and granted to service_role only', () => {
    for (const f of FNS) {
      expect(sql, f).toMatch(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${f}\\(`))
      expect(sql, `${f} revoke`).toMatch(new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${f}\\([^)]*\\) FROM PUBLIC, anon, authenticated`))
      expect(sql, `${f} grant`).toMatch(new RegExp(`GRANT\\s+EXECUTE ON FUNCTION public\\.${f}\\([^)]*\\) TO service_role;`))
    }
    expect((sql.match(/SECURITY DEFINER SET search_path = public, pg_temp/g) ?? []).length).toBe(FNS.length)
    const code = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
    expect(code).not.toMatch(/\bTO (anon|authenticated|PUBLIC)\b/i)
  })
  it('the table has row level security on and no access for anon/authenticated', () => {
    expect(sql).toMatch(/ALTER TABLE public\.mcp_jobs ENABLE ROW LEVEL SECURITY/)
    expect(sql).toMatch(/REVOKE ALL ON public\.mcp_jobs FROM PUBLIC, anon, authenticated/)
    expect(sql).not.toMatch(/CREATE POLICY/i)
  })
  it('owner-scoped read and cancel filter on the owner argument; the worker writes only for the owning worker of a running job', () => {
    const body = (name: string) => { const a = sql.indexOf(`FUNCTION public.${name}(`); return sql.slice(a, sql.indexOf('$fn$;', sql.indexOf('AS $fn$', a) + 7)) }
    expect(body('mcp_job_get')).toContain('WHERE job_id = p_job_id AND owner = p_owner')
    expect(body('mcp_job_cancel')).toContain("WHERE job_id = p_job_id AND owner = p_owner AND status IN ('queued', 'running')")
    expect(body('mcp_job_cancel')).toContain('SELECT * INTO r FROM public.mcp_jobs WHERE job_id = p_job_id AND owner = p_owner')
    expect(body('mcp_job_complete')).toContain("WHERE job_id = p_job_id AND worker_id = p_worker AND status = 'running'")
    expect(body('mcp_job_fail')).toContain("WHERE job_id = p_job_id AND worker_id = p_worker AND status = 'running'")
    expect(body('mcp_job_is_live')).toContain("worker_id = p_worker AND status = 'running'")
    expect(sql).toMatch(/FOR UPDATE SKIP LOCKED/)
    expect(sql).toMatch(/pg_advisory_xact_lock/) // idempotent create under concurrency
  })
  it('the job id shape is enforced by the table and matches the TypeScript pattern', () => {
    expect(sql).toContain("job_id ~ '^job_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'")
  })
})
