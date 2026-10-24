/**
 * The benchmark's side of BENCH_SPEND_GATE: a SpendGate (src/lib/ai/budget/spendGate.ts) backed by a BudgetGuard.
 *
 * One guard per user turn (cap = the per-turn cap); the run cap is held by the outer guard that `runUat` already reserves the per-turn
 * maximum from BEFORE each turn, so the run total can never pass it either. Everything a paid call does is recorded here (label, worst-case
 * amount, outcome) so the benchmark can count model and Serper requests without trusting a log line.
 *
 * Mock-only code: nothing here reads a key or opens a socket.
 */
import { checkTurnCap, SpendRefusal, type SpendCallDetail, type SpendGate, type SpendRefusalReason, type SpendReservation, type SpendSettleDetail, type SpendSettleStatus } from '@/lib/ai/budget/spendGate'
import { BudgetGuard, BudgetRefusal, type Reservation } from './harness'

export type SpendRecordState = 'held' | 'settled' | 'released' | 'unknown' | 'unreconciled' | 'refused'
export interface SpendRecord {
  label: string
  maxUsd: number
  state: SpendRecordState
  /** The cost the caller reported, when it was a number. */
  actualUsd?: number
  status?: SpendSettleStatus
  /** Refused because the turn had already ended (not because the cap was reached). */
  late?: boolean
  /** A photo lookup skipped for lack of a cost bound (see noteRefusal). */
  photoSkip?: boolean
  /** What the caller said about the call when it reserved (Serper: endpoint, the real `num`, the RAW query, W/V). Raw: the runner redacts before it writes anything. */
  detail?: SpendCallDetail
  /** What the caller said when the call settled (Serper: the credits the provider reported; a model call: its tokens). */
  settleDetail?: SpendSettleDetail
}

export class GuardSpendGate implements SpendGate {
  readonly records: SpendRecord[] = []
  private readonly held = new Map<number, { res: Reservation; rec: SpendRecord }>()
  private closed = false

  /** A guard with no cap, or a cap above the benchmark maximum ($0.05 per turn), is refused here — before it can hold a reservation. */
  constructor(readonly guard: BudgetGuard) {
    if (guard.capUsd === null) throw new BudgetRefusal('the per-turn guard has no cap: the gate cannot state what it enforces')
    const c = checkTurnCap(guard.capUsd)
    if (!c.ok) throw new BudgetRefusal(c.reason)
  }

  /**
   * The turn is over: a paid call that starts later (work the app left running after its answer) is refused, because its cost could no longer
   * be added to the turn's books. Reservations already open stay open — they are reported as unresolved cost.
   */
  close(): void { this.closed = true }

  reserve(label: string, maxUsd: number, detail?: SpendCallDetail): SpendReservation {
    if (this.closed) {
      this.records.push({ label, maxUsd, state: 'refused', late: true })
      throw new SpendRefusal(`the turn is over: ${label} not made`, 'blocked')
    }
    try {
      const res = this.guard.reserve(maxUsd) // atomic: the check and the hold are one synchronous step
      const rec: SpendRecord = { label, maxUsd, state: 'held', ...(detail ? { detail } : {}) }
      this.records.push(rec)
      this.held.set(res.id, { res, rec })
      return { id: res.id, maxUsd: res.maxUsd, label }
    } catch (e) {
      if (!(e instanceof BudgetRefusal)) throw e
      this.records.push({ label, maxUsd, state: 'refused' })
      throw new SpendRefusal(e.message, this.guard.blockedBy ? 'blocked' : 'budget')
    }
  }

  /** A call refused before it could be priced (no upper bound): nothing is held, the refusal is counted so the turn is flagged degraded. */
  noteRefusal(label: string, _reason: SpendRefusalReason): void {
    // A skipped photo lookup (`serper:images`) changes the pictures, not the text: counted apart (photoSkips), it does not degrade the turn.
    this.records.push({ label, maxUsd: 0, state: 'refused', ...(label === 'serper:images' ? { photoSkip: true } : {}), ...(this.closed ? { late: true } : {}) })
  }

  private take(r: SpendReservation) {
    const h = this.held.get(r.id)
    if (!h) throw new Error(`unknown spend reservation ${r.id}`)
    return h
  }

  settle(r: SpendReservation, actualUsd: unknown, detail?: SpendSettleDetail): SpendSettleStatus {
    const h = this.take(r)
    const status = this.guard.settle(h.res, actualUsd)
    if (detail) h.rec.settleDetail = detail
    h.rec.status = status
    h.rec.state = status === 'invalid' || status === 'overflow' ? 'unreconciled' : 'settled'
    if (typeof actualUsd === 'number' && Number.isFinite(actualUsd)) h.rec.actualUsd = actualUsd
    return status
  }

  release(r: SpendReservation): void {
    const h = this.take(r)
    this.guard.release(h.res)
    h.rec.state = 'released'
  }

  markUnknown(r: SpendReservation): void {
    const h = this.take(r)
    this.guard.markUnknown(h.res)
    h.rec.state = 'unknown'
  }

  get requests(): number { return this.records.filter(r => r.state !== 'refused').length }
  /** Refused by the cap or by a blocked gate DURING the turn. */
  get refusals(): number { return this.records.filter(r => r.state === 'refused' && !r.late && !r.photoSkip).length }
  /** Photo lookups skipped during the turn because `images` has no proven cost bound. */
  get photoSkips(): number { return this.records.filter(r => r.photoSkip && !r.late).length }
  /** Refused after the turn had ended. */
  get lateRefusals(): number { return this.records.filter(r => r.late).length }
  count(prefix: string): number { return this.records.filter(r => r.state !== 'refused' && r.label.startsWith(prefix)).length }
}
