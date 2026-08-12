// Which media URLs the server will accept from a client.
//
// `/api/music/tracks` takes an `audioUrl` from the browser and stores it, so it
// has always required that the URL point at storage we control — otherwise any
// caller could register a track pointing anywhere. That check was written as a
// literal Vercel Blob host regex, which silently refuses every Cloud Storage URL
// the bridge produces.
//
// The allowlist below therefore covers both providers at once: Blob for every
// object already in the database, Cloud Storage for anything written from now
// on. It stays an allowlist — the point of the check is unchanged.

const BLOB_HOST = /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i
const GCS_HOST = 'storage.googleapis.com'

/**
 * True when `value` is an https URL served by media storage we own.
 *
 * For Cloud Storage the bucket is checked too: `storage.googleapis.com` serves
 * every public bucket on Google Cloud, so the host alone would let a caller
 * register a URL pointing at a bucket belonging to someone else entirely.
 */
export function isTrustedMediaUrl(value: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (typeof value !== 'string' || value.length === 0) return false

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false

  if (BLOB_HOST.test(url.hostname)) return true

  if (url.hostname.toLowerCase() === GCS_HOST) {
    const bucket = env.GCS_MEDIA_BUCKET ?? 'tappyai-media-prod'
    return url.pathname.startsWith(`/${bucket}/`) && url.pathname.length > bucket.length + 2
  }

  return false
}
