import { isServableMediaUrl } from '@/lib/media/servableMedia'

/**
 * The image already stored on a community review row, for a "Gợi ý cho bạn" card.
 * Reuses stored metadata only (no provider call): `photos[]` first, then the clip/video
 * `thumbnail`. Public https only, and never a host we no longer serve (suspended Vercel Blob).
 * Returns null when the row truly has no image, so the card keeps its pin placeholder.
 */
export function pickReviewImage(row: { photos?: unknown; thumbnail?: unknown; thumbnail_url?: unknown }): string | null {
  const usable = (u: unknown): u is string => typeof u === 'string' && /^https:\/\//i.test(u) && isServableMediaUrl(u)
  const fromPhotos = (Array.isArray(row.photos) ? row.photos : []).find(usable)
  if (fromPhotos) return fromPhotos
  const thumb = [row.thumbnail, row.thumbnail_url].find(usable)
  return thumb ?? null
}
