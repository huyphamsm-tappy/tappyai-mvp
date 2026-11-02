// Who may use the payment routes: a REAL signed-in account (never a guest / anonymous session), not suspended or banned.
// One small guard instead of the P8 guard bundle — it uses the P7 helpers that already decide the same questions
// (getRequestUser, refuseAnonymousSocialWrite, getAccountRestriction).

import { NextResponse } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { accountRestrictionCode, accountRestrictionMessage, getAccountRestriction } from '@/lib/account/accountStatus'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

export interface Payer { user: User; supabase: SupabaseClient }

/** The signed-in, active account — or the ready-to-send refusal. Fails closed on every doubt. */
export async function requirePayer(req: Request): Promise<Payer | NextResponse> {
  let resolved: { user: User | null; supabase: SupabaseClient }
  try {
    resolved = await getRequestUser(req)
  } catch {
    resolved = { user: null, supabase: null as unknown as SupabaseClient }
  }
  if (!resolved.user) {
    return NextResponse.json({ error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) }, { status: 401 })
  }
  const anon = refuseAnonymousSocialWrite(req, resolved.user)
  if (anon) return anon
  const restriction = await getAccountRestriction(resolved.supabase, resolved.user.id)
  if (restriction.blocked) {
    const reason = restriction.reason!
    return NextResponse.json({ error: accountRestrictionCode(reason), message: accountRestrictionMessage(restriction) }, { status: reason === 'unavailable' ? 503 : 403 })
  }
  return { user: resolved.user, supabase: resolved.supabase }
}
