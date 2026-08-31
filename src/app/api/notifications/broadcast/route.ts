import { NextResponse } from 'next/server'
import { writeAuditLogAwaited } from '@/lib/admin/audit'
import { distributedRateLimit } from '@/lib/security/distributedRateLimit'
import {
  LEGACY_BROADCAST_RETIRED_ACTION,
  LEGACY_BROADCAST_RETIRED_TARGET,
} from '@/lib/notifications/legacyBroadcastRetirement'

// ─── RETIRED: THE LEGACY CRON_SECRET BROADCAST ROUTE ─────────────────────────
//
// Owner decision **O-4 = C**, contract §14.2. This endpoint is retired in favour
// of the governed path, `POST /api/admin/notifications/broadcast`, which was
// verified end-to-end in production on 2026-08-31 (campaign `4454c6b4…`,
// audience 1, `accepted: 1`, confirmed received on the device).
//
// 🚨 THIS IS STEP 6 OF §14.2, NOT STEP 8. The route still exists and answers
// **410 Gone**. It is not deleted, and deleting it is a SEPARATE Owner decision
// that may only be taken once the observation window below shows zero hits.
//
// ── WHY 410 AND NOT DELETION ─────────────────────────────────────────────────
// A deleted route returns 404, which is indistinguishable from a typo. 410 says
// "this existed and is gone on purpose", which is the difference between a
// caller diagnosing the problem in seconds and filing a bug. The audit showed
// zero callers — no cron entry, no code path, no native client — but "no caller
// I can see from inside the repository" is not the same as "no caller", and the
// endpoint was published in `docs/ios/04_API_CONTRACT.md`.
//
// ── WHAT THIS HANDLER DELIBERATELY NO LONGER DOES ────────────────────────────
// It does not check `CRON_SECRET`, resolve an audience, call `emitNotification`,
// dispatch a push, or consume the broadcast rate limiter. The previous
// implementation did all of those with no cap, no de-duplication and no audit
// record — the exact failure mode the shared dispatch seam exists to prevent.
//
// 🔑 THE SECRET IS NOT CHECKED, BY DESIGN. A retired endpoint has nothing to
// authorize, so presenting a valid `CRON_SECRET` earns exactly the same 410 as
// presenting nothing. `CRON_SECRET` itself stays untouched and load-bearing for
// the nine cron routes and the backfill route that still use it; retiring this
// endpoint neither removes nor weakens it.

// 🚨 The action/target constants live in
// `@/lib/notifications/legacyBroadcastRetirement`, NOT here. A Next.js route
// module may only export the fields the framework recognises; any other named
// export fails `npm run build` with "is not a valid Route export field" — a
// failure that `npm test`, `tsc`, `lint` and the architecture checks all miss,
// because CI does not run a build.

/**
 * The actor for a hit on a retired machine endpoint.
 *
 * `audit_log.actor_id` is `UUID NOT NULL` with **no** foreign key, so a sentinel
 * is representable without a migration. It is deliberately not a real user:
 * there is no actor here, and inventing one would put a false name in the audit
 * trail.
 */
const NO_ACTOR_ID = '00000000-0000-0000-0000-000000000000'

/**
 * Bound on evidence rows, so an anonymous scanner cannot fill `audit_log`.
 *
 * 🚨 THIS IS NOT THE BROADCAST RATE LIMITER and shares no key with it. Its only
 * job is to cap how many rows a burst of traffic can write. The 410 itself is
 * never gated by it — see below.
 */
const EVIDENCE_LIMIT = 20
const EVIDENCE_WINDOW_MS = 60_000

/**
 * POST /api/notifications/broadcast — **410 Gone**.
 *
 * The response does not depend on the audit write, the rate-limit store, or any
 * other infrastructure: the status is decided before anything else is attempted
 * and returned even if evidence recording fails completely. A retirement notice
 * that could 500 would be worse than the route it replaced.
 */
export async function POST(req: Request) {
  // 🚨 AWAITED, UNLIKE EVERY OTHER AUDIT CALL IN THIS CODEBASE — and that is
  // the whole point of this handler.
  //
  // MEASURED on production 2026-08-31: of four hits here, the first — on a cold
  // serverless instance — wrote **no** audit row, while the three that followed
  // on a warm one all did. Vercel can freeze an instance the moment the response
  // is returned, discarding un-awaited work. For an endpoint whose retirement
  // evidence IS the audit trail, that is fatal: a rare real caller is exactly
  // the request most likely to arrive cold, so the recorder was weakest
  // precisely where the evidence needed to be strongest.
  //
  // Awaiting costs a few milliseconds on a route that does nothing else, and
  // buys the difference between "we observed zero calls" and "we cannot see
  // calls" — which is the distinction §14.4 exists to protect.
  //
  // 🔑 IT IS STILL NOT A GATE. `writeAuditLogAwaited` never throws, and the 410
  // is returned whether the row landed or not. What changes is that the handler
  // can no longer *believe* a hit was recorded when it was not.
  try {
    const rl = await distributedRateLimit('legacy:broadcast:gone', EVIDENCE_LIMIT, EVIDENCE_WINDOW_MS)
    if (rl.ok) {
      await writeAuditLogAwaited({
        actorId: NO_ACTOR_ID,
        actorEmail: '—',
        actorRole: 'none',
        action: LEGACY_BROADCAST_RETIRED_ACTION,
        targetType: LEGACY_BROADCAST_RETIRED_TARGET,
        metadata: {
          // 🔑 WHETHER a credential was presented, never the credential. This is
          // the signal the delete decision needs: a hit carrying an
          // Authorization header is a plausible real caller, while a bare hit is
          // most likely an internet scanner. The header's VALUE is not read,
          // not compared and not recorded.
          had_authorization_header: req.headers.get('authorization') !== null,
          retired_in_favour_of: '/api/admin/notifications/broadcast',
        },
        // Supplies ip/user-agent, exactly as every other audited action does.
        req,
      })
    }
  } catch {
    // Evidence is best-effort. The 410 is not.
  }

  return NextResponse.json(
    {
      error: 'gone',
      message:
        'This endpoint is retired. Use POST /api/admin/notifications/broadcast, which requires the notifications.send.broadcast permission.',
    },
    { status: 410 },
  )
}
