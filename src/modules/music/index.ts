// Public barrel for the Music Module. This is the ONLY import path a
// consuming feature (Reviews, Explore, Story, ...) may use — never reach
// into modules/music/repository or any other internal file directly.

export type {
  MusicTrack,
  MusicCategory,
  MusicProvider,
  MusicUsageRecord,
  MusicSelection,
  MusicBrowseFilter,
  MusicSearchFilter,
  MusicTracksPage,
} from './types'

export {
  browseTracks,
  searchTracks,
  getTrack,
  getCategories,
  getProviders,
  createSelection,
  getPreviewUrl,
  getTrackDurationLabel,
  getCategoryLabel,
  isInternalProvider,
} from './services/musicService'

export { useMusic, useMusicTrack, useMusicSearch, useMusicCategories } from './hooks'

export {
  MusicThumbnail, MusicDuration, MusicBadge, MusicRow, MusicPickerSheet,
  MusicSearchInput, MusicCategoryTabs, MusicTrackList,
} from './components'
