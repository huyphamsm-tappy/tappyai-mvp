/**
 * Consultative UAT harness (mock-only in this phase).
 *
 * Runs the fixed UAT turns through an injected `TurnRunner` and records, per turn: the answer, wall time, the tools the turn
 * called, and the cost. No live runner is included on purpose: a real one is added only after the Owner supplies a spend cap,
 * a test-environment URL and the reference answers. Until then the only runner is a mock.
 *
 * Spend rules (fail-closed):
 *  - Every turn takes a RESERVATION of `maxUsdPerTurn` before the runner is called. Known cost + open reservations + the new
 *    reservation must fit the cap, or the turn is refused before the runner is called.
 *  - A turn that finishes with a valid cost settles its reservation (released, actual cost recorded). A cost above the amount
 *    reserved is recorded as it is, flagged as a violation of the cost assumption, and the run stops. A reservation is only a
 *    hard fence when `maxUsdPerTurn` really is an upper bound; a turn that costs more has already been paid for by then.
 *  - A runner that throws an ordinary error leaves the cost UNKNOWN: the request may have been sent. The reservation stays
 *    open, the run stops, and no total is reported as exact. Only `RequestNotSent` (a typed signal) releases a reservation.
 *  - An invalid reported cost (NaN, negative, not a number) is a failed reconciliation: the reservation stays open and the run stops.
 *  - Money is compared as integer micro-USD, so a sum that exactly fits the cap runs and a sum one micro-USD over does not.
 */
import { UAT_TURNS, type UatTurn } from './questions'

/**
 * Private, frozen copy of the fixed set, taken once when this module loads. The exported `UAT_TURNS` is an ordinary mutable array
 * of ordinary objects, so comparing against it would let a change to it (or a caller passing it back in) agree with itself.
 */
const FIXED_UAT_TURNS: readonly Readonly<UatTurn>[] = Object.freeze(UAT_TURNS.map(t => Object.freeze({ ...t })))

/** True only for the fixed UAT set: the same turns, in the same order, each with the same id, conversation, turn number and text. */
export function matchesFixedUatSet(turns: readonly UatTurn[]): boolean {
  return turns.length === FIXED_UAT_TURNS.length
    && turns.every((t, i) => {
      const f = FIXED_UAT_TURNS[i]
      return t.id === f.id && t.conversation === f.conversation && t.turn === f.turn && t.text === f.text
    })
}

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

export interface TurnResult {
  text: string
  toolCalls: ReadonlyArray<{ name: string }>
  ms: number
  usd: number
}

export type TurnRunner = (input: { turn: UatTurn; history: readonly ChatMessage[] }) => Promise<TurnResult>

/** Shape check of what a runner returned. `usd` is validated separately by the guard (it may be any value there). */
function isWellFormed(x: unknown): x is TurnResult {
  if (typeof x !== 'object' || x === null) return false
  const r = x as Record<string, unknown>
  return typeof r.text === 'string'
    && typeof r.ms === 'number' && Number.isFinite(r.ms) && r.ms >= 0
    && Array.isArray(r.toolCalls)
    && r.toolCalls.every(t => typeof t === 'object' && t !== null && typeof (t as Record<string, unknown>).name === 'string')
    && 'usd' in r
}

/** The only error that proves no request left the process and nothing was billed. Any other error leaves the cost unknown. */
export class RequestNotSent extends Error {
  constructor(message = 'request not sent') {
    super(message)
    this.name = 'RequestNotSent'
  }
}

export class BudgetRefusal extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BudgetRefusal'
  }
}

/** Misuse of a reservation (resolved twice, or not issued by this guard). */
export class ReservationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReservationError'
  }
}

const MICRO = 1e6

/**
 * USD -> whole micro-USD by moving the DECIMAL point of the number's own decimal text six places to the right. No float
 * multiplication, `toFixed` or `toPrecision` is involved, so there is no float noise to remove and nothing is rounded the
 * wrong way. 'up' (costs and reservations) adds one micro-USD when any digit remains after the point; 'down' (the cap) drops
 * those digits. Null when the input is not a finite number >= 0, or the result is not a safe integer.
 */
