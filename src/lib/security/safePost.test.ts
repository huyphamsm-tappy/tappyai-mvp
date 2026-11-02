// @vitest-environment node
// Offline tests for the POST/stream transport. A local HTTPS server uses a self-signed certificate that is generated in memory by the
// test (openssl → stdout, nothing written to disk). The test seam (a custom lookup and CA) is used ONLY here; the production defaults are
// asserted separately: the pinned lookup refuses loopback, IP literals and non-https URLs.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import https from 'node:https'
import { spawnSync } from 'node:child_process'
import type { AddressInfo } from 'node:net'
import { safePostResponse } from './safePost'
import { BlockedDestinationError } from './safeFetch'

let key = ''
let cert = ''
let server: https.Server
let port = 0
const seen: Array<{ path: string; method: string; headers: Record<string, string | string[] | undefined>; body: string }> = []
let release: (() => void) | null = null
let openSockets = 0
let closedSockets = 0

function makeCert(): { key: string; cert: string } {
  const r = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1', '-days', '2', '-keyout', '-', '-out', '-'], { encoding: 'utf8' })
  if (r.status !== 0 || !r.stdout) throw new Error('openssl unavailable for the TLS test fixture')
  const k = /-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/.exec(r.stdout)?.[0]
  const c = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/.exec(r.stdout)?.[0]
  if (!k || !c) throw new Error('openssl fixture output not parsed')
  return { key: k, cert: c }
}

// A lookup that answers the test hostname with the loopback server (the seam; production uses the pinned safeLookup).
const testLookup = ((_h: string, opts: unknown, cb: (...a: unknown[]) => void) => {
  if ((opts as { all?: boolean })?.all) cb(null, [{ address: '127.0.0.1', family: 4 }])
  else cb(null, '127.0.0.1', 4)
}) as never

beforeAll(async () => {
  const f = makeCert()
  key = f.key; cert = f.cert
  server = https.createServer({ key, cert }, (req, res) => {
    let body = ''
    req.on('data', c => { body += c })
    req.on('end', () => {
      seen.push({ path: req.url ?? '', method: req.method ?? '', headers: req.headers, body })
      if (req.url === '/echo') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ got: body, auth: req.headers.authorization ?? null }))
      } else if (req.url === '/stream') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' })
        res.write('data: one\n\n')
        release = () => { res.write('data: two\n\n'); res.end('data: end\n\n') }
      } else if (req.url === '/hold') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' })
        res.write('data: first\n\n')
      } else if (req.url === '/limit') {
        res.writeHead(429, { 'Content-Type': 'application/json' })
        res.end('{"error":{"message":"slow down"}}')
      } else if (req.url === '/redirect') {
        res.writeHead(302, { Location: '/target' })
        res.end()
      } else if (req.url === '/target') {
        res.writeHead(200); res.end('followed')
      } else {
        res.writeHead(404); res.end()
      }
    })
  })
  server.on('connection', s => { openSockets++; s.on('close', () => { closedSockets++ }) })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()))
  port = (server.address() as AddressInfo).port
})

afterAll(async () => {
  await new Promise<void>(r => { server.close(() => r()); server.closeAllConnections?.() })
})

const url = (p: string, host = 'localhost') => `https://${host}:${port}${p}`
const H = { 'Content-Type': 'application/json', Authorization: 'Bearer test-key' }

describe('safePostResponse — request', () => {
  it('sends the POST body and headers and returns the upstream body', async () => {
    const res = await safePostResponse(url('/echo'), { headers: H, body: '{"hi":1}', lookup: testLookup, tlsCa: cert })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ got: '{"hi":1}', auth: 'Bearer test-key' })
    const last = seen[seen.length - 1]
    expect(last.method).toBe('POST')
    expect(last.headers['content-type']).toBe('application/json')
  })

  it('returns a non-2xx upstream answer as a response (the provider decides what it means)', async () => {
    const res = await safePostResponse(url('/limit'), { headers: H, body: '{}', lookup: testLookup, tlsCa: cert })
    expect(res.status).toBe(429)
    expect(await res.text()).toContain('slow down')
  })

  it('does not follow a redirect: the 3xx is returned and the target is never requested', async () => {
    const before = seen.filter(s => s.path === '/target').length
    const res = await safePostResponse(url('/redirect'), { headers: H, body: '{}', lookup: testLookup, tlsCa: cert })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/target')
    expect(seen.filter(s => s.path === '/target').length).toBe(before)
  })
})

