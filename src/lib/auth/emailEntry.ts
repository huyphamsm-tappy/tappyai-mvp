// Login entry point for the EXISTING Supabase email (passwordless) sign-in.
//
// V1 hides the email block from the normal sign-in card by product decision
// (see SHOW_EMAIL_OTP_IN_CARD in app/login/page.tsx, owner decision 2026-07-21).
// The block stays fully wired because it is the only provider that works inside
// Zalo/Facebook webviews, where Google OAuth is blocked — which also made it the
// ONLY way to sign in as an email-provider identity, and only from a webview.
//
// This module answers one question: did the request explicitly ask for that
// existing block to be shown? It is PRESENTATION ONLY.
//
//   • It exposes no new authentication mechanism — `signInWithOtp` / `verifyOtp`
//     are already deployed and already reachable from any in-app browser.
//   • It grants NO authorization. Signing in this way produces an ordinary user
//     session; `/admin` still enforces the Option B corporate boundary
//     (checkCorporateIdentity in rbac.ts) and the canonical PDP, server-side.
//   • It does not touch redirect handling — `returnTo` continues to be read by
//     `readReturnTo`, and `safeReturnTo` still rejects off-site destinations.

/** The query parameter that reveals the existing email sign-in block. */
export const EMAIL_ENTRY_PARAM = 'email'

/** Only this exact value opens it — anything else leaves the card unchanged. */
const EMAIL_ENTRY_VALUE = '1'

/**
 * True iff the location search string explicitly requests the email sign-in
 * block, e.g. `/login?email=1`. Absent or any other value → false, so the
 * default card is byte-for-byte the V1 card.
 *
 * Accepts a search string with or without the leading `?`.
 */
export function emailEntryRequested(search: string | null | undefined): boolean {
  if (!search) return false
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  return params.get(EMAIL_ENTRY_PARAM) === EMAIL_ENTRY_VALUE
}
