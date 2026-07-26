// SERVER-ONLY link resolver. The backend owns all URL resolution: source
// detection, metadata, thumbnail resolution and fallback. The frontend calls
// POST /api/links/resolve and stores whatever this returns verbatim.
//
// V1 supports YouTube only (product decision 2026-07-26). Any other URL resolves
// to null → the route returns 400 and the composer refuses the post.
//
// SSRF note: we never fetch the user's URL directly. The only outbound fetch is
// to the hardcoded, trusted YouTube oEmbed endpoint, with the user URL passed
// only as a query VALUE.

import {
  detectSource,
  extractYouTubeId,
  youTubeThumbnail,
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

/**
 * Resolve a pasted URL into a clean, storable descriptor. Returns null for an
 * unsupported/unparseable source (caller surfaces a 400). `thumbnail` is never
 * empty on a non-null result.
 */
export async function resolveLink(rawUrl: string): Promise<ResolvedLink | null> {
  const source_url = rawUrl.trim()
  const source = detectSource(source_url)
  if (!source) return null // unsupported provider (TikTok/FB/IG/other) → 400

  if (source === 'youtube') {
    const id = extractYouTubeId(source_url)
    if (!id) return null // recognizably YouTube but no parseable id → not storable
    const { title, author } = await youtubeMeta(source_url)
    return { source_type: 'youtube', source_url, thumbnail: youTubeThumbnail(id), title, author }
  }

  return null
}
