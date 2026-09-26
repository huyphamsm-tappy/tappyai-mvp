// Public barrel for the Music Module. This is the ONLY import path a
// consuming feature (Reviews, Explore, Story, ...) may use — never reach
// into modules/music/repository or any other internal file directly.
//
// 🚨 BROWSER-SAFE ON PURPOSE. Everything exported here is a hook (fetching the
// `/api/music/*` routes), a pure helper or a component. The reads that touch
// the database live in `./server` and are for route handlers only — a page
// that imported them would ship the service-role repository to the browser.

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
  createSelection,
  getPreviewUrl,
  getTrackDurationLabel,
  getCategoryLabel,
  isInternalProvider,
  attributionLine,
} from './services/musicHelpers'

export { useMusic, useMusicTrack, useMusicSearch, useMusicCategories } from './hooks'

export {
  MusicThumbnail, MusicDuration, MusicBadge, MusicRow, MusicPickerSheet,
  MusicSearchInput, MusicCategoryTabs, MusicTrackList, MusicTrackCard, MusicTrackGrid,
} from './components'