export function toMicro(usd: unknown, mode: 'up' | 'down'): number | null {
  if (typeof usd !== 'number' || !Number.isFinite(usd) || usd < 0) return null
  // String() gives plain digits, or "d.ddde±x" for very small and very large numbers.
  const m = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(String(usd))
  if (!m) return null
  const digits = m[1] + (m[2] ?? '')
  const pointAt = m[1].length + Number(m[3] ?? 0) + 6 // position of the decimal point after the shift, counted in `digits`
  let whole: string
  let rest: string
  if (pointAt <= 0) { whole = '0'; rest = '0'.repeat(-pointAt) + digits }
  else if (pointAt >= digits.length) { whole = digits + '0'.repeat(pointAt - digits.length); rest = '' }
  else { whole = digits.slice(0, pointAt); rest = digits.slice(pointAt) }
  let v = BigInt(whole)
  if (mode === 'up' && /[1-9]/.test(rest)) v += BigInt(1)
  return v > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(v)
}

type ReservationState = 'held' | 'settled' | 'released' | 'unknown' | 'unreconciled'

export interface Reservation {
  readonly id: number
  readonly maxUsd: number
}

export type StopReason = 'budget-refused' | 'cost-unknown' | 'cost-exceeded-reservation' | 'invalid-cost'

/** 'overflow' = the reported cost is valid but adding it would leave the safe-integer range; it is NOT added to the known cost. */
export type SettleStatus = 'ok' | 'exceeded' | 'invalid' | 'overflow'

export class BudgetGuard {
  private readonly capMicro: number | null
  private knownMicro = 0
  private overflowed = false
  private nextId = 1
  private readonly reservations = new Map<number, { handle: Reservation; maxMicro: number; state: ReservationState }>()
  private blocked: StopReason | null = null

  /** `capUsd` null = no cap supplied: every reservation is refused. A cap that is not a finite number >= 0, or too large for exact micro-USD arithmetic, is rejected here. */
  constructor(capUsd: number | null) {
    if (capUsd === null) {
      this.capMicro = null
    } else if (typeof capUsd !== 'number' || !Number.isFinite(capUsd) || capUsd < 0) {
      throw new BudgetRefusal(`invalid cap: ${String(capUsd)}`)
    } else {
      const cap = toMicro(capUsd, 'down')
      if (cap === null) throw new BudgetRefusal(`cap too large for exact micro-USD arithmetic: ${String(capUsd)}`)
      this.capMicro = cap
    }
  }

  /** Cost of finished turns, whose cost is known. Null once an accounting overflow happened: the total can no longer be stated. */
  get knownUsd(): number | null { return this.overflowed ? null : this.knownMicro / MICRO }

  /** The sum that was kept before an overflow (and the whole known cost when there was none). It does NOT include a turn that overflowed. */
  get knownSubtotalUsd(): number { return this.knownMicro / MICRO }

  /** Reservations not yet settled or released (held, unknown or unreconciled). */
  get openReservedUsd(): number { return this.sumOpen(['held', 'unknown', 'unreconciled']) / MICRO }

  /** Reservations whose turn ended with the cost unknown or unreconciled: money that may have been spent, up to this amount. */
  get unresolvedReservedUsd(): number { return this.sumOpen(['unknown', 'unreconciled']) / MICRO }

  get blockedBy(): StopReason | null { return this.blocked }

  private sumOpen(states: readonly ReservationState[]): number {
    let s = 0
    for (const r of this.reservations.values()) if (states.includes(r.state)) s += r.maxMicro
    return s
  }

  /** Takes a reservation of `maxUsd` before a call. Throws BudgetRefusal when the run is blocked, the input is invalid, or it would not fit. */
  reserve(maxUsd: number): Reservation {
    if (this.blocked) throw new BudgetRefusal(`run blocked: ${this.blocked}`)
    if (this.capMicro === null) throw new BudgetRefusal('no spend cap supplied: paid calls are refused')
    if (typeof maxUsd !== 'number' || !Number.isFinite(maxUsd) || maxUsd <= 0) throw new BudgetRefusal(`invalid per-turn maximum: ${String(maxUsd)}`)
    const maxMicro = toMicro(maxUsd, 'up')
    if (maxMicro === null) throw new BudgetRefusal(`per-turn maximum too large for exact micro-USD arithmetic: ${String(maxUsd)}`)
    const committed = this.knownMicro + this.sumOpen(['held', 'unknown', 'unreconciled'])
    if (committed + maxMicro > this.capMicro) {
      throw new BudgetRefusal(`cap would be exceeded: known + open reservations ${committed / MICRO} + this turn up to ${maxMicro / MICRO} > cap ${this.capMicro / MICRO}`)
    }
    const id = this.nextId++
    const handle: Reservation = Object.freeze({ id, maxUsd })
    this.reservations.set(id, { handle, maxMicro, state: 'held' })
    return handle
  }

