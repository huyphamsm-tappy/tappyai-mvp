import { memo } from 'react'

// ── Partner brand registry ───────────────────────────────────────────────────
// Single source of truth for deal-partner logos. Adding a partner = adding ONE
// entry here + dropping its official asset in public/brands/. Nothing else —
// resolution, sizing, and rendering are generic (no switch statements).
//
// Assets are the brands' own published artwork (Wikimedia Commons brand files
// or files served by the brand's official site) — never redrawn, colors never
// modified. SVG preferred; PNG only where the brand publishes no public SVG
// (ShopeeFood, TikTok Shop — both ≥200px source, crisp at 2-3× on a 48px tile).
export interface BrandPartner {
  name: string
  logo: string
  /**
   * Tile treatment. 'light' (default) is the shared neutral tile. 'dark' is
   * for brands whose OFFICIAL lockup is designed for dark backgrounds
   * (TikTok Shop's wordmark is white by brand standard — putting it on the
   * light tile would hide it, and recoloring it is forbidden).
   */
  tile?: 'light' | 'dark'
  /**
   * OPTICAL size correction (multiplier on the inner logo box, default 1).
   * Solid square marks read visually heavier than wordmarks at the same pixel
   * box, so they get <1; airy wordmarks get slightly >1. Audit-tuned per
   * brand — normalize how big a logo LOOKS, never stretch its pixels.
   */
  scale?: number
  /** Extra normalized-name aliases for resolution, beyond `name` itself. */
  aliases?: string[]
}

// ── HOW TO ADD A PARTNER (e.g. Lazada, Tiki, Amazon, eBay, AliExpress) ──────
// 1. Get the brand's OFFICIAL logo (their press/brand page, their own site's
//    served asset, or a Wikimedia Commons brand file). Never redraw, never
//    recolor. Prefer SVG; PNG only if the brand publishes no public vector
//    (use a ≥200px source so it stays crisp at 2-3× DPR in the 48px tile).
// 2. Drop it in public/brands/<key>.svg (or .png) — kebab-case key.
// 3. Add ONE entry below:  lazada: { name: 'Lazada', logo: '/brands/lazada.svg' }
//    · white/light-designed lockup?          → add  tile: 'dark'
//    · admins type other spellings?          → add  aliases: ['Lazada VN']
//    · looks optically off next to the rest? → nudge scale (±0.1 max)
// That's the whole change — resolution, sizing, a11y, and fallbacks are
// generic. No switch statements, no per-brand components, ever.
// ⚠️ Product policy first: V1 restricts which commerce platforms TappyAI may
// surface (see promptBuilder rule 18 — e.g. Amazon/eBay are NOT approved V1
// platforms). Adding a logo here does not approve the partner; get the
// platform approved before its deals ship.
export const PARTNERS: Record<string, BrandPartner> = {
  shopee: { name: 'Shopee', logo: '/brands/shopee.svg' },
  shopeefood: { name: 'ShopeeFood', logo: '/brands/shopeefood.png', aliases: ['Shopee Food'] },
  'tiktok-shop': { name: 'TikTok Shop', logo: '/brands/tiktok-shop.png', tile: 'dark', aliases: ['TikTokShop'] },
  grab: { name: 'Grab', logo: '/brands/grab.svg', scale: 1.05 },
  be: { name: 'Be', logo: '/brands/be.svg', scale: 0.92, aliases: ['beVN', 'Be Group'] },
  agoda: { name: 'Agoda', logo: '/brands/agoda.svg', scale: 1.1 },
  booking: { name: 'Booking.com', logo: '/brands/booking.svg', scale: 0.92, aliases: ['Booking'] },
}

// Diacritic-insensitive, punctuation-insensitive key: "Booking.com" → "bookingcom",
// "TikTok Shop" → "tiktokshop". Matches however an admin typed the partner name.
function normalizeKey(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Built once at module load — resolution is a Map lookup, not a scan.
const PARTNER_INDEX: ReadonlyMap<string, BrandPartner> = (() => {
  const index = new Map<string, BrandPartner>()
  for (const [key, partner] of Object.entries(PARTNERS)) {
    index.set(normalizeKey(key), partner)
    index.set(normalizeKey(partner.name), partner)
    for (const alias of partner.aliases ?? []) index.set(normalizeKey(alias), partner)
  }
  return index
})()

/** The registry entry for a partner display name, or null when unknown (caller keeps its own fallback). */
export function resolveBrandPartner(partnerName: string | null | undefined): BrandPartner | null {
  if (!partnerName) return null
  return PARTNER_INDEX.get(normalizeKey(partnerName)) ?? null
}

// ── Component ────────────────────────────────────────────────────────────────

interface BrandLogoProps {
  partnerName: string
  /** Outer tile square, px. Logo is auto-fitted inside with its aspect ratio preserved. */
  size?: number
  className?: string
  /** True when adjacent text already names the partner — hides the image from AT. */
  decorative?: boolean
}

const TILE_CLASSES = {
  light:
    'bg-gradient-to-br from-gray-50 to-gray-100 dark:from-white dark:to-gray-200 ' +
    'border border-gray-100/80 dark:border-white/10',
  dark:
    'bg-gradient-to-br from-gray-900 to-black ' +
    'border border-gray-200/80 dark:border-white/10',
} as const

/**
 * Official partner logo on the shared premium tile. Renders null for partners
 * not in the registry so the call site keeps its existing fallback untouched.
 *
 * Sizing: the tile is a fixed square (no layout shift); the logo gets a fixed
 * inner box and `object-contain`, so every brand renders at the same visual
 * size with its own aspect ratio — wordmarks fill the width, square marks fill
 * the height, nothing is ever stretched or cropped. SVG sources stay crisp at
 * any devicePixelRatio; the two PNG-only brands ship ≥200px sources (2-3× the
 * rendered box).
 */
function BrandLogoBase({ partnerName, size = 48, className = '', decorative = false }: BrandLogoProps) {
  const partner = resolveBrandPartner(partnerName)
  if (!partner) return null

  // Consistent padding: logo box = 72% of the tile, then the per-brand OPTICAL
  // correction (clamped so no logo can ever escape the tile's padding).
  const inner = Math.round(size * 0.72 * Math.min(partner.scale ?? 1, 1.15))
  return (
    <div
      className={`flex-shrink-0 flex items-center justify-center rounded-xl overflow-hidden ${TILE_CLASSES[partner.tile ?? 'light']} ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Plain <img>, deliberate: local SVG needs no next/image pipeline, and fixed
          box dimensions already prevent layout shift. eslint's no-img-element is a
          warning-level rule in this repo for exactly such cases. */}
      <img
        src={partner.logo}
        alt={decorative ? '' : `${partner.name} logo`}
        aria-hidden={decorative || undefined}
        width={inner}
        height={inner}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="object-contain select-none"
        style={{ maxWidth: inner, maxHeight: inner, width: 'auto', height: 'auto' }}
      />
    </div>
  )
}

// Leaf component with primitive props — memo keeps deal-list re-renders (voucher
// copy state, countdown ticks) from re-rendering every logo tile.
const BrandLogo = memo(BrandLogoBase)
export default BrandLogo
