// The persisted job store (supabase/migrations/20261121_mcp_jobs.sql) behind the JobStore and JobWorkerStore ports. Server only. It reaches the table ONLY through the SECURITY DEFINER functions of that
// migration, each of which takes the owner principal and filters on it: there is no table access and no query built here. The migration is a FILE that has not been applied anywhere, so this adapter
// has been exercised against a fake `rpc` only (UNVERIFIED against a real database). Any transport error, malformed row or missing client is JobStoreUnavailable: the Gateway then fails closed.
import { JOB_ID_PATTERN, JOB_MAX_ATTEMPTS, JobStoreUnavailable, inputFingerprint, newJobId, JOB_TTL_MS, type JobRecord, type JobStatus, type JobStore, type JobWorkerStore } from './jobs'

export type Rpc = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> }

const STATUSES: ReadonlySet<string> = new Set(['queued', 'running', 'succeeded', 'failed', 'cancelled'])
const HOSTS: ReadonlySet<string> = new Set(['claude', 'chatgpt', 'gemini'])

function toRecord(row: unknown): JobRecord | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  if (typeof r.job_id !== 'string' || !JOB_ID_PATTERN.test(r.job_id) || typeof r.owner !== 'string' || typeof r.host !== 'string' || !HOSTS.has(r.host)) return null
  if (typeof r.status !== 'string' || !STATUSES.has(r.status) || typeof r.created_at !== 'string' || typeof r.expires_at !== 'string') return null
  if (!r.input || typeof r.input !== 'object' || Array.isArray(r.input)) return null
  return {
    jobId: r.job_id, ownerPrincipalId: r.owner, host: r.host as JobRecord['host'], installId: String(r.install_id ?? ''), tool: 'create_itinerary', status: r.status as JobStatus,
    attempts: typeof r.attempts === 'number' ? r.attempts : 0, createdAt: new Date(r.created_at).toISOString(), expiresAt: new Date(r.expires_at).toISOString(), input: r.input as Record<string, unknown>,
    ...(r.result !== null && r.result !== undefined ? { result: r.result } : {}), ...(typeof r.error_code === 'string' ? { errorCode: r.error_code } : {}),
  }
}

export function createRpcJobStore(db: Rpc): JobStore & JobWorkerStore {
  async function call(fn: string, args: Record<string, unknown>): Promise<unknown> {
    let res: { data: unknown; error: unknown }
    try { res = await db.rpc(fn, args) } catch { throw new JobStoreUnavailable() }
    if (res.error) throw new JobStoreUnavailable()
    return res.data
  }
  const one = (data: unknown): JobRecord | null => {
    const row = Array.isArray(data) ? data[0] : data
    if (row === undefined || row === null) return null
    const rec = toRecord(row)
    if (!rec) throw new JobStoreUnavailable() // a row we cannot read is a broken store, not an absent job
    return rec
  }
  const count = (data: unknown): number => { if (typeof data !== 'number' || !Number.isFinite(data)) throw new JobStoreUnavailable(); return data }
  const bool = (data: unknown): boolean => { if (typeof data !== 'boolean') throw new JobStoreUnavailable(); return data }
  return {
    async create(i) {
      const rec = one(await call('mcp_job_create', { p_job_id: newJobId(), p_owner: i.ownerPrincipalId, p_host: i.host, p_install: i.installId, p_tool: i.tool, p_input: i.input, p_fingerprint: inputFingerprint(i.ownerPrincipalId, i.input), p_ttl_seconds: Math.floor(JOB_TTL_MS / 1000) }))
      if (!rec) throw new JobStoreUnavailable()
      return rec
    },
    async get(jobId, principalId) { return one(await call('mcp_job_get', { p_job_id: jobId, p_owner: principalId })) },
    async cancel(jobId, principalId) { return one(await call('mcp_job_cancel', { p_job_id: jobId, p_owner: principalId })) },
    async claim(workerId, leaseMs) { return one(await call('mcp_job_claim', { p_worker: workerId, p_lease_seconds: Math.max(5, Math.min(900, Math.floor(leaseMs / 1000))) })) },
    async isLive(jobId, workerId) { return bool(await call('mcp_job_is_live', { p_job_id: jobId, p_worker: workerId })) },
    async complete(jobId, workerId, result) { return bool(await call('mcp_job_complete', { p_job_id: jobId, p_worker: workerId, p_result: result })) },
    async fail(jobId, workerId, code, retryable) { return bool(await call('mcp_job_fail', { p_job_id: jobId, p_worker: workerId, p_code: code, p_retryable: retryable, p_max_attempts: JOB_MAX_ATTEMPTS })) },
    async recover() { return count(await call('mcp_job_recover', { p_max_attempts: JOB_MAX_ATTEMPTS })) },
    async purge() { return count(await call('mcp_job_purge', {})) },
  }
}