describe('safePostResponse — streaming and cancellation', () => {
  it('delivers the stream incrementally: the first frame arrives before the server finishes', async () => {
    const res = await safePostResponse(url('/stream'), { headers: H, body: '{}', lookup: testLookup, tlsCa: cert })
    const reader = res.body!.getReader()
    const dec = new TextDecoder()
    const first = await reader.read()
    expect(dec.decode(first.value)).toContain('data: one')
    release?.()
    let rest = ''
    for (;;) { const n = await reader.read(); if (n.done) break; rest += dec.decode(n.value) }
    expect(rest).toContain('data: two')
    expect(rest).toContain('data: end')
  })

  it('an abort signal mid-stream destroys the socket and errors the stream', async () => {
    const ctrl = new AbortController()
    const res = await safePostResponse(url('/hold'), { headers: H, body: '{}', signal: ctrl.signal, lookup: testLookup, tlsCa: cert })
    const reader = res.body!.getReader()
    await reader.read()
    const closedBefore = closedSockets
    ctrl.abort(new Error('client gone'))
    await expect((async () => { for (;;) { const n = await reader.read(); if (n.done) return 'done'; } })()).rejects.toBeDefined()
    await new Promise(r => setTimeout(r, 50))
    expect(closedSockets).toBeGreaterThan(closedBefore)
  })

  it('an already-aborted signal refuses before any connection', async () => {
    const ctrl = new AbortController(); ctrl.abort(new Error('early'))
    await expect(safePostResponse(url('/echo'), { headers: H, body: '{}', signal: ctrl.signal, lookup: testLookup, tlsCa: cert })).rejects.toBeDefined()
  })
})

describe('safePostResponse — TLS and destination guarantees', () => {
  it('verifies the certificate: an untrusted self-signed certificate is refused', async () => {
    await expect(safePostResponse(url('/echo'), { headers: H, body: '{}', lookup: testLookup })).rejects.toThrow(/certificate|self|verify|unable/i)
  })

  it('verifies the hostname: a certificate for localhost does not serve another name', async () => {
    await expect(safePostResponse(url('/echo', 'example.test'), { headers: H, body: '{}', lookup: testLookup, tlsCa: cert })).rejects.toThrow(/Hostname|certificate|altname/i)
  })

  it('production default: the pinned lookup refuses a loopback address before any connection', async () => {
    await expect(safePostResponse(url('/echo'), { headers: H, body: '{}' })).rejects.toBeInstanceOf(BlockedDestinationError)
  })

  it('an IP literal host is refused outright (a custom lookup is not consulted for it)', async () => {
    await expect(safePostResponse(`https://127.0.0.1:${port}/echo`, { headers: H, body: '{}', lookup: testLookup, tlsCa: cert })).rejects.toBeInstanceOf(BlockedDestinationError)
  })

  it('a non-loopback http URL is refused', async () => {
    await expect(safePostResponse('http://api.example.test/v1/responses', { headers: H, body: '{}' })).rejects.toBeInstanceOf(BlockedDestinationError)
  })

  it('userinfo in the URL is refused (no credentials in a URL)', async () => {
    await expect(safePostResponse(`https://u:p@localhost:${port}/echo`, { headers: H, body: '{}', lookup: testLookup, tlsCa: cert })).rejects.toBeInstanceOf(BlockedDestinationError)
  })
})
