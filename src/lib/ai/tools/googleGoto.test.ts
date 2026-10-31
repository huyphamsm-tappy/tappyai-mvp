// 31/10 (measured on the live API: 7 of 10 Serper rows were google.com/goto tokens) - the token is resolved to its page, safely.
import { describe, it, expect, beforeEach } from 'vitest'
import { isGoogleGoto, resolveGoogleGoto, resolveGotoRows, displayedSite, __resetGotoCache } from './googleGoto'

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
  })
  it('a 200 answer (Google\'s bot-check page) is never worked around: the resolver stops asking Google for a while', async () => {
    const page = redirectTo('https://x.example/', 200)
    expect(await resolveGoogleGoto(TOKEN, { fetch: page.f })).toBeNull()
    const next = redirectTo('https://y.example/')
    expect(await resolveGoogleGoto(`${TOKEN}2`, { fetch: next.f })).toBeNull()
    expect(next.calls).toHaveLength(0) // paused: no request at all
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
  it('the site Google shows for a result', () => {
    expect(displayedSite('https://tridenstechnology.com › E-Mobility')).toBe('tridenstechnology.com')
    expect(displayedSite('www.iea.org › reports')).toBe('iea.org')
    expect(displayedSite('30+ comments · 9 months ago')).toBeNull()
    expect(displayedSite('https://www.google.com › search')).toBeNull()
    expect(displayedSite(undefined)).toBeNull()
  })
  it('rows: every token becomes its page, a row that cannot be resolved stays as it was, others untouched', async () => {
    const f = async (url: string) => new Response(null, { status: 302, headers: url.endsWith('A') ? { location: 'https://a.example/x' } : {} })
    const out = await resolveGotoRows([{ link: 'https://plain.example/', t: 1 }, { link: `${TOKEN}A`, t: 2 }, { link: `${TOKEN}B`, t: 3 }], { fetch: f })
    expect(out.rows).toEqual([{ link: 'https://plain.example/', t: 1 }, { link: 'https://a.example/x', t: 2 }, { link: `${TOKEN}B`, t: 3 }])
    expect([out.resolved, out.failed]).toEqual([1, 1])
  })
})
