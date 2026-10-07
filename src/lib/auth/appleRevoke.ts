import { createPrivateKey, sign } from 'node:crypto'

// -- Sign in with Apple: revoke the user's Apple authorization when their account is deleted ----------------------------------
//
// Apple App Review 5.1.1(v): an app that offers account creation must offer deletion, and an app that supports Sign in with Apple
// must revoke the user's Apple tokens when the account is deleted. iOS signs in NATIVELY (Apple identity token -> Supabase
// signInWithIdToken), so no Apple refresh token is ever stored by this app or by Supabase - there is nothing to look up.
//
// So the tokens are obtained at deletion time, from a FRESH single-use authorization code the app collects by asking the user to
// confirm with Apple again (Apple's recommended pattern):
//
//   iOS re-authorises with Apple -> authorizationCode (valid ~5 min, single use)
//     -> POST /api/account/delete { confirm, apple_authorization_code }
//     -> server: code -> /auth/token -> refresh_token (+ id_token.sub)
//     -> check id_token.sub is THIS account's Apple identity (never revoke somebody else's authorisation)
//     -> /auth/revoke (refresh_token)
//     -> only then delete the local account
//
// Nothing is stored: the code and the refresh token live in this function's memory for the length of the request. No token, code,
// secret or Apple response body is ever logged, returned or placed in an error - callers only ever see a REASON code.
//
// Config (server env, names only - values are secrets and never in git or chat):
//   APPLE_SIWA_TEAM_ID      10-character Apple Developer Team ID
//   APPLE_SIWA_KEY_ID       10-character Key ID of a key with "Sign in with Apple" enabled (Apple Developer > Keys)
//   APPLE_SIWA_PRIVATE_KEY  the .p8 key contents (PEM; a literal "\n" is accepted for single-line env storage)
//   APPLE_SIWA_CLIENT_ID    optional; defaults to the iOS bundle id. For an authorization code obtained by a native app the client
//                           id is the app's bundle id, and it must be the SAME id the code was issued for.
// Unset/invalid -> `not_configured`: an Apple user's deletion is refused (503), never completed without the revoke.

export const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token'
export const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke'
export const APPLE_AUDIENCE = 'https://appleid.apple.com'
export const APPLE_DEFAULT_CLIENT_ID = 'com.tappyai.ios'
/** The client-secret JWT lives for one request; Apple allows up to six months, there is no reason to ask for more than minutes. */
export const APPLE_CLIENT_SECRET_TTL_SEC = 300
export const APPLE_TIMEOUT_MS = 8_000
const MAX_CODE_CHARS = 2_048
const MAX_RESPONSE_CHARS = 20_000

export interface AppleRevokeConfig {
  teamId: string
  keyId: string
  /** PEM, already normalised. */
  privateKey: string
  clientId: string
}

export function appleRevokeConfig(env: Record<string, string | undefined> = process.env): AppleRevokeConfig | null {
  const teamId = env.APPLE_SIWA_TEAM_ID?.trim() ?? ''
  const keyId = env.APPLE_SIWA_KEY_ID?.trim() ?? ''
  const raw = env.APPLE_SIWA_PRIVATE_KEY ?? ''
  const clientId = env.APPLE_SIWA_CLIENT_ID?.trim() || APPLE_DEFAULT_CLIENT_ID
  if (!/^[A-Z0-9]{10}$/.test(teamId) || !/^[A-Z0-9]{10}$/.test(keyId)) return null
  const privateKey = raw.replace(/\\n/g, '\n').trim()
  if (!privateKey.includes('BEGIN PRIVATE KEY')) return null
  try {
    // Apple keys are P-256: anything else could not produce an ES256 signature.
    const k = createPrivateKey(privateKey)
    if (k.asymmetricKeyType !== 'ec' || k.asymmetricKeyDetails?.namedCurve !== 'prime256v1') return null
  } catch {
    return null
  }
  return { teamId, keyId, privateKey, clientId }
}

const b64url = (b: Buffer | string): string => Buffer.from(b).toString('base64url')

/** The ES256 JWT Apple wants as `client_secret`. */
export function createAppleClientSecret(cfg: AppleRevokeConfig, nowSec: number): string {
  const header = { alg: 'ES256', kid: cfg.keyId, typ: 'JWT' }
  const payload = { iss: cfg.teamId, iat: nowSec, exp: nowSec + APPLE_CLIENT_SECRET_TTL_SEC, aud: APPLE_AUDIENCE, sub: cfg.clientId }
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
  // Apple (JWS ES256) wants the raw R||S signature, not DER.
  const signature = sign('sha256', Buffer.from(input), { key: createPrivateKey(cfg.privateKey), dsaEncoding: 'ieee-p1363' })
  return `${input}.${b64url(signature)}`
}

