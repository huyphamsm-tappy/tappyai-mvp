'use client'

import { useState } from 'react'

// The 10 Tappy (otter) category icons from the official brand sheet. Drop the
// exported transparent PNGs into /public/tappy/<variant>.png (see the README
// there) and they light up everywhere this component is used. Until a file
// exists, each variant gracefully falls back to its emoji so nothing breaks.
export type TappyVariant =
  | 'overview'       // otter waving — general AI / welcome
  | 'places'         // magnifying glass — searching a place
  | 'food'           // bowl — Ăn uống
  | 'travel'         // camera + plane — Du lịch
  | 'shopping'       // bags — Mua sắm
  | 'deals'          // % — Deals
  | 'delivery'       // scooter — Giao hàng
  | 'entertainment'  // headphones — Giải trí
  | 'aitools'        // laptop — AI tools
  | 'recommendations'// shield — Gợi ý

const FALLBACK_EMOJI: Record<TappyVariant, string> = {
  overview: '🤖', places: '🔎', food: '🍜', travel: '✈️', shopping: '🛍️',
  deals: '🎯', delivery: '🛵', entertainment: '🎧', aitools: '💻', recommendations: '🛡️',
}

// Map an app CategoryId (food/shopping/entertainment/travel/spa/general) to a
// Tappy variant. Spa has no dedicated icon on the sheet yet → falls back to overview.
export function categoryToTappy(category?: string | null): TappyVariant {
  switch (category) {
    case 'food': return 'food'
    case 'shopping': return 'shopping'
    case 'entertainment': return 'entertainment'
    case 'travel': return 'travel'
    default: return 'overview'
  }
}

export function TappyMascot({
  variant = 'overview',
  size = 40,
  className = '',
  alt = '',
}: {
  variant?: TappyVariant
  size?: number
  className?: string
  alt?: string
}) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <span
        aria-hidden={!alt}
        className={className}
        style={{ fontSize: Math.round(size * 0.72), lineHeight: 1, display: 'inline-block' }}
      >
        {FALLBACK_EMOJI[variant]}
      </span>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- variant-keyed static asset from /public, next/image adds no benefit
    <img
      src={`/tappy/${variant}.png`}
      width={size}
      height={size}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
      style={{ objectFit: 'contain', display: 'inline-block' }}
      draggable={false}
    />
  )
}