  /** Looks a handle up by IDENTITY: an object with the same id and amount that this guard did not issue is rejected, and no state changes. */
  private take(res: Reservation): { handle: Reservation; maxMicro: number; state: ReservationState } {
    const r = this.reservations.get((res as Reservation | undefined)?.id as number)
    if (!r) throw new ReservationError(`unknown reservation ${String((res as Reservation | undefined)?.id)}`)
    if (r.handle !== res) throw new ReservationError('not a handle issued by this guard')
    if (r.state !== 'held') throw new ReservationError(`reservation ${res.id} is already ${r.state}`)
    return r
  }

  /** Reconciles a finished turn with its reported cost. The reservation is resolved exactly once. */
  settle(res: Reservation, actualUsd: unknown): SettleStatus {
    const r = this.take(res)
    // 1. A reported cost of 0 is valid. Negative, NaN, infinite, non-number, null and undefined (or too large) are not.
    const actualMicro = toMicro(actualUsd, 'up')
    if (actualMicro === null) {
      r.state = 'unreconciled'
      this.blocked = 'invalid-cost'
      return 'invalid'
    }
    // 2. The running total must stay a safe integer. Checked BEFORE the reservation comparison; nothing is added on overflow.
    const newKnown = this.knownMicro + actualMicro
    if (!Number.isSafeInteger(newKnown)) {
      r.state = 'unreconciled'
      this.blocked = 'invalid-cost'
      this.overflowed = true
      return 'overflow'
    }
    // 3. Valid: record it, then compare with what was reserved.
    this.knownMicro = newKnown
    r.state = 'settled'
    if (actualMicro > r.maxMicro) {
      this.blocked = 'cost-exceeded-reservation'
      return 'exceeded'
    }
    return 'ok'
  }

  /** Only for a typed proof that nothing was sent (RequestNotSent). Frees the reservation. */
  release(res: Reservation): void {
    this.take(res).state = 'released'
  }

  /** The runner failed in a way that does not prove the request was not sent. The reservation stays open. */
  markUnknown(res: Reservation): void {
    this.take(res).state = 'unknown'
    this.blocked = 'cost-unknown'
  }
}

export type CostKind = 'known' | 'unknown' | 'none'

export interface RecordedTurn {
  id: string
  conversation: string
  turn: number
  question: string
  answer: string
  ms: number
  /** null when the count is not known (the runner failed or its cost could not be reconciled). */
  toolCalls: number | null
  toolNames: string[] | null
  /** The cost when `cost` is 'known'; null otherwise. Never 0 for an unknown cost. */
  usd: number | null
  /** 'known' = reported and valid; 'unknown' = may have been billed, amount not known; 'none' = proven not sent. */
  cost: CostKind
  error?: string
  /** The reported cost was above the amount reserved for the turn. */
  exceededReservation?: boolean
  /** The reported cost is valid and shown in `usd`, but it could not be added to the running total without leaving the safe-integer range. */
  accountingOverflow?: boolean
}

export interface NotRunTurn {
  id: string
  reason: StopReason | 'previous-turn-failed'
}

export interface UatReport {
  turns: RecordedTurn[]
  notRun: NotRunTurn[]
  /** Why the run ended early, if it did. */
  stopped: { reason: StopReason; atTurn: string; detail: string } | null
  cost: {
    /** Cumulative over the guard's whole lifetime (a reused guard includes earlier spend). Null after an accounting overflow: the known total can no longer be stated. */
    knownUsd: number | null
    /** What was summed before an overflow; never includes the turn that overflowed. */
    knownSubtotalUsd: number
    unknownTurns: string[]
    unresolvedReservedUsd: number
    /** True only when no turn has an unknown cost and no reservation of the guard remains open (held, unknown or unreconciled; a reservation released by RequestNotSent is not open). */
    costAccounted: boolean
    /** True only when the supplied turns ARE the fixed UAT set (same turns, order and text), the run was not stopped, none was left unrun, all were recorded, and none carries an error. */
    complete: boolean
    /** The sum of the costs settled during THIS runUat() call (not the guard's cumulative knownUsd), only when costAccounted AND complete; otherwise null: a total of an incomplete or unaccounted run is never reported as a number. */
    totalUsd: number | null
  }
}

export interface RunOptions {
  turns: readonly UatTurn[]
  runner: TurnRunner
  guard: BudgetGuard
  /** Upper bound of one turn's cost; reserved before the call. Must be finite and > 0. */
  maxUsdPerTurn: number
}

