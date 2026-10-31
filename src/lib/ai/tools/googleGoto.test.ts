// 31/10 (measured on the live API: 7 of 10 Serper rows were google.com/goto tokens) - the token is resolved to its page, safely.
import { describe, it, expect, beforeEach } from 'vitest'
import { isGoogleGoto, resolveGoogleGoto, resolveGotoRows, __resetGotoCache } from './googleGoto'

const TOKEN = 'https://www.google.com/goto?url=CAESdwHrOzAV'
const redirectTo = (loc: string | null, status = 302) => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const f = async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(null, { status, headers: loc ? { location: loc } : {} }) }
  return { f, calls }
}
beforeEach(() => __resetGotoCache())

describe('googleGoto', () => {
  it('only google.com/goto links are tokens', () => {
    expect(isGoogleGoto(TOKEN)).toBe(true)
    expect(isGoogleGoto('https://google.com/goto?url=x')).toBe(true)
    expect(isGoogleGoto('https://www.google.com/search?q=x')).toBe(false)
    expect(isGoogleGoto('https://evil.example/www.google.com/goto?url=x')).toBe(false)
    expect(isGoogleGoto('http://www.google.com/goto?url=x')).toBe(false)
  })
  it('reads the redirect without following it, once per token', async () => {
    const { f, calls } = redirectTo('https://tridenstechnology.com/electric-car-sales-statistics/')
    expect(await resolveGoogleGoto(TOKEN, { fetch: f })).toBe('https://tridenstechnology.com/electric-car-sales-statistics/')
    expect(await resolveGoogleGoto(TOKEN, { fetch: f })).toBe('https://tridenstechnology.com/electric-car-sales-statistics/')
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(TOKEN)
    expect(calls[0].init.redirect).toBe('manual')
  })
  it('a Location that is private, not http(s), another Google redirect, or missing gives nothing', async () => {
    for (const loc of ['http://169.254.169.254/latest/meta-data', 'http://localhost:3000/x', 'javascript:alert(1)', 'https://www.google.com/url?q=https://x.example', 'https://www.google.com/goto?url=again', null]) {
      __resetGotoCache()
      expect(await resolveGoogleGoto(TOKEN, { fetch: redirectTo(loc).f })).toBeNull()
    }
    __resetGotoCache()
    expect(await resolveGoogleGoto(TOKEN, { fetch: redirectTo('https://x.example/', 200).f })).toBeNull() // not a redirect
  })
  it('a network failure or timeout gives nothing; a non-token is never requested', async () => {
    const boom = async () => { throw new Error('down') }
    expect(await resolveGoogleGoto(TOKEN, { fetch: boom })).toBeNull()
    __resetGotoCache()
    const slow = (_u: string, init: RequestInit) => new Promise<Response>((_, rej) => init.signal?.addEventListener('abort', () => rej(new Error('aborted'))))
    expect(await resolveGoogleGoto(TOKEN, { fetch: slow, timeoutMs: 10 })).toBeNull()
    const { f, calls } = redirectTo('https://x.example/')
    expect(await resolveGoogleGoto('https://x.example/page', { fetch: f })).toBeNull()
    expect(calls).toHaveLength(0)
  })
  it('rows: every token becomes its page, a row that cannot be resolved stays as it was, others untouched', async () => {
    const f = async (url: string) => new Response(null, { status: 302, headers: url.endsWith('A') ? { location: 'https://a.example/x' } : {} })
    const out = await resolveGotoRows([{ link: 'https://plain.example/', t: 1 }, { link: `${TOKEN}A`, t: 2 }, { link: `${TOKEN}B`, t: 3 }], { fetch: f })
    expect(out.rows).toEqual([{ link: 'https://plain.example/', t: 1 }, { link: 'https://a.example/x', t: 2 }, { link: `${TOKEN}B`, t: 3 }])
    expect([out.resolved, out.failed]).toEqual([1, 1])
  })
})
