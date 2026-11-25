// The signed cookie of Google Cloud CDN, and the four environment variables that configure delivery (Explore video, publishing + delivery slice).
//
// Format (proved on a real private bucket in the 05/11/2026 spike, doc PHASE0-CDN-THU-HOI-HLS):
//   Cloud-CDN-Cookie=URLPrefix=<base64url prefix>:Expires=<unix>:KeyName=<name>:Signature=<base64url HMAC-SHA1 of "URLPrefix=..:Expires=..:KeyName=..">
// No cookie, a wrong signature, an expired one, or one whose prefix does not cover the request => 403 at the CDN. HLS uses relative paths, so ONE cookie scoped to a video's
// folder covers its manifest, its playlists and its segments. The prefix is ALWAYS one video's folder (`https://<host>/vdel/<owner>/<asset>/`), never wider.
//
// Encoding: URL-safe base64 WITH padding, as the reference implementations (gcloud, Google's samples) emit it. UNVERIFIED against the real CDN whether the unpadded form is also
// accepted; the padded form is the documented one.
//
// The signing key is a secret: it is read from VIDEO_CDN_SIGNING_KEY only here, never logged, never returned, never part of an error message.

import { createHmac } from 'node:crypto'

export const CDN_COOKIE_NAME = 'Cloud-CDN-Cookie'
/** Owner decision 05/11/2026: clips are at most 5 minutes, so a 10 minute cookie covers a full view and bounds how long a removed video stays playable for someone already watching. */
export const CDN_COOKIE_TTL_SECONDS = 600

const HOSTNAME_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/
const KEY_NAME_RE = /^[A-Za-z0-9_-]{1,64}$/
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const PREFIX_RE = new RegExp(`^https://[a-z0-9.-]+/vdel/${UUID}/${UUID}/$`)
const PATH_RE = new RegExp(`^/vdel/${UUID}/${UUID}/$`)
const DOMAIN_RE = /^\.?[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/
const COOKIE_VALUE_RE = /^[A-Za-z0-9=:_\-+/.]+$/
const MIN_KEY_BYTES = 16

const b64url = (b: Buffer | string): string => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_')

export interface SignCdnCookieInput {
  /** `https://<cdn host>/vdel/<owner>/<asset>/` */
  urlPrefix: string
  keyName: string
  key: Buffer
  expiresAtSec: number
}

export function signCdnCookie(input: SignCdnCookieInput): { name: typeof CDN_COOKIE_NAME; value: string } {
  if (!PREFIX_RE.test(input.urlPrefix)) throw new RangeError('cdn cookie: the prefix must be one video folder')
  if (!KEY_NAME_RE.test(input.keyName)) throw new RangeError('cdn cookie: bad key name')
  if (!Buffer.isBuffer(input.key) || input.key.length < MIN_KEY_BYTES) throw new RangeError('cdn cookie: key too short')
  if (!Number.isInteger(input.expiresAtSec) || input.expiresAtSec <= 0) throw new RangeError('cdn cookie: bad expiry')
  const policy = `URLPrefix=${b64url(input.urlPrefix)}:Expires=${input.expiresAtSec}:KeyName=${input.keyName}`
  const signature = b64url(createHmac('sha1', input.key).update(policy).digest())
  return { name: CDN_COOKIE_NAME, value: `${policy}:Signature=${signature}` }
}

/** The signing key from its base64url form, or null when it is missing, malformed or too short to be a real key. */
export function decodeCdnKey(raw: string | undefined): Buffer | null {
  const s = raw?.trim()
  if (!s || s.length < 22 || !/^[A-Za-z0-9_-]+={0,2}$/.test(s)) return null
  const key = Buffer.from(s, 'base64url')
  return key.length >= MIN_KEY_BYTES ? key : null
}

/** The Set-Cookie header value: HttpOnly, Secure, SameSite=Lax, scoped to ONE video's folder and to the configured domain, 10 minutes. */
export function buildCdnSetCookie(opts: { value: string; domain: string; path: string }): string {
  if (!COOKIE_VALUE_RE.test(opts.value)) throw new RangeError('cdn cookie: bad value')
  if (!DOMAIN_RE.test(opts.domain)) throw new RangeError('cdn cookie: bad domain')
  if (!PATH_RE.test(opts.path)) throw new RangeError('cdn cookie: the path must be one video folder')
  return `${CDN_COOKIE_NAME}=${opts.value}; Domain=${opts.domain}; Path=${opts.path}; Max-Age=${CDN_COOKIE_TTL_SECONDS}; HttpOnly; Secure; SameSite=Lax`
}

export interface VideoCdnConfig {
  /** The CDN host, bare (`media.tappyai.com`). */
  host: string
  /** The cookie Domain: the CDN host itself or a parent (`.tappyai.com`), so a cookie set by the API reaches the CDN host. */
  cookieDomain: string
  keyName: string
  key: Buffer
}

type Env = Readonly<Record<string, string | undefined>>

/**
 * The delivery configuration, or null when ANY of the four variables is missing or malformed. There is NO default for any of them: until the owner creates the CDN and sets
 * VIDEO_CDN_HOST, VIDEO_CDN_COOKIE_DOMAIN, VIDEO_CDN_KEY_NAME and VIDEO_CDN_SIGNING_KEY, playback answers "unavailable" and nothing is signed.
 */
export function videoCdnConfig(env: Env = process.env): VideoCdnConfig | null {
  const host = env.VIDEO_CDN_HOST?.trim().toLowerCase()
  const cookieDomain = env.VIDEO_CDN_COOKIE_DOMAIN?.trim().toLowerCase()
  const keyName = env.VIDEO_CDN_KEY_NAME?.trim()
  const key = decodeCdnKey(env.VIDEO_CDN_SIGNING_KEY)
  if (!host || !HOSTNAME_RE.test(host) || !cookieDomain || !DOMAIN_RE.test(cookieDomain) || !keyName || !KEY_NAME_RE.test(keyName) || !key) return null
  // The cookie is only sent to the CDN host if its Domain is that host or a parent of it.
  const bare = cookieDomain.replace(/^\./, '')
  if (host !== bare && !host.endsWith(`.${bare}`)) return null
  return { host, cookieDomain, keyName, key }
}

/** The folder prefix and path of one video on the CDN. Both ids must be uuids (the signer re-checks). */
export function cdnVideoScope(host: string, ownerId: string, assetId: string): { urlPrefix: string; path: string; manifestUrl: string } {
  const path = `/vdel/${ownerId}/${assetId}/`
  return { urlPrefix: `https://${host}${path}`, path, manifestUrl: `https://${host}${path}manifest.m3u8` }
}
