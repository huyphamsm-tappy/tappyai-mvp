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
    src: '/backgrounds/home-desktop-v5.webp',
    alt: '',
    position: 'center',
    // Both overlays are RETUNED for the V3 surface, and the reason is that the
    // readability work moved. The 0.4 dark tint was set when content sat directly
    // on the photograph and the overlay was the only thing keeping text legible.
    // V3 puts translucent panels over the scene, so the panels now carry that job
    // and the overlay only has to stop the artwork competing — at 0.4 on top of
    // those panels the skyline flattened into a grey field, which is precisely the
    // "so darkened the artwork becomes invisible" failure. Measured by eye against
    // the render at 0.4 / 0.22 / 0.28.
    //
    // `overlayLight` was reserved in this interface for exactly this ("add only if
    // post-UAT readability requires it"). It is required now: in light theme the
    // dark section headings that sit OUTSIDE a panel fell onto the bright flower
    // bed at the foot of the photo and lost their contrast.
    overlayLight: 'rgba(255, 255, 255, 0.42)',
    overlayDark: 'rgba(0, 0, 0, 0.28)',
  },
} satisfies Record<string, BackgroundDescriptor>

export type BackgroundKey = keyof typeof BACKGROUNDS

export const DEFAULT_BACKGROUND_KEY: BackgroundKey = 'default'
