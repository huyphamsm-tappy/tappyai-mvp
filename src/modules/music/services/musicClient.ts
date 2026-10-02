import type { MusicTrack } from '../types/track'
import type { MusicCategory } from '../types/category'
import type { MusicBrowseFilter, MusicSearchFilter, MusicTracksPage } from '../types/search'

// BROWSER service: the same read surface as `musicService`, over the
// `/api/music/*` GET routes.
//
// 🚨 The hooks used to call the repository — a bare anon Supabase client —
// straight from the page. That is the F-034 finding (any client could read the
// whole `music_tracks` table) and it is closed for good by
// 20260921_music_tracks_lockdown: the browser has no grant on the table, so
// the ONLY way to a track is a route handler that applies the library filter.
// Nothing in this file may import the repository.

const EMPTY = (page = 0, limit = 20): MusicTracksPage => ({ tracks: [], page, limit, hasMore: false })

async function getJson<T>(url: string, fallback: T): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) return fallback
  try { return (await res.json()) as T } catch { return fallback }
}

export async function browseTracks(filter: MusicBrowseFilter = {}): Promise<MusicTracksPage> {
  const params = new URLSearchParams()
  if (filter.categoryId) params.set('categoryId', filter.categoryId)
  if (filter.page) params.set('page', String(filter.page))
  if (filter.limit) params.set('limit', String(filter.limit))
  const qs = params.toString()
  return getJson(`/api/music/tracks${qs ? `?${qs}` : ''}`, EMPTY(filter.page, filter.limit))
}

export async function searchTracks(filter: MusicSearchFilter): Promise<MusicTracksPage> {
  const q = filter.query.trim()
  if (!q) return EMPTY(filter.page, filter.limit)
  const params = new URLSearchParams({ q })
  if (filter.page) params.set('page', String(filter.page))
  if (filter.limit) params.set('limit', String(filter.limit))
  return getJson(`/api/music/tracks/search?${params}`, EMPTY(filter.page, filter.limit))
}

export async function getTrack(id: string): Promise<MusicTrack | null> {
  const res = await fetch(`/api/music/tracks/${encodeURIComponent(id)}`, { headers: { Accept: 'application/json' } })
  // 404 = not a library track (unknown, inactive, or a retired original sound) — an honest null.
  if (!res.ok) return null
  try {
    // The route answers with the track object itself (the shape Android reads too).
    const body = (await res.json()) as Partial<MusicTrack> | null
    return body && typeof body.id === 'string' ? (body as MusicTrack) : null
  } catch { return null }
}

export async function getCategories(): Promise<MusicCategory[]> {
  const body = await getJson<{ categories?: MusicCategory[] }>('/api/music/categories', {})
  return body.categories ?? []
}
