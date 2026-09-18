// ─────────────────────────────────────────────────────────────────────────────
// The ONE persistent first-party anonymous identifier: `anon_id`.
//
// It already existed, privately, inside `src/lib/tracking/envelope.ts` as the
// localStorage key `tappy_analytics_anon`. G1 needs the same value in three
// more places — the attribution state, the public shared-result view, and the
// server-side anonymous follow-up limiter — so it is lifted here and the
// envelope reads it from this module. Same key, same value; nothing is minted
// twice.
//
// STORAGE. localStorage is the authority; a first-party cookie (`tappy_aid`)
// MIRRORS it so server routes can read the identity without a round trip
// (view dedup on /r/[slug], the anonymous follow-up quota). If localStorage was
// cleared but the cookie survived, the cookie value is adopted — one identity
// per browser, never one per surface.
//
// 🚨 PRIVACY. A random UUID, generated locally. It never contains PII, is never
// placed in a public URL, and is never sent to another user. Analytics reads it
// from the envelope; the server never trusts it for authorization — it is an
// analytics and abuse-control key only.
// ─────────────────────────────────────────────────────────────────────────────

export const ANON_ID_STORAGE_KEY = 'tappy_analytics_anon'
export const ANON_ID_COOKIE = 'tappy_aid'
/** 400 days — the maximum lifetime Chrome honours for a cookie. */
const COOKIE_MAX_AGE_S = 400 * 24 * 60 * 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isAnonId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

export function newAnonId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  } catch { /* fall through */ }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/** Read the mirror cookie, if the document has one. Pure parse — testable. */
export function readAnonIdCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null
  const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${ANON_ID_COOKIE}=([^;]+)`))
  const v = m ? decodeURIComponent(m[1]) : null
  return isAnonId(v) ? v : null
}

function writeCookie(id: string) {
  try {
    const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${ANON_ID_COOKIE}=${id}; Path=/; Max-Age=${COOKIE_MAX_AGE_S}; SameSite=Lax${secure}`
  } catch { /* cookies disabled — localStorage still holds it */ }
}

/**
 * The browser's anon_id, minting one on first call.
 *
 * Browser-only. On the server this returns null — callers there read the
 * cookie from the request instead (`readAnonIdCookie`).
 */
export function getAnonId(): string | null {
  if (typeof window === 'undefined') return null
  let id: string | null = null
  try { id = localStorage.getItem(ANON_ID_STORAGE_KEY) } catch { /* private mode */ }
  if (!isAnonId(id)) {
    id = readAnonIdCookie(typeof document !== 'undefined' ? document.cookie : null) ?? newAnonId()
    try { localStorage.setItem(ANON_ID_STORAGE_KEY, id) } catch { /* best effort */ }
  }
  // Refresh the mirror on every read: a cookie's lifetime is bounded, localStorage's is not.
  writeCookie(id)
  return id
}