/** Runs the turns in order. A turn sees the earlier turns of its own conversation as history; if one of them failed, the later ones are not run. */
export async function runUat(opts: RunOptions): Promise<UatReport> {
  const history = new Map<string, ChatMessage[]>()
  const failedConversations = new Set<string>()
  const recorded: RecordedTurn[] = []
  const notRun: NotRunTurn[] = []
  const unknownTurns: string[] = []
  let stopped: UatReport['stopped'] = null

  const base = (turn: UatTurn) => ({ id: turn.id, conversation: turn.conversation, turn: turn.turn, question: turn.text })

  // Decided BEFORE any runner is called, from the turns exactly as the caller supplied them. The runner only ever receives a
  // frozen copy (below), so it cannot edit these objects or the canonical UAT_TURNS and change this answer afterwards.
  const isFixedSet = matchesFixedUatSet(opts.turns)
  // Cost of THIS run only, in whole micro-USD. The guard's own total is cumulative over its lifetime and may hold earlier spend.
  let runMicro = 0
  let runTotalLost = false // a settled cost that cannot be added exactly (outside the safe-integer range): no run total can be stated

  for (const turn of opts.turns) {
    if (stopped) { notRun.push({ id: turn.id, reason: stopped.reason }); continue }
    if (failedConversations.has(turn.conversation)) { notRun.push({ id: turn.id, reason: 'previous-turn-failed' }); continue }

    let reservation: Reservation
    try {
      reservation = opts.guard.reserve(opts.maxUsdPerTurn)
    } catch (e) {
      if (!(e instanceof BudgetRefusal)) throw e
      stopped = { reason: 'budget-refused', atTurn: turn.id, detail: e.message }
      notRun.push({ id: turn.id, reason: 'budget-refused' })
      continue
    }

    const past = history.get(turn.conversation) ?? []
    let result: TurnResult
    try {
      // UatTurn holds only primitives, so a shallow frozen copy is enough: a write to it throws (strict mode) or is ignored.
      result = await opts.runner({ turn: Object.freeze({ ...turn }), history: past })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (e instanceof RequestNotSent) {
        opts.guard.release(reservation)
        recorded.push({ ...base(turn), answer: '', ms: 0, toolCalls: null, toolNames: null, usd: null, cost: 'none', error: message })
        failedConversations.add(turn.conversation)
      } else {
        opts.guard.markUnknown(reservation)
        recorded.push({ ...base(turn), answer: '', ms: 0, toolCalls: null, toolNames: null, usd: null, cost: 'unknown', error: message })
        unknownTurns.push(turn.id)
        stopped = { reason: 'cost-unknown', atTurn: turn.id, detail: `runner failed, cost unknown: ${message}` }
      }
      continue
    }

    // A runner that answers with something that is not a TurnResult cannot be reconciled: its cost is unknown, the reservation
    // stays open and the run stops. (Reading `.usd` of undefined would otherwise throw out of runUat and lose the whole report.)
    if (!isWellFormed(result)) {
      opts.guard.markUnknown(reservation)
      recorded.push({ ...base(turn), answer: '', ms: 0, toolCalls: null, toolNames: null, usd: null, cost: 'unknown', error: 'malformed runner result' })
      unknownTurns.push(turn.id)
      stopped = { reason: 'cost-unknown', atTurn: turn.id, detail: 'runner returned a malformed result, cost unknown' }
      continue
    }

    const status = opts.guard.settle(reservation, result.usd)
    const toolNames = result.toolCalls.map(t => t.name)
    if (status === 'invalid') {
      recorded.push({ ...base(turn), answer: result.text, ms: result.ms, toolCalls: toolNames.length, toolNames, usd: null, cost: 'unknown', error: `invalid reported cost: ${String(result.usd)}` })
      unknownTurns.push(turn.id)
      stopped = { reason: 'invalid-cost', atTurn: turn.id, detail: `reported cost ${String(result.usd)} could not be reconciled` }
    } else if (status === 'overflow') {
      // The cost is valid and is kept on the turn, but it is not in the running total: the total can no longer be stated.
      recorded.push({ ...base(turn), answer: result.text, ms: result.ms, toolCalls: toolNames.length, toolNames, usd: result.usd, cost: 'known', accountingOverflow: true })
      unknownTurns.push(turn.id)
      stopped = { reason: 'invalid-cost', atTurn: turn.id, detail: 'accounting total would exceed the safe-integer range' }
    } else {
      // 'ok' and 'exceeded' both mean the guard accepted and recorded this cost, so it is a validated, settled amount of this run.
      const settledMicro = toMicro(result.usd, 'up')
      const newRun = settledMicro === null ? NaN : runMicro + settledMicro
      if (Number.isSafeInteger(newRun)) runMicro = newRun
      else runTotalLost = true
      recorded.push({ ...base(turn), answer: result.text, ms: result.ms, toolCalls: toolNames.length, toolNames, usd: result.usd, cost: 'known', ...(status === 'exceeded' ? { exceededReservation: true } : {}) })
      history.set(turn.conversation, [...past, { role: 'user', content: turn.text }, { role: 'assistant', content: result.text }])
      if (status === 'exceeded') {
        stopped = { reason: 'cost-exceeded-reservation', atTurn: turn.id, detail: `cost ${result.usd} was above the ${opts.maxUsdPerTurn} reserved` }
      }
    }
  }

  const unresolved = opts.guard.unresolvedReservedUsd
  // Read after the loop, before the report is built. ANY reservation still open (held, unknown or unreconciled, of this run or
  // of an earlier use of the same guard) means money may be spent or committed that no settled cost accounts for. A reservation
  // released by a typed RequestNotSent is no longer open and is not counted here.
  const stillOpen = opts.guard.openReservedUsd
  const costAccounted = unknownTurns.length === 0 && stillOpen === 0
  // "Complete" means the fixed UAT set, all of it, with no error: a partial or altered list never yields a total.
  const complete = stopped === null && notRun.length === 0 && isFixedSet && recorded.length === FIXED_UAT_TURNS.length && !recorded.some(t => t.error !== undefined)
  return {
    turns: recorded,
    notRun,
    stopped,
    cost: {
      knownUsd: opts.guard.knownUsd, knownSubtotalUsd: opts.guard.knownSubtotalUsd, unknownTurns, unresolvedReservedUsd: unresolved, costAccounted, complete,
      totalUsd: costAccounted && complete && !runTotalLost ? runMicro / MICRO : null,
    },
  }
}

