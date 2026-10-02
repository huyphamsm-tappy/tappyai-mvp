import { createAdminClient } from '@/lib/supabase/admin'
import type { MusicTrack } from '../types/track'
import type { MusicCategory } from '../types/category'
import type { MusicProvider } from '../types/provider'
import type { MusicBrowseFilter, MusicSearchFilter, MusicTracksPage } from '../types/search'
import { isServableMediaUrl } from '@/lib/media/servableMedia'

// ============================================================================
// SERVER-ONLY. The catalogue is read through the service-role client, behind
// the `/api/music/*` GET routes — never from a browser.
// ============================================================================
// This used to be a bare anon-key client that hooks called straight from the
// page, and that was the F-034 finding: every client could read the whole
// `music_tracks` table over PostgREST, including the retired borrowed-sound
// rows. 20260921_music_tracks_lockdown revoked the anon/authenticated grants
// and dropped the ordinary-role policies; they stay revoked. The library is
// served by these functions, from a route handler, with the filter below.
//
// 🚨 THE LIBRARY, NOT THE REUSE PATH. Phase 7 restores the Music LIBRARY
// (curated, licensed tracks a person picks as a soundtrack) — not "use this
// sound" (taking the audio of another user's clip). The difference is a row's
// `music_type`: `LIBRARY_TYPES` are served; `original_sound` (a clip's own audio,
// registered so others could borrow it) is never returned by any function here,
// whatever the id. That is the whole enforcement, so it lives in ONE place.
//
// 🔑 Attribution travels with the track. CC-BY (the Jamendo catalogue) and the
// SoundHelix seed both require crediting the artist; `license` and `sourceUrl`
// are read here so every surface that shows a track can show its credit.

export const LIBRARY_TYPES = ['royalty_free', 'licensed'] as const

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

interface TrackRow {
  id: string
  title: string
  artist: string | null
  duration_sec: number
  audio_url: string
  preview_url: string | null
  cover_url: string | null
  category_id: string | null
  provider_id: string
  license: string | null
  source_url: string | null
}

function mapTrackRow(row: TrackRow): MusicTrack {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    durationSec: row.duration_sec,
    audioUrl: row.audio_url,
    previewUrl: row.preview_url,
    /**
     * 🚨 THE RETIRED BLOB HOST IS FILTERED OUT HERE, AND THAT IS THE MUSIC
     * LIBRARY'S BROKEN-THUMBNAIL BUG.
     *
     * Covers written before the storage move live on Vercel Blob, and those
     * objects are GONE — measured against production data: every
     * `*.public.blob.vercel-storage.com` cover answers 404. `isServableMediaUrl`
     * is the app's existing answer to exactly this, and `cover_url` is already
     * one of its `MEDIA_FIELDS`. Nulling here rather than at each route covers
     * browse, search and by-id in one place, and `MusicThumbnail` already draws
     * a real fallback for a null cover.
     */
    coverUrl: isServableMediaUrl(row.cover_url) ? row.cover_url : null,
    categoryId: row.category_id,
    providerId: row.provider_id,
    license: row.license,
    sourceUrl: row.source_url,
  }
}

function clampLimit(limit?: number): number {
  if (!limit || limit < 1) return DEFAULT_LIMIT
  return Math.min(limit, MAX_LIMIT)
}

