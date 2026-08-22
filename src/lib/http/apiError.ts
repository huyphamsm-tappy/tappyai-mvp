import { NextResponse } from 'next/server'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage, type ServerMessageKey } from '@/lib/i18n/serverMessages'

/**
 * The one shape a user-facing API error takes.
 *
 * ============================================================================
 * WHY THIS EXISTS — B08
 * ============================================================================
 * `error` was carrying two contracts at once. Some routes put a machine code in it
 * (`rate_limit`, `invalid_role`) and 96 sites across 29 route files put a Vietnamese SENTENCE in
 * it instead — and web clients read it straight into the UI (`setError(data.error)`), so those
 * sentences were the interface. An English user got Vietnamese; a client that wanted to branch on
 * the failure had nothing stable to branch on.
 *
 * 🚨 B04 fixed this for the `message:` field on three routes, and its guard
 * (`serverErrorLocale.test.ts`) only ever grepped `message:` — which is exactly why it kept
 * passing while 96 sentences shipped in the field next door. The lesson is in the guard as much as
 * the code: a check shaped around one field cannot see the one beside it.
 *
 * The split this restores:
 *
 *   error    a stable machine code. Never translated, never shown to a user, safe to branch on.
 *   message  the human sentence, in the caller's language.
 *
 * 🚨 Nothing here may carry a provider name, model id, table, policy id or stack. Error text is
 * the easiest place in a codebase to hand an attacker a map, so the catalogue is the only source
 * of wording and every entry in it is deliberately generic.
 */
interface LocaleBearingRequest {
  readonly url?: string
  readonly nextUrl?: { readonly searchParams: URLSearchParams }
  readonly headers?: { get?: (name: string) => string | null }
}

export function apiError(
  req: LocaleBearingRequest,
  code: string,
  key: ServerMessageKey,
  status: number,
  vars?: Record<string, string | number>,
): NextResponse {
  return NextResponse.json(
    { error: code, message: serverMessage(key, requestLocale(req), vars) },
    { status },
  )
}

/**
 * The same contract for routes that build a `Response` by hand rather than a `NextResponse`
 * (the chat route streams, so it cannot use the helper above for its early exits).
 */
export function apiErrorBody(
  req: LocaleBearingRequest,
  code: string,
  key: ServerMessageKey,
  vars?: Record<string, string | number>,
): string {
  return JSON.stringify({ error: code, message: serverMessage(key, requestLocale(req), vars) })
}
