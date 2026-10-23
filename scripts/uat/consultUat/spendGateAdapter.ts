/**
 * The benchmark's side of BENCH_SPEND_GATE: a SpendGate (src/lib/ai/budget/spendGate.ts) backed by a BudgetGuard.
 *
 * One guard per user turn (cap = the per-turn cap); the run cap is held by the outer guard that `runUat` already reserves the per-turn
 * maximum from BEFORE each turn, so the run total can never pass it either. Everything a paid call does is recorded here (label, worst-case
 * amount, outcome) so the benchmark can count model and Serper requests without trusting a log line.
 *
 * Mock-only code: nothing here reads a key or opens a socket.
 */
import { SpendRefusal, type SpendGate, type SpendReservation, type SpendSettleStatus } from '@/lib/ai/budget/spendGate'
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
}

export class GuardSpendGate implements SpendGate {
  readonly records: SpendRecord[] = []
  private readonly held = new Map<number, { res: Reservation; rec: SpendRecord }>()
  private closed = false

  constructor(readonly guard: BudgetGuard) {}

  /**
   * The turn is over: a paid call that starts later (work the app left running after its answer) is refused, because its cost could no longer
   * be added to the turn's books. Reservations already open stay open — they are reported as unresolved cost.
   */
  close(): void { this.closed = true }

  reserve(label: string, maxUsd: number): SpendReservation {
    if (this.closed) {
      this.records.push({ label, maxUsd, state: 'refused', late: true })
      throw new SpendRefusal(`the turn is over: ${label} not made`, 'blocked')
    }
    try {
      const res = this.guard.reserve(maxUsd) // atomic: the check and the hold are one synchronous step
      const rec: SpendRecord = { label, maxUsd, state: 'held' }
      this.records.push(rec)
      this.held.set(res.id, { res, rec })
      return { id: res.id, maxUsd: res.maxUsd, label }
    } catch (e) {
      if (!(e instanceof BudgetRefusal)) throw e
      this.records.push({ label, maxUsd, state: 'refused' })
      throw new SpendRefusal(e.message, this.guard.blockedBy ? 'blocked' : 'budget')
    }
  }

  private take(r: SpendReservation) {
    const h = this.held.get(r.id)
    if (!h) throw new Error(`unknown spend reservation ${r.id}`)
    return h
  }

  settle(r: SpendReservation, actualUsd: unknown): SpendSettleStatus {
    const h = this.take(r)
    const status = this.guard.settle(h.res, actualUsd)
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
  get refusals(): number { return this.records.filter(r => r.state === 'refused' && !r.late).length }
  /** Refused after the turn had ended. */
  get lateRefusals(): number { return this.records.filter(r => r.late).length }
  count(prefix: string): number { return this.records.filter(r => r.state !== 'refused' && r.label.startsWith(prefix)).length }
}
