import { describe, it, expect, beforeEach } from 'vitest'
import { createMetrics, METRIC_PREFIX, latencyBucket } from './metrics'
import { __resetKvCounters } from '@/lib/security/kvCounter'

beforeEach(() => __resetKvCounters())
const ev = (o: Record<string, unknown> = {}) => ({ type: 'tappyai_mcp_call', tool: 'search_places', host: 'claude', status: 'success', execution_mode: 'SYNC', latency_ms: 120, result_count: 5, principal_ref: 'abc123', install_ref: 'def456', ...o })

describe('observability counts (aggregate counters; no person is counted)', () => {
  it('counts calls by host, tool and status, errors by code, partial results, unknown outcomes and latency buckets', async () => {
    const keys: string[] = []
    const m = createMetrics({ incr: async (k, by) => { keys.push(`${k}|${by}`); return { count: by, scope: 'instance' as const } } })
    m.record(ev()); m.record(ev({ status: 'error', error_code: 'DEADLINE_EXCEEDED', unknown_outcome: true, latency_ms: 12_000 })); m.record(ev({ status: 'success', partial: true }))
    await m.flush()
    const joined = keys.join('\n')
    expect(joined).toContain(`${METRIC_PREFIX}calls:claude:search_places:success|1`)
    expect(joined).toContain(`${METRIC_PREFIX}calls:claude:search_places:error|1`)
    expect(joined).toContain(`${METRIC_PREFIX}errors:claude:DEADLINE_EXCEEDED|1`)
    expect(joined).toContain(`${METRIC_PREFIX}unknown_outcome:claude:search_places|1`)
    expect(joined).toContain(`${METRIC_PREFIX}partial:claude:search_places|1`)
    expect(joined).toContain(`${METRIC_PREFIX}latency:search_places:lt250|1`); expect(joined).toContain(`${METRIC_PREFIX}latency:search_places:gte5000|1`)
  })
  it('no key carries a principal, an installation or a query: tool calls are never unique users', async () => {
    const keys: string[] = []
    const m = createMetrics({ incr: async (k, by) => { keys.push(k); return { count: by, scope: 'instance' as const } } })
    m.record(ev({ query: 'bí mật' })); await m.flush()
    for (const k of keys) { expect(k.startsWith(METRIC_PREFIX)).toBe(true); expect(k).not.toMatch(/abc123|def456|bí mật|user|principal|install/i) }
  })
  it('keys live under mcp:, apart from every Web/App counter', async () => {
    const keys: string[] = []
    const m = createMetrics({ incr: async (k, by) => { keys.push(k); return { count: by, scope: 'instance' as const } } })
    m.record(ev()); await m.flush()
    expect(METRIC_PREFIX.startsWith('mcp:')).toBe(true)
    for (const k of keys) expect(k).not.toMatch(/^ai:cost:|^serper|^chat:/)
  })
  it('is best effort: a failing or slow store never throws into the caller', async () => {
    const m = createMetrics({ incr: async () => { throw new Error('store down') } })
    expect(() => m.record(ev())).not.toThrow()
    await expect(m.flush()).resolves.toBeUndefined()
    const sync = createMetrics({ incr: (() => { throw new Error('sync boom') }) as never })
    expect(() => sync.record(ev())).not.toThrow()
  })
  it('ignores events that are not Gateway call events or lack a tool/host (no garbage keys)', async () => {
    const keys: string[] = []
    const m = createMetrics({ incr: async (k, by) => { keys.push(k); return { count: by, scope: 'instance' as const } } })
    m.record({ type: 'other' }); m.record(ev({ tool: undefined })); m.record(ev({ host: 'evil:host' })); m.record(ev({ tool: 'x'.repeat(100) })); await m.flush()
    expect(keys).toEqual([])
  })
  it('click and job events are counted without any identity', async () => {
    const keys: string[] = []
    const m = createMetrics({ incr: async (k, by) => { keys.push(k); return { count: by, scope: 'instance' as const } } })
    m.record({ type: 'tappyai_mcp_click', ch: 'claude_mcp', tool: 'search_hotels' }); m.record({ type: 'tappyai_mcp_job', event: 'job_succeeded', host: 'claude' }); await m.flush()
    expect(keys).toContain(`${METRIC_PREFIX}clicks:claude_mcp:search_hotels`); expect(keys).toContain(`${METRIC_PREFIX}jobs:claude:job_succeeded`)
  })
  it('read-back returns the day totals of the counters it wrote, and 0 for the rest', async () => {
    const m = createMetrics({ env: {} })
    m.record(ev()); m.record(ev()); await m.flush()
    expect(await m.read([`${METRIC_PREFIX}calls:claude:search_places:success`, `${METRIC_PREFIX}calls:chatgpt:search_places:success`])).toEqual({ [`${METRIC_PREFIX}calls:claude:search_places:success`]: 2, [`${METRIC_PREFIX}calls:chatgpt:search_places:success`]: 0 })
  })
  it('latency buckets', () => { expect([latencyBucket(10), latencyBucket(249), latencyBucket(250), latencyBucket(999), latencyBucket(1000), latencyBucket(4999), latencyBucket(5000)]).toEqual(['lt250', 'lt250', 'lt1000', 'lt1000', 'lt5000', 'lt5000', 'gte5000']) })
})
