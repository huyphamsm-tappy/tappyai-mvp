import { describe, it, expect } from 'vitest'
import { parseRobots, robotsAllows, createRobotsGate, ROBOTS_TOKEN } from './robotsTxt'
import type { PageFetchResult } from './safePageFetch'

const ok = (body: string, contentType = 'text/plain'): PageFetchResult => ({ ok: true, url: 'x', finalUrl: 'x', status: 200, contentType, body, bytes: body.length, truncated: false, redirects: 0, ms: 1 })
const fail = (status?: number, reason: string = 'http_error'): PageFetchResult => ({ ok: false, url: 'x', reason: reason as never, ...(status ? { status } : {}), redirects: 0, ms: 1 })
const allows = (txt: string, path: string, token?: string) => robotsAllows(parseRobots(txt), path, token)

describe('W1 robots.txt · parser and matcher (RFC 9309)', () => {
  it('no file content, no group, or an empty Disallow: everything is allowed', () => {
    expect(allows('', '/a')).toBe(true)
    expect(allows('User-agent: *\nDisallow:', '/a')).toBe(true)
    expect(allows('Disallow: /a', '/a')).toBe(true) // a rule before any user-agent line belongs to no group
    expect(allows('User-agent: other\nDisallow: /', '/a')).toBe(true) // a group for somebody else
  })
  it('Disallow / Allow: the longest match wins, Allow wins a tie', () => {
    const t = 'User-agent: *\nDisallow: /private\nAllow: /private/open'
    expect(allows(t, '/private/x')).toBe(false)
    expect(allows(t, '/private/open/page')).toBe(true)
    expect(allows(t, '/public')).toBe(true)
    expect(allows('User-agent: *\nDisallow: /a\nAllow: /a', '/a')).toBe(true)
    expect(allows('User-agent: *\nDisallow: /', '/anything')).toBe(false)
  })
  it('wildcards and the end anchor', () => {
    const t = 'User-agent: *\nDisallow: /*.pdf$\nDisallow: /tmp/*/secret\nDisallow: /q?'
    expect(allows(t, '/files/a.pdf')).toBe(false)
    expect(allows(t, '/files/a.pdf?x=1')).toBe(true)
    expect(allows(t, '/files/a.pdfx')).toBe(true)
    expect(allows(t, '/tmp/u1/secret/file')).toBe(false)
    expect(allows(t, '/tmp/u1/open')).toBe(true)
    expect(allows(t, '/q?id=3')).toBe(false)
  })
  it('our own group beats the * group; the * group applies without one; comments and case are tolerated', () => {
    const t = 'User-agent: *\nDisallow: /\n\nUSER-AGENT: TappyAI\nAllow: /\n# comment\nDisallow: /admin # trailing'
    expect(ROBOTS_TOKEN).toBe('tappyai')
    expect(allows(t, '/page')).toBe(true)
    expect(allows(t, '/admin/x')).toBe(false)
    expect(allows('User-agent: *\nDisallow: /', '/page')).toBe(false)
    expect(allows('User-agent: googlebot\nUser-agent: *\nDisallow: /x', '/x/1')).toBe(false) // consecutive user-agent lines share a group
  })
  it('a hostile file cannot make the matcher expensive', () => {
    const evil = `User-agent: *\nDisallow: ${'*a'.repeat(5000)}\nDisallow: /*a*a*a*a*a*a*a*a*a*a*a*b`
    const t0 = Date.now()
    expect(allows(evil, `/${'a'.repeat(5000)}`)).toBe(true) // both rules are ignored as too complex
    expect(Date.now() - t0).toBeLessThan(500)
    expect(parseRobots('x'.repeat(2_000_000)).groups).toEqual([]) // only the first 500 KB are read, and it has no line
  })
})

