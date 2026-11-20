// @vitest-environment node
// Plan PDF pictures (20/11): the public-page fetch can also read a small PICTURE (png / jpeg / webp / gif), raw bytes, only when the caller asks with imageMaxBytes. Every other rule stays:
// no picture without the option, no SVG (it can carry script), a picture over the cap is refused whole (a cut picture is useless), the option reaches the transport only when asked for.
import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { fetchPublicPage, realHop, type HopResult, type HopTransport } from '../safePageFetch'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

describe('image mode of the page fetch (real sockets against a local server)', () => {
  let server: http.Server
  let base = ''
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/png') { res.writeHead(200, { 'content-type': 'image/png' }); res.end(PNG) }
      else if (req.url === '/jpg-big') { res.writeHead(200, { 'content-type': 'image/jpeg' }); res.end(Buffer.alloc(50_000, 1)) }
      else if (req.url === '/svg') { res.writeHead(200, { 'content-type': 'image/svg+xml' }); res.end('<svg onload="alert(1)"/>') }
      else { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html></html>') }
    })
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => { server.closeAllConnections(); server.close() })
  const hop = (path: string, o: Partial<{ imageMaxBytes: number }> = {}) =>
    realHop(new URL(base + path), { signal: new AbortController().signal, maxBytes: 800_000, connectTimeoutMs: 2_000, readTimeoutMs: 2_000, ...o })

  it('reads a png as raw bytes when asked, with its content type', async () => {
    const r = await hop('/png', { imageMaxBytes: 1_000_000 }) as Extract<HopResult, { kind: 'body' }>
    expect(r).toMatchObject({ kind: 'body', status: 200, contentType: 'image/png', body: '' })
    expect(Buffer.from(r.raw!).equals(PNG)).toBe(true)
  })
  it('refuses a picture when the caller did not ask for pictures', async () => {
    expect(await hop('/png')).toMatchObject({ kind: 'error', reason: 'unsupported_content_type' })
  })
  it('refuses a picture over the cap whole, and never reads an SVG', async () => {
    expect(await hop('/jpg-big', { imageMaxBytes: 10_000 })).toMatchObject({ kind: 'error', reason: 'image_too_large' })
    expect(await hop('/svg', { imageMaxBytes: 1_000_000 })).toMatchObject({ kind: 'error', reason: 'unsupported_content_type' })
  })
  it('imageMaxBytes reaches the transport only when asked for', async () => {
    const seen: Array<number | undefined> = []
    const t: HopTransport = async (_u, o) => { seen.push(o.imageMaxBytes); return { kind: 'body', status: 200, contentType: 'image/png', body: '', bytes: 4, truncated: false, raw: PNG } }
    await fetchPublicPage('https://img.example/a.png', { imageMaxBytes: 5000 }, t)
    await fetchPublicPage('https://img.example/a.png', {}, t)
    expect(seen).toEqual([5000, undefined])
  })
})
