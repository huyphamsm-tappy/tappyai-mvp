import { describe, it, expect, beforeEach } from 'vitest'
import { createSpendPool, TOOL_RESERVE_USD } from './spendPool'
import { __resetKvCounters, incrDailyCounter } from '@/lib/security/kvCounter'
import { reserveTurnCost, dayCostMicros } from '@/lib/ai/cost/costGate'
import type { VerifiedClaims } from './connectorContract'

const WEB_USER = '11111111-2222-4333-8444-555555555555'
const CAPS = { MCP_POOL_DAILY_USD: '0.10', MCP_POOL_HOST_USD: '0.05', MCP_POOL_INSTALL_USD: '0.03', MCP_POOL_PRINCIPAL_USD: '0.02', MCP_POOL_TOOL_USD: '0.04', MCP_POOL_REQUEST_USD: '0.5' }
const who = (o: Partial<Pick<VerifiedClaims, 'host' | 'installId' | 'principalId'>> = {}) => ({ host: 'claude' as const, installId: 'inst-1', principalId: 'p-1', ...o })
const micros = (usd: number) => Math.round(usd * 1_000_000)

beforeEach(() => __resetKvCounters())

describe('MCP External Spend Pool', () => {
  it('refuses every paid call when no cap is configured (no default cap to fall back on)', async () => {
    const r = await createSpendPool({ env: {} }).reserve({ claims: who(), tool: 'search_places', estimateUsd: 0.01, requestId: 'r1' })
    expect(r).toMatchObject({ ok: false, reason: 'no_caps' })
  })
  it('an invalid cap (negative, NaN, text) counts as no cap', async () => {
    for (const bad of ['-1', 'abc', '0', '']) {
      const r = await createSpendPool({ env: { ...CAPS, MCP_POOL_DAILY_USD: bad } }).reserve({ claims: who(), tool: 'search_places', estimateUsd: 0.001, requestId: 'r' })
      expect(r.ok).toBe(false)
    }
  })
  it('reserves, and settle replaces the reservation by the real cost', async () => {
    const pool = createSpendPool({ env: CAPS })
    const r = await pool.reserve({ claims: who(), tool: 'search_places', estimateUsd: 0.01, requestId: 'r1' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect((await incrDailyCounter('mcp:pool:x', 0)).count).toBe(0)
    await r.reservation.settle(0.004)
    const next = await pool.reserve({ claims: who(), tool: 'search_places', estimateUsd: 0, requestId: 'r2' })
    expect(next.ok).toBe(true)
  })
  it('release gives the whole reservation back', async () => {
    const pool = createSpendPool({ env: CAPS })
    const a = await pool.reserve({ claims: who(), tool: 'search_places', estimateUsd: 0.02, requestId: 'a' })
    expect(a.ok).toBe(true); if (!a.ok) return
    const blocked = await pool.reserve({ claims: who(), tool: 'search_places', estimateUsd: 0.01, requestId: 'b' })
    expect(blocked).toMatchObject({ ok: false, reason: 'budget_exceeded' }) // principal cap 0.02 already held
    await a.reservation.release()
    const again = await pool.reserve({ claims: who(), tool: 'search_places', estimateUsd: 0.02, requestId: 'c' })
    expect(again.ok).toBe(true)
  })
  it('a level that is over its cap refuses and gives back every level it had already taken (no leak into the other counters)', async () => {
    const pool = createSpendPool({ env: CAPS })
    const over = await pool.reserve({ claims: who(), tool: 'search_places', estimateUsd: 0.025, requestId: 'x' }) // principal cap is 0.02
    expect(over).toMatchObject({ ok: false, reason: 'budget_exceeded' })
    // the pool / host / install counters must be back at zero: a different principal can still use the whole host cap
    const other = await pool.reserve({ claims: who({ principalId: 'p-2', installId: 'inst-2' }), tool: 'search_places', estimateUsd: 0.02, requestId: 'y' })
    expect(other.ok).toBe(true)
  })
  it('each tier is enforced: per-host, per-install, per-tool, global', async () => {
    const pool = createSpendPool({ env: CAPS })
    // install cap 0.03: two principals on one install
    expect((await pool.reserve({ claims: who({ principalId: 'a' }), tool: 'search_places', estimateUsd: 0.02, requestId: '1' })).ok).toBe(true)
    expect(await pool.reserve({ claims: who({ principalId: 'b' }), tool: 'search_places', estimateUsd: 0.02, requestId: '2' })).toMatchObject({ ok: false, reason: 'budget_exceeded' })
    // host cap 0.05 across installs of one host
    expect((await pool.reserve({ claims: who({ principalId: 'c', installId: 'i2' }), tool: 'search_shopping', estimateUsd: 0.02, requestId: '3' })).ok).toBe(true)
    expect(await pool.reserve({ claims: who({ principalId: 'd', installId: 'i3' }), tool: 'search_hotels', estimateUsd: 0.02, requestId: '4' })).toMatchObject({ ok: false })
    // another host is not blocked by claude's host cap
    expect((await pool.reserve({ claims: who({ host: 'chatgpt', principalId: 'e', installId: 'i4' }), tool: 'search_hotels', estimateUsd: 0.02, requestId: '5' })).ok).toBe(true)
  })
  it('a per-request ceiling refuses one expensive call before anything is counted', async () => {
    const pool = createSpendPool({ env: { ...CAPS, MCP_POOL_REQUEST_USD: '0.005' } })
    expect(await pool.reserve({ claims: who(), tool: 'search_places', estimateUsd: 0.01, requestId: 'r' })).toMatchObject({ ok: false, reason: 'request_ceiling' })
  })
  it('concurrent requests competing for one budget never over-admit', async () => {
    const pool = createSpendPool({ env: { ...CAPS, MCP_POOL_PRINCIPAL_USD: '0.05', MCP_POOL_INSTALL_USD: '0.05', MCP_POOL_HOST_USD: '0.05', MCP_POOL_TOOL_USD: '0.05', MCP_POOL_DAILY_USD: '0.05' } })
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => pool.reserve({ claims: who(), tool: 'search_places', estimateUsd: 0.01, requestId: `c${i}` })))
    expect(rs.filter(r => r.ok).length).toBe(5)
  })
  it('FAILS CLOSED when the counter store is down: no spend, and nothing stays counted', async () => {
    const calls: Array<[string, number]> = []
    const incr = async (key: string, by: number) => { calls.push([key, by]); return { count: 0, scope: 'store_down' as const } }
    const r = await createSpendPool({ env: CAPS, incr }).reserve({ claims: who(), tool: 'search_places', estimateUsd: 0.01, requestId: 'r' })
    expect(r).toMatchObject({ ok: false, reason: 'store_unavailable' })
    expect(calls.reduce((s, [, by]) => s + by, 0)).toBe(0)
  })
  it('in a production runtime a per-instance counter is not a pool: refused as store_unavailable', async () => {
    const r = await createSpendPool({ env: { ...CAPS, VERCEL_ENV: 'production' } }).reserve({ claims: who(), tool: 'search_places', estimateUsd: 0.01, requestId: 'r' })
    expect(r).toMatchObject({ ok: false, reason: 'store_unavailable' })
  })
  it('keep() (unknown outcome) leaves the reservation counted, never refunds it', async () => {
    const pool = createSpendPool({ env: CAPS })
    const a = await pool.reserve({ claims: who(), tool: 'search_places', estimateUsd: 0.02, requestId: 'a' })
    expect(a.ok).toBe(true); if (!a.ok) return
    a.reservation.keep('deadline')
    await a.reservation.release() // a later release must not undo a kept reservation
    expect(await pool.reserve({ claims: who(), tool: 'search_places', estimateUsd: 0.01, requestId: 'b' })).toMatchObject({ ok: false })
  })
  it('settle and release act once only', async () => {
    const pool = createSpendPool({ env: CAPS })
    const a = await pool.reserve({ claims: who(), tool: 'search_places', estimateUsd: 0.01, requestId: 'a' })
    expect(a.ok).toBe(true); if (!a.ok) return
    await a.reservation.release(); await a.reservation.release(); await a.reservation.settle(0.5)
    const b = await pool.reserve({ claims: who(), tool: 'search_places', estimateUsd: 0.02, requestId: 'b' })
    expect(b.ok).toBe(true)
  })
})

