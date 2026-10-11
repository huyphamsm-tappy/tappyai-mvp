/**
 * `safeGetText` redirect hops — an IP-literal hop never reaches the socket layer.
 *
 * The pinned resolver (`safeLookup`) is the SSRF boundary for NAMES. It is not one for literal
 * addresses: Node connects to an IP literal directly and never calls a custom `lookup`. Callers
 * pre-filter only the first url, so a public page answering `302 Location: https://127.0.0.1/`
 * used to be followed. These tests count real TCP arrivals at a loopback `net` server.
 *
 * Harness: `https.request` is wrapped. Requests to the fake public host `public.example` get a
 * scripted response (there is no TLS endpoint to succeed against); every other request goes to
 * the REAL `https.request`, so a hop that slips through actually dials and is counted.
 *
 * The control test comes first: without the hop check, the transport alone DOES connect to
 * 127.0.0.1 even with `lookup: safeLookup` set. Every `0` below means something only because that
 * `1` proves the counter can see a connection.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import net from 'node:net'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { RequestOptions } from 'node:https'

type Scripted = { status: number; headers?: Record<string, string>; body?: string }

const harness = vi.hoisted(() => ({
  /** Every hostname `https.request` was asked to dial, in order. */
  requested: [] as string[],
  /** Scripted responses for `public.example`, keyed by path. */
  routes: new Map<string, Scripted>(),
}))

vi.mock('node:https', async importOriginal => {
  const actual = await importOriginal<typeof import('node:https')>()
  const request = ((opts: RequestOptions, cb?: (res: unknown) => void) => {
    harness.requested.push(String(opts.hostname))
    if (opts.hostname !== 'public.example') {
      return (actual.request as unknown as (o: RequestOptions, c?: unknown) => unknown)(opts, cb)
    }
    const req = new EventEmitter() as EventEmitter & { end: () => void }
    req.end = () => {
      const route = harness.routes.get(String(opts.path)) ?? { status: 404 }
      const res = Object.assign(new PassThrough(), {
        statusCode: route.status,
        headers: route.headers ?? {},
      })
      queueMicrotask(() => {
        cb?.(res)
        res.end(route.body ?? '')
      })
    }
    return req
  }) as unknown as typeof actual.request
  const mod = { ...actual, request }
  return { ...mod, default: mod }
})

import https from 'node:https'
import { safeGetText, safeLookup, BlockedDestinationError } from '@/lib/security/safeFetch'

const connections: string[] = []
const server = net.createServer(sock => {
  connections.push(sock.remoteAddress ?? '?')
  sock.destroy()
})
const port: number = await new Promise(resolve => {
  server.listen(0, '127.0.0.1', () => resolve((server.address() as net.AddressInfo).port))
})
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())))

beforeEach(() => {
  connections.length = 0
  harness.requested.length = 0
  harness.routes.clear()
})

const get = (url: string) =>
  safeGetText(url, AbortSignal.timeout(1500), { maxBytes: 10_000 })
    .then(r => r)
    .catch((e: unknown) => (e instanceof BlockedDestinationError ? ('blocked' as const) : e))

describe('control: the pinned resolver does not cover IP literals', () => {
  it('a raw request to 127.0.0.1 with lookup: safeLookup still connects', async () => {
    const lookupSpy = vi.fn(safeLookup)
    await new Promise<void>(resolve => {
      const req = https.request(
        { hostname: '127.0.0.1', port, path: '/', method: 'GET', lookup: lookupSpy, agent: false, signal: AbortSignal.timeout(1500) },
        res => { res.resume(); resolve() },
      )
      req.on('error', () => resolve())
      req.end()
    })
    // Give the server's connection handler a turn in case the client errored first.
    await new Promise(r => setTimeout(r, 50))
    expect(lookupSpy).not.toHaveBeenCalled()
    expect(connections).toHaveLength(1)
  })
})

describe('safeGetText validates every redirect hop before dialling it', () => {
  const internalTargets = [
    `https://127.0.0.1:${port}/`,
    `https://[::1]:${port}/`,
    `https://[::ffff:127.0.0.1]:${port}/`,
    `https://10.0.0.5/`,
    `https://192.168.1.1/admin`,
    `https://169.254.169.254/latest/meta-data/`,
    `https://2130706433:${port}/`,          // 127.0.0.1 as a decimal integer
    `https://0x7f.0.0.1:${port}/`,          // 127.0.0.1 with a hex octet
    `https://localhost:${port}/`,
    `http://example.com/`,                  // scheme downgrade
    `https://user:pw@example.com/`,         // credentials
  ]

  it.each(internalTargets)('refuses a redirect to %s without requesting it', async target => {
    harness.routes.set('/start', { status: 302, headers: { location: target } })

    const result = await get('https://public.example/start')

    expect(result).toBe('blocked')
    expect(harness.requested).toEqual(['public.example'])
    expect(connections).toHaveLength(0)
  })

  it('the refusal message names no address', async () => {
    harness.routes.set('/start', { status: 301, headers: { location: 'https://10.0.0.5/' } })
    const err = await safeGetText('https://public.example/start', AbortSignal.timeout(1500), { maxBytes: 100 })
      .catch((e: Error) => e)
    expect(err).toBeInstanceOf(BlockedDestinationError)
    expect((err as Error).message).not.toMatch(/10\.0\.0\.5|\d+\.\d+\.\d+\.\d+/)
  })

  it('refuses an IP-literal FIRST url too, before any request', async () => {
    const result = await get(`https://127.0.0.1:${port}/`)
    expect(result).toBe('blocked')
    expect(harness.requested).toEqual([])
    expect(connections).toHaveLength(0)
  })

  it('still follows a public relative redirect and reports the final url', async () => {
    harness.routes.set('/start', { status: 302, headers: { location: '/next?x=1' } })
    harness.routes.set('/next?x=1', { status: 200, headers: { 'content-type': 'text/html' }, body: '<title>ok</title>' })

    const result = await get('https://public.example/start')

    expect(result).toEqual({
      text: '<title>ok</title>',
      finalUrl: 'https://public.example/next?x=1',
      contentType: 'text/html',
    })
    expect(harness.requested).toEqual(['public.example', 'public.example'])
    expect(connections).toHaveLength(0)
  })
})
