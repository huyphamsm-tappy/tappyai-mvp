// @vitest-environment node
// Phase 8 M3 — page reading security: every hop validated (scheme, credentials, port, host names, IP literals), DNS pinning refuses
// rebinding answers, redirects bounded and re-validated, timeouts, content-type allow-list, byte cap, malformed input — never a throw.
import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { fetchPublicPage, realHop, validateHop, type HopResult, type HopTransport } from '../safePageFetch'
import { createSafeLookup } from '../safeFetch'

const body = (html: string, contentType = 'text/html; charset=utf-8'): HopResult => ({ kind: 'body', status: 200, contentType, body: html, bytes: html.length, truncated: false })
/** A scripted transport: url → hop result; records the hops it was asked for. */
const scripted = (map: Record<string, HopResult>) => {
  const asked: string[] = []
  const t: HopTransport = async u => { asked.push(u.toString()); return map[u.toString()] ?? { kind: 'error', reason: 'network_error' } }
  return { t, asked }
}

describe('hop validation (string level, before any socket)', () => {
  it.each([
    ['https://www.apple.com/airpods-pro/', null],
    ['http://example.com/page', null],
    ['ftp://example.com/x', 'blocked_scheme'],
    ['file:///etc/passwd', 'blocked_scheme'],
    ['javascript:alert(1)', 'blocked_scheme'],
    ['data:text/html,<b>x</b>', 'blocked_scheme'],
    ['https://user:pw@example.com/', 'blocked_credentials'],
    ['https://example.com:8443/', 'blocked_port'],
    ['http://example.com:6379/', 'blocked_port'],
    ['http://localhost/', 'blocked_host'],
    ['http://api.localhost/', 'blocked_host'],
    ['http://printer.local/', 'blocked_host'],
    ['http://metadata.google.internal/computeMetadata/v1/', 'blocked_host'],
    ['http://intranet/', 'blocked_host'],
    ['http://127.0.0.1/', 'blocked_address'],
    ['http://10.0.0.5/', 'blocked_address'],
    ['http://192.168.1.1/', 'blocked_address'],
    ['http://169.254.169.254/latest/meta-data/', 'blocked_address'],
    ['http://[::1]/', 'blocked_address'],
    ['http://[::ffff:7f00:1]/', 'blocked_address'],
    ['http://2130706433/', 'blocked_address'],
    ['http://0x7f000001/', 'blocked_address'],
    ['not a url', 'invalid_url'],
  ])('%s → %s', (url, reason) => {
    const v = validateHop(url)
    if (reason === null) expect('url' in v).toBe(true)
    else expect(v).toEqual({ reason })
  })

  it('http can be switched off', () => {
    expect(validateHop('http://example.com/', { allowHttp: false })).toEqual({ reason: 'blocked_scheme' })
  })
})

describe('redirects: bounded and re-validated hop by hop', () => {
  it('follows a relative redirect to a public page', async () => {
    const s = scripted({ 'https://a.example/x': { kind: 'redirect', status: 301, location: '/y' }, 'https://a.example/y': body('<title>ok</title>') })
    const r = await fetchPublicPage('https://a.example/x', {}, s.t)
    expect(r).toMatchObject({ ok: true, finalUrl: 'https://a.example/y', redirects: 1 })
  })
  it('a public page redirecting to cloud metadata is refused before any request to it', async () => {
    const s = scripted({ 'https://evil.example/': { kind: 'redirect', status: 302, location: 'http://169.254.169.254/latest/meta-data/' } })
    const r = await fetchPublicPage('https://evil.example/', {}, s.t)
    expect(r).toMatchObject({ ok: false, reason: 'blocked_address' })
    expect(s.asked).toEqual(['https://evil.example/'])
  })
  it('redirects to localhost / file: / a private name are refused', async () => {
    for (const loc of ['http://localhost:80/admin', 'file:///etc/passwd', 'http://db.internal/']) {
      const s = scripted({ 'https://evil.example/': { kind: 'redirect', status: 302, location: loc } })
      const r = await fetchPublicPage('https://evil.example/', {}, s.t)
      expect(r.ok).toBe(false)
      expect(s.asked).toHaveLength(1)
    }
  })
  it('too many redirects', async () => {
    const map: Record<string, HopResult> = {}
    for (let i = 0; i < 10; i++) map[`https://loop.example/${i}`] = { kind: 'redirect', status: 302, location: `https://loop.example/${i + 1}` }
    const r = await fetchPublicPage('https://loop.example/0', { maxRedirects: 4 }, scripted(map).t)
    expect(r).toMatchObject({ ok: false, reason: 'too_many_redirects' })
  })
  it('a redirect without a location', async () => {
    const r = await fetchPublicPage('https://a.example/', {}, scripted({ 'https://a.example/': { kind: 'redirect', status: 302, location: null } }).t)
    expect(r).toMatchObject({ ok: false, reason: 'redirect_without_location' })
  })
})

