// ─────────────────────────────────────────────────────────────────────────────
// Partner Brand Registry — the single, PLATFORM-INDEPENDENT source of truth
// for every deal-partner brand. Pure data + pure functions: no React, no
// Next.js, no DOM. Android/iOS mirror this exact schema for a native Deals
// surface (see docs/architecture/BRAND_ASSETS.md §2 for the normative schema).
//
// Rendering lives elsewhere (src/components/ui/BrandLogo.tsx — a pure
// renderer over this data). Validation lives in
// src/config/brandRegistry.validation.test.ts (`npm run validate:brands`,
// enforced in CI).
//
// ── HOW TO ADD A PARTNER (e.g. Lazada, Tiki, Amazon, eBay, AliExpress) ──────
// 1. Get the brand's OFFICIAL logo (their press/brand page, their own site's
//    served asset, or a Wikimedia Commons brand file). Never redraw, never
//    recolor. Prefer SVG; PNG only if the brand publishes no public vector
//    (≥200px source so it stays crisp at 2-3× DPR in a 48px tile).
// 2. Drop it in public/brands/<id>.svg (or .png) — kebab-case id — OR host it
//    on a CDN and use the full https:// URL (admin-CMS path, §5 of the doc).
// 3. Add ONE entry below and run `npm run validate:brands`.
//    · white/light-designed lockup?          → background: 'dark'
//    · admins type other spellings?          → aliases: ['Lazada VN']
//    · looks optically off next to the rest? → nudge scale (±0.1 max) —
//      optical balance is judged on screenshots, not computed.
// That's the whole change. No switch statements, no per-brand components.
// ⚠️ Product policy first: V1 restricts which commerce platforms TappyAI may
// surface (promptBuilder rule 18 — e.g. Amazon/eBay are NOT approved V1
// platforms). An entry here does not approve the partner; `approvedSince`
// records when the OWNER approved it for Deals.
// ─────────────────────────────────────────────────────────────────────────────

/** Deal-partner category (matches how the Deals admin groups partners). */
export type BrandCategory = 'shopping' | 'food-delivery' | 'transport' | 'travel'

export interface BrandDefinition {
  /** Stable kebab-case identifier — must equal its key in BRAND_REGISTRY. */
  readonly id: string
  /** Exact display/alt name ("Booking.com", "TikTok Shop"). */
  readonly displayName: string
  /** Extra admin spellings resolved to this brand (id + displayName always match). */
  readonly aliases: readonly string[]
  /** Local public path ('/brands/x.svg') or full https:// CDN URL — renderer treats both identically. */
  readonly logo: string
  /**
   * Tile background the OFFICIAL mark is designed for. 'light' = shared
   * neutral tile. 'dark' = the brand's lockup is light/white by brand
   * standard (TikTok Shop) — the tile supplies the background; the mark is
   * never recolored.
   */
  readonly background: 'light' | 'dark'
  /**
   * OPTICAL size correction (multiplier on the renderer's inner logo box,
   * default 1, clamped ≤1.15). Solid square marks read heavier than wordmarks
   * at equal pixel size → <1; airy wordmarks → slightly >1. Tuned by eye
   * against screenshots — never by math, never by stretching pixels.
   */
  readonly scale: number
  readonly category: BrandCategory
  readonly officialWebsite: string
  /** Format of the logo asset. 'svg' strongly preferred (see doc §1). */
  readonly assetType: 'svg' | 'png'
  /** Provenance of the exact asset file — licensing traceability (doc §4). */
  readonly source: string
  /** ISO date the Owner approved this partner for the Deals surface. */
  readonly approvedSince: string
}

