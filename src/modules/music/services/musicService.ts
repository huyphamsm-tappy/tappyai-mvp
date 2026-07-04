import * as musicRepository from '../repository/musicRepository'
import { formatDuration, normalizeSearch, validateSelection } from '../utils'
import type { MusicTrack } from '../types/track'
import type { MusicCategory } from '../types/category'
import type { MusicProvider } from '../types/provider'
import type { MusicSelection } from '../types/selection'
import type { MusicBrowseFilter, MusicSearchFilter, MusicTracksPage } from '../types/search'

const DEFAULT_LOCALE = 'vi'

// --- Browse / Search / Track / Category / Provider reads ---
// Thin delegations to the Repository: this is the required indirection layer
// so Hooks never import the Repository (or Supabase) directly.

export async function browseTracks(filter?: MusicBrowseFilter): Promise<MusicTracksPage> {
  return musicRepository.getTracks(filter)
}

export async function searchTracks(filter: MusicSearchFilter): Promise<MusicTracksPage> {
  const query = normalizeSearch(filter.query)
  if (!query) return { tracks: [], page: filter.page ?? 0, limit: filter.limit ?? 20, hasMore: false }
  return musicRepository.searchTracks({ ...filter, query })
}

export async function getTrack(id: string): Promise<MusicTrack | null> {
  return musicRepository.getTrackById(id)
}

export async function getCategories(): Promise<MusicCategory[]> {
  return musicRepository.getCategories()
}

export async function getProviders(): Promise<MusicProvider[]> {
  return musicRepository.getProviders()
}

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
// Resolves a category's localized label: requested locale -> the app's
// primary locale -> the raw slug as a last resort (never renders blank).
export function getCategoryLabel(category: MusicCategory, locale: string = DEFAULT_LOCALE): string {
  return category.labelI18n[locale] ?? category.labelI18n[DEFAULT_LOCALE] ?? category.slug
}

// --- Provider helper ---
// Distinguishes first-party tracks from external-licensor tracks, e.g. so a
// consumer can decide whether to render a provider attribution badge.
export function isInternalProvider(provider: MusicProvider): boolean {
  return provider.slug === 'internal'
}
