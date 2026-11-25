// Explore video, web playback: recognising a post's HLS media_url. Pure and client-safe (no server imports).
//
// A post made with the new pipeline stores, as its media_url, the manifest on the CDN host: `https://<cdn host>/vdel/<owner>/<asset>/manifest.m3u8`. That URL alone plays nothing (the CDN
// answers 403 without the signed cookie); the player asks POST /api/video/playback/<asset> first, which decides whether this viewer may watch and sets the cookie. Old posts keep a
// plain .mp4 or a YouTube link and never go through here.

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const MANIFEST_PATH = new RegExp(`^/vdel/${UUID}/(${UUID})/manifest\\.m3u8$`, 'i')

/** True when the URL's PATH ends in .m3u8 (a query string that merely mentions it does not count). */
export function isHlsUrl(url: string | null | undefined): boolean {
  if (typeof url !== 'string' || url.length === 0) return false
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.m3u8')
  } catch {
    return false
  }
}

/** The asset id of a delivery manifest URL, or null for anything else. */
export function videoAssetIdFromManifestUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string' || url.length === 0) return null
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return null
    const m = MANIFEST_PATH.exec(u.pathname)
    return m ? m[1].toLowerCase() : null
  } catch {
    return null
  }
}
