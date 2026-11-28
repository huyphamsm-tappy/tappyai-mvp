import { NextResponse } from 'next/server'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { isAnonymousUser, type MaybeAnonymousUser } from '@/lib/auth/socialWriteAccess'

// Owner 28/11/2026: everything except the chat with Tappy needs a Tappy account. A visitor (no session, or the anonymous session every browser gets for the 5 free chat
// questions) may look at the product, not use it. Put this right after the route has resolved the user:
//
//     const { user } = await getRequestUser(req)
//     const refusal = refuseWithoutAccount(req, user)
//     if (refusal) return refusal
//
// 401 when there is no user at all (authenticate); 403 for an anonymous session, never 401: that client IS authenticated and would loop minting new visitor sessions.
// The chat route, and the visitor's own chat state (conversations, memory, preferences), do not call this.

interface LocaleBearingRequest {
  readonly url?: string
  readonly nextUrl?: { readonly searchParams: URLSearchParams }
  readonly headers?: { get?: (name: string) => string | null }
}

export function refuseWithoutAccount(req: LocaleBearingRequest, user: MaybeAnonymousUser | null | undefined): NextResponse | null {
  if (!user) {
    return NextResponse.json({ error: 'login_required', message: serverMessage('auth.useRequiresAccount', requestLocale(req)) }, { status: 401 })
  }
  if (isAnonymousUser(user)) {
    return NextResponse.json({ error: 'account_required', message: serverMessage('auth.useRequiresAccount', requestLocale(req)) }, { status: 403 })
  }
  return null
}
