import { memo } from 'react'
import { resolveBrand } from '@/config/brandRegistry'

// Pure renderer over src/config/brandRegistry.ts — ALL brand knowledge (ids,
// names, assets, tile treatment, optical scale, licensing provenance) lives in
// the registry, which is platform-independent and mirrored by native clients.
// This component only turns a resolved BrandDefinition into markup. Adding or
// changing a partner never touches this file.

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
 * inner box (72% of the tile × the brand's OPTICAL scale, clamped so nothing
 * escapes the tile padding) and `object-contain`, so every brand renders at
 * the same visual weight with its own aspect ratio — wordmarks fill the
 * width, square marks fill the height, nothing is ever stretched or cropped.
 * SVG sources stay crisp at any devicePixelRatio; PNG-only brands ship ≥200px
 * sources (2-3× the rendered box). `logo` may be a local /brands/ path or a
 * full CDN URL — rendered identically (admin-CMS path, BRAND_ASSETS.md §5).
 */
function BrandLogoBase({ partnerName, size = 48, className = '', decorative = false }: BrandLogoProps) {
  const brand = resolveBrand(partnerName)
  if (!brand) return null

  const inner = Math.round(size * 0.72 * Math.min(brand.scale, 1.15))
  return (
    <div
      className={`flex-shrink-0 flex items-center justify-center rounded-xl overflow-hidden ${TILE_CLASSES[brand.background]} ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Plain <img>, deliberate: local SVG needs no next/image pipeline, and fixed
          box dimensions already prevent layout shift. eslint's no-img-element is a
          warning-level rule in this repo for exactly such cases. */}
      <img
        src={brand.logo}
        alt={decorative ? '' : `${brand.displayName} logo`}
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
