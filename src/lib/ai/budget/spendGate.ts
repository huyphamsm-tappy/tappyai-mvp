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

/**
 * THE HARD MAXIMUM of the benchmark: $0.10 per turn, $0.65 per run. They are constants, not parameters — no option and no environment variable
 * can raise them; a LOWER cap is valid. Every place that receives a cap checks it against these (see `checkBenchCaps`).
 *
 * Owner decision 26/10/2026 (Wave 3-FIX, R3-06): the per-turn maximum was $0.05; it is $0.10 for the MEASUREMENT mode only - the maximum is read when BENCH_SPEND_GATE is ON
 * (the caps are read only then) and nothing in production reads it, so production behaviour is unchanged. The cap itself is still typed by the Owner at the launcher (a run can
 * keep $0.05; $0.10 is only the ceiling a deeper level (L2-L4) needs so its writing step is not refused). The run maximums ($0.65 / $1.75) did not change.
 */
export const MAX_TURN_CAP_USD = 0.10
export const MAX_RUN_CAP_USD = 0.65

/**
 * BUDGET MODES (closure round 2). The $0.65 run maximum belongs to the ACCEPTANCE run and does not change. The development EXTENSION run (BENCH_TRIAL_MODE
 * exactly `dev-multi`, the 30-turn extension set) may be capped higher, at most $1.75 per run; the per-turn maximum ($0.10) is the same in every mode. The mode is
 * read from ONE place (`benchModeOf`) and is FAIL-CLOSED: anything that is not exactly `dev-multi` — unset, blank, another word, another case, a trailing
 * space — is `acceptance`, i.e. $0.65. Like the other maxima these are constants: no option and no environment variable raises them.
 */
export const MAX_RUN_CAP_EXTENSION_USD = 1.75
export type BenchMode = 'acceptance' | 'extension'
export const benchModeOf = (env: Record<string, string | undefined> = process.env): BenchMode => (env.BENCH_TRIAL_MODE === 'dev-multi' ? 'extension' : 'acceptance')
export const maxRunCapUsd = (mode: BenchMode): number => (mode === 'extension' ? MAX_RUN_CAP_EXTENSION_USD : MAX_RUN_CAP_USD)

const CAP_DECIMALS = 12
// no BigInt literals (10n): the project targets ES2017
const CAP_SCALE = BigInt(10) ** BigInt(CAP_DECIMALS)

/**
 * A cap as an EXACT scaled integer (USD × 10^12), read from its decimal TEXT before any rounding or micro-USD conversion. Only a plain positive
 * decimal with at most 12 decimals is a cap: exponent form ("5e-2", "1e-2", and the "5e-8" / "1e+21" a number prints as), a sign, NaN, hex, a
 * percent, an empty string, too many decimals and zero are all null. A number is read through its own decimal text (`String(n)`).
 */
export function capToScaled(v: unknown): bigint | null {
  let s: string
  if (typeof v === 'number') { if (!Number.isFinite(v)) return null; s = String(v) }
  else if (typeof v === 'string') s = v.trim()
  else return null
  const m = /^(\d+)(?:\.(\d{1,12}))?$/.exec(s)
  if (!m) return null
  const scaled = BigInt(m[1]) * CAP_SCALE + BigInt((m[2] ?? '').padEnd(CAP_DECIMALS, '0'))
  return scaled > BigInt(0) ? scaled : null
}
const MAX_TURN_SCALED = capToScaled(String(MAX_TURN_CAP_USD))!
const MAX_RUN_SCALED = capToScaled(String(MAX_RUN_CAP_USD))!
const MAX_RUN_EXTENSION_SCALED = capToScaled(String(MAX_RUN_CAP_EXTENSION_USD))!
const capNumber = (v: unknown): number => Number(typeof v === 'string' ? v.trim() : v)

export type CapCheck = { ok: true; turnUsd: number; runUsd: number } | { ok: false; reasons: string[] }

/** One cap against its maximum. `what` names it in the reason. */
function capProblem(what: string, v: unknown, max: bigint, maxUsd: number): { scaled: bigint | null; problem: string | null } {
  const scaled = capToScaled(v)
  if (scaled === null) return { scaled: null, problem: `the ${what} cap (${String(v)}) is missing or not a plain positive decimal with at most ${CAP_DECIMALS} decimals` }
  if (scaled > max) return { scaled, problem: `the ${what} cap (${String(v)}) is above the maximum of $${maxUsd} ${what === 'per-turn' ? 'per turn' : 'per run'}` }
  return { scaled, problem: null }
}

/** The per-turn cap alone (the per-turn guard of the adapter has no run cap). */
export function checkTurnCap(turn: unknown): { ok: true; turnUsd: number } | { ok: false; reason: string } {
  const t = capProblem('per-turn', turn, MAX_TURN_SCALED, MAX_TURN_CAP_USD)
  return t.problem ? { ok: false, reason: t.problem } : { ok: true, turnUsd: capNumber(turn) }
}

/**
 * The caps as received (environment text or option numbers): both valid decimals, the turn cap not above the run cap, the turn cap at most
 * $0.10 and the run cap at most the maximum of the MODE ($0.65 acceptance, $1.75 extension) — judged on the exact decimal value.
 * `mode` defaults to `acceptance`: a caller that does not say which run this is gets the strict maximum.
 */
