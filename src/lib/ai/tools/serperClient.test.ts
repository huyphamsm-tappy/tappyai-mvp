// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { serperAdmit, serperPost, serperDailyCeiling, __resetSerperAlerts, SERPER_CEILING_KEY } from './serperClient'
import { serperSnapshot } from './serperMeter'
import { incrDailyCounter, __resetKvCounters } from '@/lib/security/kvCounter'

// ─────────────────────────────────────────────────────────────────────────────
// A2 — THE SERPER DAILY CREDIT CEILING.
//
// One door for every paid Serper call, one shared daily counter (KV when configured, in-process
// otherwise — NOT production safe as a global cap, and it says so), credits added BEFORE the call
// so a burst cannot slip through, an ERROR alert once per day at the ceiling and a warning at
// 80 %. Over the ceiling the call is refused (null) and the tool degrades; the turn still answers.
// ─────────────────────────────────────────────────────────────────────────────

const env = (ceiling: string) => ({ SERPER_DAILY_CREDIT_CEILING: ceiling } as unknown as NodeJS.ProcessEnv)

beforeEach(() => { __resetKvCounters(); __resetSerperAlerts() })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe('serperAdmit', () => {
  it('counts credits as billed (maps 3, the rest 1) and refuses once today is over the ceiling', async () => {
    const e = env('7')
    expect(await serperAdmit('maps', e)).toBe(true)   // 3
    expect(await serperAdmit('maps', e)).toBe(true)   // 6
    expect(await serperAdmit('search', e)).toBe(true) // 7 — at the ceiling, still admitted
    expect(await serperAdmit('images', e)).toBe(false) // 8 > 7
    expect(await serperAdmit('maps', e)).toBe(false)
  })
  it('logs ONE error alert per day at the ceiling and one warning at 80 %, with the counter scope', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const e = env('10')
    for (let i = 0; i < 12; i++) await serperAdmit('search', e)
    const alerts = err.mock.calls.map(c => JSON.parse(String(c[0])) as { type: string; alert: string; scope: string })
    expect(alerts.filter(a => a.alert === 'serper_daily_ceiling')).toHaveLength(1)
    expect(alerts[0].scope).toBe('instance')
    const warns = warn.mock.calls.map(c => JSON.parse(String(c[0])) as { alert: string })
    expect(warns.filter(w => w.alert === 'serper_daily_ceiling_80pct')).toHaveLength(1)
  })
  it('the default ceiling is 15,000 credits; the env overrides it', () => {
    expect(serperDailyCeiling({} as unknown as NodeJS.ProcessEnv)).toBe(15_000)
    expect(serperDailyCeiling(env('500'))).toBe(500)
    expect(serperDailyCeiling(env('abc'))).toBe(15_000)
  })
})

describe('serperPost', () => {
  it('under the ceiling: records the call and fetches the endpoint with the key; over it: null and NO fetch', async () => {
    vi.stubEnv('SERPER_DAILY_CREDIT_CEILING', '3')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
    const before = serperSnapshot()
    const ok = await serperPost('maps', 'k', { q: 'x' }, 1000)
    expect(ok?.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://google.serper.dev/maps')
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ 'X-API-KEY': 'k' })
    expect(serperSnapshot().maps - before.maps).toBe(1)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const refused = await serperPost('maps', 'k', { q: 'y' }, 1000)
    expect(refused).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(serperSnapshot().maps - before.maps).toBe(1)
  })
})

describe('the shared daily counter', () => {
  it('without a store: per instance, keyed by the VN day, and says so', async () => {
    const r1 = await incrDailyCounter('t:x', 2, {} as unknown as NodeJS.ProcessEnv)
    const r2 = await incrDailyCounter('t:x', 3, {} as unknown as NodeJS.ProcessEnv)
    expect(r1).toEqual({ count: 2, scope: 'instance' })
    expect(r2).toEqual({ count: 5, scope: 'instance' })
  })
  it('with a store: INCRBY + EXPIRE NX through the pipeline; a store that does not answer falls back to the instance count and says store_down', async () => {
    const e = { KV_REST_API_URL: 'https://kv.test', KV_REST_API_TOKEN: 't' } as unknown as NodeJS.ProcessEnv
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([{ result: 42 }, { result: 1 }]), { status: 200 }))
    const r = await incrDailyCounter(SERPER_CEILING_KEY, 3, e)
    expect(r).toEqual({ count: 42, scope: 'distributed' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://kv.test/pipeline')
    const cmds = JSON.parse(String((init as RequestInit).body)) as string[][]
    expect(cmds[0][0]).toBe('INCRBY'); expect(cmds[0][1]).toMatch(/^local:serper:credits:\d{4}-\d{2}-\d{2}$/); expect(cmds[0][2]).toBe('3')
    expect(cmds[1].slice(0, 1)).toEqual(['EXPIRE']); expect(cmds[1][3]).toBe('NX')
    fetchMock.mockResolvedValue(new Response('down', { status: 503 }))
    const down = await incrDailyCounter(SERPER_CEILING_KEY, 3, e)
    expect(down.scope).toBe('store_down')
    expect(down.count).toBe(6) // the local shadow kept counting: 3 mirrored from the store call + 3 now
  })
})

describe('every paid Serper call goes through the one door', () => {
  it('no file fetches google.serper.dev except serperClient.ts (the debug route is exempt: dev-only, gated)', () => {
    const files = ['src/lib/ai/tools/common.ts', 'src/lib/ai/tools/serperPlaces.ts', 'src/app/api/cron/price-check/route.ts', 'src/app/api/chat/route.ts']
    for (const f of files) expect(readFileSync(f, 'utf8'), f).not.toContain('google.serper.dev')
    expect(readFileSync('src/lib/ai/tools/serperClient.ts', 'utf8')).toContain('https://google.serper.dev/${endpoint}')
  })
})
