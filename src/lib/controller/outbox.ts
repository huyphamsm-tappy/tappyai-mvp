// Controller V2 — Component 8: Event Bus, kernel side.
//
// Contract: docs/controller-v2/08_COMPONENT8_EVENT_BUS_CONTRACT.md
//
// This file holds the parts of C8 that are decisions rather than I/O:
// which consumers a fact is owed to, which of those are eligible right now, and
// what a delivery outcome means. The durable mechanics (uniqueness, locking,
// state transitions, grants) live in
// supabase/migrations/20260813_c8_event_outbox.sql, because only the database
// can enforce them.
//
// C8 ships the mechanism. There are no producers and no consumers today, and
// nothing here invents one.

import type { ControllerEvent, RegisteredModule } from './types'

/** A module that has declared it consumes an event type. */
export interface ConsumerBinding {
  readonly consumerId: string
  readonly ready: boolean
}

/**
 * Consumers bound to an event type, from `manifest.events.consumes` — the
 * authority §7 names ("Consumers are bound by the kernel from
 * manifest.events.consumes"). There is deliberately no second registry: a
 * separate consumer table could disagree with the manifest, and then neither
 * would be authoritative.
 *
 * Sorted by module id so a publish produces the same row set every time,
 * regardless of registration order.
 */
export function resolveConsumers(
  modules: readonly RegisteredModule[],
  eventType: string,
  isReady: (moduleId: string) => boolean
): ConsumerBinding[] {
  const bound: ConsumerBinding[] = []

  for (const mod of modules) {
    const consumes = mod.manifest.events?.consumes
    if (!consumes?.includes(eventType)) continue
    bound.push({ consumerId: mod.manifest.id, ready: isReady(mod.manifest.id) })
  }

  return bound.sort((a, b) => a.consumerId.localeCompare(b.consumerId))
}

/**
 * The consumer ids a publish creates outbox rows for — ALL bound consumers,
 * ready or not.
 *
 * D2: a disabled consumer still gets a row. Skipping it at publish time would
 * lose the event for a module that is merely switched off, which is precisely
 * what D2 rejects.
 */
export function consumerIdsForPublish(bindings: readonly ConsumerBinding[]): string[] {
  return bindings.map((b) => b.consumerId)
}

/**
 * The consumer ids a drain may claim — the READY ones only.
 *
 * This is D2's enforcement point, and it works by exclusion rather than by a
 * later branch: a not-ready consumer's id never reaches the claim query, so its
 * rows are not selected, its `attempts` is not incremented, it is not marked
 * delivered and it is not moved to the DLQ. The row simply stays `pending`
 * until the consumer is ready again.
 *
 * Returning [] when nothing is ready is meaningful, not a degenerate case: the
 * claim then matches no rows at all.
 */
export function readyConsumerIds(bindings: readonly ConsumerBinding[]): string[] {
  return bindings.filter((b) => b.ready).map((b) => b.consumerId)
}

/**
 * Runtime delivery targets, keyed by module id.
 *
 * `ModuleManifest.events.consumes` declares WHICH event types a module is owed,
 * but the manifest carries no handler function — and giving it one would change
 * C6's manifest semantics, which C8 may not do. This map supplies the callable
 * for a module the manifest has already bound. It is NOT a second consumer
 * registry: it cannot bind a consumer the manifest did not, and
 * `resolveConsumers` never consults it.
 *
 * **In production it is empty**, matching the zero consumers the manifests
 * declare.
 */
export type ConsumerDispatch = ReadonlyMap<string, (event: ControllerEvent) => Promise<void> | void>

/**
 * Consumers that are bound and C6-ready but have no handler to call.
 *
 * ⛔ THIS IS A DETECTOR, NOT A POLICY. It reports the state and deliberately
 * does not decide what happens to such a consumer's rows.
 *
 * An earlier revision folded this case into D2 by treating "no handler" as
 * not-ready. Owner decision 2026-08-13 rejected that: C6 defines
 * `ready = enabled && available`, `ConsumerDispatch` is a C8 implementation
 * mechanism rather than a C6 lifecycle state, and D2 must not be used to
 * conceal a new semantics that was never approved.
 *
 * The policy this feeds is contract §9c, ratified by the Owner on 2026-08-13:
 * if this returns anything at all, the drain refuses the ENTIRE tick before
 * claiming — 501, zero rows, zero attempts, no state transitions. That policy
 * lives in the route, in one place. It is not implemented here, and it is not
 * implemented a second time in the per-row delivery path.
 *
 * Currently unreachable: no manifest declares `events.consumes`, so the bound
 * set is empty and this always returns [].
 */
export function undispatchableConsumerIds(
  bindings: readonly ConsumerBinding[],
  dispatch: ConsumerDispatch
): string[] {
  return readyConsumerIds(bindings).filter((id) => !dispatch.has(id))
}

/** One row handed back by `fn_outbox_claim`. */
export interface ClaimedRow {
  readonly id: string
  readonly event_id: string
  readonly type: string
  readonly event_version: string
  readonly producer: string
  readonly actor: string | null
  readonly correlation_id: string | null
  readonly security_class: string
  readonly payload: Record<string, unknown> | null
  readonly metadata: Record<string, unknown> | null
  readonly occurred_at: string
  readonly consumer_id: string
  readonly attempts: number
}

/** P1. The single source of truth in TypeScript; the SQL holds its own copy. */
export const MAX_ATTEMPTS = 3

/**
 * Rebuild the frozen envelope from a claimed row, so a consumer receives
 * exactly the `ControllerEvent` shape FOUNDATION_01 §6 froze — not the storage
 * layout. The two must be allowed to differ: the row carries delivery
 * bookkeeping the envelope must never leak.
 */
export function envelopeOf(row: ClaimedRow): ControllerEvent {
  return {
    id: row.event_id,
    type: row.type,
    version: row.event_version,
    producer: row.producer,
    actor: row.actor,
    timestamp: Date.parse(row.occurred_at),
    correlationId: row.correlation_id ?? '',
    securityClass: row.security_class as ControllerEvent['securityClass'],
    ...(row.payload ? { payload: row.payload } : {}),
    ...(row.metadata ? { metadata: row.metadata } : {}),
  }
}

/** What settling a row will do, given the outcome of one delivery attempt. */
export type SettleOutcome = 'delivered' | 'pending' | 'dead'

/**
 * The transition for one attempt. Mirrors `fn_outbox_settle` exactly so the
 * route can report what it did without a second round trip — the database
 * remains the authority that performs it.
 *
 * `attempts` is the value AFTER the claim incremented it, which is why the DLQ
 * comparison is `>=` and not `>`: a row on its third attempt arrives here with
 * attempts === 3 and must not be retried a fourth time.
 */
export function settleOutcome(ok: boolean, attempts: number): SettleOutcome {
  if (ok) return 'delivered'
  return attempts >= MAX_ATTEMPTS ? 'dead' : 'pending'
}
