import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { BRAND_REGISTRY, normalizeBrandKey, type BrandDefinition } from './brandRegistry'

// ── Android brand registry ↔ web brand registry ──────────────────────────────
//
// Android's Deals cards showed a partner INITIAL — "S", "T", "G" — where the web shows the official
// Shopee, TikTok Shop and Grab marks. Not an API defect: `logoImage` is null on every current row
// BY DESIGN, because `BRAND_ASSETS.md` §8 makes the curated registry the FIRST of three fallbacks
// and it outranks per-content images for partners it knows. Android had implemented only the third
// step, the initial tile, so it always landed there.
//
// `BRAND_ASSETS.md` §13 specifies the Android mirror, and `docs/ios/13_PARITY_GOVERNANCE.md` §1
// makes the web implementation the spec. A hand-copied mirror silently drifts — a new partner added
// here, an alias fixed there — so this compares the two registries field by field and fails on the
// difference rather than letting one platform quietly resolve a name the other cannot.
//
// It runs in CI, which the Kotlin unit tests do not: CI does not run Gradle.

const KOTLIN =
  'android/core/common/src/main/kotlin/com/tappyai/core/common/brand/BrandRegistry.kt'
const ANDROID_ASSETS = 'android/app/src/main/assets'
const WEB_ASSETS = 'public'

/**
 * Reads a source file with line endings normalised.
 *
 * 🚨 Not cosmetic. This repo's line endings are not uniform — git checks Kotlin out as CRLF while a
 * file written during a port arrives as LF — so a pattern ending `{\n` matched while the file was
 * fresh and stopped matching after the next checkout. A guard that goes quiet is worse than one
 * never written. Normalising here makes every pattern in this file line-ending agnostic.
 */
const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

const source = () => read(KOTLIN)

interface KotlinBrand {
  id: string
  displayName: string
  aliases: string[]
  logo: string
  background: string
  scale: number
  category: string
  officialWebsite: string
  assetType: string
  approvedSince: string
}

/** Parses the `BrandDefinition(...)` literals out of the Kotlin registry. */
function kotlinBrands(): KotlinBrand[] {
  const out: KotlinBrand[] = []
  for (const block of source().matchAll(/BrandDefinition\(([\s\S]*?)\n    \),/g)) {
    const body = block[1]
    const str = (field: string) => {
      const m = new RegExp(`${field} = "((?:[^"\\\\]|\\\\.)*)"`).exec(body)
      return m ? m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\') : ''
    }
    const aliasesRaw = /aliases = (emptyList\(\)|listOf\(([^)]*)\))/.exec(body)
    const aliases = !aliasesRaw || aliasesRaw[1] === 'emptyList()'
      ? []
      : [...aliasesRaw[2].matchAll(/"([^"]*)"/g)].map((m) => m[1])
    out.push({
      id: str('id'),
      displayName: str('displayName'),
      aliases,
      logo: str('logo'),
      background: /background = BrandBackground\.(\w+)/.exec(body)?.[1] ?? '',
      scale: Number(/scale = ([\d.]+)/.exec(body)?.[1]),
      category: /category = BrandCategory\.(\w+)/.exec(body)?.[1] ?? '',
      officialWebsite: str('officialWebsite'),
      assetType: str('assetType'),
      approvedSince: str('approvedSince'),
    })
  }
  return out
}