/** `sub` of an id_token received DIRECTLY from Apple's token endpoint over TLS (OIDC allows skipping the signature check there). */
export function idTokenSubject(idToken: unknown): string | null {
  if (typeof idToken !== 'string') return null
  const parts = idToken.split('.')
  if (parts.length !== 3) return null
  try {
    const sub = (JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { sub?: unknown }).sub
    return typeof sub === 'string' && sub.length > 0 && sub.length <= 256 ? sub : null
  } catch {
    return null
  }
}

export type AppleRevokeReason = 'not_configured' | 'invalid_code' | 'identity_mismatch' | 'apple_error'
export type AppleRevokeOutcome = { ok: true } | { ok: false; reason: AppleRevokeReason }

type Post = { ok: boolean; status: number; json: Record<string, unknown> | null } | null

async function postForm(url: string, form: Record<string, string>, fetchImpl: typeof fetch, timeoutMs: number): Promise<Post> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(form).toString(),
      signal: ctl.signal,
      redirect: 'error',
      cache: 'no-store',
    })
    const text = (await res.text()).slice(0, MAX_RESPONSE_CHARS)
    let json: Record<string, unknown> | null = null
    try { const p = JSON.parse(text); json = p && typeof p === 'object' && !Array.isArray(p) ? p as Record<string, unknown> : null } catch { /* the revoke endpoint answers an empty 200 */ }
    return { ok: res.ok, status: res.status, json }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export interface RevokeForDeletionInput {
  /** The fresh single-use code the app collected at deletion time. */
  authorizationCode: string
  /** Apple user ids (`sub`) of THIS account's Apple identity. Empty -> the code cannot be tied to the account -> refused. */
  appleSubjects: readonly string[]
  env?: Record<string, string | undefined>
  fetchImpl?: typeof fetch
  nowMs?: number
  timeoutMs?: number
}

/**
 * Exchange the code, prove it belongs to this account, revoke at Apple. `{ ok: true }` ONLY when Apple answered 200 to the revoke.
 * Never throws; never returns anything but a reason code.
 */
export async function revokeAppleForDeletion(input: RevokeForDeletionInput): Promise<AppleRevokeOutcome> {
  const cfg = appleRevokeConfig(input.env ?? process.env)
  if (!cfg) return { ok: false, reason: 'not_configured' }
  const code = typeof input.authorizationCode === 'string' ? input.authorizationCode.trim() : ''
  if (!code || code.length > MAX_CODE_CHARS) return { ok: false, reason: 'invalid_code' }

  const fetchImpl = input.fetchImpl ?? fetch
  const timeoutMs = input.timeoutMs ?? APPLE_TIMEOUT_MS
  const nowSec = Math.floor((input.nowMs ?? Date.now()) / 1000)
  let clientSecret: string
  try { clientSecret = createAppleClientSecret(cfg, nowSec) } catch { return { ok: false, reason: 'not_configured' } }

  const exchanged = await postForm(APPLE_TOKEN_URL, { client_id: cfg.clientId, client_secret: clientSecret, code, grant_type: 'authorization_code' }, fetchImpl, timeoutMs)
  if (!exchanged) return { ok: false, reason: 'apple_error' }
  if (!exchanged.ok) {
    // 400 invalid_grant / invalid_request = the code is expired, already used or not for this app: the user can simply re-confirm.
    const err = exchanged.json?.error
    return { ok: false, reason: exchanged.status === 400 && (err === 'invalid_grant' || err === 'invalid_request') ? 'invalid_code' : 'apple_error' }
  }
  const refreshToken = exchanged.json?.refresh_token
  const subject = idTokenSubject(exchanged.json?.id_token)
  if (typeof refreshToken !== 'string' || !refreshToken || !subject) return { ok: false, reason: 'apple_error' }
  // The code must be THIS account's. Otherwise revoking would cut some other person's authorisation.
  if (!input.appleSubjects.includes(subject)) return { ok: false, reason: 'identity_mismatch' }

  const revoked = await postForm(APPLE_REVOKE_URL, { client_id: cfg.clientId, client_secret: clientSecret, token: refreshToken, token_type_hint: 'refresh_token' }, fetchImpl, timeoutMs)
  return revoked?.ok && revoked.status === 200 ? { ok: true } : { ok: false, reason: 'apple_error' }
}
