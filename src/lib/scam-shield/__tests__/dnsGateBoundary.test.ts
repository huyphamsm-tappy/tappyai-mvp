/**
 * The entry gate, extended from "does this URL LOOK internal" to "does this name GO somewhere
 * internal".
 *
 * ============================================================================
 * WHY THE GATE STILL MATTERS WHEN THE SOCKET IS ALREADY PINNED
 * ============================================================================
 * `safeFetch` is the security boundary — it pins the connection to an address it validated, so
 * nothing internal is reachable whether or not this gate exists. What the gate buys is SEMANTICS.
 * Without it, `https://points-inward.example/` passes the string check, every provider fails on
 * its own, and the visitor gets a muddled "check failed" for what is really the same refusal as
 * typing `http://10.0.0.5/` by hand.
 *
 * ============================================================================
 * WHAT IS ASSERTED
 * ============================================================================
 * 🚨 Not the error message — that a rejection was returned proves nothing about whether the
 * request went out first. The assertion is that `executeProviders` is NEVER CALLED. No provider
 * runs, so there is no fetch, no TLS handshake, no third-party lookup, and nothing to leak back
 * through the evidence report.
 *
 * 🔑 This also holds the `await` in front of `assertSafeTarget`. The gate became async when it
 * started resolving; a forgotten `await` turns the throw into an unhandled rejection while
 * `runCheck` carries on regardless — a guard that reports and does not guard. Drop the `await` and
 * every test below fails, because the providers run.
 *
 * Both doors are tested. The QR path is the one that was open in BUG-007, and the rule for
 * keeping them the same size is that whatever the URL path refuses, the QR path refuses too.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  decoded: 'https://example.com/',
  resolved: [] as { address: string; family: number }[],
  resolveFails: false,
  executeProviders: vi.fn(async (_t: { url: URL }) => [] as unknown[]),
}))

vi.mock('node:dns/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:dns/promises')>()
  return {
    ...actual,
    default: actual,
    lookup: async () => {
      if (h.resolveFails) throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' })
      return h.resolved
    },
  }
})
vi.mock('../qr/decoder', () => ({
  decodeQrImage: async () => ({ success: true, text: h.decoded, url: new URL(h.decoded) }),
}))
vi.mock('../orchestrator', () => ({ executeProviders: h.executeProviders }))
vi.mock('../directory/officialDirectory', () => ({ officialDirectory: { getAll: async () => [] } }))
vi.mock('../cache/redisCache', () => ({ getCachedSignals: async () => new Map(), setCachedSignal: async () => {} }))

import { checkUrl, checkQr } from '../index'

const IMAGE = new Uint8Array([1, 2, 3])
const PUBLIC_LOOKING = 'https://looks-perfectly-fine.example/pay'

/** Did the target reach a provider? The only question that matters. */
async function reachedProviders(run: () => Promise<unknown>): Promise<boolean> {
  h.executeProviders.mockClear()
  try { await run() } catch { /* refusal is the expected path */ }
  return h.executeProviders.mock.calls.length > 0
}

const refused = async (run: () => Promise<unknown>): Promise<boolean> => {
  try { await run(); return false } catch (e) {
    return /private|internal/i.test(e instanceof Error ? e.message : String(e))
  }
}

beforeEach(() => {
  h.resolveFails = false
  h.decoded = PUBLIC_LOOKING
  h.resolved = [{ address: '93.184.216.34', family: 4 }]
})

describe('a public hostname that resolves inward never reaches a provider', () => {
  const INWARD = [
    ['loopback', '127.0.0.1', 4],
    ['private 10/8', '10.0.0.5', 4],
    ['private 192.168/16', '192.168.1.1', 4],
    ['🚨 cloud metadata', '169.254.169.254', 4],
    ['IPv6 unique-local', 'fd00::1', 6],
    ['🚨 IPv4-mapped metadata', '::ffff:169.254.169.254', 6],
  ] as const

  for (const [name, address, family] of INWARD) {
    it(`🚨 URL path — ${name} is refused with no provider run`, async () => {
      h.resolved = [{ address, family }]

      expect(await reachedProviders(() => checkUrl(PUBLIC_LOOKING))).toBe(false)
      expect(await refused(() => checkUrl(PUBLIC_LOOKING))).toBe(true)
    })

    it(`🚨 QR path — ${name} is refused with no provider run`, async () => {
      h.resolved = [{ address, family }]

      expect(await reachedProviders(() => checkQr(IMAGE))).toBe(false)
      expect(await refused(() => checkQr(IMAGE))).toBe(true)
    })
  }

  it('🚨 one private answer among public ones is enough to refuse', async () => {
    h.resolved = [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.5', family: 4 }]

    expect(await reachedProviders(() => checkUrl(PUBLIC_LOOKING))).toBe(false)
    expect(await refused(() => checkUrl(PUBLIC_LOOKING))).toBe(true)
  })
})

describe('what the gate must NOT refuse', () => {
  it('an ordinary public host still runs the full check', async () => {
    h.resolved = [{ address: '93.184.216.34', family: 4 }]

    await expect(checkUrl(PUBLIC_LOOKING)).resolves.toBeTruthy()
    expect(h.executeProviders).toHaveBeenCalled()
  })

  it('🔑 a domain that does not resolve is still examined, not refused', async () => {
    // Scam Shield's job includes reporting on domains that are dead, parked, or registered
    // yesterday — the DNS provider scores "no A record" as a signal in its own right. Failing
    // closed here would refuse to look at exactly the domains most worth looking at, and would
    // hand anyone a way to make a check fail by breaking their own DNS.
    h.resolveFails = true

    await expect(checkUrl('https://probably-parked.example/')).resolves.toBeTruthy()
    expect(h.executeProviders).toHaveBeenCalled()
  })

  it('the two doors stay the same size', async () => {
    // Whatever the URL path refuses, the QR path refuses too — the asymmetry between them is
    // precisely what BUG-007 was.
    h.resolved = [{ address: '169.254.169.254', family: 4 }]

    expect(await refused(() => checkUrl(PUBLIC_LOOKING))).toBe(true)
    expect(await refused(() => checkQr(IMAGE))).toBe(true)
  })
})
