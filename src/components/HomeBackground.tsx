'use client'

import Image from 'next/image'
import { getActiveBackground } from '@/lib/background/backgroundManager'

/**
 * Full-bleed Home background layer (desktop + tablet only).
 *
 * Renders a fixed layer BEHIND the page content (`-z-10`). The HomeView root is
 * transparent from `md` up so this layer shows through; below `md` this element
 * is `hidden`, so the phone experience is untouched (and, being hidden +
 * non-priority, next/image does not fetch the asset on mobile).
 *
 * All selection logic lives in `backgroundManager` — this component only paints
 * whatever descriptor it's handed, so adding time-of-day/weather/etc. later
 * requires no change here.
 */
export default function HomeBackground() {
  const bg = getActiveBackground()

  return (
    <div aria-hidden className="fixed inset-0 -z-10 hidden md:block">
      <Image
        src={bg.src}
        alt={bg.alt}
        fill
        // The asset is already a hand-optimized WebP at sensible dimensions, so
        // `unoptimized` serves it directly instead of letting the Next optimizer
        // UPSCALE a 1672px source to a 3840px candidate (slower + larger bytes,
        // no extra detail on a decorative background).
        unoptimized
        // Not `priority`: keeps it lazy so the hidden (mobile) instance is not
        // fetched, and the background never competes with the Hero for LCP.
        className="object-cover"
        style={{ objectPosition: bg.position }}
      />
      {bg.overlayLight && (
        <div
          className="absolute inset-0 dark:hidden"
          style={{ background: bg.overlayLight }}
        />
      )}
      {bg.overlayDark && (
        <div
          className="absolute inset-0 hidden dark:block"
          style={{ background: bg.overlayDark }}
        />
      )}
    </div>
  )
}