/** Nearest-rank percentile of a list of numbers (p in 0..100). Null for an empty list. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length))
  return sorted[Math.min(sorted.length, rank) - 1]
}

export interface UatSummary {
  turns: number
  answered: number
  errors: number
  notRun: number
  stoppedReason: StopReason | null
  totalToolCalls: number
  turnsWithToolCall: number
  totalMs: number
  p90Ms: number | null
  /** Cost of the turns whose cost is known; null after an accounting overflow. */
  knownUsd: number | null
  /** What was summed before an overflow; never includes the turn that overflowed. */
  knownSubtotalUsd: number
  unknownCostTurns: number
  unresolvedReservedUsd: number
  /** True only when every turn's cost is accounted for. */
  costAccounted: boolean
  /** True only for the full fixed UAT set, run to the end with no error (see UatReport.cost.complete). */
  complete: boolean
  /** The total, or null unless the cost is accounted for AND the run is complete. */
  totalUsd: number | null
}

export function summarize(report: UatReport): UatSummary {
  const ok = report.turns.filter(t => !t.error)
  return {
    turns: report.turns.length,
    answered: ok.length,
    errors: report.turns.length - ok.length,
    notRun: report.notRun.length,
    stoppedReason: report.stopped?.reason ?? null,
    totalToolCalls: ok.reduce((s, t) => s + (t.toolCalls ?? 0), 0),
    turnsWithToolCall: ok.filter(t => (t.toolCalls ?? 0) > 0).length,
    totalMs: ok.reduce((s, t) => s + t.ms, 0),
    p90Ms: percentile(ok.map(t => t.ms), 90),
    knownUsd: report.cost.knownUsd,
    knownSubtotalUsd: report.cost.knownSubtotalUsd,
    unknownCostTurns: report.cost.unknownTurns.length,
    unresolvedReservedUsd: report.cost.unresolvedReservedUsd,
    costAccounted: report.cost.costAccounted,
    complete: report.cost.complete,
    totalUsd: report.cost.totalUsd,
  }
}

/**
 * Share of the labelled fresh-information turns that called at least one tool. The labels come from the caller (the Owner);
 * with no labelled turn present in the report the rate is null, never 0 or 1.
 */
export function toolCallRate(report: UatReport, freshTurnIds: ReadonlySet<string>): { rate: number | null; fresh: number; withTool: number } {
  const fresh = report.turns.filter(t => !t.error && freshTurnIds.has(t.id))
  const withTool = fresh.filter(t => (t.toolCalls ?? 0) > 0).length
  return { rate: fresh.length === 0 ? null : withTool / fresh.length, fresh: fresh.length, withTool }
}

/** Mock runner: answers come from a script keyed by turn id; a missing key yields an empty answer with no tool call. */
export function createMockRunner(script: Readonly<Record<string, Partial<TurnResult>>>): TurnRunner {
  return async ({ turn }) => {
    const s = script[turn.id] ?? {}
    return { text: s.text ?? '', toolCalls: s.toolCalls ?? [], ms: s.ms ?? 0, usd: s.usd ?? 0 }
  }
}