describe('isolation from the Web/App allocation', () => {
  it('every MCP counter key lives under mcp: and none is a Web/App key', async () => {
    const keys: string[] = []
    const incr = async (key: string, by: number) => { keys.push(key); return { count: by, scope: 'instance' as const } }
    await createSpendPool({ env: CAPS, incr }).reserve({ claims: who(), tool: 'search_places', estimateUsd: 0.001, requestId: 'r' })
    expect(keys.length).toBeGreaterThanOrEqual(5)
    for (const k of keys) { expect(k.startsWith('mcp:')).toBe(true); expect(k).not.toMatch(/^ai:cost:|^serper|^chat:/) }
  })
  it('an MCP reservation does not move a Web/App account day total, and a Web/App turn does not use up the MCP pool', async () => {
    const pool = createSpendPool({ env: CAPS })
    const m = await pool.reserve({ claims: who(), tool: 'search_places', estimateUsd: 0.02, requestId: 'm' })
    expect(m.ok).toBe(true)
    expect(await dayCostMicros(WEB_USER, {})).toBe(0)
    const web = await reserveTurnCost({ userId: WEB_USER, tier: 'pro', mode: 'deep', env: {} })
    expect(web.ok).toBe(true)
    expect(await dayCostMicros(WEB_USER, {})).toBe(micros(0.25))
    // MCP principal cap (0.02) is still exactly used by the first reservation, unaffected by the web turn
    expect(await pool.reserve({ claims: who(), tool: 'search_places', estimateUsd: 0.001, requestId: 'm2' })).toMatchObject({ ok: false, reason: 'budget_exceeded' })
  })
  it('has a conservative placeholder reservation for each paid tool', () => {
    for (const [t, usd] of Object.entries(TOOL_RESERVE_USD)) { expect(usd, t).toBeGreaterThan(0); expect(usd, t).toBeLessThan(1) }
  })
})
