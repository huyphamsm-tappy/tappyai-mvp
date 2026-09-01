/**
 * DNS rebinding / SSRF — the destination is an ADDRESS, not a string.
 *
 * ============================================================================
 * WHAT THESE TESTS MEASURE
 * ============================================================================
 * 🚨 Not "was an unsafe verdict returned". A verdict can be perfectly correct and arrive one
 * millisecond after the request already went out, which is the entire thing being prevented. Every
 * assertion here counts TCP connections that actually arrived at a listening socket.
 *
 * The harness makes that countable: a real `net` server on loopback, and a fake resolver that
 * decides what the attacker's hostname "resolves" to. The hostname exists nowhere in real DNS, so
 * a connection can only arrive if our own code sent it there.
 *
 * ============================================================================
 * THE CONTROL MATTERS AS MUCH AS THE TEST
 * ============================================================================
 * A test asserting `connections === 0` passes just as well when the harness is broken and could
 * never have observed a connection at all. So the first test deliberately connects WITHOUT the
 * policy and asserts the count reaches 1. Every `0` that follows is meaningful only because that
 * `1` proves the counter works.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import net from 'node:net'
import https from 'node:https'
import type { LookupAddress } from 'node:dns'
import type { LookupFunction } from 'node:net'

/**
 * What the fake resolver answers with, and how many times it was asked.
 *
 * `queue` lets a test hand out a DIFFERENT answer on each call — that is how the rebinding
 * scenario is staged. `calls` is what proves the gap is closed: a resolve-then-fetch design asks
 * twice and the attacker aims at the second answer, so "exactly one" is the property.
 */
const dnsAnswer = vi.hoisted(() => ({
  addresses: [] as { address: string; family: number }[],
  queue: null as { address: string; family: number }[][] | null,
  fail: false,
  calls: 0,
}))

vi.mock('node:dns', async importOriginal => {
  const actual = await importOriginal<typeof import('node:dns')>()
  return {
    ...actual,
    default: actual,
    lookup: (hostname: string, _options: unknown, cb: (e: Error | null, a?: LookupAddress[]) => void) => {
      dnsAnswer.calls++
      if (dnsAnswer.fail) return cb(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }))
      const next = dnsAnswer.queue?.shift()
      cb(null, (next ?? dnsAnswer.addresses) as LookupAddress[])
    },
  }
})

import { safeHeadRequest, safeGetText, BlockedDestinationError } from '@/lib/security/safeFetch'

/** A socket that counts arrivals and says nothing back. Enough to answer "did a packet land?". */
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

// Bounded on purpose: a refusal rejects instantly, but a case that is ALLOWED through actually
// dials, and an address that never answers would otherwise hang the run rather than fail it.
const attack = () =>
  safeHeadRequest(`https://attacker.example:${port}/`, AbortSignal.timeout(1200))
    .then(() => 'resolved' as const)
    .catch((e: unknown) => (e instanceof BlockedDestinationError ? 'blocked' : `error:${(e as Error).message}`))

beforeEach(() => {
  connections.length = 0
  dnsAnswer.fail = false
  dnsAnswer.queue = null
  dnsAnswer.calls = 0
})
afterAll(() => { server.close() })

describe('the harness can see a connection at all', () => {
  it('🔑 CONTROL — without the policy, a lookup pointing here DOES connect', async () => {
    // If this ever fails, every `toBe(0)` below is worthless and this file is measuring nothing.
    await new Promise<void>(resolve => {
      const req = https.request(
        {
          hostname: 'attacker.example', port, method: 'HEAD', agent: false,
          lookup: ((_h, o, cb) =>
            o.all ? cb(null, [v4('127.0.0.1')]) : cb(null, '127.0.0.1', 4)) satisfies LookupFunction,
        },
        () => resolve(),
      )
      req.on('error', () => resolve())   // TLS will fail against a bare socket; the TCP hit is the point
      req.end()
    })

    expect(connections.length).toBe(1)
  })
})

describe('a hostname that resolves inward is refused before any packet leaves', () => {
  const INWARD: Array<[string, LookupAddress]> = [
    ['loopback', v4('127.0.0.1')],
    ['private 10/8', v4('10.0.0.5')],
    ['private 172.16/12', v4('172.16.0.1')],
    ['private 192.168/16', v4('192.168.1.1')],
    ['link-local / cloud metadata', v4('169.254.169.254')],
    ['CGNAT 100.64/10', v4('100.64.0.1')],
    ['this-network 0/8', v4('0.0.0.0')],
    ['IPv6 loopback', v6('::1')],
    ['IPv6 unique-local', v6('fd00::1')],
    ['IPv6 link-local', v6('fe80::1')],
    ['IPv4-mapped IPv6, dotted', v6('::ffff:169.254.169.254')],
    ['IPv4-mapped IPv6, hex', v6('::ffff:7f00:1')],
  ]

  for (const [name, address] of INWARD) {
    it(`🚨 ${name} — blocked, and NOTHING connects`, async () => {
      dnsAnswer.addresses = [address]

      expect(await attack()).toBe('blocked')
      expect(connections.length).toBe(0)
    })
  }

  it('🚨 mixed answers — one public and one private is still refused', async () => {
    // The attacker does not need every answer to be useful; they need one. A resolver is free to
    // return these in any order, and "we picked a public one this time" is not a security property.
    dnsAnswer.addresses = [v4('93.184.216.34'), v4('10.0.0.5')]

    expect(await attack()).toBe('blocked')
    expect(connections.length).toBe(0)
  })

  it('🚨 mixed A + AAAA — a private AAAA alongside a public A is refused', async () => {
    dnsAnswer.addresses = [v4('93.184.216.34'), v6('fd00::1')]

    expect(await attack()).toBe('blocked')
    expect(connections.length).toBe(0)
  })

  it('an empty answer connects to nothing', async () => {
    dnsAnswer.addresses = []

    expect(await attack()).not.toBe('resolved')
    expect(connections.length).toBe(0)
  })

  it('a DNS failure connects to nothing', async () => {
    dnsAnswer.fail = true

    expect(await attack()).not.toBe('resolved')
    expect(connections.length).toBe(0)
  })
})

