// One paid dispatch, shared by the Gateway (SYNC tools) and the job worker (itinerary queries): reserve from the MCP External Spend Pool → call the adapter under a deadline and the caller's abort → settle,
// or KEEP the reservation when the outcome is unknown. Nothing paid is ever called without a reservation, and a timeout or an error never refunds (the provider may already have charged).
import type { ToolName, VerifiedClaims } from './connectorContract'
import type { ServiceAdapter, ServiceCall, ServiceOutput } from './serviceMap'
import type { ReserveRefusal, SpendPool } from './spendPool'

export type PaidOutcome =
  | { kind: 'refused'; reason: ReserveRefusal }
  | { kind: 'cancelled_before' }
  | { kind: 'ok'; output: ServiceOutput }
  | { kind: 'error' | 'timeout' | 'aborted' }

type Race<T> = { kind: 'ok'; value: T } | { kind: 'error' } | { kind: 'timeout' } | { kind: 'aborted' }

/** Waits for `p` for at most `ms` and until the caller goes away. It does NOT wait for a provider that ignores cancellation. */
function race<T>(p: Promise<T>, ms: number, signal: AbortSignal | undefined, onGiveUp: () => void): Promise<Race<T>> {
  return new Promise(resolve => {
    let done = false
    const finish = (r: Race<T>) => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', onAbort); if (r.kind !== 'ok' && r.kind !== 'error') onGiveUp(); resolve(r) }
    const timer = setTimeout(() => finish({ kind: 'timeout' }), ms)
    const onAbort = () => finish({ kind: 'aborted' })
    signal?.addEventListener('abort', onAbort, { once: true })
    p.then(value => finish({ kind: 'ok', value }), () => finish({ kind: 'error' }))
  })
}

export async function dispatchPaid(o: {
  pool: SpendPool
  claims: Pick<VerifiedClaims, 'host' | 'installId' | 'principalId'>
  tool: ToolName
  estimateUsd: number
  requestId: string
  adapter: ServiceAdapter
  call: Omit<ServiceCall, 'signal'>
  deadlineMs: number
  signal?: AbortSignal
  /** called when the reservation is kept because the outcome is unknown */
  onUnknownOutcome?: (reason: string) => void
}): Promise<PaidOutcome> {
  const reserved = await o.pool.reserve({ claims: o.claims, tool: o.tool, estimateUsd: o.estimateUsd, requestId: o.requestId })
  if (!reserved.ok) return { kind: 'refused', reason: reserved.reason }
  const reservation = reserved.reservation
  // the caller is already gone: nothing was dispatched, so the whole reservation is given back
  if (o.signal?.aborted) { await reservation.release(); return { kind: 'cancelled_before' } }

  const ac = new AbortController()
  const settled = o.adapter({ ...o.call, signal: ac.signal })
  settled.catch(() => { /* an abandoned call that fails later is not an unhandled rejection */ })
  const r = await race(settled, o.deadlineMs, o.signal, () => ac.abort())
  if (r.kind !== 'ok') {
    reservation.keep(r.kind); o.onUnknownOutcome?.(r.kind)
    return { kind: r.kind }
  }
  await reservation.settle(typeof r.value.costUsd === 'number' ? r.value.costUsd : o.estimateUsd)
  return { kind: 'ok', output: r.value }
}
