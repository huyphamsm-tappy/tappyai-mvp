import { NextResponse } from 'next/server'
import { isAuthorizedCronRequest } from '@/lib/security/cronAuth'
import { mcpGatewayOn } from '@/lib/mcp/gatewayFlag'
import { createSpendPool } from '@/lib/mcp/spendPool'
import { realAdapters, rpcJobStore } from '@/lib/mcp/defaultDeps'
import { composeItinerary } from '@/lib/mcp/itineraryComposer'
import { runJobWorker } from '@/lib/mcp/jobWorker'
import { createMetrics } from '@/lib/mcp/metrics'
import { randomUUID } from 'node:crypto'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

// Remote MCP Gateway job worker trigger (connector doc §13.7). 404 unless MCP_GATEWAY=1 (locked in production); then the cron secret is required; then the persisted store must be enabled
// (MCP_JOBS_ENABLED=1, which is only meaningful once supabase/migrations/20261121_mcp_jobs.sql has been applied by the owner). NOT listed in vercel.json: nothing schedules it yet.
const metrics = createMetrics()
const MAX_JOBS_PER_RUN = 3
const LEASE_MS = 90_000

export async function GET(req: Request) {
  if (!mcpGatewayOn()) return new NextResponse(null, { status: 404 })
  if (!isAuthorizedCronRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const store = rpcJobStore(process.env)
  if (!store) return NextResponse.json({ error: 'jobs_disabled', message: 'MCP_JOBS_ENABLED is not set.' }, { status: 503 })
  const adapters = realAdapters()
  const pool = createSpendPool()
  try {
    const run = await runJobWorker({
      store, workerId: `w-${randomUUID().slice(0, 8)}`, leaseMs: LEASE_MS, maxJobs: MAX_JOBS_PER_RUN, log: e => { console.log(JSON.stringify(e)); metrics.record(e) },
      compose: (job, isLive) => composeItinerary(job, { adapters, pool, isLive }),
    })
    return NextResponse.json({ ok: true, ...run })
  } catch {
    return NextResponse.json({ error: 'worker_failed', message: 'The job store is unavailable.' }, { status: 503 })
  }
}
