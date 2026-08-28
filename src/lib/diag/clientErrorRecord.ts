// ── TEMPORARY DIAGNOSTIC — remove with the P0 fix ───────────────────────────
//
// Exists for exactly one open bug: on iOS Safari, an authenticated Zalo session that goes
// Chat → BottomNav "Trang chủ" (router.push('/')) lands on Next's client-exception page. The
// flow is clean in Chromium, and iOS Safari has no console we can reach without a Mac, so the
// exception has to be recorded ON THE DEVICE and read back by the owner.
//
// This module is the pure, testable half: it decides WHAT is recorded. The listener half
// (ClientErrorDiag) only forwards to it, and the reader (/diag) only displays it.
//
// 🔒 Nothing leaves the device. There is no endpoint, no fetch, no logging. The record lives in
// this tab's sessionStorage and is read by the owner on /diag.

/** One captured client error. Deliberately a closed shape — no free-form payload. */
export interface ClientErrorRecord {
  kind: 'error' | 'unhandledrejection'
  name: string
  message: string
  stack: string
  /** Path only — never the query string, which can carry a user's typed question (`?q=`). */
  pathname: string
  visibility: string
  /** Whether a session exists. A boolean, never the user, the id, or the token. */
  authed: boolean
  at: string
}

/**
 * Strip anything that could be a credential before it is written down.
 *
 * Stacks and messages normally contain script URLs and framework frames, but this app puts the
 * Zalo access token in a URL FRAGMENT (`/auth/zalo-finish#at=…`) and the magic-link token in a
 * query (`/auth/confirm?token_hash=…`), so a stack captured mid-auth could carry one. The
 * redactor is therefore not decoration: it runs before anything is stored.
 */
export function redact(input: string): string {
  return String(input ?? '')
    // Named secrets in a query or fragment: at / token / token_hash / access_token / refresh_token / code.
    .replace(/\b(at|code|token|token_hash|access_token|refresh_token|api_key|apikey|key|secret|password)=[^&\s"')]+/gi, '$1=[REDACTED]')
    // A bare JWT anywhere.
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]')
    // Any long opaque run that could be a token; short words and hashes in filenames are left alone.
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[REDACTED_LONG]')
    .slice(0, 4000)
}

/** Build the record. Every field is either derived here or a primitive the caller measured. */
export function buildRecord(input: {
  kind: ClientErrorRecord['kind']
  name?: unknown
  message?: unknown
  stack?: unknown
  pathname?: string
  visibility?: string
  authed?: boolean
  at?: string
}): ClientErrorRecord {
  return {
    kind: input.kind,
    name: redact(typeof input.name === 'string' ? input.name : ''),
    message: redact(typeof input.message === 'string' ? input.message : String(input.message ?? '')),
    stack: redact(typeof input.stack === 'string' ? input.stack : ''),
    // Path only, no search: `/chat?q=…` would otherwise record what the user typed.
    pathname: redact((input.pathname ?? '').split('?')[0]),
    visibility: input.visibility ?? '',
    authed: input.authed === true,
    at: input.at ?? '',
  }
}

export const DIAG_KEY = 'tappy_diag_v1'
export const DIAG_MAX = 20