describe('W1 robots.txt · the cached gate', () => {
  const mk = (responses: Record<string, PageFetchResult | (() => PageFetchResult)>, clock = { t: 0 }) => {
    const calls: string[] = []
    const gate = createRobotsGate({
      now: () => clock.t,
      fetchPage: async (url) => { calls.push(url); const r = responses[url]; return r === undefined ? fail(404) : typeof r === 'function' ? r() : r },
    })
    return { gate, calls, clock }
  }
  it('fetches robots.txt once per host and honours it', async () => {
    const { gate, calls } = mk({ 'https://a.example/robots.txt': ok('User-agent: *\nDisallow: /secret') })
    expect((await gate.check('https://a.example/page')).allowed).toBe(true)
    expect(await gate.check('https://a.example/secret/x')).toEqual({ allowed: false, reason: 'disallowed_by_rules' })
    expect((await gate.check('https://a.example/other?x=1')).allowed).toBe(true)
    expect(calls).toEqual(['https://a.example/robots.txt'])
    expect((await gate.check('https://b.example/page')).allowed).toBe(true) // another host: another file (404 -> allowed)
    expect(calls.length).toBe(2)
  })
  it('the origin keeps the port and the scheme apart', async () => {
    const { gate, calls } = mk({ 'https://a.example/robots.txt': ok('User-agent: *\nDisallow: /'), 'http://a.example/robots.txt': ok('') })
    expect((await gate.check('https://a.example/p')).allowed).toBe(false)
    expect((await gate.check('http://a.example/p')).allowed).toBe(true)
    expect(calls.length).toBe(2)
  })
  it('Wave 3-FIX R3-05: a Disallow served with a non-text Content-Type is still honoured; a page of another kind has no rule to honour', async () => {
    const { gate } = mk({
      'https://oct.example/robots.txt': ok('User-agent: *\nDisallow: /', 'application/octet-stream'),
      'https://bin.example/robots.txt': ok('User-agent: tappyai\nDisallow: /private', ''),
      'https://page.example/robots.txt': ok('<html><body>Not found. Disallow: / (text on a page)</body></html>', 'text/html'),
    })
    expect(await gate.check('https://oct.example/p')).toEqual({ allowed: false, reason: 'disallowed_by_rules' })
    expect(await gate.check('https://bin.example/private/x')).toEqual({ allowed: false, reason: 'disallowed_by_rules' })
    expect((await gate.check('https://bin.example/public')).allowed).toBe(true)
    expect((await gate.check('https://page.example/p')).allowed).toBe(true)
  })
  it('4xx = no robots file = allowed; 5xx / timeout / network / refused address = unreachable = disallowed; a page that has no rule line = nothing to honour', async () => {
    const { gate } = mk({
      'https://nf.example/robots.txt': fail(404), 'https://gone.example/robots.txt': fail(410), 'https://forbidden.example/robots.txt': fail(403),
      'https://err.example/robots.txt': fail(503), 'https://slow.example/robots.txt': fail(undefined, 'total_timeout'), 'https://net.example/robots.txt': fail(undefined, 'network_error'),
      'https://html.example/robots.txt': ok('<html>Disallow: /</html>', 'application/xhtml+xml'),
    })
    for (const h of ['nf', 'gone', 'forbidden']) expect((await gate.check(`https://${h}.example/p`)).allowed, h).toBe(true)
    for (const h of ['err', 'slow', 'net']) expect(await gate.check(`https://${h}.example/p`), h).toEqual({ allowed: false, reason: 'robots_unreachable' })
    expect((await gate.check('https://html.example/p')).allowed).toBe(true)
  })
  it('the cache expires: an hour for a file, ten minutes for a failure', async () => {
    let body = 'User-agent: *\nDisallow: /a'
    const { gate, calls, clock } = mk({ 'https://t.example/robots.txt': () => ok(body), 'https://f.example/robots.txt': () => fail(500) })
    expect((await gate.check('https://t.example/a')).allowed).toBe(false)
    body = 'User-agent: *\nDisallow: /b'
    clock.t = 59 * 60_000
    expect((await gate.check('https://t.example/a')).allowed).toBe(false) // still the cached file
    clock.t = 61 * 60_000
    expect((await gate.check('https://t.example/a')).allowed).toBe(true) // re-read
    expect(calls.filter(c => c.includes('t.example')).length).toBe(2)
    clock.t = 0
    await gate.check('https://f.example/x'); clock.t = 9 * 60_000; await gate.check('https://f.example/x'); clock.t = 11 * 60_000; await gate.check('https://f.example/x')
    expect(calls.filter(c => c.includes('f.example')).length).toBe(2)
  })
  it('concurrent checks of one host share one fetch', async () => {
    const { gate, calls } = mk({ 'https://c.example/robots.txt': ok('User-agent: *\nDisallow: /z') })
    const r = await Promise.all(['/a', '/b', '/z/1', '/c'].map(p => gate.check(`https://c.example${p}`)))
    expect(r.map(x => x.allowed)).toEqual([true, true, false, true])
    expect(calls.length).toBe(1)
  })
  it('a URL that is not http(s) or does not parse is not allowed, and nothing is fetched', async () => {
    const { gate, calls } = mk({})
    for (const u of ['ftp://a.example/x', 'javascript:alert(1)', 'not a url', '', 'file:///etc/passwd']) expect((await gate.check(u)).allowed, u).toBe(false)
    expect(calls).toEqual([])
  })
})