// Builds a "contains" ILIKE pattern from a raw search term and safely embeds
// it as a double-quoted value for a PostgREST .or() filter string.
//
// Two independent escaping passes are required here:
// 1. Escape the user's literal `%`/`_` so Postgres's ILIKE treats them as
//    literal characters (not SQL wildcards), then add our own leading/
//    trailing `%` for the "contains" match.
// 2. Escape backslashes/double-quotes in the resulting pattern and wrap it
//    in double quotes, per PostgREST's documented value-quoting rule. This
//    protects reserved filter-syntax characters in the user's term (",",
//    ".", "(", ")") from being parsed as `.or()` structure — e.g. a comma
//    in a search term would otherwise split into an unintended second
//    filter condition. `.or()` passes its string through unescaped, so this
//    quoting must happen here, at the only place the value is constructed.
function buildIlikePattern(term: string): string {
  const likeEscaped = term.replace(/[%_]/g, (c) => `\\${c}`)
  const pattern = `%${likeEscaped}%`
  const quoted = pattern.replace(/[\\"]/g, (c) => `\\${c}`)
  return `"${quoted}"`
}

const TRACK_COLUMNS =
  'id, title, artist, duration_sec, audio_url, preview_url, cover_url, category_id, provider_id, license, source_url'

/** Every track read starts here: active, and a LIBRARY type. Nothing else is ever selected. */
function libraryTracks() {
  return createAdminClient()
    .from('music_tracks')
    .select(TRACK_COLUMNS)
    .eq('is_active', true)
    .in('music_type', [...LIBRARY_TYPES])
}

export async function getTrackById(id: string): Promise<MusicTrack | null> {
  // 🚨 `.limit(1)`, deliberately NOT `.maybeSingle()`.
  //
  // `maybeSingle()` asks PostgREST for a SINGULAR object
  // (`Accept: application/vnd.pgrst.object+json`), and a zero-row result then
  // comes back as **HTTP 406 / PGRST116**, not as an empty list. That was
  // harmless while every track was readable. It stopped being harmless on
  // 2026-08-18, when the publication boundary began hiding a held track's row:
  // the request flipped from `200 {row}` to `406 {error}`, an error response
  // does not replace a stored success, and production went on serving the held
  // clip's media URL from the last good 200 — for hours after the database had
  // stopped returning the row to anyone.
  //
  // A list request makes "no rows" an ordinary success (`200 []`), so it stores
  // and replaces like every other read. One row still yields that one row, and
  // the caller contract — `MusicTrack | null` — is unchanged.
  const { data, error } = await libraryTracks().eq('id', id).limit(1)

  if (error || !data || data.length === 0) return null
  return mapTrackRow(data[0] as TrackRow)
}

export async function getTracks(filter: MusicBrowseFilter = {}): Promise<MusicTracksPage> {
  const page = Math.max(0, filter.page ?? 0)
  const limit = clampLimit(filter.limit)
  const offset = page * limit

  let query = libraryTracks()
  if (filter.categoryId) {
    query = query.eq('category_id', filter.categoryId)
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit) // fetch one extra row to detect hasMore

  if (error || !data) return { tracks: [], page, limit, hasMore: false }

  const hasMore = data.length > limit
  const tracks = (data.slice(0, limit) as TrackRow[]).map(mapTrackRow)
  return { tracks, page, limit, hasMore }
}

export async function searchTracks(filter: MusicSearchFilter): Promise<MusicTracksPage> {
  const page = Math.max(0, filter.page ?? 0)
  const limit = clampLimit(filter.limit)
  const offset = page * limit
  const term = filter.query.trim()

  if (!term) return { tracks: [], page, limit, hasMore: false }

  const pattern = buildIlikePattern(term)
  const { data, error } = await libraryTracks()
    .or(`title.ilike.${pattern},artist.ilike.${pattern}`)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit)

  if (error || !data) return { tracks: [], page, limit, hasMore: false }

  const hasMore = data.length > limit
  const tracks = (data.slice(0, limit) as TrackRow[]).map(mapTrackRow)
  return { tracks, page, limit, hasMore }
}

export async function getCategories(): Promise<MusicCategory[]> {
  const { data, error } = await createAdminClient()
    .from('music_categories')
    .select('id, slug, label_i18n, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error || !data) return []

  return data.map((row) => ({
    id: row.id,
    slug: row.slug,
    labelI18n: (row.label_i18n ?? {}) as Record<string, string>,
    sortOrder: row.sort_order,
  }))
}

export async function getProviders(): Promise<MusicProvider[]> {
  const { data, error } = await createAdminClient()
    .from('music_providers')
    .select('id, slug, name')
    .order('name', { ascending: true })

  if (error || !data) return []

  return data.map((row) => ({ id: row.id, slug: row.slug, name: row.name }))
}
