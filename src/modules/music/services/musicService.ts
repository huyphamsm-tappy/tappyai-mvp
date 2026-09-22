import * as musicRepository from '../repository/musicRepository'
import { normalizeSearch } from '../utils'
import type { MusicTrack } from '../types/track'
import type { MusicCategory } from '../types/category'
import type { MusicProvider } from '../types/provider'
import type { MusicBrowseFilter, MusicSearchFilter, MusicTracksPage } from '../types/search'

// SERVER service: the reads the `/api/music/*` route handlers call. It imports
// the service-role repository, so it must never be imported by a browser
// bundle — hooks go through `./musicClient` (fetch) instead, and the pure
// helpers live in `./musicHelpers` so both sides share one implementation.
//
// The usage log (`recordUsage`) and original-sound registration
// (`createOriginalSound`) that used to live here were the reuse path — one
// user borrowing another user's clip audio — retired in F-024/F-034 and NOT
// restored. The library is browse / search / by-id / categories / providers.

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

export {
  createSelection,
  getPreviewUrl,
  getTrackDurationLabel,
  getCategoryLabel,
  isInternalProvider,
  attributionLine,
} from './musicHelpers'
