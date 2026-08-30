import { getRequestUser } from '@/lib/auth/getRequestUser'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { NextResponse } from 'next/server'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'

// POST /api/notifications/subscribe/reconcile
//
// Closes the identity half of the push-ownership defect: a Web Push
// subscription belongs to a BROWSER, the row belongs to a USER, and nothing
// reconciled the two when the person at the browser changed. Measured on
// production 2026-08-29 with a single row and no duplicate anywhere.
//
// One request, one atomic act, because "ask, then act" over two round trips is
// a race:
//   · release this credential from every account that is not the caller
//   · answer whether the caller owns it
//
// 🚨 IDENTITY COMES FROM THE SESSION. The body carries a credential and nothing
// else that matters; `disown_push_credential` takes no user id at all and reads
// auth.uid() itself, so there is no parameter a caller could point at someone
// else. This mirrors the pin already on the subscribe route: the request body
// never decides who a subscription belongs to.
//
// 🔑 The RLS-bound client from getRequestUser is used deliberately — no
// service-role in a user-facing route. The privilege needed to touch another
// account's row lives in the SECURITY DEFINER function, which is granted to
// `authenticated` and nothing else.
//
// This endpoint NEVER enables, creates or transfers a claim. B arriving on A's
// browser is told the truth (`mine: false`) and opts in themselves, or does not.

// A Web Push endpoint is ~100–300 bytes and an FCM token ~150; the bound is
// generous but keeps the row from being used as arbitrary storage, and matches
// the FCM token bound the subscribe route already applies.
const MAX_CREDENTIAL_LENGTH = 4096

export async function POST(req: Request) {
  try {
    const { user, supabase } = await getRequestUser(req)
    if (!user) {
      return NextResponse.json(
        { error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) },
        { status: 401 },
      )
    }

    // 🚨 A REGISTERED ACCOUNT, NOT MERELY "A USER". An anonymous session is a
    // real auth.users row whose JWT role is `authenticated`, so it satisfies
    // both the `!user` check above and the function's EXECUTE grant. Without
    // this line, anyone could mint an anonymous session in one request and then
    // switch off push for any device whose credential they hold.
    //
    // It is affordable because it is not needed to close the defect: the
    // incident of 2026-08-29 had the arriving account signed in (founder), and
    // sign-out now releases the claim on the way out. What is left is a visitor
    // who never signs in on a browser whose previous owner never signed out —
    // narrower than the write surface it would cost.
    const anonRefusal = refuseAnonymousSocialWrite(req, user)
    if (anonRefusal) return anonRefusal

    const body = await req.json().catch(() => null)
    const credential = typeof body?.credential === 'string' ? body.credential.trim() : ''
    if (!credential || credential.length > MAX_CREDENTIAL_LENGTH) {
      return NextResponse.json(
        { error: 'invalid_input', message: serverMessage('validation.invalid', requestLocale(req)) },
        { status: 400 },
      )
    }

    const { data, error } = await supabase.rpc('disown_push_credential', {
      p_credential: credential,
    })

    if (error) {
      // Never log the credential itself. It does not let its holder SEND a push
      // (that needs the VAPID private key and the subscription's encryption
      // keys), but it names one person's browser and it is the one input that
      // silences it — so it does not belong in a log line. The code is enough to
      // tell a missing migration (42883) from a permission problem (42501).
      console.error('[reconcile] disown_push_credential failed:', error.code ?? error.message)
      return NextResponse.json(
        { error: 'server_error', message: serverMessage('server.error', requestLocale(req)) },
        { status: 500 },
      )
    }

    // Only the boolean leaves this route. The credential is never echoed back.
    return NextResponse.json({ mine: data === true })
  } catch (e) {
    console.error('[reconcile] Error:', e)
    return NextResponse.json(
      { error: 'server_error', message: serverMessage('server.error', requestLocale(req)) },
      { status: 500 },
    )
  }
}
