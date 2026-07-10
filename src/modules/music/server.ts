// Server-safe public entry point for the Music Module. Use this from
// server-only contexts (API routes, Route Handlers) that never render React
// — importing the default barrel (./index.ts) there pulls in UI components
// that use hooks, which fails to compile outside a Client Component tree
// (Route Handlers have no client/server boundary to attach a "use client"
// component to). This file re-exports only plain types/functions: no React,
// no hooks, no components.
//
// index.ts remains the only import path for UI-consuming features.

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
  recordUsage,
  createOriginalSound,
  getPreviewUrl,
  getTrackDurationLabel,
  getCategoryLabel,
  isInternalProvider,
} from './services/musicService'

export { validateSelection } from './utils'