export function checkBenchCaps(turn: unknown, run: unknown, mode: BenchMode = 'acceptance'): CapCheck {
  const t = capProblem('per-turn', turn, MAX_TURN_SCALED, MAX_TURN_CAP_USD)
  const r = capProblem('run', run, mode === 'extension' ? MAX_RUN_EXTENSION_SCALED : MAX_RUN_SCALED, maxRunCapUsd(mode))
  const reasons = [t.problem, r.problem].filter((x): x is string => x !== null)
  if (t.scaled !== null && r.scaled !== null && t.scaled > r.scaled) reasons.push(`the per-turn cap (${String(turn)}) is above the run cap (${String(run)})`)
  return reasons.length ? { ok: false, reasons } : { ok: true, turnUsd: capNumber(turn), runUsd: capNumber(run) }
}

/** The caps, read only when the flag is ON. Null = flag OFF, or a cap is missing / invalid / above the maximum / the turn cap is above the run cap. */
export function readBenchCaps(env: Record<string, string | undefined> = process.env): BenchCaps | null {
  if (!benchSpendGateOn(env)) return null
  const c = checkBenchCaps(env.BENCH_SPEND_TURN_CAP_USD, env.BENCH_SPEND_RUN_CAP_USD, benchModeOf(env))
  return c.ok ? { turnUsd: c.turnUsd, runUsd: c.runUsd } : null
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

/**
 * What the caller tells the INJECTED gate about a call it is about to make (round 3a): for a Serper request the endpoint, the `num` of the body that is sent, the
 * query and whether it is a web ("W") or a vertical ("V") request. It goes to the injected gate and nowhere else - `reserveSpend` returns before it looks at it
 * when the flag is OFF - and this code never logs it. The gate (the benchmark runner) decides what to keep and redacts the query before it writes anything.
 */
export interface SpendCallDetail { endpoint?: string; num?: number; q?: string; purpose?: 'W' | 'V' }
/** What the caller tells the injected gate when a call settles: the credits the provider reported (Serper) or the tokens of the answer (a model call). */
export interface SpendSettleDetail { credits?: number; tokensIn?: number; tokensOut?: number; cachedIn?: number; reasoning?: number }

/** What the benchmark injects. `reserve` throws SpendRefusal when the call must not be made. */
export interface SpendGate {
  reserve(label: string, maxUsd: number, detail?: SpendCallDetail): SpendReservation
  /** The real cost of a finished call. 'exceeded' = above what was reserved; 'invalid' = not a usable cost. Both stop the run. */
  settle(res: SpendReservation, actualUsd: unknown, detail?: SpendSettleDetail): SpendSettleStatus
  /** ONLY for a call that provably never left the process. */
  release(res: SpendReservation): void
  /** The call may have been sent and its cost is not known. */
  markUnknown(res: SpendReservation, reason?: string): void
  /**
   * Optional: a call was refused BEFORE the gate was asked to hold anything (it has no upper bound: an image part, an `images` request, an uncovered
   * request parameter). Nothing is held; the gate may record it so the benchmark can flag the turn as degraded.
   */
  noteRefusal?(label: string, reason: SpendRefusalReason): void
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
  settle(actualUsd: unknown, detail?: SpendSettleDetail): SpendSettleStatus
  release(): void
  /** `reason` (optional, an enum-like code, never user text) is only passed on when given, so a call without one reaches the gate exactly as before. */
  markUnknown(reason?: string): void
}

/** Wave 2I · A: a model call the fallback gave up waiting for (no first part in time) and cancelled; what it cost is not known. */
export const ABANDONED_FIRST_PART_REASON = 'abandoned_first_part_timeout'

/**
 * The ONE place a paid call asks for permission. `maxUsd` is the call's worst-case cost (null = it cannot be bounded).
 * Flag OFF → null (the caller goes on exactly as before). Flag ON → a handle, or SpendRefusal. Synchronous on purpose: no await between the
 * check and the hold, so two calls started together can never both see the same remainder.
 */
export function reserveSpend(label: string, maxUsd: number | null, detail?: SpendCallDetail): SpendHandle | null {
  if (!benchSpendGateOn()) return null
  if (!readBenchCaps()) throw new SpendRefusal(`spend gate is ON but its caps are missing or invalid: ${label} not made`, 'no_caps')
  const gate = currentSpendGate()
  if (!gate) throw new SpendRefusal(`spend gate is ON but no gate was injected: ${label} not made`, 'no_gate')
  if (maxUsd === null || !Number.isFinite(maxUsd) || maxUsd <= 0) {
    try { gate.noteRefusal?.(label, 'no_bound') } catch { /* recording only: the refusal below is what matters */ }
    throw new SpendRefusal(`${label} has no upper bound on its cost: not made`, 'no_bound')
  }
  const reservation = detail ? gate.reserve(label, maxUsd, detail) : gate.reserve(label, maxUsd) // throws SpendRefusal; nothing is held then
  let resolved = false
  const once = <T,>(fn: () => T): T => { if (resolved) throw new Error(`spend reservation ${reservation.id} was already resolved`); resolved = true; return fn() }
  return {
    reservation,
    settle: (actualUsd, settleDetail) => once(() => (settleDetail ? gate.settle(reservation, actualUsd, settleDetail) : gate.settle(reservation, actualUsd))),
    release: () => once(() => gate.release(reservation)),
    markUnknown: (reason) => once(() => (reason === undefined ? gate.markUnknown(reservation) : gate.markUnknown(reservation, reason))),
  }
}

/** UTF-8 bytes of a value as JSON: an upper bound of its tokens (a token is at least one byte). */
export function utf8Bytes(v: unknown): number {
  let s: string
  try { s = JSON.stringify(v) ?? '' } catch { return Number.POSITIVE_INFINITY }
  return new TextEncoder().encode(s).length
}