export const BRAND_REGISTRY = {
  shopee: {
    id: 'shopee',
    displayName: 'Shopee',
    aliases: [],
    logo: '/brands/shopee.svg',
    background: 'light',
    scale: 1,
    category: 'shopping',
    officialWebsite: 'https://shopee.vn',
    assetType: 'svg',
    source: 'Wikimedia Commons — File:Shopee logo.svg (official vertical lockup)',
    approvedSince: '2026-07-31',
  },
  shopeefood: {
    id: 'shopeefood',
    displayName: 'ShopeeFood',
    aliases: ['Shopee Food'],
    logo: '/brands/shopeefood.png',
    background: 'light',
    scale: 1,
    category: 'food-delivery',
    officialWebsite: 'https://shopeefood.vn',
    assetType: 'png',
    source: 'shopeefood.vn — site-served official logo (brand publishes no public SVG)',
    approvedSince: '2026-07-31',
  },
  'tiktok-shop': {
    id: 'tiktok-shop',
    displayName: 'TikTok Shop',
    aliases: ['TikTokShop'],
    logo: '/brands/tiktok-shop.png',
    background: 'dark',
    scale: 1,
    category: 'shopping',
    officialWebsite: 'https://shop.tiktok.com',
    assetType: 'png',
    source: "TikTok seller-center CDN (oecstatic.com) — official lockup; white text is TikTok's brand standard, hence background: 'dark'",
    approvedSince: '2026-07-31',
  },
  grab: {
    id: 'grab',
    displayName: 'Grab',
    aliases: [],
    logo: '/brands/grab.svg',
    background: 'light',
    scale: 1.05,
    category: 'transport',
    officialWebsite: 'https://www.grab.com/vn/',
    assetType: 'svg',
    source: 'Wikimedia Commons — File:Grab Logo.svg',
    approvedSince: '2026-07-31',
  },
  be: {
    id: 'be',
    displayName: 'Be',
    aliases: ['beVN', 'Be Group'],
    logo: '/brands/be.svg',
    background: 'light',
    scale: 0.92,
    category: 'transport',
    officialWebsite: 'https://be.com.vn',
    assetType: 'svg',
    source: 'be.com.vn — official site theme asset (logo.svg)',
    approvedSince: '2026-07-31',
  },
  agoda: {
    id: 'agoda',
    displayName: 'Agoda',
    aliases: [],
    logo: '/brands/agoda.svg',
    background: 'light',
    scale: 1.1,
    category: 'travel',
    officialWebsite: 'https://www.agoda.com',
    assetType: 'svg',
    source: 'Wikimedia Commons — File:Agoda Logo 2022.svg',
    approvedSince: '2026-07-31',
  },
  booking: {
    id: 'booking',
    displayName: 'Booking.com',
    aliases: ['Booking'],
    logo: '/brands/booking.svg',
    background: 'light',
    scale: 0.92,
    category: 'travel',
    officialWebsite: 'https://www.booking.com',
    assetType: 'svg',
    source: 'Wikimedia Commons — File:Booking.com Icon 2022.svg (official "B." app icon; the wordmark is illegible at 48px)',
    approvedSince: '2026-07-31',
  },
} as const satisfies Record<string, BrandDefinition>

/** Strict brand identifier — derived from the registry, never hand-written strings. */
export type BrandId = keyof typeof BRAND_REGISTRY

export const BRAND_IDS = Object.keys(BRAND_REGISTRY) as readonly BrandId[]

export function isBrandId(value: string): value is BrandId {
  return value in BRAND_REGISTRY
}

/**
 * Diacritic-insensitive, punctuation-insensitive key: "Booking.com" →
 * "bookingcom", "TikTok Shop" → "tiktokshop". Matches however an admin typed
 * the partner name. Exported so the validator and native ports share it.
 */
export function normalizeBrandKey(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Built once at module load — resolution is a Map lookup, not a scan.
const BRAND_INDEX: ReadonlyMap<string, BrandId> = (() => {
  const index = new Map<string, BrandId>()
  for (const id of BRAND_IDS) {
    const def = BRAND_REGISTRY[id]
    index.set(normalizeBrandKey(id), id)
    index.set(normalizeBrandKey(def.displayName), id)
    for (const alias of def.aliases) index.set(normalizeBrandKey(alias), id)
  }
  return index
})()

/** BrandId for a free-text partner name, or null for unknown brands (graceful fallback — callers keep their own placeholder). */
export function resolveBrandId(partnerName: string | null | undefined): BrandId | null {
  if (!partnerName) return null
  return BRAND_INDEX.get(normalizeBrandKey(partnerName)) ?? null
}

/** Full definition for a free-text partner name, or null when unknown. */
export function resolveBrand(partnerName: string | null | undefined): BrandDefinition | null {
  const id = resolveBrandId(partnerName)
  return id ? BRAND_REGISTRY[id] : null
}
