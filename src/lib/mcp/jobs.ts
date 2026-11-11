// Job contract for ASYNC MCP work (R13 §14.4, connector doc §13): an application-level job inside a valid MCP result, used because MCP Tasks is NOT negotiated with any Host.
//
// WHAT IS REAL: the contract, the unpredictable id, owner-scoped reads/cancels (a job of another principal does not exist for you), duplicate-submission protection, expiry.
// WHAT IS NOT: the durable store and the worker. There is no queue or job table in the repo (Source Audit §7), and choosing one (a Supabase table + worker, Cloud Run Jobs, another queue) is the owner's decision.
// So the default store is `unavailableJobStore`, which throws and makes the Gateway fail closed (PROVIDER_UNAVAILABLE). The in-memory store below exists for tests ONLY: it is per-instance and not durable.
import { createHash, randomUUID } from 'node:crypto'

export const JOB_POLL_AFTER_MS = 3_000
/** PLACEHOLDER retention (owner has not approved a result retention policy). */
export const JOB_TTL_MS = 60 * 60 * 1000

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'expired'
const TERMINAL: ReadonlySet<JobStatus> = new Set(['succeeded', 'failed', 'cancelled', 'expired'])

export interface JobRecord {
  jobId: string
  ownerPrincipalId: string
  tool: 'create_itinerary'
  status: JobStatus
  createdAt: string
  expiresAt: string
  input: Record<string, unknown>
  /** only ever set by a worker that finished the job; never by the Gateway */
  result?: unknown
}

export interface JobStore {
  /** Creates the job, or returns the existing one for the same principal + same input (duplicate submission). */
  create(i: { ownerPrincipalId: string; tool: 'create_itinerary'; input: Record<string, unknown> }): Promise<JobRecord>
  /** The job, ONLY when `principalId` owns it. Anyone else gets null, the same as for a job that does not exist. */
  get(jobId: string, principalId: string): Promise<JobRecord | null>
  /** Cooperative cancel, owner only. A terminal job is returned unchanged. */
  cancel(jobId: string, principalId: string): Promise<JobRecord | null>
}

export class JobStoreUnavailable extends Error { constructor() { super('job_store_unavailable'); this.name = 'JobStoreUnavailable' } }

const down = async (): Promise<never> => { throw new JobStoreUnavailable() }
export const unavailableJobStore: JobStore = { create: down, get: down, cancel: down }

export const newJobId = (): string => `job_${randomUUID()}`

const canonical = (v: unknown): string => Array.isArray(v) ? `[${v.map(canonical).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v)

/** Same principal + same input (key order ignored) = same fingerprint. Pure. */
export const inputFingerprint = (principalId: string, input: Record<string, unknown>): string => createHash('sha256').update(`${principalId}\n${canonical(input)}`).digest('hex')

export interface JobView { job_id: string; status: JobStatus; created_at: string; poll_after_ms: number; expires_at: string }

/** The handle fields the contract names. An expired job reads as expired whatever its stored status. Pure. */
export function jobView(r: JobRecord, now: Date): JobView {
  const expired = !TERMINAL.has(r.status) && now.getTime() > Date.parse(r.expiresAt)
  return { job_id: r.jobId, status: expired ? 'expired' : r.status, created_at: r.createdAt, poll_after_ms: JOB_POLL_AFTER_MS, expires_at: r.expiresAt }
}

/** TEST-ONLY store: per-instance memory, not durable. */
export function createInMemoryJobStore(now: () => Date = () => new Date()): JobStore {
  const jobs = new Map<string, JobRecord>()
  const byFingerprint = new Map<string, string>()
  return {
    async create(i) {
      const fp = inputFingerprint(i.ownerPrincipalId, i.input)
      const existing = byFingerprint.get(fp)
      if (existing && jobs.has(existing)) return jobs.get(existing) as JobRecord
      const t = now()
      const rec: JobRecord = { jobId: newJobId(), ownerPrincipalId: i.ownerPrincipalId, tool: i.tool, status: 'queued', createdAt: t.toISOString(), expiresAt: new Date(t.getTime() + JOB_TTL_MS).toISOString(), input: i.input }
      jobs.set(rec.jobId, rec); byFingerprint.set(fp, rec.jobId)
      return rec
    },
    async get(jobId, principalId) { const r = jobs.get(jobId); return r && r.ownerPrincipalId === principalId ? r : null },
    async cancel(jobId, principalId) {
      const r = jobs.get(jobId)
      if (!r || r.ownerPrincipalId !== principalId) return null
      if (!TERMINAL.has(r.status)) r.status = 'cancelled'
      return r
    },
  }
}
