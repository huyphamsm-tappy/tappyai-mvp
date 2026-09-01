/**
 * BUG-007 — SSRF through the QR path.
 *
 * ============================================================================
 * THE HOLE
 * ============================================================================
 * `checkUrl` coerces http→https and then refuses anything `isSafeHttpsUrl` rejects, so a private
 * or internal address never reaches a provider. `checkQr` did neither: it normalised whatever URL
 * the QR image decoded to and went straight to `runCheck`. The QR decoder accepts `http:` as well
 * as `https:`, so an anonymous visitor could upload an image encoding `http://169.254.169.254/…`
 * and the server would issue the request.
 *
 * ============================================================================
 * THE PROPERTY THESE TESTS LOCK
 * ============================================================================
 * 🔑 Not "an error is returned" — that could pass while the request still went out. The assertion
 * is that **`executeProviders` is never called** for an unsafe target. No provider runs, so no
 * fetch, no DNS lookup, no third-party lookup, and nothing to leak back through the evidence
 * report.
 *
 * The last test is the one that keeps the two doors the same size: whatever policy the URL path
 * applies, the QR path applies too.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  decoded: 'https://example.com/',
  // Typed with its real parameter so the assertion below can read the target it was handed.
  executeProviders: vi.fn(async (_target: { url: URL }) => [] as unknown[]),
}))

vi.mock('../qr/decoder', () => ({
  decodeQrImage: async () => ({ success: true, text: h.decoded, url: new URL(h.decoded) }),
}))
vi.mock('../orchestrator', () => ({ executeProviders: h.executeProviders }))
vi.mock('../directory/officialDirectory', () => ({ officialDirectory: { getAll: async () => [] } }))
vi.mock('../cache/redisCache', () => ({ getCachedSignals: async () => new Map(), setCachedSignal: async () => {} }))

import { checkQr, checkUrl } from '../index'

const IMAGE = new Uint8Array([1, 2, 3])

/** Did the target ever reach a provider? That is the only question that matters here. */
async function reachedProviders(url: string): Promise<boolean> {
  h.decoded = url
  h.executeProviders.mockClear()
  try { await checkQr(IMAGE) } catch { /* refusal is the expected path for unsafe input */ }
  return h.executeProviders.mock.calls.length > 0
}

async function qrRefuses(url: string): Promise<boolean> {
  h.decoded = url
  try { await checkQr(IMAGE); return false } catch (e) {
    return /private|internal/i.test(e instanceof Error ? e.message : String(e))
  }
}

async function urlRefuses(url: string): Promise<boolean> {
  try { await checkUrl(url); return false } catch (e) {
    return /private|internal/i.test(e instanceof Error ? e.message : String(e))
  }
}

beforeEach(() => { h.executeProviders.mockClear(); h.decoded = 'https://example.com/' })

describe('BUG-007 — a QR code cannot make the server call an internal address', () => {
  const UNSAFE: [string, string][] = [
    ['localhost', 'http://localhost/admin'],
    ['loopback IPv4', 'http://127.0.0.1/'],
    ['cloud metadata', 'http://169.254.169.254/latest/meta-data/'],
    ['private 10/8', 'http://10.0.0.1/'],
    ['private 172.16/12', 'http://172.16.0.1/'],
    ['private 192.168/16', 'http://192.168.1.1/'],
    ['CGNAT 100.64/10', 'http://100.64.0.1/'],
    ['IPv6 loopback', 'http://[::1]/'],
    ['IPv6 unique-local', 'http://[fd00::1]/'],
    ['internal TLD', 'https://vault.internal/'],
    ['.local mDNS', 'https://printer.local/'],
    ['https loopback', 'https://127.0.0.1/'],
  ]

  for (const [name, url] of UNSAFE) {
    it(`🚨 refuses ${name} BEFORE any provider runs`, async () => {
      expect(await reachedProviders(url)).toBe(false)
      expect(await qrRefuses(url)).toBe(true)
    })
  }

  it('a public https QR is still checked normally', async () => {
    h.decoded = 'https://vietcombank.com.vn/'
    const result = await checkQr(IMAGE)
    expect(result.inputType).toBe('qr')
    expect(h.executeProviders).toHaveBeenCalledTimes(1)
  })

  it('a public http QR is upgraded to https and allowed, exactly like the URL path', async () => {
    h.decoded = 'http://vietcombank.com.vn/'
    const result = await checkQr(IMAGE)
    expect(result.url.startsWith('https://')).toBe(true)
    expect(h.executeProviders).toHaveBeenCalledTimes(1)
    const passed = h.executeProviders.mock.calls[0][0]
    expect(passed.url.protocol).toBe('https:')
  })
})

describe('BUG-007 — the two doors are the same size', () => {
  const CASES = [
    'http://127.0.0.1/', 'http://169.254.169.254/', 'http://10.0.0.1/',
    'http://172.16.0.1/', 'http://192.168.1.1/', 'http://[::1]/', 'https://vault.internal/',
  ]

  it('🚨 every URL the direct check refuses, the QR check refuses too', async () => {
    for (const url of CASES) {
      expect([url, await urlRefuses(url)]).toEqual([url, true])
      expect([url, await qrRefuses(url)]).toEqual([url, true])
    }
  })

  it('and a public host is accepted by both', async () => {
    h.decoded = 'https://vietcombank.com.vn/'
    await expect(checkQr(IMAGE)).resolves.toBeTruthy()
    await expect(checkUrl('https://vietcombank.com.vn/')).resolves.toBeTruthy()
  })
})
