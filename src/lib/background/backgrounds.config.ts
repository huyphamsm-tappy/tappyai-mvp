/**
 * Home background catalog (data only — no logic).
 *
 * V1 ships a single high-quality production background. The shape is already
 * future-ready: the resolver in `backgroundManager.ts` can select a different
 * descriptor based on time-of-day / weather / season / city (all backlog)
 * without any change to the Home component.
 *
 * To swap the production image, change `src` here (and drop the file in
 * /public/backgrounds/). Optional readability overlays are declared per-theme
 * and are intentionally left off for light mode in V1 — add `overlayLight`
 * only if post-UAT readability requires it (see project backlog).
 */

export interface BackgroundDescriptor {
  /** Stable id (used later as the time/weather/season/city key). */
  id: string
  /** Public path to the image asset. */
  src: string
  /** Alt text — decorative background, kept empty by default. */
  alt: string
  /** CSS object-position for the image (e.g. 'center', 'center 40%'). */
  position: string
  /** Optional CSS background applied over the image in LIGHT theme (V1: none). */
  overlayLight?: string
  /** Optional CSS background applied over the image in DARK theme. */
  overlayDark?: string
}

/**
 * The catalog. V1 = one entry. Adding `morning`/`day`/`sunset`/`night` (or
 * `rain`, `tet`, `hanoi`, …) later is purely additive here + one resolver rule.
 */
export const BACKGROUNDS = {
  default: {
    id: 'default',
    src: '/backgrounds/home-desktop.webp',
    alt: '',
    position: 'center',
    // Light: no overlay (rely on a clean-centre asset). Dark: subtle tint so
    // card/text stay readable when the UI is in dark theme — this preserves the
    // existing production behavior, it is not a new light-mode overlay.
    overlayDark: 'rgba(0, 0, 0, 0.4)',
  },
} satisfies Record<string, BackgroundDescriptor>

export type BackgroundKey = keyof typeof BACKGROUNDS

export const DEFAULT_BACKGROUND_KEY: BackgroundKey = 'default'
