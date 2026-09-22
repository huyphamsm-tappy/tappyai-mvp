import type { MusicTrack } from './track'

export interface MusicBrowseFilter {
  categoryId?: string
  page?: number
  limit?: number
}

export interface MusicSearchFilter {
  query: string
  page?: number
  limit?: number
}

export interface MusicTracksPage {
  tracks: MusicTrack[]
  page: number
  limit: number
  hasMore: boolean
}
