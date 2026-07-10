import { createClient, type SupabaseClient } from '@supabase/supabase-js'
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

  const pattern = buildIlikePattern(term)
  const { data, error } = await supabase
    .from('music_tracks')
    .select(TRACK_COLUMNS)
    .eq('is_active', true)
    .or(`title.ilike.${pattern},artist.ilike.${pattern}`)
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

// Append-only usage log write. Unlike the read paths, this cannot use the
// module's own anon client: music_usage's INSERT policy is
// WITH CHECK (auth.uid() = user_id), which the anon client (no session) can
// never satisfy. So the caller passes in its own authenticated client (an API
// route's per-request Supabase client) and RLS enforces that user_id matches
// the signed-in user. Best-effort — the caller treats failures as non-fatal.
export async function recordUsage(
  client: SupabaseClient,
  row: { trackId: string; entityType: string; entityId: string; userId: string }
): Promise<void> {
  await client.from('music_usage').insert({
    track_id: row.trackId,
    entity_type: row.entityType,
    entity_id: row.entityId,
    user_id: row.userId,
  })
}

// Registers a clip's own audio as a reusable "original sound" (TikTok model).
// Phase 1: audio_url is a POINTER to the clip's media_url — no audio extraction,
// no ffmpeg. Later (Phase 2) we can extract audio to its own file and just swap
// what audio_url points at; every reader already goes through audio_url.
// Requires the caller's AUTHENTICATED client: the music_tracks INSERT RLS policy
// is WITH CHECK (auth.uid() = uploaded_by AND music_type = 'original_sound' AND
// rights_confirmed = true), which the module's anon read client can't satisfy.
// Returns the new track id, or null on any failure (best-effort — never blocks
// the post that triggered it).
export async function insertOriginalSoundTrack(
  client: SupabaseClient,
  row: { title: string; artist: string | null; durationSec: number; audioUrl: string; coverUrl: string | null; uploadedBy: string }
): Promise<string | null> {
  const { data: provider } = await client
    .from('music_providers').select('id').eq('slug', 'internal').single()
  if (!provider) return null
  const { data, error } = await client
    .from('music_tracks')
    .insert({
      title: row.title,
      artist: row.artist,
      duration_sec: row.durationSec,
      audio_url: row.audioUrl,
      preview_url: row.audioUrl,
      cover_url: row.coverUrl,
      provider_id: provider.id,
      music_type: 'original_sound',
      uploaded_by: row.uploadedBy,
      rights_confirmed: true,
      is_active: true,
    })
    .select('id')
    .single()
  if (error || !data) return null
  return data.id as string
}

export async function getProviders(): Promise<MusicProvider[]> {
  const { data, error } = await supabase
    .from('music_providers')
    .select('id, slug, name')
    .order('name', { ascending: true })

  if (error || !data) return []

  return data.map((row) => ({ id: row.id, slug: row.slug, name: row.name }))
}
