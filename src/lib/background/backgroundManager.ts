/**
 * Background resolver — pure, framework-agnostic, side-effect free.
 *
 * It maps a `BackgroundContext` to a concrete `BackgroundDescriptor`. V1 always
 * resolves to the single production background, but the signature is the seam
 * for future dimensions (time-of-day, weather, season, city). When those land,
 * add resolution rules HERE and entries in `backgrounds.config.ts` — the Home
 * component and `HomeBackground` never change.
 *
 * Keep this pure: no `Date.now()`, `window`, or I/O. Callers pass the context
 * in (e.g. the client component supplies the local `date`), which keeps the
 * resolver testable and SSR-safe.
 */

import {
  BACKGROUNDS,
  DEFAULT_BACKGROUND_KEY,
  type BackgroundDescriptor,
} from './backgrounds.config'

export interface BackgroundContext {
  /** Local time — reserved for the backlog time-of-day rule. */
  date?: Date
  // Backlog seams (resolution order will be weather > season > city > time):
  // weather?: 'clear' | 'rain' | 'cloud' | ...
  // season?: 'tet' | 'midautumn' | ...
  // city?: string
}

/**
 * Resolve the active background for the given context.
 * V1: always the default. Never returns undefined.
 */
export function getActiveBackground(
  _ctx: BackgroundContext = {},
): BackgroundDescriptor {
  // Future rules slot in above this line, most-specific first, each falling
  // through to the default when it doesn't apply.
  return BACKGROUNDS[DEFAULT_BACKGROUND_KEY]
}
