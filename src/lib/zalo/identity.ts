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
