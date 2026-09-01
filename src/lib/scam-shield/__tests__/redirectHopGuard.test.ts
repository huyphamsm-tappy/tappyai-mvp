/**
 * BUG-007, second half — a PUBLIC url that redirects to an internal one.
 *
 * The entry guard (`assertSafeTarget`) only sees the url the caller supplied. A host that answers
 * `302 Location: http://169.254.169.254/…` moves the target after that check has passed, so the
 * redirect follower is the only thing standing between a public-looking QR code and an internal
 * request. It has to check every hop, and it has to check it BEFORE fetching it.
 *
 * 🚨 The assertion here is on the FETCH CALLS, not on the returned verdict. A test that only
 * checked for `UNSAFE_REDIRECT` would pass even if the request had already gone out — which is
 * the entire thing being prevented.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CheckTarget } from '../types'

/**
 * The follower no longer calls `fetch`. It goes through `safeHeadRequest`, which resolves the
 * hostname once, refuses any answer pointing inward, and pins the socket to the address it
 * approved — see `dnsPinning.test.ts`, which measures that part against a real listening socket.
 *
 * This file keeps testing what it always tested: URL-level policy per hop, asserted on the
 * requests that actually went out. Only the seam being recorded has moved.
 */
const h = vi.hoisted(() => ({
  requested: [] as string[],
  map: {} as Record<string, { status: number; location?: string }>,
}))

vi.mock('@/lib/security/safeFetch', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/security/safeFetch')>()
  return {
    ...actual,
    safeHeadRequest: vi.fn(async (url: string) => {
      h.requested.push(url)
      const r = h.map[url] ?? { status: 200 }
      return { status: r.status, location: r.location ?? null }
    }),
  }
})

const { redirectProvider } = await import('../providers/redirect')

const target = (url: string): CheckTarget => {
  const u = new URL(url)
  return { url: u, hostname: u.hostname, domain: u.hostname }
}

/** Every url this run actually requested. */
const requested = h.requested

function respondWith(map: Record<string, { status: number; location?: string }>) {
  h.map = map
}

const run = (url: string) => redirectProvider.check(target(url), new AbortController().signal)

beforeEach(() => { h.requested.length = 0; h.map = {} })

describe('redirect follower — no hop reaches an internal address', () => {
  const INTERNAL = [
    ['cloud metadata', 'http://169.254.169.254/latest/meta-data/'],
    ['loopback', 'http://127.0.0.1/'],
    ['private 10/8', 'http://10.0.0.1/secret'],
    ['private 192.168/16', 'https://192.168.1.1/'],
    ['internal TLD', 'https://vault.internal/'],
  ] as const

  for (const [name, internal] of INTERNAL) {
    it(`🚨 public → ${name} is refused, and the internal url is never fetched`, async () => {
      respondWith({ 'https://public.example/': { status: 302, location: internal } })

      const signal = await run('https://public.example/')

      expect(signal.finding).toBe('UNSAFE_REDIRECT')
      expect(signal.severity).toBe('critical')
      // The public hop was requested; the internal one must not have been.
      expect(requested).toEqual(['https://public.example/'])
      expect(requested.some(u => u.includes(new URL(internal).hostname))).toBe(false)
    })
  }

  it('a public → public redirect still works and is still reported', async () => {
    respondWith({
      'https://a.example/': { status: 302, location: 'https://b.example/' },
      'https://b.example/': { status: 200 },
    })

    const signal = await run('https://a.example/')

    expect(signal.status).toBe('completed')
    expect(signal.finding).not.toBe('UNSAFE_REDIRECT')
    expect(requested).toEqual(['https://a.example/', 'https://b.example/'])
  })

  it('a url with no redirects is unchanged', async () => {
    respondWith({ 'https://a.example/': { status: 200 } })

    const signal = await run('https://a.example/')

    expect(signal.finding).toBe('NO_REDIRECTS')
    expect(signal.severity).toBe('safe')
  })

  it('🚨 an internal FIRST hop is refused before any request at all', async () => {
    // Defence in depth: the entry guard should already have refused this, but the follower must
    // not depend on that — the `&& i > 0` exemption it used to carry is what made BUG-007 exploitable.
    respondWith({})

    const signal = await run('http://169.254.169.254/latest/meta-data/')

    expect(signal.finding).toBe('UNSAFE_REDIRECT')
    expect(requested).toEqual([])
  })
})
