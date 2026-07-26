// SERVER-ONLY link resolver. The backend owns all URL resolution: source
// detection, metadata, thumbnail resolution and fallback. The frontend calls
// POST /api/links/resolve and stores whatever this returns verbatim.
//
// SSRF note: we never fetch the user's URL directly. The only outbound fetches
// are to hardcoded, trusted metadata endpoints (youtube.com/oembed,
// tiktok.com/oembed) with the user URL passed only as a query VALUE. This is
// why the old Facebook OG-scrape (which fetched the user page) is gone.

import {
  detectSource,
  extractYouTubeId,
  youTubeThumbnail,
  placeholderFor,
  type LinkSource,
} from './platforms'

export interface ResolvedLink {
  source_type: LinkSource
  source_url: string
  /** GUARANTEED non-empty — real thumbnail, or a platform placeholder path. */
  thumbnail: string
  title: string
  author: string
}

const FETCH_TIMEOUT_MS = 5000
const UA = 'Mozilla/5.0 (compatible; TappyAI/1.0)'

async function youtubeMeta(url: string): Promise<{ title: string; author: string }> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
    )
    if (!res.ok) return { title: '', author: '' }
    const d = await res.json()
    return { title: typeof d.title === 'string' ? d.title : '', author: typeof d.author_name === 'string' ? d.author_name : '' }
  } catch {
    return { title: '', author: '' }
  }
}

async function tiktokMeta(url: string): Promise<{ thumbnail: string | null; title: string; author: string }> {
  try {
    const res = await fetch(
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
    )
    if (!res.ok) return { thumbnail: null, title: '', author: '' }
    const d = await res.json()
    return {
      thumbnail: typeof d.thumbnail_url === 'string' && d.thumbnail_url ? d.thumbnail_url : null,
      title: typeof d.title === 'string' ? d.title : '',
      author: typeof d.author_name === 'string' ? d.author_name : '',
    }
  } catch {
    return { thumbnail: null, title: '', author: '' }
  }
}

/**
 * Resolve a pasted URL into a clean, storable descriptor. Returns null for an
 * unsupported/unparseable source (caller surfaces a 400). `thumbnail` is never
 * empty on a non-null result.
 */
export async function resolveLink(rawUrl: string): Promise<ResolvedLink | null> {
  const source_url = rawUrl.trim()
  const source = detectSource(source_url)
  if (!source) return null

  if (source === 'youtube') {
    const id = extractYouTubeId(source_url)
    if (!id) return null // recognizably YouTube but no parseable id → not storable
    const { title, author } = await youtubeMeta(source_url)
    return { source_type: 'youtube', source_url, thumbnail: youTubeThumbnail(id), title, author }
  }

  // tiktok
  const meta = await tiktokMeta(source_url)
  return {
    source_type: 'tiktok',
    source_url,
    thumbnail: meta.thumbnail ?? placeholderFor('tiktok'), // best-effort → placeholder, never empty
    title: meta.title,
    author: meta.author,
  }
}
