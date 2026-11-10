// Explore video: PLAYBACK ACCESS. Decides (decidePlayback: the one rule) and, if the viewer may watch, signs a Cloud CDN cookie for THAT video's folder only.
//
// Every refusal is the same 404 with the same body: an unknown video, a hidden post, a stranger asking for someone's unpublished video all look alike, so this is no oracle for
// "this asset exists". The cookie is HttpOnly (a browser's scripts cannot read it); only a NATIVE player, which has no cookie jar tied to a page, asks for the value in the body.

import { decidePlayback } from './playbackAccess'
import { CDN_COOKIE_TTL_SECONDS, buildCdnSetCookie, cdnVideoScope, signCdnCookie, type VideoCdnConfig } from './cdnCookie'
import type { VideoDeliveryStore } from './deliveryStore'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface PlaybackDeps {
  store: VideoDeliveryStore
  /** null when the CDN is not configured (no default for any of its variables). */
  config: VideoCdnConfig | null
  now?: () => number
  /** The saved text overlay of the video (src/lib/media/video/overlay/overlayStore). Optional: without it the answer carries `overlay: null`. */
  overlay?: { get(assetId: string): Promise<{ version: number; doc: unknown } | null> }
}

export interface PlaybackOutcome {
  status: number
  body: Record<string, unknown>
  /** The Set-Cookie header value (web). Absent on every refusal. */
  setCookie?: string
}

const NOT_FOUND: PlaybackOutcome = { status: 404, body: { error: 'not_found' } }

export async function issueVideoPlayback(input: { assetId: string; viewerId: string | null; native: boolean }, deps: PlaybackDeps): Promise<PlaybackOutcome> {
  if (!deps.config) return { status: 503, body: { error: 'video_unavailable' } }
  if (typeof input.assetId !== 'string' || !UUID.test(input.assetId)) return NOT_FOUND

  const asset = await deps.store.get(input.assetId.toLowerCase())
  if (!asset) return NOT_FOUND
  const review = asset.review_id ? await deps.store.getReview(asset.review_id) : null

  const decision = decidePlayback({ asset, review, viewerId: input.viewerId })
  if (!decision.allow) return NOT_FOUND

  // The folder comes from the ROW's own ids, never from the request.
  const scope = cdnVideoScope(deps.config.host, asset.owner_id, asset.id)
  const nowMs = (deps.now ?? Date.now)()
  const expiresAtSec = Math.floor(nowMs / 1000) + CDN_COOKIE_TTL_SECONDS
  const cookie = signCdnCookie({ urlPrefix: scope.urlPrefix, keyName: deps.config.keyName, key: deps.config.key, expiresAtSec })
  const expiresAt = new Date(nowMs + CDN_COOKIE_TTL_SECONDS * 1000).toISOString()

  // The text the owner put on the video is shown over it, so it travels with the (already authorised) playback answer: whoever may watch the video may read its text layers.
  // A failed read is "no overlay": the video still plays.
  let overlay: { version: number; doc: unknown } | null = null
  if (deps.overlay) {
    try { overlay = await deps.overlay.get(asset.id) } catch { overlay = null }
  }

  return {
    status: 200,
    body: {
      assetId: asset.id,
      manifestUrl: scope.manifestUrl,
      expiresAt,
      ttlSeconds: CDN_COOKIE_TTL_SECONDS,
      preview: decision.reason === 'owner_preview',
      overlay: overlay ? { version: overlay.version, doc: overlay.doc } : null,
      ...(input.native ? { cookie: { name: cookie.name, value: cookie.value, domain: deps.config.cookieDomain, path: scope.path, expiresAt } } : {}),
    },
    setCookie: buildCdnSetCookie({ value: cookie.value, domain: deps.config.cookieDomain, path: scope.path }),
  }
}
