// @vitest-environment node
/**
 * Wave 4 · C0 — sharedRobotsGate() against the REAL transport (a local server stands in for the site; only the address is rewritten, every other rule of safePageFetch runs for real).
 * Why: Wave 3-FIX R3-05 made the robots.txt fetch accept ANY Content-Type and a compressed answer. A reviewer mutation (FR-A4c: drop `anyContentType: true`) must turn a test red - without it a CDN's
 * "application/octet-stream" robots.txt is refused as unsupported, the gate reads it as "unreachable" and fails CLOSED for every page of that host (the bench lost 8/8 pages that way once).
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import http from 'node:http'
import zlib from 'node:zlib'
import type { AddressInfo } from 'node:net'
import { ROBOTS_MAX_BYTES } from '@/lib/security/robotsTxt'

const seen = vi.hoisted(() => ({ opts: [] as Array<Record<string, unknown>>, base: '' }))

vi.mock('@/lib/security/safePageFetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/safePageFetch')>()
  // The production code calls fetchPublicPage(url, opts) with the real transport; here the transport is the real realHop pointed at the local server. The first label of the host picks the scenario.
  return {
    ...actual,
    fetchPublicPage: (rawUrl: string, opts: Record<string, unknown> = {}) => {
      seen.opts.push(opts)
      return actual.fetchPublicPageReal(rawUrl, opts, (url, o) => actual.realHop(new URL(`${seen.base}/${url.hostname.split('.')[0]}${url.pathname}`), o))
    },
  }
})

import { sharedRobotsGate, __resetSharedRobots } from './researchLoop'

const ROBOTS = 'User-agent: *\nDisallow: /private\n'
let server: http.Server
beforeAll(async () => {
  server = http.createServer((req, res) => {
    const [, scenario, ...rest] = (req.url ?? '').split('/')
    if (rest.join('/') !== 'robots.txt') { res.writeHead(200, { 'content-type': 'text/html' }); return void res.end('<html>page</html>') }
    switch (scenario) {
      case 'plain': res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); return void res.end(ROBOTS)
      case 'octet': res.writeHead(200, { 'content-type': 'application/octet-stream' }); return void res.end(ROBOTS)
      case 'nolabel': res.writeHead(200, {}); return void res.end(ROBOTS)
      case 'htmltype': res.writeHead(200, { 'content-type': 'text/html' }); return void res.end(ROBOTS)
      case 'gzip': res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-encoding': 'gzip' }); return void res.end(zlib.gzipSync(ROBOTS))
      case 'html': res.writeHead(200, { 'content-type': 'text/html' }); return void res.end('<html><body>Not a robots file. Disallow: /</body></html>')
      case 'missing': res.writeHead(404); return void res.end()
      case 'broken': res.writeHead(500); return void res.end()
      default: res.writeHead(404); return void res.end()
    }
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  seen.base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => { server.closeAllConnections(); server.close() })
beforeEach(() => { __resetSharedRobots(); seen.opts.length = 0 })

describe('sharedRobotsGate (the process-wide gate the research loop uses)', () => {
  it('asks for the robots file with ANY content type, compressed answers decoded, under the robots byte cap', async () => {
    await sharedRobotsGate().check('https://plain.example/ok')
    expect(seen.opts).toHaveLength(1)
    expect(seen.opts[0]).toMatchObject({ anyContentType: true, decodeCompressed: true, maxBytes: ROBOTS_MAX_BYTES })
  })

  it('a robots.txt labelled application/octet-stream is still parsed: its Disallow is honoured and the rest of the host stays open (FR-A4c)', async () => {
    const g = sharedRobotsGate()
    expect(await g.check('https://octet.example/private/menu')).toEqual({ allowed: false, reason: 'disallowed_by_rules' })
    expect(await g.check('https://octet.example/ok')).toEqual({ allowed: true, reason: 'allowed' })
  })

  it('with no Content-Type at all, with text/html, and with text/plain: the same verdicts', async () => {
    const g = sharedRobotsGate()
    for (const h of ['plain', 'nolabel', 'htmltype']) {
      expect(await g.check(`https://${h}.example/private/x`), h).toEqual({ allowed: false, reason: 'disallowed_by_rules' })
      expect(await g.check(`https://${h}.example/ok`), h).toEqual({ allowed: true, reason: 'allowed' })
    }
  })

  it('a gzip-compressed robots.txt with an odd label is decoded and its Disallow honoured', async () => {
    const g = sharedRobotsGate()
    expect(await g.check('https://gzip.example/private/a')).toEqual({ allowed: false, reason: 'disallowed_by_rules' })
    expect(await g.check('https://gzip.example/ok')).toEqual({ allowed: true, reason: 'allowed' })
  })

  it('an HTML page served at /robots.txt has no rule lines: nothing is disallowed (it is not read as a Disallow)', async () => {
    expect(await sharedRobotsGate().check('https://html.example/anything')).toEqual({ allowed: true, reason: 'allowed' })
  })

  it('no robots.txt (404) = allowed; a server error (500) = fail closed, typed robots_unreachable', async () => {
    const g = sharedRobotsGate()
    expect(await g.check('https://missing.example/x')).toEqual({ allowed: true, reason: 'allowed' })
    expect(await g.check('https://broken.example/x')).toEqual({ allowed: false, reason: 'robots_unreachable' })
  })

  it('one fetch per host is cached; the gate is one object until reset', async () => {
    const g = sharedRobotsGate()
    await g.check('https://octet.example/a'); await g.check('https://octet.example/b'); await g.check('https://octet.example/private/c')
    expect(seen.opts).toHaveLength(1)
    expect(sharedRobotsGate()).toBe(g)
    __resetSharedRobots()
    expect(sharedRobotsGate()).not.toBe(g)
  })
})
