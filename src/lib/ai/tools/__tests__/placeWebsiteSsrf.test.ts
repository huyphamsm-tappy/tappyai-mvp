/**
 * BUG-010 — the place-website fetch could be pointed at our own network.
 *
 * ============================================================================
 * WHAT WAS WRONG
 * ============================================================================
 * `fetchOfficialWebsiteImage` fetched `place.website_uri` server-side to read its `og:image`.
 * `website_uri` is whatever a business owner typed into their Google listing, and the only guard
 * was `isSafeHttpsUrl` — which reads a STRING. `https://looks-fine.example/` passes it and can
 * resolve to `169.254.169.254`.
 *
 * The second half was worse: `redirect: 'follow'`. Following happens INSIDE the HTTP client, so
 * even a genuinely public first hop could answer `302 Location: http://10.0.0.5/` and be fetched
 * before any code of ours ran again. There was no seam at which to check hop two.
 *
 * Self-triggerable: point your own listing at your own domain, then ask TappyAI about your own
 * place. The og:image comes back to you, so this returned data — not merely a blind request.
 *
 * ============================================================================
 * WHAT IS ASSERTED
 * ============================================================================
 * 🚨 Connections, not verdicts. `null` is returned on every failure path, so "returns null" proves
 * nothing at all about whether the packet went out. These tests count TCP connections arriving at
 * a real listening socket.
 *
 * 🔑 And the first test connects WITHOUT the policy to prove the counter can see one. Without that
 * control, every `toBe(0)` below would pass just as happily against a broken harness.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import net from 'node:net'
import https from 'node:https'
import type { LookupAddress } from 'node:dns'
import type { LookupFunction } from 'node:net'

const dnsAnswer = vi.hoisted(() => ({
  addresses: [] as { address: string; family: number }[],
  calls: 0,
}))

vi.mock('node:dns', async importOriginal => {
  const actual = await importOriginal<typeof import('node:dns')>()
  return {
    ...actual,
    default: actual,
    lookup: (_h: string, _o: unknown, cb: (e: Error | null, a?: LookupAddress[]) => void) => {
      dnsAnswer.calls++
      cb(null, dnsAnswer.addresses as LookupAddress[])
    },
  }
})

import { fetchOfficialWebsiteImage } from '../common'

const connections: string[] = []
const server = net.createServer(sock => {
  connections.push(sock.remoteAddress ?? '?')
  sock.destroy()
})
const port: number = await new Promise(resolve => {
  server.listen(0, '127.0.0.1', () => resolve((server.address() as net.AddressInfo).port))
})

const v4 = (address: string): LookupAddress => ({ address, family: 4 })
const v6 = (address: string): LookupAddress => ({ address, family: 6 })

beforeEach(() => { connections.length = 0; dnsAnswer.calls = 0 })
afterAll(() => { server.close() })

describe('the harness can see a connection at all', () => {
  it('🔑 CONTROL — a lookup pointing here, with no policy, DOES connect', async () => {
    await new Promise<void>(resolve => {
      const req = https.request(
        {
          hostname: 'attacker-listing.example', port, method: 'GET', agent: false,
          lookup: ((_h, o, cb) =>
            o.all ? cb(null, [v4('127.0.0.1')]) : cb(null, '127.0.0.1', 4)) satisfies LookupFunction,
        },
        () => resolve(),
      )
      req.on('error', () => resolve())
      req.end()
    })

    expect(connections.length).toBe(1)
  })
})

describe('a listing whose website resolves inward is never fetched', () => {
  const INWARD: Array<[string, LookupAddress]> = [
    ['loopback', v4('127.0.0.1')],
    ['private 10/8', v4('10.0.0.5')],
    ['private 192.168/16', v4('192.168.1.1')],
    ['🚨 cloud metadata', v4('169.254.169.254')],
    ['IPv6 unique-local', v6('fd00::1')],
    ['🚨 IPv4-mapped metadata', v6('::ffff:169.254.169.254')],
  ]

  for (const [name, address] of INWARD) {
    it(`🚨 ${name} — no og:image, and NOTHING connects`, async () => {
      dnsAnswer.addresses = [address]

      const result = await fetchOfficialWebsiteImage(`https://attacker-listing.example:${port}/`)

      expect(result).toBeNull()
      expect(connections.length).toBe(0)
    })
  }

  it('🚨 one private answer among public ones is enough', async () => {
    dnsAnswer.addresses = [v4('93.184.216.34'), v4('10.0.0.5')]

    expect(await fetchOfficialWebsiteImage(`https://attacker-listing.example:${port}/`)).toBeNull()
    expect(connections.length).toBe(0)
  })
})

describe('the string guard still does its own job', () => {
  it('an internal address written out is refused without even resolving', async () => {
    expect(await fetchOfficialWebsiteImage('https://169.254.169.254/')).toBeNull()
    expect(await fetchOfficialWebsiteImage('http://10.0.0.5/')).toBeNull()
    expect(await fetchOfficialWebsiteImage('https://vault.internal/')).toBeNull()

    expect(dnsAnswer.calls).toBe(0)   // rejected on the string, before any lookup
    expect(connections.length).toBe(0)
  })

  it('an empty website_uri does nothing', async () => {
    expect(await fetchOfficialWebsiteImage('')).toBeNull()
    expect(connections.length).toBe(0)
  })
})

describe('🚨 the HTTP client no longer follows redirects on its own', () => {
  it('the global fetch is never used for the page fetch', async () => {
    // The old implementation was `fetch(websiteUri, { redirect: 'follow' })`. That single option
    // is the whole redirect hole, and it lives inside undici where no assertion can reach it —
    // so what is locked here is that this function does not go through `fetch` AT ALL. Restore
    // the old call and this fails immediately.
    const spy = vi.fn()
    const original = globalThis.fetch
    globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
      spy(String(args[0]))
      return original(...args)
    }) as typeof fetch

    dnsAnswer.addresses = [v4('10.0.0.5')]
    await fetchOfficialWebsiteImage(`https://attacker-listing.example:${port}/`)

    globalThis.fetch = original
    expect(spy).not.toHaveBeenCalled()
    expect(connections.length).toBe(0)
  })
})
