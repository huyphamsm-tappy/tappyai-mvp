import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getRequestUser } from '@/lib/auth/getRequestUser'
import { refuseAnonymousSocialWrite } from '@/lib/auth/socialWriteAccess'
import { requestLocale } from '@/lib/i18n/requestLocale'
import { serverMessage } from '@/lib/i18n/serverMessages'
import { createAdminClient } from '@/lib/supabase/admin'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import { MARKETING_CHANNELS } from '@/lib/marketing/governance'
import {
  readConsent,
  setChannelConsent,
  setGlobalUnsubscribe,
  toConsentView,
} from '@/lib/marketing/consentStore'

// ─── V2.2-2 — THE PERSON'S OWN MARKETING CONSENT ─────────────────────────────
//
// GET  /api/notifications/marketing-consent   what this user has agreed to
// PUT  /api/notifications/marketing-consent   change it
//
// Contract: M-1 (absence = opted out) · M-3 (per channel) · M-10 (global
// unsubscribe, honored immediately) · M-24 (auditable).
//
// 🔑 THE USER ALWAYS COMES FROM THE VERIFIED SESSION, NEVER FROM THE BODY.
// There is no `userId` field in the schema below and there must never be one:
// this endpoint is reachable by every signed-in account, so a body-supplied id
// would let anyone opt anyone else in.
//
// 🔑 WHY A SERVER ROUTE RATHER THAN AN RLS POLICY. `marketing_consent` grants
// `authenticated` nothing at all, so a client cannot write its own row
// directly. Routing the write through here means the change is rate-limited,
// validated, and happens in one place that can be audited — and it keeps the
// table's grant surface at zero, which is what stops the whole consent set
// being one PostgREST GET away.
//
// 🚨 THIS ROUTE CANNOT SEND ANYTHING. It writes consent state and nothing else.
// Marketing activation remains blocked by M-30 and Q6 elsewhere.

export const runtime = 'nodejs'

const ChannelSchema = z.enum(MARKETING_CHANNELS)

/**
 * Exactly one of the two operations per request.
 *
 * A union rather than an object with both fields optional: "set push consent
 * AND clear the global unsubscribe" in one call would need an order of
 * operations the client should not be choosing, and a request carrying neither
 * would silently succeed while doing nothing.
 */
const BodySchema = z.union([
  z.object({ channel: ChannelSchema, optedIn: z.boolean() }),
  z.object({ globallyUnsubscribed: z.boolean() }),
])

/** A person changing their own preferences, not an abuse surface. Generous. */
const WRITE_LIMIT = 30
const WRITE_WINDOW_MS = 60 * 60 * 1000

export async function GET(req: Request) {
  try {
    const { user } = await getRequestUser(req)
    if (!user) {
      return NextResponse.json(
        { error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) },
        { status: 401 },
      )
    }

    const admin = createAdminClient()
    const rows = await readConsent(admin, user.id)
    // An empty row set is a complete answer, not an empty response: every
    // channel comes back present and `false`.
    return NextResponse.json({ data: toConsentView(rows) })
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const { user } = await getRequestUser(req)
    if (!user) {
      return NextResponse.json(
        { error: 'unauthorized', message: serverMessage('auth.required', requestLocale(req)) },
        { status: 401 },
      )
    }

    // ── ANONYMOUS SESSIONS MAY NOT RECORD CONSENT ────────────────────────────
    //
    // Same boundary as `/api/notifications/subscribe` (#225). An anonymous
    // session costs one request to mint, so a consent row created by one is a
    // marketing agreement from nobody in particular — and it would then sit in
    // the table indistinguishable from a real person's decision. Consent has to
    // be attributable to survive being asked about later (M-24).
    const anonRefusal = refuseAnonymousSocialWrite(req, user)
    if (anonRefusal) return anonRefusal

    const rl = await distributedRateLimit(`consent:marketing:${user.id}`, WRITE_LIMIT, WRITE_WINDOW_MS)
    if (!rl.ok) {
      return NextResponse.json(
        { error: 'rate_limited' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
      )
    }

    const parsed = BodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
    }

    const admin = createAdminClient()
    if ('globallyUnsubscribed' in parsed.data) {
      await setGlobalUnsubscribe(admin, user.id, parsed.data.globallyUnsubscribed)
    } else {
      await setChannelConsent(admin, user.id, parsed.data.channel, parsed.data.optedIn)
    }

    // Return the state AFTER the write, read back from the database rather than
    // assumed from the request. The client renders what is stored, so an
    // optimistic echo would let the UI and the table disagree silently — and
    // `fetch` does not throw on a 4xx, so a failed write can otherwise look
    // exactly like a successful one.
    const rows = await readConsent(admin, user.id)
    return NextResponse.json({ data: toConsentView(rows) })
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
