import { NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteOwnAccount, isConfirmWord, lookupAppleIdentity, staffStatus } from '@/lib/account/selfDelete'
import { selfDeleteAvailable } from '@/lib/account/deletionReady'
import { revokeAppleForDeletion } from '@/lib/auth/appleRevoke'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

export const runtime = 'nodejs'

// POST /api/account/delete — the signed-in person deletes their own account (UAT3 P0).
//
// The deletion itself is `deleteOwnAccount` → `auth.admin.deleteUser`, the same call the operator
// runbook makes (see `lib/account/selfDelete.ts`). Web uses the cookie session; a native client can
// send its Supabase JWT as `Authorization: Bearer` (`getRequestUser`).
//
// Sign in with Apple (App Review 5.1.1(v)): an account that has an Apple identity is deleted ONLY
// after its Apple authorisation has been revoked at Apple (`lib/auth/appleRevoke.ts`). The app
// re-confirms with Apple and sends the fresh single-use code; the server exchanges it, checks it
// belongs to THIS account, revokes, and only then deletes. Any failure before the revoke leaves the
// account untouched and retryable. Nothing about the code or the tokens is stored, logged or returned.
//
// Contract:
//   body  { confirm: "XÓA" | "XOÁ" | "DELETE", apple_authorization_code?: string }
//         the code is required ONLY for an account with an Apple identity; ignored otherwise
//   200   { ok: true }                            — account deleted; client then signs out
//   200   { ok: true, apple_revoked: true }       — an Apple account: revoked at Apple, then deleted
//   400   { error: "confirm_required" }
//   400   { error: "apple_authorization_invalid" }— the code is expired / used / not for this app: re-confirm with Apple
//   401   { error: "unauthorized" }               — no session
//   403   { error: "account_required" }           — an anonymous session (nothing to delete)
//   404   { error: "not_available" }              — ACCOUNT_SELF_DELETE_ENABLED is off here, OR the clean-up migration is not installed
//   409   { error: "staff_account" }              — use the staff leaver runbook
//   409   { error: "apple_authorization_required" } — an Apple account and no code: the app must re-confirm with Apple
//   409   { error: "apple_identity_mismatch" }    — the code belongs to a different Apple ID (nothing revoked, nothing deleted)
//   500   { error: "delete_failed" }
//   502   { error: "apple_revoke_failed" }        — Apple did not confirm the revoke; account NOT deleted, retry
//   503   { error: "apple_revoke_unavailable" }   — Apple revocation is not configured here; account NOT deleted
// Every error carries `message` in the caller's language (serverMessages).
// Logged: outcome only — never the user id, email, code or token.

export async function POST(req: Request) {
  const locale = requestLocale(req)
  // Flag AND installed clean-up (lib/account/deletionReady.ts): the env flag alone must never switch deletion on.
  if (!(await selfDeleteAvailable())) {
    return NextResponse.json({ error: 'not_available', message: serverMessage('account.deleteUnavailable', locale) }, { status: 404 })
  }

  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', locale) }, { status: 401 })
  const anonymous = refuseAnonymousSocialWrite(req, user)
  if (anonymous) return anonymous

  let body: unknown = null
  try { body = await req.json() } catch { /* handled below */ }
  const fields = (body && typeof body === 'object' ? body : {}) as { confirm?: unknown; apple_authorization_code?: unknown }
  if (!isConfirmWord(fields.confirm)) {
    return NextResponse.json({ error: 'confirm_required', message: serverMessage('account.deleteConfirmRequired', locale) }, { status: 400 })
  }

  const admin = createAdminClient()

  // Staff first: an account that cannot be deleted must not have its Apple authorisation revoked on the way to being refused.
  const staff = await staffStatus(admin, user.id)
  if (staff === 'staff') return NextResponse.json({ error: 'staff_account', message: serverMessage('account.deleteStaff', locale) }, { status: 409 })
  if (staff === 'error') return NextResponse.json({ error: 'delete_failed', message: serverMessage('account.deleteFailed', locale) }, { status: 500 })

  // Does this account have an Apple identity? Asked of Auth, never of the request. A failed lookup is not "no": fail closed.
  const identity = await lookupAppleIdentity(admin, user.id)
  if (!identity.ok) {
    console.log(JSON.stringify({ type: 'tappyai_account', event: 'self_delete', ok: false, reason: 'identity_lookup_failed' }))
    return NextResponse.json({ error: 'delete_failed', message: serverMessage('account.deleteFailed', locale) }, { status: 500 })
  }

  let appleRevoked = false
  if (identity.apple) {
    const code = typeof fields.apple_authorization_code === 'string' ? fields.apple_authorization_code.trim() : ''
    if (!code) {
      console.log(JSON.stringify({ type: 'tappyai_account', event: 'self_delete', ok: false, reason: 'apple_authorization_required' }))
      return NextResponse.json({ error: 'apple_authorization_required', message: serverMessage('account.appleAuthorizationRequired', locale) }, { status: 409 })
    }
    const revoke = await revokeAppleForDeletion({ authorizationCode: code, appleSubjects: identity.subjects })
    if (!revoke.ok) {
      console.log(JSON.stringify({ type: 'tappyai_account', event: 'self_delete', ok: false, reason: `apple_${revoke.reason}` }))
      switch (revoke.reason) {
        case 'invalid_code':
          return NextResponse.json({ error: 'apple_authorization_invalid', message: serverMessage('account.appleAuthorizationInvalid', locale) }, { status: 400 })
        case 'identity_mismatch':
          return NextResponse.json({ error: 'apple_identity_mismatch', message: serverMessage('account.appleIdentityMismatch', locale) }, { status: 409 })
        case 'not_configured':
          return NextResponse.json({ error: 'apple_revoke_unavailable', message: serverMessage('account.appleRevokeUnavailable', locale) }, { status: 503 })
        default:
          return NextResponse.json({ error: 'apple_revoke_failed', message: serverMessage('account.appleRevokeFailed', locale) }, { status: 502 })
      }
    }
    appleRevoked = true
  }

  const result = await deleteOwnAccount(admin, user.id)
  console.log(JSON.stringify({ type: 'tappyai_account', event: 'self_delete', ok: result.ok, apple_revoked: appleRevoked, reason: result.ok ? null : result.reason }))
  if (!result.ok) {
    return result.reason === 'staff_account'
      ? NextResponse.json({ error: 'staff_account', message: serverMessage('account.deleteStaff', locale) }, { status: 409 })
      : NextResponse.json({ error: 'delete_failed', message: serverMessage('account.deleteFailed', locale) }, { status: 500 })
  }

  // The user no longer exists, so their refresh token is dead server-side. The browser tears down
  // its own session with `performSignOut` (the one sign-out call site in src/).
  return NextResponse.json(appleRevoked ? { ok: true, apple_revoked: true } : { ok: true })
}
