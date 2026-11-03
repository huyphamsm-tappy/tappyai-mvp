import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { webSearch } from './common'
import type { ParallelSearchOutcome } from './parallelClient'

// CONSULT_PARALLEL (owner 30/10): web_search falls back to Parallel Search when Serper gives no rows (measured 30/10: an exhausted Serper
// account answered HTTP 400 "credits" for every search, and every answer said "the search tool failed"). Mock-only: fetch is stubbed.

let serperStatus = 200
let serperOrganic: unknown[] = []
const sent: string[] = []

beforeEach(() => {
  serperStatus = 200
  serperOrganic = []
  sent.length = 0
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    const url = typeof input === 'string' ? input : String((input as { url?: string })?.url ?? input)
    sent.push(url)
    if (url.includes('serper.dev/search')) return new Response(JSON.stringify(serperStatus === 200 ? { organic: serperOrganic } : { message: 'Not enough credits' }), { status: serperStatus })
    return new Response('<html></html>', { status: 200 })
  }))
  process.env.SERPER_API_KEY = 'test-key-not-a-real-secret'
})
afterEach(() => { vi.unstubAllGlobals() })

const rows = [{ title: 'Binance sự cố an ninh', link: 'https://news.example/binance', snippet: 'Binance xác nhận…', date: '2026-10-30' }]

describe('web_search · Parallel Search fallback', () => {
  it('Serper refused (HTTP 400, no credits): the Parallel rows are the result, named as such; DuckDuckGo is not called', async () => {
    serperStatus = 400
    const parallelSearch = vi.fn(async (): Promise<ParallelSearchOutcome> => ({ ok: true, rows }))
    const r = await webSearch('binance hack parallel case one', 'vi', { parallelSearch }) as Record<string, unknown>
    expect(parallelSearch).toHaveBeenCalledWith('binance hack parallel case one')
    expect(r.source).toBe('Parallel')
    expect(r.results).toEqual(rows)
    expect(r.provider_status).toBeUndefined()
    expect(sent.some(u => u.includes('duckduckgo'))).toBe(false)
  })
  it('Serper answered with no rows: Parallel is tried too', async () => {
    const parallelSearch = vi.fn(async (): Promise<ParallelSearchOutcome> => ({ ok: true, rows }))
    const r = await webSearch('binance hack parallel case two', 'vi', { parallelSearch }) as Record<string, unknown>
    expect(parallelSearch).toHaveBeenCalledTimes(1)
    expect(r.source).toBe('Parallel')
  })
  it('Serper has rows: Parallel is never called', async () => {
    serperOrganic = [{ title: 'A', link: 'https://a.example/x', snippet: 's' }]
    const parallelSearch = vi.fn(async (): Promise<ParallelSearchOutcome> => ({ ok: true, rows }))
    const r = await webSearch('binance hack parallel case three', 'vi', { parallelSearch }) as Record<string, unknown>
    expect(parallelSearch).not.toHaveBeenCalled()
    expect(r.source).toBe('Google (Serper)')
  })
  it('Parallel fails or finds nothing: the result is what it was without Parallel (the provider failure is still said)', async () => {
    serperStatus = 400
    const failed = vi.fn(async (): Promise<ParallelSearchOutcome> => ({ ok: false, rows: [], reason: 'timeout' }))
    const r = await webSearch('binance hack parallel case four', 'vi', { parallelSearch: failed }) as Record<string, unknown>
    expect(failed).toHaveBeenCalledTimes(1)
    expect(r.source).not.toBe('Parallel')
    const empty = vi.fn(async (): Promise<ParallelSearchOutcome> => ({ ok: true, rows: [] }))
    const r2 = await webSearch('binance hack parallel case five', 'vi', { parallelSearch: empty }) as Record<string, unknown>
    expect(r2.source).not.toBe('Parallel')
  })
  it('no Parallel given: HEAD behaviour (nothing new is called)', async () => {
    serperStatus = 400
    const r = await webSearch('binance hack parallel case six', 'vi') as Record<string, unknown>
    expect(r.source).not.toBe('Parallel')
    expect(sent.every(u => !u.includes('parallel.ai'))).toBe(true)
  })
})
