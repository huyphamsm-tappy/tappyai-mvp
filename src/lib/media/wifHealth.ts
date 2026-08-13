// Does this deployment actually have production GCS write authority?
//
// The bridge is fail-closed by design: while MEDIA_PROVIDER=blob nothing
// touches the credential chain, so a misconfigured federation would stay
// invisible until the flag was flipped and every new upload started failing.
// This check runs the real chain on demand — Vercel OIDC -> Google STS ->
// service-account impersonation -> Cloud Storage — and reports how far it got.
//
// It proves the chain without handing any of it back. The verdict names a
// stage; it never carries the OIDC token, the impersonated access token, or the
// resumable session URI (a bearer capability in its own right).
//
// It is also non-mutating: opening a resumable session and never PUTting to it
// leaves no object in the bucket.

import { WifExchangeError, WifTimeoutError } from './gcpAuth'
import { MediaUploadSessionError } from './types'
import { randomMediaSuffix } from './key'
import type { UploadSession, UploadSessionRequest } from './types'

export type WifHealthStage = 'oidc' | 'sts' | 'impersonation' | 'gcs' | 'complete'

export interface OidcClaims {
  issuer: string
  audience: string
  subject: string
  expiresInSeconds: number
}

export interface WifHealthResult {
  ok: boolean
  /** How far the chain got. On success this is 'complete'. */
  stage: WifHealthStage
  /** Metadata only — enough to confirm the identity, never the token itself. */
  oidc?: OidcClaims
  /**
   * Whether the token's claims could be decoded. Reported separately from `ok`
   * on purpose: an undecodable token is a cosmetic problem, not a failure, and
   * conflating the two is what hid a working identity behind "no deployment
   * identity available".
   */
  claimsReadable?: boolean
  bucket?: string
  /** A short, non-sensitive reason. Never provider text, never credentials. */
  reason?: string
}

export interface WifHealthDeps {
  bucket: string
  getOidcToken: () => string | null | undefined
  /** The same call the real upload routes make. */
  createUploadSession: (req: UploadSessionRequest) => Promise<UploadSession>
  now?: () => number
}

/**
 * Reads the claims out of the deployment's OIDC token.
 *
 * The signature is deliberately NOT verified: Google verifies it during the
 * exchange, which is the check that actually matters. This is only so an
 * operator can see which identity the deployment is presenting — in particular
 * whether the subject ends in `environment:production`.
 */
/**
 * base64url -> utf8, using `atob` rather than `Buffer`.
 *
 * `Buffer` is a Node global and does not exist in the Edge runtime, so a
 * Buffer-based decode throws there — and because the caller treats a throw as
 * "cannot decode", a perfectly valid token would look unreadable purely because
 * of where the route happened to run. `atob` and `TextDecoder` exist in both.
 */
function decodeBase64Url(segment: string): string | null {
  try {
    const b64 = segment.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

export function readOidcClaims(
  token: string | null | undefined,
  now: () => number = () => Date.now()
): OidcClaims | null {
  if (typeof token !== 'string' || token.length === 0) return null

  const parts = token.split('.')
  if (parts.length !== 3) return null

  const json = decodeBase64Url(parts[1])
  if (json === null) return null

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(json)
  } catch {
    return null
  }
  if (typeof payload !== 'object' || payload === null) return null

  const exp = typeof payload.exp === 'number' ? payload.exp : 0
  return {
    issuer: String(payload.iss ?? ''),
    audience: String(payload.aud ?? ''),
    subject: String(payload.sub ?? ''),
    expiresInSeconds: Math.max(0, Math.round(exp - now() / 1000)),
  }
}

/** Maps a thrown error onto the stage the chain reached. */
function stageOf(e: unknown): WifHealthStage {
  if (e instanceof WifExchangeError) return e.stage === 'oidc' ? 'oidc' : e.stage
  if (e instanceof WifTimeoutError) return e.stage
  if (e instanceof MediaUploadSessionError) return 'gcs'
  return 'gcs'
}

export async function checkWifHealth(deps: WifHealthDeps): Promise<WifHealthResult> {
  const now = deps.now ?? (() => Date.now())
  const token = deps.getOidcToken()

  // Presence is a question about the TOKEN, not about whether we can pretty-print
  // it. This used to test `readOidcClaims(...) !== null`, which also returns null
  // for a token that is present but not decodable — so a perfectly good identity
  // was reported as a missing one and the exchange never ran at all.
  if (typeof token !== 'string' || token.length === 0) {
    return { ok: false, stage: 'oidc', reason: 'no deployment identity available' }
  }

  // Claims are operator convenience. Google — not this code — is the authority
  // on whether a token is acceptable, and the only way to learn its verdict is
  // to attempt the exchange. An identity we cannot decode is still an identity.
  const oidc = readOidcClaims(token, now) ?? undefined
  const claimsReadable = oidc !== undefined

  // A server-owned key under an allowed prefix, exactly as a real upload would
  // be named. Nothing here comes from a caller.
  const req: UploadSessionRequest = {
    key: `videos/health/${randomMediaSuffix(24)}.mp4`,
    contentType: 'video/mp4',
    sizeBytes: 1,
  }

  try {
    await deps.createUploadSession(req)
  } catch (e) {
    // The error's own text is never echoed: a provider message can contain
    // request metadata, and a wrapped error could carry a session URI.
    return {
      ok: false,
      stage: stageOf(e),
      oidc,
      claimsReadable,
      bucket: deps.bucket,
      reason: 'chain rejected',
    }
  }

  return { ok: true, stage: 'complete', oidc, claimsReadable, bucket: deps.bucket }
}
