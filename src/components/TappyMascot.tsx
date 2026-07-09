'use client'

import { useState } from 'react'

// ── Tappy Core Pose Library (18 canonical poses) ────────────────────────────
// The OWNER owns all art (the 3D otter mascot). This file is code only: it maps
// every in-app situation to ONE of these 18 poses (18 poses → 100+ situations).
// Drop each exported PNG at /public/tappy/<pose>.png (transparent, 288×288 @3×);
// the component scales it to the display size and falls back to 🤖 until the
// file exists. NEVER add/redesign a pose here — art is the owner's domain.
export type TappyPose =
  | 'welcome'        // 01
  | 'wave'           // 02  (default / overview)
  | 'thinking'       // 03
  | 'searching'      // 04
  | 'food'           // 05
  | 'travel'         // 06
  | 'shopping'       // 07
  | 'deals'          // 08
  | 'entertainment'  // 09
  | 'aitools'        // 10
  | 'recommendation' // 11
  | 'success'        // 12
  | 'sorry'          // 13  (error)
  | 'reading'        // 14
  | 'phone'          // 15
  | 'speaking'       // 16
  | 'delivery'       // 17
  | 'spa'            // 18

// Emoji fallback per pose — shown only until the real PNG is dropped in.
const FALLBACK: Record<TappyPose, string> = {
  welcome: '👋', wave: '🤖', thinking: '🤔', searching: '🔎', food: '🍜',
  travel: '✈️', shopping: '🛍️', deals: '🎯', entertainment: '🎧', aitools: '💻',
  recommendation: '🛡️', success: '🎉', sorry: '😔', reading: '📖', phone: '📱',
  speaking: '💬', delivery: '🛵', spa: '💆',
}

// Phase 1 poses (ship as soon as these 13 land) — the rest are Phase 2.
export const PHASE_1: TappyPose[] = [
  'welcome', 'wave', 'thinking', 'searching', 'food', 'travel', 'shopping',
  'deals', 'entertainment', 'aitools', 'recommendation', 'success', 'sorry',
]

export function TappyMascot({
  pose = 'wave',
  size = 40,
  className = '',
  alt = '',
  eager = false,
  animated = false,
}: {
  pose?: TappyPose
  size?: number
  className?: string
  alt?: string
  eager?: boolean
  animated?: boolean
}) {
  const [failed, setFailed] = useState(false)
  const motionClass = animated ? `tappy-motion-${pose}` : ''

  if (failed) {
    return (
      <span
        aria-hidden={!alt}
        className={`${motionClass} ${className}`.trim()}
        style={{ fontSize: Math.round(size * 0.72), lineHeight: 1, display: 'inline-block' }}
      >
        {FALLBACK[pose]}
      </span>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- pose-keyed static asset from /public; next/image adds no benefit for a fixed-size mascot
    <img
      src={`/tappy/${pose}.png`}
      width={size}
      height={size}
      alt={alt}
      className={`${motionClass} ${className}`.trim()}
      onError={() => setFailed(true)}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      style={{ objectFit: 'contain', display: 'inline-block' }}
      draggable={false}
    />
  )
}
