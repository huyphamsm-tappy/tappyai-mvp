// Observability counts for the Gateway (connector doc §16): aggregate day counters on the same atomic counter store, under their OWN `mcp:metric:` prefix. They count CALLS, errors, partial results,
// unknown outcomes, latency buckets, clicks and job events. They never count people: no key contains a principal, an installation or a query (tool calls are not unique users, connector doc §16.3).
// Best effort and never in the way: a failing store is swallowed (the spend pool, not this, is what fails closed), and `record` returns immediately.
import { incrDailyCounter, type CounterResult } from '@/lib/security/kvCounter'

type Env = Record<string, string | undefined>
type Incr = (key: string, by: number, env?: NodeJS.ProcessEnv) => Promise<CounterResult>

export const METRIC_PREFIX = 'mcp:metric:'
const SAFE = /^[A-Za-z0-9_]{1,40}$/

export const latencyBucket = (ms: number): 'lt250' | 'lt1000' | 'lt5000' | 'gte5000' => (ms < 250 ? 'lt250' : ms < 1000 ? 'lt1000' : ms < 5000 ? 'lt5000' : 'gte5000')

export interface Metrics {
  /** fire and forget; never throws */
  record(event: Record<string, unknown>): void
  /** waits for the writes started so far (tests, graceful shutdown); never rejects */
  flush(): Promise<void>
  /** the day totals of the named counters (0 for a counter that was never written) */
  read(keys: readonly string[]): Promise<Record<string, number>>
}

const safe = (v: unknown): string | null => (typeof v === 'string' && SAFE.test(v) ? v : null)

export function createMetrics(o: { incr?: Incr; env?: Env } = {}): Metrics {
  const env = (o.env ?? process.env) as NodeJS.ProcessEnv
  const incr: Incr = o.incr ?? ((k, by, e) => incrDailyCounter(k, by, e))
  const pending = new Set<Promise<unknown>>()
  const bump = (name: string) => { const p = incr(`${METRIC_PREFIX}${name}`, 1, env).catch(() => undefined); pending.add(p); void p.finally(() => pending.delete(p)) }

  return {
    record(e) {
      try {
        if (e.type === 'tappyai_mcp_click') { const ch = safe(e.ch); const tool = safe(e.tool); if (ch && tool) bump(`clicks:${ch}:${tool}`); return }
        if (e.type === 'tappyai_mcp_job') { const host = safe(e.host); const ev = safe(e.event); if (host && ev) bump(`jobs:${host}:${ev}`); return }
        if (e.type !== 'tappyai_mcp_call') return
        const host = safe(e.host); const tool = safe(e.tool); const status = safe(e.status)
        if (!host || !tool || !status) return
        bump(`calls:${host}:${tool}:${status}`)
        const code = safe(e.error_code); if (code) bump(`errors:${host}:${code}`)
        if (e.partial === true) bump(`partial:${host}:${tool}`)
        if (e.unknown_outcome === true) bump(`unknown_outcome:${host}:${tool}`)
        if (typeof e.latency_ms === 'number' && Number.isFinite(e.latency_ms)) bump(`latency:${tool}:${latencyBucket(e.latency_ms)}`)
      } catch { /* never in the way */ }
    },
    async flush() { await Promise.allSettled([...pending]) },
    async read(keys) {
      const out: Record<string, number> = {}
      for (const k of keys) { try { out[k] = Math.max(0, (await incr(k, 0, env)).count) } catch { out[k] = 0 } }
      return out
    },
  }
}
