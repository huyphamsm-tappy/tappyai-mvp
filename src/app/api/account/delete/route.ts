import { NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteOwnAccount, isConfirmWord, selfDeleteEnabled } from '@/lib/account/selfDelete'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

export const runtime = 'nodejs'

// POST /api/account/delete — the signed-in person deletes their own account (UAT3 P0).
//
// The deletion itself is `deleteOwnAccount` → `auth.admin.deleteUser`, the same call the operator
// runbook makes; the database cascades and the D4 trigger queues the file/Google clean-up job
// (see `lib/account/selfDelete.ts`). Web uses the cookie session; a native client can send its
// Supabase JWT as `Authorization: Bearer` (`getRequestUser`).
//
// Contract:
//   body  { confirm: "XÓA" | "XOÁ" | "DELETE" }   — the typed word, re-checked here
//   200   { ok: true }                            — account deleted; client then signs out
//   400   { error: "confirm_required" }
//   401   { error: "unauthorized" }               — no session
//   403   { error: "account_required" }           — an anonymous session (nothing to delete)
//   404   { error: "not_available" }              — ACCOUNT_SELF_DELETE_ENABLED is off here
//   409   { error: "staff_account" }              — use the staff leaver runbook
//   500   { error: "delete_failed" }
// Every error carries `message` in the caller's language (serverMessages).
// Logged: outcome only — never the user id or email.

export async function POST(req: Request) {
  const locale = requestLocale(req)
  if (!selfDeleteEnabled()) {
    return NextResponse.json({ error: 'not_available', message: serverMessage('account.deleteUnavailable', locale) }, { status: 404 })
  }

  const { user } = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', locale) }, { status: 401 })
  const anonymous = refuseAnonymousSocialWrite(req, user)
  if (anonymous) return anonymous

  let body: unknown = null
  try { body = await req.json() } catch { /* handled below */ }
  if (!isConfirmWord((body as { confirm?: unknown } | null)?.confirm)) {
    return NextResponse.json({ error: 'confirm_required', message: serverMessage('account.deleteConfirmRequired', locale) }, { status: 400 })
  }

  const result = await deleteOwnAccount(createAdminClient(), user.id)
  console.log(JSON.stringify({ type: 'tappyai_account', event: 'self_delete', ok: result.ok, reason: result.ok ? null : result.reason }))
  if (!result.ok) {
    return result.reason === 'staff_account'
      ? NextResponse.json({ error: 'staff_account', message: serverMessage('account.deleteStaff', locale) }, { status: 409 })
      : NextResponse.json({ error: 'delete_failed', message: serverMessage('account.deleteFailed', locale) }, { status: 500 })
  }

  // The user no longer exists, so their refresh token is dead server-side. The browser tears down
  // its own session with `performSignOut` (the one sign-out call site in src/).
  return NextResponse.json({ ok: true })
}
