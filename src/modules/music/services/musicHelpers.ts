// Pure helpers shared by the server service and the browser bundle.
//
// Nothing here touches Supabase or `fetch`, so the client barrel (index.ts) can
// export them without dragging the service-role repository into a page.

import { formatDuration, validateSelection } from '../utils'
import type { MusicTrack } from '../types/track'
import type { MusicCategory } from '../types/category'
import type { MusicProvider } from '../types/provider'
import type { MusicSelection } from '../types/selection'

const DEFAULT_LOCALE = 'vi'

// --- Selection helper ---
// Builds and validates a MusicSelection value object. Throws on invalid
// input rather than silently returning a broken selection.
export function createSelection(trackId: string, startSec: number, volume: number): MusicSelection {
  const selection: MusicSelection = { trackId, startSec, volume }
  if (!validateSelection(selection)) {
    throw new Error('Invalid music selection')
  }
  return selection
}

// --- Preview metadata ---
// A track's short pre-cut preview clip is the intended preview source;
// fall back to the full track when no preview clip was cut.
export function getPreviewUrl(track: MusicTrack): string {
  return track.previewUrl ?? track.audioUrl
}

// --- Duration helper ---
export function getTrackDurationLabel(track: MusicTrack): string {
  return formatDuration(track.durationSec)
}

// --- Category helper ---
/**
 * Resolves a category's localized label: requested locale → the app's primary locale → the raw
 * slug as a last resort (never renders blank).
 *
 * ============================================================================
 * WHY `locale` IS REQUIRED — B11
 * ============================================================================
 * 🚨 IT USED TO DEFAULT TO `DEFAULT_LOCALE`, WHICH IS `'vi'`, AND THAT DEFAULT WAS THE BUG.
 *
 * `MusicCategoryTabs` called `getCategoryLabel(category)` with no second argument, so every
 * category rendered Vietnamese no matter what language the app was in — an English user saw
 * "Thịnh hành" and "Sôi động". Nothing was missing: the API returns
 * `labelI18n: { en: "Trending", vi: "Thịnh hành" }` and the English label was sitting right
 * there, simply never asked for. Android reads the same payload and gets it right.
 *
 * The parameter is now REQUIRED, so forgetting it is a compile error rather than a screen in the
 * wrong language. A default that silently picks a language is worse than no default at all —
 * it turns an omission into plausible-looking output.
 */
export function getCategoryLabel(category: MusicCategory, locale: string): string {
  return category.labelI18n[locale] ?? category.labelI18n[DEFAULT_LOCALE] ?? category.slug
}

// --- Provider helper ---
// Distinguishes first-party tracks from external-licensor tracks, e.g. so a
// consumer can decide whether to render a provider attribution badge.
export function isInternalProvider(provider: MusicProvider): boolean {
  return provider.slug === 'internal'
}

// --- Attribution ---
/**
 * The credit line a surface shows beside a library track — "Artist · CC-BY 3.0".
 *
 * 🔑 CC-BY is a licence CONDITION, not a courtesy: a track shown without its
 * credit is a track used outside its licence. `license` comes from the row as
 * recorded at ingest; when it was never recorded the line still names the
 * artist and says nothing about a licence rather than inventing one.
 */
export function attributionLine(track: MusicTrack): string {
  const parts = [track.artist?.trim(), track.license?.trim()].filter((p): p is string => !!p)
  return parts.join(' · ')
}
