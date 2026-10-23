// ── BENCH_SPEND_GATE · permission BEFORE every paid call (default OFF, read at call time) ────────────────────────────────────────
//
// A hard USD cap is only a cap if it is checked before the money can be spent. Every call that can cost money (a model call through the
// llm layer, a Serper request) asks `reserveSpend` for its WORST-CASE cost first; no budget left → the call is not made. The bill is never
// added up afterwards to find out that the cap was passed.
//
// The gate is injected from outside (the benchmark runner, scripts/uat/consultUat) through the ONE injection point `runWithSpendGate`; this
// file imports nothing from scripts. It follows the semantics of the benchmark's BudgetGuard: integer micro-USD, cost rounded UP and the cap
// DOWN, an atomic reservation (no await between check and hold), only a provable "not sent" gives a reservation back, any other failure
// leaves the cost UNKNOWN and stops the run.
//
// Flag OFF (the default): `reserveSpend` returns null, nothing is asked of anyone, behaviour is unchanged.
// Flag ON: the caps (BENCH_SPEND_TURN_CAP_USD, BENCH_SPEND_RUN_CAP_USD) are read — and only then. A missing or invalid cap, or no injected gate,
// REFUSES every paid call; there is no default cap to fall back on.
import { AsyncLocalStorage } from 'node:async_hooks'

const flagIsOn = (v: string | undefined): boolean => { const s = (v ?? '').trim().toLowerCase(); return s === '1' || s === 'true' }
export const benchSpendGateOn = (env: Record<string, string | undefined> = process.env): boolean => flagIsOn(env.BENCH_SPEND_GATE)

/** Serper's list price per credit. The gate never prices a credit below it, whatever SERPER_USD_PER_CREDIT says (a lower figure would understate the books). */
export const SERPER_MIN_USD_PER_CREDIT = 0.001

export interface BenchCaps { turnUsd: number; runUsd: number }

/** A cap is a plain positive decimal ("0.05"); anything else (empty, NaN, negative, 1e-2, "5%") is invalid. */
function parseCap(v: string | undefined): number | null {
  const s = (v ?? '').trim()
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** The caps, read only when the flag is ON. Null = flag OFF, or a cap is missing / invalid / the turn cap is above the run cap. */
export function readBenchCaps(env: Record<string, string | undefined> = process.env): BenchCaps | null {
  if (!benchSpendGateOn(env)) return null
  const turnUsd = parseCap(env.BENCH_SPEND_TURN_CAP_USD)
  const runUsd = parseCap(env.BENCH_SPEND_RUN_CAP_USD)
  if (turnUsd === null || runUsd === null || turnUsd > runUsd) return null
  return { turnUsd, runUsd }
}

export type SpendRefusalReason = 'no_caps' | 'no_gate' | 'no_bound' | 'budget' | 'blocked'

/** A paid call that was NOT made because the spend gate did not allow it. Nothing was sent; nothing is held. */
export class SpendRefusal extends Error {
  constructor(message: string, readonly reason: SpendRefusalReason) {
    super(message)
    this.name = 'SpendRefusal'
  }
}

export interface SpendReservation { readonly id: number; readonly maxUsd: number; readonly label: string }
export type SpendSettleStatus = 'ok' | 'exceeded' | 'invalid' | 'overflow'

/** What the benchmark injects. `reserve` throws SpendRefusal when the call must not be made. */
export interface SpendGate {
  reserve(label: string, maxUsd: number): SpendReservation
  /** The real cost of a finished call. 'exceeded' = above what was reserved; 'invalid' = not a usable cost. Both stop the run. */
  settle(res: SpendReservation, actualUsd: unknown): SpendSettleStatus
  /** ONLY for a call that provably never left the process. */
  release(res: SpendReservation): void
  /** The call may have been sent and its cost is not known. */
  markUnknown(res: SpendReservation): void
}

const store = new AsyncLocalStorage<SpendGate>()

/** THE injection point. Everything the callback does (and every async continuation of it) asks this gate. */
export function runWithSpendGate<T>(gate: SpendGate, fn: () => T): T {
  return store.run(gate, fn)
}

export function currentSpendGate(): SpendGate | undefined {
  return store.getStore()
}

export interface SpendHandle {
  readonly reservation: SpendReservation
  settle(actualUsd: unknown): SpendSettleStatus
  release(): void
  markUnknown(): void
}

/**
 * The ONE place a paid call asks for permission. `maxUsd` is the call's worst-case cost (null = it cannot be bounded).
 * Flag OFF → null (the caller goes on exactly as before). Flag ON → a handle, or SpendRefusal. Synchronous on purpose: no await between the
 * check and the hold, so two calls started together can never both see the same remainder.
 */
export function reserveSpend(label: string, maxUsd: number | null): SpendHandle | null {
  if (!benchSpendGateOn()) return null
  if (!readBenchCaps()) throw new SpendRefusal(`spend gate is ON but its caps are missing or invalid: ${label} not made`, 'no_caps')
  const gate = currentSpendGate()
  if (!gate) throw new SpendRefusal(`spend gate is ON but no gate was injected: ${label} not made`, 'no_gate')
  if (maxUsd === null || !Number.isFinite(maxUsd) || maxUsd <= 0) throw new SpendRefusal(`${label} has no upper bound on its cost: not made`, 'no_bound')
  const reservation = gate.reserve(label, maxUsd) // throws SpendRefusal; nothing is held then
  let resolved = false
  const once = <T,>(fn: () => T): T => { if (resolved) throw new Error(`spend reservation ${reservation.id} was already resolved`); resolved = true; return fn() }
  return {
    reservation,
    settle: actualUsd => once(() => gate.settle(reservation, actualUsd)),
    release: () => once(() => gate.release(reservation)),
    markUnknown: () => once(() => gate.markUnknown(reservation)),
  }
}

/** UTF-8 bytes of a value as JSON: an upper bound of its tokens (a token is at least one byte). */
export function utf8Bytes(v: unknown): number {
  let s: string
  try { s = JSON.stringify(v) ?? '' } catch { return Number.POSITIVE_INFINITY }
  return new TextEncoder().encode(s).length
}
