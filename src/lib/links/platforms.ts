// Link video platform logic (V1: YouTube + TikTok only).
//
// This is the SINGLE source of truth for source detection, id extraction and
// poster resolution. It is pure and safe to import from both client and server
// — but the deterministic thumbnail generator (`youTubeThumbnail`) is only ever
// called by the SERVER resolver (`resolve.ts`); the frontend must never generate
// a YouTube URL itself (owner rule), it only reads the thumbnail the backend
// already stored.
//
// Provider architecture is intentionally NOT introduced here — V1 supports a
// fixed, small set of sources. Facebook/Instagram are deliberately excluded from
// creation; the render helpers still degrade legacy rows gracefully.

export type LinkSource = 'youtube' | 'tiktok'

export const SUPPORTED_LINK_SOURCES: readonly LinkSource[] = ['youtube', 'tiktok']

// Static, self-hosted placeholders. Served from /public, so they can never 404
// and never require next/image remote-pattern config. Used both as the STORED
// fallback (backend never saves an empty thumbnail) and as the render-time
// onError fallback (defends legacy rows + expired CDN thumbnails).
export const POSTER_PLACEHOLDER = {
  youtube: '/placeholders/youtube.svg',
  tiktok: '/placeholders/tiktok.svg',
  video: '/placeholders/video.svg',
} as const

/** Detect a supported link source, or null. V1: YouTube + TikTok only. */
export function detectSource(url: string): LinkSource | null {
  const u = url.trim().toLowerCase()
  if (!u) return null
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube'
  if (u.includes('tiktok.com')) return 'tiktok'
  return null
}

/** Extract an 11-char YouTube video id from watch / youtu.be / shorts / embed URLs. */
export function extractYouTubeId(url: string): string | null {
  return url.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  )?.[1] ?? null
}

/**
 * Deterministic YouTube poster. `hqdefault.jpg` exists for EVERY public video
 * (unlike `maxresdefault`, which 404s for many videos and most Shorts), so this
 * is a reliable, zero-network thumbnail. SERVER-ONLY by convention.
 */
export function youTubeThumbnail(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
}

/** Extract a numeric TikTok video id from canonical or embed URLs. */
export function extractTikTokId(url: string): string | null {
  return url.match(/tiktok\.com\/(?:@[^/]+\/video\/|v\/|embed\/v2\/)(\d+)/)?.[1] ?? null
}

/** Platform placeholder for a source_type (legacy 'facebook'/null → generic). */
export function placeholderFor(sourceType?: string | null): string {
  if (sourceType === 'youtube') return POSTER_PLACEHOLDER.youtube
  if (sourceType === 'tiktok') return POSTER_PLACEHOLDER.tiktok
  return POSTER_PLACEHOLDER.video
}

/**
 * Resolve the poster for a review tile. Priority: real photo → stored thumbnail
 * → platform placeholder. GUARANTEED non-empty — this is the render-side half of
 * the "never a blank tile" guarantee (the backend is the data-side half).
 */
export function posterFor(r: {
  photos?: string[] | null
  thumbnail?: string | null
  content_type?: string | null
  source_type?: string | null
}): string {
  const photo = r.photos?.[0]?.trim()
  if (photo) return photo
  const thumb = r.thumbnail?.trim()
  if (thumb) return thumb
  return placeholderFor(r.source_type)
}
