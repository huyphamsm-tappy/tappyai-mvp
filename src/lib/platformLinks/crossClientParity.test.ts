import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildFoodOrderLinks } from './food'
import { buildTravelLinks } from './travel'
import { buildSpaLinks } from './spa'
import { buildEntertainmentLinks } from './entertainment'
import { buildShoppingLinks } from './shopping'
import { commerceOwnedHosts, marketplaceSearchPrefixes, withoutCommerceOwnedLinks } from './ccpShim'

// ── Cross-client platform-link parity ────────────────────────────────────────
//
// src/lib/platformLinks/* is the AUTHORITATIVE list of platforms TappyAI will link a user to.
// iOS reimplements the same builders in Swift (Features/Discovery/Model/PlatformLinks.swift)
// because ServiceDetailView builds them locally rather than reading them off the API. A
// reimplementation is allowed to exist; it is NOT allowed to disagree — a client that adds a
// platform of its own has become a second contract, and nothing else in the stack can see it.
//
// This guard caught exactly that: iOS's shopping list carried a fourth entry, "TikTok Shop"
// (https://www.tiktok.com/search?q=…), which the backend never emits. TikTok is an UNSUPPORTED
// platform in V1 — the product decision lives in config/product.ts (LINK_VIDEO_PROVIDERS =
// ['youtube']), promptBuilder rule 18 forbids linking outside Shopee/Tiki/Lazada for shopping,
// and streamEnrichment strips any TikTok line the model writes. Every layer enforced it except
// the one nobody could test from here.
//
// Static source comparison is the mechanism on purpose: there is no Swift toolchain on the
// build machine, so a text-level contract check is the only thing that can run in CI at all.

const SWIFT = 'ios/TappyAI/Features/Discovery/Model/PlatformLinks.swift'

/** Platform names a Swift builder constructs, in declaration order. */
function swiftLinkNames(source: string, fn: string): string[] {
  const start = source.indexOf(`static func ${fn}(`)
  if (start === -1) throw new Error(`${fn} not found in ${SWIFT}`)
  const next = source.indexOf('static func ', start + 1)
  const body = source.slice(start, next === -1 ? source.length : next)
  return [...body.matchAll(/PlatformLink\(name:\s*"([^"]+)"/g)].map(m => m[1])
}

const swift = readFileSync(SWIFT, 'utf8')

describe('iOS platform links match the authoritative backend list', () => {
  const CASES: Array<[string, string[]]> = [
    ['buildFoodOrderLinks', buildFoodOrderLinks('Quán A', '1 Lê Lợi', 'Quận 1').map(l => l.name)],
    ['buildTravelLinks', buildTravelLinks('Khách sạn A', 'Đà Nẵng').map(l => l.name)],
    ['buildSpaLinks', buildSpaLinks('Spa A', 'https://example.test', 'https://maps.google.com/?cid=1').map(l => l.name)],
    ['buildEntertainmentLinks', buildEntertainmentLinks('Rạp A', 'https://example.test', 'https://maps.google.com/?cid=1').map(l => l.name)],
    ['buildShoppingLinks', buildShoppingLinks('áo thun').map(l => l.name)],
  ]

  for (const [fn, backend] of CASES) {
    it(`${fn} offers the same platforms as the backend`, () => {
      expect(swiftLinkNames(swift, fn)).toEqual(backend)
    })
  }
})

describe('no client may surface an unsupported V1 platform', () => {
  it('the iOS builder emits no tiktok.com URL', () => {
    // TikTok is unsupported in V1 — enforced in the prompt and in streamEnrichment on the
    // server. A client that builds its own URL bypasses both.
    const offending = swift.split(/\r?\n/).filter(l => /tiktok\.com/i.test(l)).map(l => l.trim())
    expect(offending).toEqual([])
  })
})

// ── Phase 6 (owner decision D2): the parity guard is re-pointed at the CCP registry ─
//
// A merchant the Commerce Capability Platform transacts with (src/lib/ccp registry,
// tier 'mvp') is reached ONLY through a Commerce Link resolved server-side. No legacy
// builder — TypeScript or its Swift twin — may compose a URL on one of those hosts,
// or the same merchant would have two link authorities with two contracts.
describe('CCP-owned merchants are never linked by a legacy builder (D2)', () => {
  const hosts = commerceOwnedHosts()
  const hostRe = new RegExp(hosts.map(h => h.replace(/\./g, '\\.')).join('|'), 'i')

  it('the registry names the five MVP merchants and the three marketplaces', () => {
    expect(hosts.length).toBeGreaterThanOrEqual(8)
  })

  it('every backend builder output is unchanged by the CCP shim', () => {
    const outputs = [
      buildFoodOrderLinks('Quán A', '1 Lê Lợi', 'Quận 1'),
      buildTravelLinks('Khách sạn A', 'Đà Nẵng'),
      buildSpaLinks('Spa A', 'https://example.test', 'https://maps.google.com/?cid=1'),
      buildEntertainmentLinks('Rạp A', 'https://example.test', 'https://maps.google.com/?cid=1'),
      buildShoppingLinks('áo thun'),
    ]
    for (const links of outputs) expect(withoutCommerceOwnedLinks(links)).toEqual(links)
  })

  it('the iOS Swift builders spell no CCP merchant host, except the registry search grammars the backend builder projects', () => {
    const prefixes = marketplaceSearchPrefixes()
    const offending = swift.split(/\r?\n/).filter(l => hostRe.test(l) && !prefixes.some(p => l.includes(p))).map(l => l.trim())
    expect(offending).toEqual([])
  })

  it('the shopping builders are registry projections: Shopee + Lazada search pages, no TikTok Shop search (none exists), no Tiki', () => {
    const prefixes = marketplaceSearchPrefixes()
    expect(buildShoppingLinks('áo thun').map(l => l.name)).toEqual(['Shopee', 'Lazada'])
    expect(buildShoppingLinks('áo thun').every(l => prefixes.some(p => l.url.startsWith(p)))).toBe(true)
    expect(prefixes.some(p => p.includes('tiktok'))).toBe(false)
  })
})
