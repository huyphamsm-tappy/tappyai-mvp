// P2a (2026-09-28) — is an upload failure "the storage service is unavailable" rather than
// "this particular upload failed"?
//
// The distinction matters to the person uploading. On a preview deployment the GCP WIF provider's
// attribute condition only admits the production environment, so EVERY avatar/cover upload fails
// at the STS leg; answering that with "please try again" invites retries that cannot succeed.
//
// Read structurally (by `name` / `stage` / `status`) rather than with `instanceof`, the same way
// `uploadRoute.ts` reads these errors, so this module imports no provider or credential code.

const UNAVAILABLE_NAMES = new Set([
  'WifExchangeError',
  'WifTimeoutError',
  'MediaCredentialsUnavailableError',
  'MediaTimeoutError',
])

const CREDENTIAL_STAGES = new Set(['oidc', 'sts', 'impersonation'])

export function isUploadServiceUnavailable(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false
  const err = e as { name?: unknown; stage?: unknown }
  if (typeof err.name === 'string' && UNAVAILABLE_NAMES.has(err.name)) return true
  if (typeof err.stage === 'string' && CREDENTIAL_STAGES.has(err.stage)) return true
  return false
}
