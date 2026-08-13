import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildAdminController } from '@/lib/controller/registry/adminModules'
import {
  resolveConsumers,
  readyConsumerIds,
  undispatchableConsumerIds,
  envelopeOf,
  settleOutcome,
  type ClaimedRow,
  type ConsumerDispatch,
} from '@/lib/controller/outbox'

export const runtime = 'nodejs'
export const maxDuration = 60

// Controller V2 — Component 8: the outbox drain.
//
// Contract: docs/controller-v2/08_COMPONENT8_EVENT_BUS_CONTRACT.md
//
// Daily, per P2 — Hobby permits no finer interval, and the job fires anywhere
// inside its scheduled hour (±59 min). An event therefore waits up to ~24 hours
// plus that jitter for its first attempt, and a persistently failing consumer
// reaches the DLQ after roughly 3 days. This is durable, eventually-delivered,
// at-least-once fan-out. It is NOT near-real-time and must never be described
// as such.
//
// THE ROUTE HOLDS NO DELIVERY POLICY. Claiming (FOR UPDATE SKIP LOCKED, the
// attempts increment) and settling (delivered / pending / dead) both happen
// inside Postgres functions, because only the database can make them atomic.
// What happens here is dispatch, which is the one part that must be in-process.
//
// TODAY THIS DRAINS NOTHING. No manifest declares `events.consumes`, so there
// are zero bound consumers, zero eligible consumer ids, and the claim matches
// no rows. That is the correct zero-consumer behaviour, not a stub.

const BATCH_LIMIT = 100

/**
 * Delivery targets. Empty, deliberately: C8 ships the mechanism and creates no
 * consumers. Registering a fake one here to make the route "look" exercised
 * would be inventing a consumer the architecture does not have.
 */
const DISPATCH: ConsumerDispatch = new Map()

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const controller = buildAdminController()
  const modules = controller.discover()

  // Every consumer id that is bound and C6-ready, across all event types — the
  // claim filters on consumer, not on type. Readiness is C6's definition
  // verbatim (`enabled && available`); C8 does not extend it.
  //
  // A row whose consumer is absent from this list is never selected, which is
  // how D2 is enforced: attempts untouched, not delivered, not DLQ'd, still
  // pending for the next tick.
  const ready = new Set<string>()
  const undispatchable = new Set<string>()
  for (const mod of modules) {
    for (const type of mod.manifest.events?.consumes ?? []) {
      const bindings = resolveConsumers(modules, type, (id) => controller.isReady(id))
      for (const id of readyConsumerIds(bindings)) ready.add(id)
      for (const id of undispatchableConsumerIds(bindings, DISPATCH)) undispatchable.add(id)
    }
  }

  // ⛔ FAIL CLOSED — contract §9c, ratified by the Owner on 2026-08-13.
  //
  // A consumer that is bound and C6-ready but has no handler means the whole
  // tick is refused: 501, zero rows claimed, zero attempts, no state
  // transitions, no partial delivery. This is C8 delivery POLICY, not a
  // placeholder — the alternatives were considered and rejected. Claiming it
  // burns attempts and DLQs a good event; skipping it silently is D2's
  // behaviour without D2's authority; treating it as not-ready extends C6,
  // which the Owner rejected on 2026-08-13.
  //
  // The refusal is whole-tick on purpose. Draining the healthy consumers and
  // passing over this one would be the silent-skip semantics under another
  // name, and would let a broken deployment run unnoticed. Accepted cost: one
  // handler-less consumer stops delivery for all of them until it is fixed.
  //
  // IT MUST STAY ABOVE THE CLAIM. Attempts increment at claim time (§6), so a
  // guard below it would already have burned one — "zero attempts" is true
  // only because of this ordering.
  //
  // Unreachable today: no manifest declares `events.consumes`.
  if (undispatchable.size > 0) {
    return NextResponse.json(
      {
        ok: false,
        blocked: 'C8_UNDEFINED_MISSING_HANDLER',
        consumers: [...undispatchable].sort(),
        detail:
          'Bound, ready consumers have no dispatch handler. Contract §9c: the drain refuses the whole tick — no rows claimed, no attempts incremented, no state transitions. Deploy a handler for these consumers.',
      },
      { status: 501 }
    )
  }

  const { data, error: claimError } = await supabase.rpc('fn_outbox_claim', {
    p_ready_consumers: [...ready].sort(),
    p_limit: BATCH_LIMIT,
  })

  if (claimError) {
    // Nothing was claimed, so nothing needs unwinding — the claim is one
    // transaction and it either incremented attempts or it did not.
    return NextResponse.json({ ok: false, claimError: claimError.message }, { status: 500 })
  }

  const rows = (data ?? []) as ClaimedRow[]
  let delivered = 0
  let retried = 0
  let dead = 0

  for (const row of rows) {
    // Guaranteed present: the guard above returned early unless every ready
    // consumer had a handler, and the claim selects only ready consumers. The
    // assertion is deliberate — a `if (!handler)` fallback here would be a
    // SECOND answer to the missing-handler question, quieter than the one §9c
    // ratified and reached only after an attempt had already been burned.
    const handler = DISPATCH.get(row.consumer_id)!
    let ok = false
    let message: string | null = null

    try {
      await handler(envelopeOf(row))
      ok = true
    } catch (err) {
      message = err instanceof Error ? err.message : String(err)
    }

    const { error: settleError } = await supabase.rpc('fn_outbox_settle', {
      p_id: row.id,
      p_ok: ok,
      p_error: message,
    })

    // A failed settle leaves the row `pending` with its attempts already
    // incremented, so the next tick retries it and the DLQ is still reachable.
    // Counting it as delivered here would be a lie the next tick contradicts.
    const outcome = settleError ? 'pending' : settleOutcome(ok, row.attempts)
    if (outcome === 'delivered') delivered++
    else if (outcome === 'dead') dead++
    else retried++
  }

  return NextResponse.json({
    ok: true,
    readyConsumers: ready.size,
    claimed: rows.length,
    delivered,
    retried,
    dead,
  })
}
