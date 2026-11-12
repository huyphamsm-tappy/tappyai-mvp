// Job contract for ASYNC MCP work (R13 §14.4, connector doc §13): an application-level job inside a valid MCP result, used because MCP Tasks is NOT negotiated with any Host.
//
// Three implementations of the same two ports (JobStore for the Gateway, JobWorkerStore for the worker):
//   · createRpcJobStore (jobsRpc.ts)  the persisted one: supabase/migrations/20261121_mcp_jobs.sql. The migration is a FILE: it has not been applied anywhere, so this store is UNVERIFIED against a real database.
//   · createInMemoryJobStore (below)  per-instance memory, NOT durable, used by tests as the reference semantics the SQL is written to match.
//   · unavailableJobStore             the default: throws, so the Gateway fails closed (PROVIDER_UNAVAILABLE).
// Semantics (both stores): unpredictable id; an owner-scoped read/cancel (a job of another principal does not exist for you); duplicate submission by the same owner + same input returns the live job;
// cancel is immediate in the store and cooperative in the worker; a worker whose lease ran out loses the job (recover); a worker that no longer owns a running job cannot write a result; expiry deletes.
import { createHash, randomUUID } from 'node:crypto'
import type { HostPlatform } from './connectorContract'

export const JOB_POLL_AFTER_MS = 3_000
/** PLACEHOLDER retention (the owner has not approved a result retention policy). */
export const JOB_TTL_MS = 60 * 60 * 1000
export const JOB_MAX_ATTEMPTS = 3

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'expired'
const TERMINAL: ReadonlySet<JobStatus> = new Set(['succeeded', 'failed', 'cancelled', 'expired'])

export interface JobRecord {
  jobId: string
  ownerPrincipalId: string
  /** where the job came from: needed so the worker can charge the right External Spend Pool allocation */
  host: HostPlatform
  installId: string
  tool: 'create_itinerary'
  status: JobStatus
  attempts: number
  createdAt: string
  expiresAt: string
  input: Record<string, unknown>
  /** only ever set by a worker that finished the job; never by the Gateway */
  result?: unknown
  errorCode?: string
}

export interface JobCreate { ownerPrincipalId: string; host: HostPlatform; installId: string; tool: 'create_itinerary'; input: Record<string, unknown> }

export interface JobStore {
  /** Creates the job, or returns the live one for the same owner + same input (duplicate submission). */
  create(i: JobCreate): Promise<JobRecord>
  /** The job, ONLY when `principalId` owns it. Anyone else gets null, the same as for a job that does not exist. */
  get(jobId: string, principalId: string): Promise<JobRecord | null>
  /** Owner only. queued/running become cancelled; a finished job is returned unchanged. */
  cancel(jobId: string, principalId: string): Promise<JobRecord | null>
}

export interface JobWorkerStore {
  /** Takes the oldest live queued job under a lease, or null. */
  claim(workerId: string, leaseMs: number): Promise<JobRecord | null>
  /** Still running, still mine, not expired? False after a cancel, an expiry or a lease taken over. */
  isLive(jobId: string, workerId: string): Promise<boolean>
  /** true only when this worker still owned the running job and the result was written. */
  complete(jobId: string, workerId: string, result: unknown): Promise<boolean>
  /** retryable and attempts left = back to the queue; otherwise failed. */
  fail(jobId: string, workerId: string, code: string, retryable: boolean): Promise<boolean>
  /** running jobs whose lease ran out go back to the queue (or fail after max attempts); returns how many. */
  recover(): Promise<number>
  /** deletes expired jobs; returns how many. */
  purge(): Promise<number>
}

export class JobStoreUnavailable extends Error { constructor() { super('job_store_unavailable'); this.name = 'JobStoreUnavailable' } }

const down = async (): Promise<never> => { throw new JobStoreUnavailable() }
export const unavailableJobStore: JobStore & JobWorkerStore = { create: down, get: down, cancel: down, claim: down, isLive: down, complete: down, fail: down, recover: down, purge: down }

export const newJobId = (): string => `job_${randomUUID()}`
export const JOB_ID_PATTERN = /^job_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const canonical = (v: unknown): string => Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v)

/** Same principal + same input (key order ignored) = same fingerprint. Pure. */
export const inputFingerprint = (principalId: string, input: Record<string, unknown>): string => createHash('sha256').update(`${principalId}\n${canonical(input)}`).digest('hex')