describe('the rebinding window is closed, not narrowed', () => {
  it('🚨 one request resolves the name EXACTLY once', async () => {
    // This is the whole defence stated as a number. Rebinding needs two resolutions with a gap:
    // a public answer to pass validation, a private one for the connection. A design that
    // resolves, validates, then lets the HTTP client resolve again would count 2 here and the
    // attacker would aim at the second. One resolution means there is no second answer to poison.
    dnsAnswer.addresses = [v4('10.0.0.5')]

    await attack()

    expect(dnsAnswer.calls).toBe(1)
  })

  it('🚨 a resolver that flips public→private cannot land a packet', async () => {
    // Staged as the attack would be: the first answer is public, the second private. If anything
    // in the path re-resolved, the private answer would be the one the socket used.
    // TEST-NET-1 for the public half so the "allowed" path dials somewhere unroutable instead of
    // a real host on the internet — the test must not depend on the network being up.
    dnsAnswer.queue = [[v4('192.0.2.1')], [v4('127.0.0.1')]]

    const first = await attack()

    // The first (public) answer was validated and pinned, so the socket went to 192.0.2.1 —
    // wherever that leads, it is NOT this loopback listener. The private second answer was never
    // consulted, so nothing arrived here.
    expect(connections.length).toBe(0)
    expect(dnsAnswer.calls).toBe(1)
    expect(first).not.toBe('resolved')   // that public address does not serve us TLS
  })
})

describe('safeGetText refuses a hop before it dials', () => {
  // 🚨 These exist because a mutant survived without them: deleting the scheme check in `getOnce`
  // broke nothing. It matters most on hop TWO — the first url is vetted by the caller, but a
  // redirect to `http://10.0.0.5/` is only ever stopped here, and following redirects is exactly
  // what this primitive was written to do safely.
  const get = (url: string) =>
    safeGetText(url, AbortSignal.timeout(1200), { maxBytes: 1000 })
      .then(() => 'fetched' as const)
      .catch((e: unknown) => (e instanceof BlockedDestinationError ? 'blocked' : 'other'))

  it('🚨 a plain-http url is refused with no connection', async () => {
    dnsAnswer.addresses = [v4('93.184.216.34')]

    expect(await get(`http://attacker.example:${port}/`)).toBe('blocked')
    expect(connections.length).toBe(0)
  })

  it('🚨 embedded credentials are refused with no connection', async () => {
    dnsAnswer.addresses = [v4('93.184.216.34')]

    expect(await get(`https://user:pass@attacker.example:${port}/`)).toBe('blocked')
    expect(connections.length).toBe(0)
  })

  it('a hostname resolving inward is refused with no connection', async () => {
    dnsAnswer.addresses = [v4('169.254.169.254')]

    expect(await get(`https://attacker.example:${port}/`)).toBe('blocked')
    expect(connections.length).toBe(0)
  })
})

describe('the refusal does not become an oracle', () => {
  it('🚨 nothing about the resolved address reaches the evidence report', async () => {
    // The evidence report is returned to whoever submitted the URL. If a refusal said "10.0.0.5",
    // an attacker could point a hostname at candidate addresses and read our own error text to map
    // the internal network — trading an SSRF for an information leak is not a fix.
    const { redirectProvider } = await import('../providers/redirect')
    dnsAnswer.addresses = [v4('10.11.12.13')]

    const url = new URL('https://looks-fine.example/pay')
    const sig = await redirectProvider.check(
      { url, hostname: url.hostname, domain: url.hostname },
      AbortSignal.timeout(1200),
    )

    expect(sig.finding).toBe('UNSAFE_REDIRECT')     // the right verdict, not a vague "check failed"
    expect(sig.severity).toBe('critical')

    const serialised = JSON.stringify(sig)
    expect(serialised).not.toContain('10.11.12.13')
    // No address of any shape, and no leaked internals to reconstruct one from.
    expect(serialised).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/)
    expect(connections.length).toBe(0)
  })
})

describe('an address the policy allows is not blocked by it', () => {
  it('a public answer passes the policy — the guard is not just "reject everything"', async () => {
    // TEST-NET-1: shaped like a public address, guaranteed not to route anywhere real. The
    // request must fail as TRANSPORT, never as a policy refusal — otherwise this file would pass
    // just as happily against a guard that blocked the entire internet.
    dnsAnswer.addresses = [v4('192.0.2.1')]

    const outcome = await safeHeadRequest('https://public.example/', AbortSignal.timeout(1200))
      .then(() => 'resolved')
      .catch((e: unknown) => (e instanceof BlockedDestinationError ? 'blocked' : 'transport-error'))

    expect(outcome).not.toBe('blocked')
    expect(dnsAnswer.calls).toBe(1)
  })
})
