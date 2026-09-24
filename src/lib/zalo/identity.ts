// ─────────────────────────────────────────────────────────────────────────────
// Zalo identity as a RATE-LIMIT SIGNAL (G1-E), never as authentication.
//
// The Mini App holds a Zalo access token (ZMP SDK `getAccessToken`). The server
// verifies it through a `ZaloIdentityVerifier`, then issues a SIGNED, httpOnly
// cookie carrying an HMAC of the Zalo user id — not the id itself. /api/chat
// reads that cookie and applies a per-Zalo-identity daily cap on top of the
// existing anonymous quota. The client can present a cookie it did not sign
// only by forging the HMAC, so "never trust client-side identity claims" holds
// by construction.
//
// Tappy's canonical identity model is UNCHANGED: chat quota still keys on the
// Supabase (anonymous or real) uid; the Zalo hash is one more key, not a user.
//
// 🚨 KNOWN CONSTRAINT, RECORDED NOT HIDDEN: `graph.zalo.me/v2.0/me` answers
// only to Vietnam IPs (the OAuth callback documents the -501 from Vercel-US).
// The real verifier therefore may fail from the current hosting region; the
// route reports `verification_unavailable` (503) in that case and the Mini App
// falls back to plain anonymous quota. Verification through a VN-region
// function is an owner infrastructure decision, listed in the doc.
// ─────────────────────────────────────────────────────────────────────────────

import { createHmac, timingSafeEqual } from 'crypto'

export const ZALO_IDENTITY_COOKIE = 'tappy_zalo'
export const ZALO_IDENTITY_SECRET_ENV = 'ZALO_IDENTITY_SECRET'
/** The cookie lives a day: the cap it backs is a daily cap. */
export const ZALO_IDENTITY_MAX_AGE_S = 24 * 60 * 60

export interface ZaloIdentityVerifier {
  /** Resolve a Zalo access token to a Zalo user id, or null when invalid. Throws when the verifier itself cannot answer. */
  verify(accessToken: string): Promise<string | null>
}

/** The real adapter: Zalo Open API, `id` only — no profile fields are requested or stored. */
export function createGraphZaloVerifier(fetchImpl: typeof fetch = fetch): ZaloIdentityVerifier {
  return {
    async verify(accessToken) {
      const res = await fetchImpl('https://graph.zalo.me/v2.0/me?fields=id', { headers: { access_token: accessToken } })
      if (!res.ok) throw new Error(`zalo graph HTTP ${res.status}`)
      const body = (await res.json()) as { id?: unknown; error?: unknown }
      if (typeof body.error === 'number' && body.error !== 0) {
        // -501 is the VN-IP restriction: the verifier cannot answer from here.
        if (body.error === -501) throw new Error('zalo graph region restricted')
        return null
      }
      return typeof body.id === 'string' && /^\d{6,32}$/.test(body.id) ? body.id : null
    },
  }
}

// ── The Vietnam egress (2026-09-24) ─────────────────────────────────────────
//
// MEASURED WITH A REAL TOKEN, not assumed: `graph.zalo.me/v2.0/me` answers -501 ("region
// restricted") from Vercel iad1 (a live UAT login, 18:28), from Cloud Run us-central1 AND from
// Cloud Run asia-southeast1 (Singapore). Only a Vietnamese address is accepted, so the server can
// only learn a Zalo user id through a small verifier running on a VPS in Vietnam
// (`infra/zalo-verify/`). That service does exactly what `createGraphZaloVerifier` does, from an
// address Zalo accepts; this side talks to it.
//
// 🚨 FAIL-CLOSED, IN EVERY BRANCH. Unconfigured, unreachable, slow, wrong secret, rate-limited,
// malformed answer — each one THROWS, which the routes turn into 503 `verification_unavailable`.
// The only null is the proxy saying Zalo rejected the token. There is no path that falls back to
// an id supplied by the client: that fallback was R-1.

export const ZALO_VERIFY_URL_ENV = 'ZALO_VERIFY_URL'
export const ZALO_VERIFY_SECRET_ENV = 'ZALO_VERIFY_SECRET'
/** The header the proxy checks, constant-time, before it does anything else. */
export const ZALO_VERIFY_SECRET_HEADER = 'x-zalo-verify-secret'
/** Whole round trip to the proxy, which itself allows Zalo 5s. A login waits no longer than this. */
export const ZALO_VERIFY_TIMEOUT_MS = 6000

const ZALO_ID = /^\d{6,32}$/

