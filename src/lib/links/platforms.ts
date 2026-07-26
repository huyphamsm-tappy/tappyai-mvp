// Link video platform logic (V1: YouTube only).
//
// SINGLE source of truth for source DETECTION and poster resolution. The set of
// supported providers is NOT hardcoded here — it comes from
// LINK_VIDEO_PROVIDERS in @/lib/config/product (the same list served to native
// clients via /api/config), so Web/Android/iOS stay identical.
//
// Pure + safe to import from client and server. The deterministic thumbnail
// generator (`youTubeThumbnail`) is only ever called by the SERVER resolver
// (`resolve.ts`); the frontend never generates a video URL itself.
//
// Extensibility (V2): to reintroduce a provider (e.g. TikTok), add its id to
// LINK_VIDEO_PROVIDERS, add a matcher below, and add its resolver branch — the
// generic pipeline (LinkPoster, resolve, poster fallback) needs no refactor. The
// `MATCHERS` type is keyed by LinkVideoProvider, so adding an id without a
// matcher is a compile error — completeness is enforced.

import { LINK_VIDEO_PROVIDERS, type LinkVideoProvider } from '@/lib/config/product'

export type LinkSource = LinkVideoProvider
export const SUPPORTED_LINK_SOURCES = LINK_VIDEO_PROVIDERS

// Static, self-hosted placeholders. Served from /public, so they can never 404
// and never require next/image remote-pattern config. Used both as the STORED
// fallback (backend never saves an empty thumbnail) and as the render-time
// onError fallback (defends legacy rows + expired CDN thumbnails). Legacy rows
// from removed providers (tiktok/facebook/instagram) fall back to `video`.
export const POSTER_PLACEHOLDER = {
  youtube: '/placeholders/youtube.svg',
  video: '/placeholders/video.svg',
} as const

// Per-provider URL matchers. Keyed by LinkVideoProvider so the set stays in
// lockstep with the config list (missing matcher = compile error).
const MATCHERS: Record<LinkVideoProvider, (u: string) => boolean> = {
  youtube: u => u.includes('youtube.com') || u.includes('youtu.be'),
}

/** Detect a SUPPORTED link source, or null. Driven by LINK_VIDEO_PROVIDERS. */
export function detectSource(url: string): LinkSource | null {
  const u = url.trim().toLowerCase()
  if (!u) return null
  for (const p of SUPPORTED_LINK_SOURCES) {
    if (MATCHERS[p](u)) return p
  }
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

/** Platform placeholder for a source_type. Removed/legacy providers → generic. */
export function placeholderFor(sourceType?: string | null): string {
  if (sourceType === 'youtube') return POSTER_PLACEHOLDER.youtube
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
