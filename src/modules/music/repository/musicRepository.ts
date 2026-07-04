import { createClient } from '@supabase/supabase-js'
import type { MusicTrack } from '../types/track'
import type { MusicCategory } from '../types/category'
import type { MusicProvider } from '../types/provider'
import type { MusicBrowseFilter, MusicSearchFilter, MusicTracksPage } from '../types/search'

// All four read policies on these tables are unconditionally public
// (no auth.uid() dependency), so a bare anon-key client — with no cookie or
// browser-storage dependency — is safe and correct here. This same client
// works identically whether the caller is a browser hook or a server route
// handler, matching the Repository -> Supabase single-hop dependency rule.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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
}

function mapTrackRow(row: TrackRow): MusicTrack {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    durationSec: row.duration_sec,
    audioUrl: row.audio_url,
    previewUrl: row.preview_url,
    coverUrl: row.cover_url,
    categoryId: row.category_id,
    providerId: row.provider_id,
  }
}

function clampLimit(limit?: number): number {
  if (!limit || limit < 1) return DEFAULT_LIMIT
  return Math.min(limit, MAX_LIMIT)
}

const TRACK_COLUMNS =
  'id, title, artist, duration_sec, audio_url, preview_url, cover_url, category_id, provider_id'

export async function getTrackById(id: string): Promise<MusicTrack | null> {
  const { data, error } = await supabase
    .from('music_tracks')
    .select(TRACK_COLUMNS)
    .eq('id', id)
    .eq('is_active', true)
    .maybeSingle()

  if (error || !data) return null
  return mapTrackRow(data as TrackRow)
}

export async function getTracks(filter: MusicBrowseFilter = {}): Promise<MusicTracksPage> {
  const page = Math.max(0, filter.page ?? 0)
  const limit = clampLimit(filter.limit)
  const offset = page * limit

  let query = supabase
    .from('music_tracks')
    .select(TRACK_COLUMNS)
    .eq('is_active', true)

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

  const escaped = term.replace(/[%_]/g, (c) => `\\${c}`)
  const { data, error } = await supabase
    .from('music_tracks')
    .select(TRACK_COLUMNS)
    .eq('is_active', true)
    .or(`title.ilike.%${escaped}%,artist.ilike.%${escaped}%`)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit)

  if (error || !data) return { tracks: [], page, limit, hasMore: false }

  const hasMore = data.length > limit
  const tracks = (data.slice(0, limit) as TrackRow[]).map(mapTrackRow)
  return { tracks, page, limit, hasMore }
}

export async function getCategories(): Promise<MusicCategory[]> {
  const { data, error } = await supabase
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
  const { data, error } = await supabase
    .from('music_providers')
    .select('id, slug, name')
    .order('name', { ascending: true })

  if (error || !data) return []

  return data.map((row) => ({ id: row.id, slug: row.slug, name: row.name }))
}
