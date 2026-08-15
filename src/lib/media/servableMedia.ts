// Which stored media a client is still allowed to be pointed at.
//
// The Vercel Blob store is suspended for DATA TRANSFER — 10.1 GB against a
// 10 GB allowance — not for storage, which sits at 38%. Every historical object
// therefore 403s today and costs nothing. The trap is what happens next: when
// the allowance resets and the store un-suspends, every feed item still holding
// a Blob URL starts serving real bytes again and the egress that caused the
// suspension resumes. Not referencing them is a fix that needs no credentials,
// no migration and no deletion.
//
// This is a PRESENTATION filter and nothing more. It removes no database row,
// no Cloud Storage object and no Blob object; it only decides what goes out in
// a response.
//
// Classification is by HOST. A substring rule such as `url.includes('blob')`
// would also catch `blob:` object URLs, a `/blob/` path segment, a host like
// `blobfish.example.com`, and anything else containing those four letters —
// see the tests, which ban that implementation outright.

/** Where a stored media URL lives. */
export type MediaHostProvider = 'gcs' | 'vercel-blob' | 'external' | 'none'

/** `<store>.public.blob.vercel-storage.com` — anchored, so no suffixed impostor matches. */
const VERCEL_BLOB_HOST = /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i
const GCS_HOST = 'storage.googleapis.com'

/**
 * Classifies a media URL by its host.
 *
 * Anything that is not an absolute http(s) URL — an empty value, a bare key, a
 * `blob:` object URL, a `data:` URI — is not a stored-media reference we serve,
 * so it classifies as `none` rather than being guessed at.
 */
export function mediaProviderOf(value: string | null | undefined): MediaHostProvider {
  if (typeof value !== 'string' || value.length === 0) return 'none'

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return 'none'
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'none'

  const host = url.hostname.toLowerCase()
  if (VERCEL_BLOB_HOST.test(host)) return 'vercel-blob'
  if (host === GCS_HOST) return 'gcs'
  return 'external'
}

/**
 * False only for media we must stop requesting.
 *
 * Everything else is left alone on purpose: Cloud Storage is the live provider,
 * and YouTube, TikTok, Google avatars and other external links were never part
 * of this problem. Narrowing the rule to the one host that matters is what keeps
 * this from becoming a general-purpose media blocklist.
 */
export function isServableMediaUrl(value: string | null | undefined): boolean {
  return mediaProviderOf(value) !== 'vercel-blob'
}

/**
 * Scalar media fields on a review row, as the feed routes select them.
 *
 * `source_url` is deliberately absent: it is the ORIGINAL external link of a
 * YouTube/TikTok post, not stored media, and clearing it would strip link posts
 * of their attribution.
 */
const MEDIA_FIELDS = ['media_url', 'thumbnail', 'thumbnail_url', 'audio_url', 'cover_url'] as const

/**
 * Media fields that hold an ARRAY of URLs.
 *
 * Found in production rather than in review: a review's `photos` is a list, and
 * a filter that only understood scalars let a Blob photo through a feed every
 * other check called clean. Entries are filtered individually so a gallery
 * keeps its servable images instead of being dropped wholesale.
 */
const MEDIA_ARRAY_FIELDS = ['photos'] as const

interface ProfileLike {
  avatar_url?: string | null
  [key: string]: unknown
}

/**
 * Returns a copy of a row with unservable media references removed.
 *
 * The row keeps its identity and every other field — the post still exists, the
 * caption still reads, the counts are untouched. Only the pointer to media that
 * cannot be served is cleared, so the client renders the item without a dead
 * player instead of requesting a URL that is either 403 or, worse, live again
 * and billing egress.
 *
 * Does not mutate the input.
 */
export function stripUnservableMedia<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row }

  for (const field of MEDIA_FIELDS) {
    const value = out[field]
    if (typeof value === 'string' && !isServableMediaUrl(value)) out[field] = null
  }

  // Arrays keep their servable entries. An empty array, not null, is the right
  // "nothing left" answer: consumers already handle a gallery with no photos,
  // and changing the field's type would be a second, avoidable break.
  for (const field of MEDIA_ARRAY_FIELDS) {
    const value = out[field]
    if (Array.isArray(value)) {
      out[field] = value.filter((entry) => typeof entry === 'string' && isServableMediaUrl(entry))
    }
  }

  // The author's avatar travels with the row via the joined profile.
  const profile = out.profiles as ProfileLike | null | undefined
  if (profile && typeof profile === 'object') {
    const avatar = profile.avatar_url
    if (typeof avatar === 'string' && !isServableMediaUrl(avatar)) {
      out.profiles = { ...profile, avatar_url: null }
    }
  }

  return out as T
}

/**
 * Whether an Explore slide would render anything at all.
 *
 * Deliberately the same predicate the feed client already uses to pick a renderer
 * (feedShared.tsx): a video needs `media_url`, otherwise the row needs `photos`. Anything
 * else falls through to a bare gradient `<div>` — a full-screen blank slide the user has to
 * swipe past. Keeping the two in one rule is the point; when they drifted, the backend served
 * rows the client could only render as nothing.
 *
 * Call it AFTER stripUnservableMedia: a row whose only media was a suspended Blob URL still
 * has a non-null `media_url` in the database, and looks renderable until that pointer is
 * cleared. Order is why this lives next to the strip and not in the SQL query.
 *
 * This decides VISIBILITY, not existence. The row is untouched, and the author still sees the
 * post on their own profile (/api/reviews/mine, /saved) so they can fix or delete it.
 */
export function isExploreRenderable(row: Record<string, unknown>): boolean {
  if (row.content_type === 'video' && typeof row.media_url === 'string' && row.media_url.length > 0) return true
  const photos = row.photos
  return Array.isArray(photos) && photos.length > 0
}

/**
 * The Explore feed's response projection: clear media we must not point at, then drop whatever
 * is left with nothing to show.
 *
 * One function so the two steps cannot be reordered or applied separately by a future caller —
 * filtering before the strip would keep exactly the dead Blob rows this exists to remove.
 */
export function toExploreFeedItems<T extends Record<string, unknown>>(rows: readonly T[]): T[] {
  return rows.map(stripUnservableMedia).filter(isExploreRenderable)
}
