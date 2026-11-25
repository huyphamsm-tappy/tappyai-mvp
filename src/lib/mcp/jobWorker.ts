// The job worker (connector doc §13.7): claim → compose → complete/fail, independent of any HTTP request or Host connection. One run = recover dead leases, purge expired rows, then up to `maxJobs` jobs.
// It holds no state in memory: everything lives in the store, so a crash between steps leaves a running job with a lease that `recover` hands back. A cancel, expiry or takeover is noticed through
// `isLive` (cooperative: a provider call already in flight is not recalled, its reservation stays counted), and a result is written only if this worker still owns the running job.
// WHAT IS NOT DONE: nothing schedules this. vercel.json is untouched (Hobby crons are daily); the route is a trigger for a scheduler the owner chooses.
import type { ComposeOutcome } from './itineraryComposer'
import type { JobRecord, JobStore, JobWorkerStore } from './jobs'

export interface WorkerRun { recovered: number; purged: number; processed: number; succeeded: number; failed: number; requeued: number; cancelled: number; lost: number }

export async function runJobWorker(o: {
  store: JobStore & JobWorkerStore
  compose: (job: JobRecord, isLive: () => Promise<boolean>) => Promise<ComposeOutcome>
  workerId: string
  leaseMs: number
  maxJobs: number
  log: (e: Record<string, unknown>) => void
}): Promise<WorkerRun> {
  const run: WorkerRun = { recovered: await o.store.recover(), purged: await o.store.purge(), processed: 0, succeeded: 0, failed: 0, requeued: 0, cancelled: 0, lost: 0 }
  for (let i = 0; i < o.maxJobs; i++) {
    const job = await o.store.claim(o.workerId, o.leaseMs)
    if (!job) break
    run.processed++
    let out: ComposeOutcome
    try { out = await o.compose(job, () => o.store.isLive(job.jobId, o.workerId)) } catch { out = { ok: false, code: 'provider_unavailable', retryable: true } }
    let event = 'job_lost'
    if (out.ok) {
      if (await o.store.complete(job.jobId, o.workerId, out.result)) { run.succeeded++; event = 'job_succeeded' } else run.lost++
    } else if (out.code === 'cancelled') {
      run.cancelled++; event = 'job_cancelled'
    } else {
      const wrote = await o.store.fail(job.jobId, o.workerId, out.code, out.retryable)
      if (!wrote) run.lost++
      else if (out.retryable && job.attempts < 3) { run.requeued++; event = 'job_requeued' } else { run.failed++; event = 'job_failed' }
    }
    o.log({ type: 'tappyai_mcp_job', event, job_ref: job.jobId.slice(-8), attempts: job.attempts, host: job.host })
  }
  return run
}