/** The adapter the app uses: POST `{at}` to our Vietnam-hosted verifier, get `{id}` back. */
export function createProxyZaloVerifier(opts: {
  url: string
  secret: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): ZaloIdentityVerifier {
  const fetchImpl = opts.fetchImpl ?? fetch
  const timeoutMs = opts.timeoutMs ?? ZALO_VERIFY_TIMEOUT_MS
  return {
    async verify(accessToken) {
      let res: Response
      try {
        res = await fetchImpl(opts.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', [ZALO_VERIFY_SECRET_HEADER]: opts.secret },
          body: JSON.stringify({ at: accessToken }),
          signal: AbortSignal.timeout(timeoutMs),
          cache: 'no-store',
        })
      } catch (e) {
        // Timeout, DNS, TLS, connection refused — the verifier did not answer.
        throw new Error(`zalo verify proxy unreachable: ${e instanceof Error ? e.name : 'error'}`)
      }
      // 401/403 is OUR secret being refused — a configuration fault, never a verdict on the user.
      if (res.status === 401 || res.status === 403) throw new Error('zalo verify proxy rejected our secret')
      let body: { id?: unknown; error?: unknown }
      try {
        body = (await res.json()) as { id?: unknown; error?: unknown }
      } catch {
        throw new Error(`zalo verify proxy HTTP ${res.status}: unparseable body`)
      }
      if (res.ok && typeof body.id === 'string' && ZALO_ID.test(body.id)) return body.id
      // The one answer that means "this token is not valid": Zalo itself rejected it.
      if (res.ok && body.error === 'invalid_token') return null
      throw new Error(`zalo verify proxy HTTP ${res.status}: ${typeof body.error === 'string' ? body.error : 'no id'}`)
    },
  }
}

/**
 * The verifier every route should use.
 *
 * Proxy when `ZALO_VERIFY_URL` (https only) and `ZALO_VERIFY_SECRET` (≥ 32 chars) are both set;
 * otherwise a verifier that always throws. Missing configuration is therefore a 503, never a
 * silent fall back to calling `graph.zalo.me` directly — which from our hosting region is a
 * guaranteed -501 and would only hide the misconfiguration behind a vaguer error.
 */
export function createZaloVerifier(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl?: typeof fetch,
): ZaloIdentityVerifier {
  const url = env[ZALO_VERIFY_URL_ENV]
  const secret = env[ZALO_VERIFY_SECRET_ENV]
  if (!url || !url.startsWith('https://') || !secret || secret.length < 32) {
    return {
      async verify() {
        throw new Error('zalo verify proxy not configured')
      },
    }
  }
  return createProxyZaloVerifier({ url, secret, fetchImpl })
}

/** A deterministic verifier for tests and local runs. Accepts `mock:<id>` tokens only. */
export function createMockZaloVerifier(): ZaloIdentityVerifier {
  return {
    async verify(accessToken) {
      const m = accessToken.match(/^mock:(\d{6,32})$/)
      return m ? m[1] : null
    },
  }
}

export function zaloIdentitySecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const s = env[ZALO_IDENTITY_SECRET_ENV]
  return typeof s === 'string' && s.length >= 32 ? s : null
}

/** HMAC of the Zalo user id. Stable per (id, secret); reveals nothing about the id. */
export function hashZaloUserId(zaloUserId: string, secret: string): string {
  return createHmac('sha256', secret).update(`zalo:${zaloUserId}`).digest('base64url')
}

/** The cookie value: `<hash>.<sig>` so a forged hash fails the signature check. */
export function signZaloIdentity(zaloUserId: string, secret: string): string {
  const hash = hashZaloUserId(zaloUserId, secret)
  const sig = createHmac('sha256', secret).update(`sig:${hash}`).digest('base64url')
  return `${hash}.${sig}`
}

/** Pure: the verified Zalo identity hash from a cookie header, or null. */
export function readZaloIdentity(cookieHeader: string | null | undefined, secret: string | null): string | null {
  if (!cookieHeader || !secret) return null
  const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${ZALO_IDENTITY_COOKIE}=([^;]+)`))
  if (!m) return null
  const [hash, sig] = decodeURIComponent(m[1]).split('.')
  if (!hash || !sig) return null
  const expected = createHmac('sha256', secret).update(`sig:${hash}`).digest('base64url')
  const a = Buffer.from(sig), b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return hash
}

/** The Set-Cookie header for a verified identity. httpOnly, Secure, SameSite=None so the Mini App webview can carry it. */
export function zaloIdentitySetCookie(value: string): string {
  return `${ZALO_IDENTITY_COOKIE}=${value}; Path=/; Max-Age=${ZALO_IDENTITY_MAX_AGE_S}; HttpOnly; Secure; SameSite=None`
}
