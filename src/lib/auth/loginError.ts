// What /login says when a sign-in attempt sends the visitor back with `?error=…`.
//
// The value comes from OUR routes (`no_code`, `zalo_*`, `app_state_invalid`, `rate_limited`) and, for
// /auth/callback and /auth/confirm, from the provider's own error text (e.g. "Email link is invalid or has
// expired"). Either way it is attacker-controllable (anyone can craft a link), so it is only ever MAPPED
// to one of a fixed set of dictionary keys. The raw value is never rendered, and any value we do not
// recognise gets the generic sentence.

export type LoginErrorKey =
  | 'login.err.noCode'
  | 'login.err.cancelled'
  | 'login.err.zaloDenied'
  | 'login.err.zaloFailed'
  | 'login.err.zaloUnavailable'
  | 'login.err.zaloInvalid'
  | 'login.err.appState'
  | 'login.err.linkExpired'
  | 'login.err.rateLimited'
  | 'login.err.generic'

const BY_CODE: Record<string, LoginErrorKey> = {
  no_code: 'login.err.noCode',
  access_denied: 'login.err.cancelled',
  zalo_denied: 'login.err.zaloDenied',
  zalo_failed: 'login.err.zaloFailed',
  zalo_unavailable: 'login.err.zaloUnavailable',
  zalo_invalid: 'login.err.zaloInvalid',
  app_state_invalid: 'login.err.appState',
  rate_limited: 'login.err.rateLimited',
  missing_token: 'login.err.linkExpired',
  exchange_failed: 'login.err.linkExpired',
  verify_failed: 'login.err.linkExpired',
}

/** The dictionary key for a `?error=` value, or null when there is no error to show. Total: never throws. */
export function loginErrorKey(raw: string | null | undefined): LoginErrorKey | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value) return null
  const code = BY_CODE[value.toLowerCase()]
  if (code) return code
  // The provider's wording for an expired or already-used email link / one-time code.
  if (/email link is invalid|link is invalid|has expired|otp_expired|invalid or has expired/i.test(value)) return 'login.err.linkExpired'
  return 'login.err.generic'
}