export interface JobView { job_id: string; status: JobStatus; created_at: string; poll_after_ms: number; expires_at: string }

/** The handle fields the contract names. A job past its expiry that never finished reads as expired. Pure. */
export function jobView(r: JobRecord, now: Date): JobView {
  const expired = !TERMINAL.has(r.status) && now.getTime() > Date.parse(r.expiresAt)
  return { job_id: r.jobId, status: expired ? 'expired' : r.status, created_at: r.createdAt, poll_after_ms: JOB_POLL_AFTER_MS, expires_at: r.expiresAt }
}

/** TEST-ONLY store with the reference semantics: per-instance memory, not durable. */
export function createInMemoryJobStore(now: () => Date = () => new Date()): JobStore & JobWorkerStore {
  type Row = JobRecord & { fingerprint: string; workerId?: string; leaseUntil?: number; updatedAt: string }
  const jobs = new Map<string, Row>()
  const live = (r: Row) => Date.parse(r.expiresAt) > now().getTime()
  const pub = (r: Row): JobRecord => { const { fingerprint: _f, workerId: _w, leaseUntil: _l, updatedAt: _u, ...rest } = r; return rest }
  const touch = (r: Row) => { r.updatedAt = now().toISOString() }
  return {
    async create(i) {
      const fp = inputFingerprint(i.ownerPrincipalId, i.input)
      const existing = [...jobs.values()].filter(r => r.ownerPrincipalId === i.ownerPrincipalId && r.fingerprint === fp && live(r)).pop()
      if (existing) return pub(existing)
      const t = now()
      const r: Row = { jobId: newJobId(), ownerPrincipalId: i.ownerPrincipalId, host: i.host, installId: i.installId, tool: i.tool, status: 'queued', attempts: 0, createdAt: t.toISOString(), expiresAt: new Date(t.getTime() + JOB_TTL_MS).toISOString(), input: i.input, fingerprint: fp, updatedAt: t.toISOString() }
      jobs.set(r.jobId, r)
      return pub(r)
    },
    async get(jobId, principalId) { const r = jobs.get(jobId); return r && r.ownerPrincipalId === principalId ? pub(r) : null },
    async cancel(jobId, principalId) {
      const r = jobs.get(jobId)
      if (!r || r.ownerPrincipalId !== principalId) return null
      if (r.status === 'queued' || r.status === 'running') { r.status = 'cancelled'; r.workerId = undefined; r.leaseUntil = undefined; touch(r) }
      return pub(r)
    },
    async claim(workerId, leaseMs) {
      const r = [...jobs.values()].filter(x => x.status === 'queued' && live(x)).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.createdAt.localeCompare(b.createdAt))[0]
      if (!r) return null
      r.status = 'running'; r.workerId = workerId; r.leaseUntil = now().getTime() + leaseMs; r.attempts += 1; touch(r)
      return pub(r)
    },
    async isLive(jobId, workerId) { const r = jobs.get(jobId); return !!r && r.status === 'running' && r.workerId === workerId && live(r) },
    async complete(jobId, workerId, result) {
      const r = jobs.get(jobId)
      if (!r || r.status !== 'running' || r.workerId !== workerId) return false
      r.status = 'succeeded'; r.result = result; r.workerId = undefined; r.leaseUntil = undefined; touch(r)
      return true
    },
    async fail(jobId, workerId, code, retryable) {
      const r = jobs.get(jobId)
      if (!r || r.status !== 'running' || r.workerId !== workerId) return false
      r.status = retryable && r.attempts < JOB_MAX_ATTEMPTS ? 'queued' : 'failed'; r.errorCode = code.slice(0, 60); r.workerId = undefined; r.leaseUntil = undefined; touch(r)
      return true
    },
    async recover() {
      let n = 0
      for (const r of jobs.values()) {
        if (r.status === 'running' && (r.leaseUntil ?? 0) < now().getTime()) {
          if (r.attempts < JOB_MAX_ATTEMPTS) r.status = 'queued'; else { r.status = 'failed'; r.errorCode = 'worker_lost' }
          r.workerId = undefined; r.leaseUntil = undefined; touch(r); n++
        }
      }
      return n
    },
    async purge() {
      let n = 0
      for (const [id, r] of jobs) if (Date.parse(r.expiresAt) < now().getTime() - 3_600_000) { jobs.delete(id); n++ }
      return n
    },
  }
}