/** `/brands/shopee.svg` and `brands/shopee.png` both reduce to `shopee`. */
const stem = (path: string) => path.replace(/^.*\//, '').replace(/\.[a-z0-9]+$/i, '')

const webBrands = Object.values(BRAND_REGISTRY) as BrandDefinition[]

describe('the Android brand registry mirrors the web registry', () => {
  const android = kotlinBrands()

  it('parses a non-empty Kotlin registry', () => {
    // Guards the guard: a parser that silently matched nothing would make every case below vacuous.
    expect(android.length).toBe(webBrands.length)
    expect(android.length).toBeGreaterThanOrEqual(7)
  })

  it('covers exactly the same brand ids', () => {
    expect(android.map((b) => b.id).sort()).toEqual(webBrands.map((b) => b.id).sort())
  })

  it.each(webBrands.map((b) => [b.id, b] as const))('%s matches field for field', (id, web) => {
    const kt = android.find((b) => b.id === id)
    expect(kt, `no Kotlin entry for ${id}`).toBeDefined()
    expect(kt!.displayName).toBe(web.displayName)
    expect(kt!.aliases).toEqual([...web.aliases])
    expect(kt!.background).toBe(web.background.toUpperCase())
    expect(kt!.scale).toBe(web.scale)
    // 'food-delivery' ↔ FOOD_DELIVERY
    expect(kt!.category).toBe(web.category.toUpperCase().replace(/-/g, '_'))
    expect(kt!.officialWebsite).toBe(web.officialWebsite)
    // assetType records the WEB asset's type; Android bundles PNG for all of them, so this must
    // keep saying "svg" for an SVG-sourced brand rather than being rewritten to match the bundle.
    expect(kt!.assetType).toBe(web.assetType)
    expect(kt!.approvedSince).toBe(web.approvedSince)
  })

  it.each(webBrands.map((b) => [b.id, b] as const))('%s points at the same artwork', (id, web) => {
    const kt = android.find((b) => b.id === id)!
    expect(stem(kt.logo)).toBe(stem(web.logo))
  })

  it.each(webBrands.map((b) => [b.id, b] as const))('%s ships both assets', (id, web) => {
    const kt = android.find((b) => b.id === id)!
    // A registry entry whose artwork is not bundled renders an empty tile — worse than the initial
    // it replaced, and invisible until someone looks at that one card on a device.
    expect(existsSync(`${ANDROID_ASSETS}/${kt.logo}`), `missing ${kt.logo}`).toBe(true)
    expect(existsSync(`${WEB_ASSETS}${web.logo}`), `missing ${web.logo}`).toBe(true)
  })
})

describe('name resolution agrees across platforms', () => {
  it('normalizes the same way', () => {
    // Mirrors the Kotlin `normalizeBrandKey`. If these drift, a partner name resolves on one
    // platform and falls through to the initial tile on the other — exactly the reported symptom.
    const kt = source()
    expect(kt).toContain('Normalizer.normalize(name, Normalizer.Form.NFD)')
    expect(kt).toContain('replace(Regex("\\\\p{Mn}+"), "")')
    expect(kt).toContain('.lowercase()')
    expect(kt).toContain('replace(Regex("[^a-z0-9]"), "")')
  })

  it.each([
    ['Shopee', 'shopee'],
    ['ShopeeFood', 'shopeefood'],
    ['Shopee Food', 'shopeefood'],
    ['TikTok Shop', 'tiktokshop'],
    ['TikTokShop', 'tiktokshop'],
    ['Booking.com', 'bookingcom'],
    ['Be Group', 'begroup'],
  ])('web normalizes %s to %s', (input, expected) => {
    expect(normalizeBrandKey(input)).toBe(expected)
  })

  it('every live partner name the Deals feed sends resolves to a brand', () => {
    // The seven partners on today's production feed. If a rename ever makes one unresolvable it
    // falls back to an initial silently, which is the bug this whole change exists to fix.
    const live = ['Shopee', 'ShopeeFood', 'TikTok Shop', 'Grab', 'Be', 'Agoda', 'Booking.com']
    const unresolved = live.filter((name) => {
      const key = normalizeBrandKey(name)
      return !webBrands.some(
        (b) =>
          normalizeBrandKey(b.id) === key ||
          normalizeBrandKey(b.displayName) === key ||
          b.aliases.some((a) => normalizeBrandKey(a) === key),
      )
    })
    expect(unresolved).toEqual([])
  })
})

describe('the Deals card walks the §8 fallback chain', () => {
  const screen = read('android/app/src/main/java/com/tappyai/app/deals/DealsScreen.kt')

  it('asks the registry first and keeps both later fallbacks', () => {
    // Order matters and is the whole contract: registry wins, then the content's own image, then
    // the initial.
    //
    // 🚨 The branch CONDITION is asserted, not just the token's position. The first version of this
    // compared `indexOf` offsets, and a mutation that disabled the branch outright
    // (`if (false && hasBrandLogo(…))`) left every offset unchanged and sailed through — the
    // registry would never have won and the test would still have been green.
    // The exact branch text, so `if (false && hasBrandLogo(…))` — a mutation that disables the
    // registry without moving anything — fails here rather than sailing through an offset check.
    expect(screen).toContain('if (hasBrandLogo(deal.partnerName)) {')
    expect(screen).toMatch(/BrandLogo\(partnerName = deal\.partnerName, size = 48\.dp\)/)

    const registryAt = screen.indexOf('hasBrandLogo(deal.partnerName)')
    const logoImageAt = screen.indexOf('if (deal.logoImage != null)')
    const initialAt = screen.indexOf('deal.partnerName.firstOrNull()?.uppercase()')
    expect(registryAt).toBeGreaterThan(-1)
    expect(logoImageAt).toBeGreaterThan(registryAt)
    expect(initialAt).toBeGreaterThan(logoImageAt)
  })
})