describe('DNS rebinding / pinning', () => {
  it('a name resolving to ANY private address is refused (public + private answer)', async () => {
    const lookup = createSafeLookup((_h, _o, cb) => cb(null, [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.7', family: 4 }]))
    const err = await new Promise<NodeJS.ErrnoException | null>(r => lookup('rebind.example', { all: true }, e => r(e)))
    expect(err?.name).toBe('BlockedDestinationError')
  })
  it('a name resolving to the metadata address is refused', async () => {
    const lookup = createSafeLookup((_h, _o, cb) => cb(null, [{ address: '169.254.169.254', family: 4 }]))
    const err = await new Promise<NodeJS.ErrnoException | null>(r => lookup('meta.example', { all: true }, e => r(e)))
    expect(err?.name).toBe('BlockedDestinationError')
  })
})

describe('transport (real sockets against a local server)', () => {
  let server: http.Server
  let base = ''
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/html') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end('<html><title>Xin chào</title><body>Nội dung</body></html>') }
      else if (req.url === '/pdf') { res.writeHead(200, { 'content-type': 'application/pdf' }); res.end('%PDF-1.7 …') }
      else if (req.url === '/big') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('x'.repeat(50_000)) }
      else if (req.url === '/slow') { res.writeHead(200, { 'content-type': 'text/html' }); res.write('<html>'); /* never ends */ }
      else if (req.url === '/hang') { /* never answers */ }
      else if (req.url === '/404') { res.writeHead(404); res.end() }
      else { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<<<<not html at all') }
    })
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => { server.closeAllConnections(); server.close() })
  const hop = (path: string, o: Partial<{ maxBytes: number; connectTimeoutMs: number; readTimeoutMs: number }> = {}) =>
    realHop(new URL(base + path), { signal: new AbortController().signal, maxBytes: 800_000, connectTimeoutMs: 2_000, readTimeoutMs: 2_000, ...o })

  it('🚨 why IP literals are checked at the string level: the transport alone connects to 127.0.0.1 (Node skips the pinned lookup for a literal)', async () => {
    expect((await hop('/html')).kind).toBe('body')
    // …and the full fetch refuses the same URL before any socket.
    expect(await fetchPublicPage(base + '/html')).toMatchObject({ ok: false, reason: 'blocked_port' })
    expect(await fetchPublicPage('http://127.0.0.1/html')).toMatchObject({ ok: false, reason: 'blocked_address' })
  })
  it('reads text/html (utf-8)', async () => {
    expect(await hop('/html')).toMatchObject({ kind: 'body', status: 200, body: expect.stringContaining('Xin chào') })
  })
  it('refuses a non-text content type before reading the body', async () => {
    expect(await hop('/pdf')).toMatchObject({ kind: 'error', reason: 'unsupported_content_type' })
  })
  it('caps an oversized body and flags it', async () => {
    const r = await hop('/big', { maxBytes: 10_000 }) as Extract<HopResult, { kind: 'body' }>
    expect(r.truncated).toBe(true)
    expect(r.body.length).toBe(10_000)
  })
  it('read timeout on a stalled body', async () => {
    expect(await hop('/slow', { readTimeoutMs: 150 })).toMatchObject({ kind: 'error', reason: 'read_timeout' })
  })
  it('a server that never answers: no hang (connect/idle timeout path)', async () => {
    const r = await hop('/hang', { connectTimeoutMs: 150, readTimeoutMs: 150 })
    expect(r.kind).toBe('error')
  })
  it('HTTP errors are typed', async () => {
    expect(await hop('/404')).toMatchObject({ kind: 'error', reason: 'http_error', status: 404 })
  })
  it('the total deadline and the caller signal abort the whole fetch', async () => {
    const stall: HopTransport = (_u, o) => new Promise(r => o.signal.addEventListener('abort', () => r({ kind: 'error', reason: 'aborted' })))
    expect(await fetchPublicPage('https://slow.example/', { totalTimeoutMs: 50 }, stall)).toMatchObject({ ok: false, reason: 'total_timeout' })
    const ctrl = new AbortController(); ctrl.abort()
    expect(await fetchPublicPage('https://slow.example/', { signal: ctrl.signal }, stall)).toMatchObject({ ok: false, reason: 'aborted' })
  })
})
