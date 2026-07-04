import type { MusicBrowseFilter, MusicSearchFilter } from '../types/search'

// Adapts the raw HTTP query string into the typed filters Services expect.
// Kept separate from Services so Services stay HTTP-agnostic (callable from
// a hook, a route handler, or a future server component alike).

function parsePage(searchParams: URLSearchParams): number {
  return Math.max(0, parseInt(searchParams.get('page') || '0', 10) || 0)
}

function parseLimit(searchParams: URLSearchParams): number | undefined {
  const raw = searchParams.get('limit')
  if (!raw) return undefined
  const parsed = parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

export function parseTracksQuery(searchParams: URLSearchParams): MusicBrowseFilter {
  return {
    categoryId: searchParams.get('categoryId') || undefined,
    page: parsePage(searchParams),
    limit: parseLimit(searchParams),
  }
}

export function parseSearchQuery(searchParams: URLSearchParams): MusicSearchFilter {
  return {
    query: searchParams.get('q') || '',
    page: parsePage(searchParams),
    limit: parseLimit(searchParams),
  }
}
