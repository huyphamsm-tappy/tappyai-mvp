/**
 * Consultative UAT harness (mock-only in this phase).
 *
 * Runs the fixed UAT turns through an injected `TurnRunner` and records, per turn: the answer, wall time, the tools the turn
 * called, and the estimated cost. No live runner is included on purpose: a real one is added only after the Owner supplies a
 * spend cap, a test-environment URL and the reference answers. Until then the only runner is a mock.
 *
 * Spend rule: every call goes through `BudgetGuard.reserve` BEFORE the runner is called. With no cap (null) the guard refuses
 * every call, so a harness wired to a paid runner cannot spend without an explicit cap.
 */
import type { UatTurn } from './questions'

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

export interface TurnResult {
  text: string
  toolCalls: ReadonlyArray<{ name: string }>
  ms: number
  usd: number
}

export type TurnRunner = (input: { turn: UatTurn; history: readonly ChatMessage[] }) => Promise<TurnResult>

export class BudgetRefusal extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BudgetRefusal'
  }
}

/** Cumulative-spend guard. `capUsd` null = no cap supplied = every paid call is refused. */
export class BudgetGuard {
  private spentUsd = 0
  constructor(private readonly capUsd: number | null) {}

  get spent(): number {
    return this.spentUsd
  }

  /** Throws before a call whose worst-case estimate could push the running total past the cap. */
  reserve(estimateUsd: number): void {
    if (this.capUsd === null) throw new BudgetRefusal('no spend cap supplied: paid calls are refused')
    if (!(estimateUsd >= 0) || !Number.isFinite(estimateUsd)) throw new BudgetRefusal('invalid cost estimate')
    if (this.spentUsd + estimateUsd > this.capUsd) {
      throw new BudgetRefusal(`cap ${this.capUsd} USD would be exceeded (spent ${this.spentUsd}, next call up to ${estimateUsd})`)
    }
  }

  /** Records what a finished call actually cost (reported usage). */
  record(actualUsd: number): void {
    if (Number.isFinite(actualUsd) && actualUsd > 0) this.spentUsd += actualUsd
  }
}

export interface RecordedTurn {
  id: string
  conversation: string
  turn: number
  question: string
  answer: string
  ms: number
  toolCalls: number
  toolNames: string[]
  usd: number
  error?: string
}

export interface UatReport {
  turns: RecordedTurn[]
  /** Why the run ended early, if it did. */
  stoppedBy: 'budget' | null
  spentUsd: number
}

export interface RunOptions {
  turns: readonly UatTurn[]
  runner: TurnRunner
  guard: BudgetGuard
  /** Worst-case cost of one turn, used for the pre-call check. */
  estimateUsdPerTurn: number
}

/** Runs the turns in order; a turn sees the earlier turns of its own conversation as history. Stops at the first budget refusal. */
export async function runUat(opts: RunOptions): Promise<UatReport> {
  const history = new Map<string, ChatMessage[]>()
  const recorded: RecordedTurn[] = []
  let stoppedBy: UatReport['stoppedBy'] = null

  for (const turn of opts.turns) {
    try {
      opts.guard.reserve(opts.estimateUsdPerTurn)
    } catch (e) {
      if (e instanceof BudgetRefusal) { stoppedBy = 'budget'; break }
      throw e
    }
    const past = history.get(turn.conversation) ?? []
    try {
      const r = await opts.runner({ turn, history: past })
      opts.guard.record(r.usd)
      recorded.push({
        id: turn.id, conversation: turn.conversation, turn: turn.turn, question: turn.text, answer: r.text,
        ms: r.ms, toolCalls: r.toolCalls.length, toolNames: r.toolCalls.map(t => t.name), usd: r.usd,
      })
      history.set(turn.conversation, [...past, { role: 'user', content: turn.text }, { role: 'assistant', content: r.text }])
    } catch (e) {
      recorded.push({
        id: turn.id, conversation: turn.conversation, turn: turn.turn, question: turn.text, answer: '',
        ms: 0, toolCalls: 0, toolNames: [], usd: 0, error: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return { turns: recorded, stoppedBy, spentUsd: opts.guard.spent }
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
  totalToolCalls: number
  turnsWithToolCall: number
  totalMs: number
  p90Ms: number | null
  totalUsd: number
}

export function summarize(report: UatReport): UatSummary {
  const ok = report.turns.filter(t => !t.error)
  return {
    turns: report.turns.length,
    answered: ok.length,
    errors: report.turns.length - ok.length,
    totalToolCalls: ok.reduce((s, t) => s + t.toolCalls, 0),
    turnsWithToolCall: ok.filter(t => t.toolCalls > 0).length,
    totalMs: ok.reduce((s, t) => s + t.ms, 0),
    p90Ms: percentile(ok.map(t => t.ms), 90),
    totalUsd: ok.reduce((s, t) => s + t.usd, 0),
  }
}

/**
 * Share of the labelled fresh-information turns that called at least one tool. The labels come from the caller (the Owner);
 * with no labelled turn present in the report the rate is null, never 0 or 1.
 */
export function toolCallRate(report: UatReport, freshTurnIds: ReadonlySet<string>): { rate: number | null; fresh: number; withTool: number } {
  const fresh = report.turns.filter(t => !t.error && freshTurnIds.has(t.id))
  const withTool = fresh.filter(t => t.toolCalls > 0).length
  return { rate: fresh.length === 0 ? null : withTool / fresh.length, fresh: fresh.length, withTool }
}

/** Mock runner: answers come from a script keyed by turn id; a missing key yields an empty answer with no tool call. */
export function createMockRunner(script: Readonly<Record<string, Partial<TurnResult>>>): TurnRunner {
  return async ({ turn }) => {
    const s = script[turn.id] ?? {}
    return { text: s.text ?? '', toolCalls: s.toolCalls ?? [], ms: s.ms ?? 0, usd: s.usd ?? 0 }
  }
}
