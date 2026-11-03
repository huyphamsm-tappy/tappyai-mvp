import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { serperShopping, __clearToolCache } from './common'
import { serperSnapshot, serperDelta } from './serperMeter'
import { __resetKvCounters } from '@/lib/security/kvCounter'
import { __resetSerperAlerts } from './serperClient'

// Serper review finding D: the SAME /shopping request was sent again right after the first one TIMED OUT (searchProducts' structured
// path, then its organic fallback — both ask num=20). A timed-out request may already have been processed and billed, so the identical
// resend only doubled the credits (+2) and the wait (+8 s). Now: an identical request that failed by timeout / abort / network error is
// not re-sent for 30 s (process-local); a different query or count, a fast HTTP failure, and the time after the window are unaffected.

let shoppingCalls = 0
let mode: 'hang' | 'http500' | 'ok'

function install() {
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    const url = String(input)
    if (url === 'https://google.serper.dev/shopping') {
      shoppingCalls++
      if (mode === 'hang') return new Promise<Response>(() => {})
      if (mode === 'http500') return new Response('boom', { status: 500 })
      return new Response(JSON.stringify({ shopping: [{ title: 'Ốp UAG iPhone 17 Pro Max', link: 'https://shop.example/uag', price: '₫790.000', source: 'Shop' }] }), { status: 200 })
    }
    throw new Error(`unexpected fetch ${url}`)
  }))
}

beforeEach(() => {
  __clearToolCache(); __resetKvCounters(); __resetSerperAlerts()
  shoppingCalls = 0; mode = 'hang'
  vi.stubEnv('SERPER_API_KEY', 'test-key')
  install()
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

const attempt = async (q: string, num = 20) => {
  const p = serperShopping(q, num)
  let done = false
  p.finally(() => { done = true }).catch(() => {})
  // stepwise until it settles: the request registers its timeout after a few microtask hops, so one big jump can miss it
  for (let i = 0; i < 40 && !done; i++) await vi.advanceTimersByTimeAsync(500)
  return p
}

describe('/shopping is not re-sent right after a timeout', () => {
  it('the identical request after a timeout is NOT sent again (1 request / 1 attempt in the ledger), the caller gets null at once', async () => {
    vi.useFakeTimers() // inside the test: the vitest test timeout keeps running on real timers
    const before = serperSnapshot()
    expect(await attempt('ốp lưng 17 pro max uag')).toBeNull()
    expect(shoppingCalls).toBe(1)
    expect(await attempt('ốp lưng 17 pro max uag')).toBeNull() // identical, right after: must not reach the provider
    expect(shoppingCalls).toBe(1)
    expect(serperDelta(before).calls.shopping).toBe(1)
  })
  it('a different query, or a different count, is a different request and is sent', async () => {
    vi.useFakeTimers() // inside the test: the vitest test timeout keeps running on real timers
    await attempt('ốp lưng 17 pro max uag')
    await attempt('sạc nhanh 65w anker')
    await attempt('ốp lưng 17 pro max uag', 10)
    expect(shoppingCalls).toBe(3)
  })
  it('after the 30 s window the same request may be sent again', async () => {
    vi.useFakeTimers() // inside the test: the vitest test timeout keeps running on real timers
    await attempt('ốp lưng 17 pro max uag')
    await vi.advanceTimersByTimeAsync(31_000)
    await attempt('ốp lưng 17 pro max uag')
    expect(shoppingCalls).toBe(2)
  })
  it('a FAST HTTP failure is not a timeout: the request may be sent again (it was not processed)', async () => {
    vi.useFakeTimers() // inside the test: the vitest test timeout keeps running on real timers
    mode = 'http500'
    expect(await attempt('ốp lưng 17 pro max uag')).toBeNull()
    expect(await attempt('ốp lưng 17 pro max uag')).toBeNull()
    expect(shoppingCalls).toBe(2)
  })
  it('a success is unaffected and is returned (and a later identical request can still be answered by the cache layers, not blocked)', async () => {
    mode = 'ok'
    const rows = await serperShopping('ốp lưng uag', 20)
    expect(rows?.length).toBe(1)
    expect(rows?.[0].title).toContain('UAG')
  })
})
