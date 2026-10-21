// ── C2 P2 · one budget per LOGICAL user request (C2_REQUEST_BUDGET=1, default OFF) ────────────────────────────────────────────────────────────
//
// Owner contract (18/10): every model call of one chat request — the agent's rounds, the task monitor running beside them, the answer-first
// check, a rewrite, a rescue (continuation / empty re-run), and every retry or fallback request the provider layer makes underneath — draws from
// ONE ledger:
//   · operating limit 20 000 tokens = input NOT served from cache + output (reasoning is output, so it is never free);
//   · every generation is capped at max_output_tokens 4 000 (reasoning + visible text together — the API offers no separate caps; 1 500 visible /
//     2 500 reasoning are soft targets, checked after each call and warned about, never claimed as guarantees);
//   · 45 s from the moment the server received the request; after ~30 s no new lookup round is opened.
//
// HOW THE LIMIT IS HELD, AND WHERE IT IS ONLY AN ESTIMATE (reported as such, never as an exact hard limit):
//   · a call must RESERVE before it starts: its estimated uncached input + its whole output cap. Reservation is synchronous, so calls started in
//     parallel can never both see the same remainder. After the call the reservation is released and the provider's REAL usage is charged.
//   · the uncached input of a call is not known until the provider answers (cache hits are decided upstream). The estimate is conservative:
//     the first call counts ALL its input as uncached; later calls count the new part as uncached and the repeated part at the cache ratio the
//     previous call actually measured. Input tokens are estimated from characters (chars / 3, above the real ratio for Vietnamese and English).
//   · so the ledger guarantees: no call STARTS unless spent + reserved + its reservation fits. A call whose real uncached input exceeds its estimate
//     can push the total past the limit by that difference — logged per call as `over_estimate`.
//   · a request the provider refused (HTTP 4xx) is not billed; a failure, timeout or cancellation may have been — its estimated input is charged.
//
// Request scope travels with AsyncLocalStorage (as the latency marks do): the provider layer and the agent runtime find the ledger of the
// request they serve without a parameter through every call site; two users' requests never share one.

import { AsyncLocalStorage } from 'node:async_hooks'

export const requestBudgetOn = (): boolean => (process.env.C2_REQUEST_BUDGET ?? '').trim() === '1'

export const REQUEST_LIMITS = {
  /** uncached input + output, all model calls of the request */
  tokens: 20_000,
  /** max_output_tokens of every single generation (reasoning + visible text) */
  maxOutputPerCall: 4_000,
  /** soft targets, warned about after a call — not enforceable separately */
  visibleTarget: 1_500,
  reasoningTarget: 2_500,
  /** from request received */
  hardMs: 45_000,
  noNewLookupMs: 30_000,
} as const

/** C2_REASONING_HEADROOM_TOKENS: extra output tokens for reasoning on top of the answer budget (0 = off, max 8000). The one reader of this env. */
export function reasoningHeadroomTokens(env: Record<string, string | undefined> = process.env): number {
  const n = Number((env.C2_REASONING_HEADROOM_TOKENS ?? '').trim())
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 8_000) : 0
}

/** Who is calling: decides what a refusal means (aux = skipped and logged; main = the turn ends honestly; guard = fail closed). */
export type BudgetKind = 'main' | 'aux' | 'guard'

export class RequestBudgetError extends Error {
  constructor(message: string, readonly kind: BudgetKind) { super(message); this.name = 'RequestBudgetError' }
}

export interface ActualUsage { inputTokens: number; cachedInputTokens: number; outputTokens: number; reasoningTokens: number | null; usd: number | null }

export interface CallRecord {
  n: number
  label: string
  kind: BudgetKind
  est_uncached_in: number
  reserved: number
  outcome: 'ok' | 'error_unbilled' | 'error_usage_unknown' | 'refused'
  actual?: { input: number; cached: number; uncached: number; output: number; reasoning: number | null; usd: number | null }
  charged: number
  over_estimate?: number
  warn?: string[]
}

export interface Ticket { n: number; label: string; kind: BudgetKind; estUncachedIn: number; estInputTokens: number; reserved: number; done: boolean }

const store = new AsyncLocalStorage<RequestBudget>()

export class RequestBudget {
  readonly startedAt: number
  private spent = 0
  private reserved = 0
  private seq = 0
  private lastInput: number | null = null
  private lastCacheRatio = 0
  readonly records: CallRecord[] = []
  rescueUsed = false
  private usd = 0
  private usdUnknown = 0

  constructor(readonly limits: { tokens: number; maxOutputPerCall: number; hardMs: number; noNewLookupMs: number } = REQUEST_LIMITS, private readonly now: () => number = Date.now, startedAt?: number) {
    this.startedAt = startedAt ?? now()
  }

  elapsedMs(): number { return this.now() - this.startedAt }
  deadlineAt(): number { return this.startedAt + this.limits.hardMs }
  lookupCutoffAt(): number { return this.startedAt + this.limits.noNewLookupMs }
  /** spent (real) + outstanding reservations */
  committed(): number { return this.spent + this.reserved }
  remaining(): number { return Math.max(0, this.limits.tokens - this.committed()) }
  spentTokens(): number { return this.spent }

  /** Conservative uncached-input estimate for a call whose whole input is about `inputTokens` (see header). */
  estimateUncached(inputTokens: number): number {
    const t = Math.max(0, Math.ceil(inputTokens))
    if (this.lastInput === null) return t
    const fresh = Math.max(0, t - this.lastInput)
    const repeated = Math.min(t, this.lastInput)
    return fresh + Math.ceil(repeated * (1 - this.lastCacheRatio))
  }

  /** Would a call of about `inputTokens` input with output cap `maxOut` fit right now (nothing reserved)? */
  affords(inputTokens: number, maxOut: number = this.limits.maxOutputPerCall): boolean {
    return this.committed() + this.estimateUncached(inputTokens) + maxOut <= this.limits.tokens
  }

  /**
   * What the next agent round may do. `lookupInputTokens` = the round's input if it offers tools (null = it is already a final round);
   * `finalInputTokens` = the input of the final answer call after it. A lookup round is allowed only if it AND a final answer still fit, and
   * only before the no-new-lookup mark (~30 s); the final answer needs its own room and time; otherwise the request stops.
   */
  planRound(o: { lookupInputTokens: number | null; finalInputTokens: number; outCap: number; minStepMs: number }): { verdict: 'ok' | 'final_only' | 'stop'; reason: string } {
    const now = this.now()
    if (this.deadlineAt() - now < o.minStepMs) return { verdict: 'stop', reason: 'deadline' }
    const finalNeed = this.estimateUncached(o.finalInputTokens) + o.outCap
    if (this.committed() + finalNeed > this.limits.tokens) return { verdict: 'stop', reason: 'request_budget' }
    if (o.lookupInputTokens === null) return { verdict: 'ok', reason: 'final_fits' }
    if (now >= this.lookupCutoffAt()) return { verdict: 'final_only', reason: 'lookup_cutoff' }
    const lookupNeed = this.estimateUncached(o.lookupInputTokens) + o.outCap
    // after the lookup round the final call repeats its input (cached at the measured ratio) plus the new tool results — counted as finalNeed again
    if (this.committed() + lookupNeed + finalNeed > this.limits.tokens) return { verdict: 'final_only', reason: 'request_budget' }
    return { verdict: 'ok', reason: 'lookup_and_final_fit' }
  }

  /** Reserve before a call starts. Synchronous: two parallel calls can never be granted the same remainder. null = refused (logged). */
  reserve(label: string, kind: BudgetKind, inputTokens: number, maxOut: number): Ticket | null {
    const est = this.estimateUncached(inputTokens)
    const need = est + Math.max(0, Math.ceil(maxOut))
    const n = ++this.seq
    if (this.committed() + need > this.limits.tokens) {
      this.records.push({ n, label, kind, est_uncached_in: est, reserved: 0, outcome: 'refused', charged: 0 })
      log({ type: 'tappyai_request_budget_refused', label, kind, need, committed: this.committed(), limit: this.limits.tokens })
      return null
    }
    this.reserved += need
    return { n, label, kind, estUncachedIn: est, estInputTokens: Math.ceil(inputTokens), reserved: need, done: false }
  }

  /** Release a reservation and charge the provider's real usage. */
  settle(t: Ticket, u: ActualUsage): void {
    if (t.done) return
    t.done = true
    this.reserved = Math.max(0, this.reserved - t.reserved)
    const cached = Math.max(0, Math.min(u.cachedInputTokens, u.inputTokens))
    const uncached = Math.max(0, u.inputTokens - cached)
    const charged = uncached + Math.max(0, u.outputTokens)
    this.spent += charged
    if (u.inputTokens > 0) { this.lastInput = u.inputTokens; this.lastCacheRatio = cached / u.inputTokens }
    if (typeof u.usd === 'number') this.usd += u.usd; else this.usdUnknown++
    const warn: string[] = []
    const reasoning = u.reasoningTokens
    if (typeof reasoning === 'number') {
      if (reasoning > REQUEST_LIMITS.reasoningTarget) warn.push('reasoning_over_soft_target')
      if (u.outputTokens - reasoning > REQUEST_LIMITS.visibleTarget) warn.push('visible_over_soft_target')
    }
    const over = uncached - t.estUncachedIn
    this.records.push({ n: t.n, label: t.label, kind: t.kind, est_uncached_in: t.estUncachedIn, reserved: t.reserved, outcome: 'ok', actual: { input: u.inputTokens, cached, uncached, output: u.outputTokens, reasoning, usd: u.usd }, charged, ...(over > 0 ? { over_estimate: over } : {}), ...(warn.length ? { warn } : {}) })
    if (warn.length) log({ type: 'tappyai_request_budget_soft_target', label: t.label, warn, output: u.outputTokens, reasoning })
  }

  /** A call that failed: a refused request (4xx) is not billed; anything else may have been — its estimated input is charged. */
  fail(t: Ticket, billedUnknown: boolean): void {
    if (t.done) return
    t.done = true
    this.reserved = Math.max(0, this.reserved - t.reserved)
    const charged = billedUnknown ? t.estUncachedIn : 0
    this.spent += charged
    if (billedUnknown) this.usdUnknown++
    this.records.push({ n: t.n, label: t.label, kind: t.kind, est_uncached_in: t.estUncachedIn, reserved: t.reserved, outcome: billedUnknown ? 'error_usage_unknown' : 'error_unbilled', charged })
  }

  summary(): Record<string, unknown> {
    return {
      type: 'tappyai_request_budget', limit: this.limits.tokens, spent: this.spent, reserved_outstanding: this.reserved,
      calls: this.records.length, refused: this.records.filter(r => r.outcome === 'refused').length,
      over_estimate_calls: this.records.filter(r => (r.over_estimate ?? 0) > 0).length,
      usd: Math.round(this.usd * 1e6) / 1e6, usd_unknown_calls: this.usdUnknown, rescue_used: this.rescueUsed, elapsed_ms: this.elapsedMs(),
      records: this.records,
    }
  }
}

function log(o: Record<string, unknown>): void { try { console.log(JSON.stringify(o)) } catch { /* logging never breaks a call */ } }

/** The ledger of the request this code runs for, or null (flag off / outside a request). */
export function currentBudget(): RequestBudget | null { return store.getStore() ?? null }

/**
 * Called once, synchronously, by the chat handler — owner §7.2 (19/10): only for a turn that runs the CONSULT_V3 prompt, right where the
 * handler classifies the prompt (before any model call). Flag off → null, nothing entered, nothing changes.
 * `startedAt` = when the server received the request.
 */
export function startRequestBudget(startedAt?: number): RequestBudget | null {
  if (!requestBudgetOn()) return null
  const b = new RequestBudget(REQUEST_LIMITS, Date.now, startedAt)
  store.enterWith(b)
  return b
}

/** Test seam: run `fn` inside a given ledger. */
export function withRequestBudget<T>(b: RequestBudget, fn: () => T): T { return store.run(b, fn) }

/** Input tokens of a call, estimated from its characters (chars / 3 — conservative). */
export function estimateTokens(chars: number): number { return Math.ceil(Math.max(0, chars) / 3) }

/** Characters of an AI-SDK call: prompt messages (text parts, tool calls / results as JSON) + tool schemas. */
export function promptChars(prompt: unknown, tools?: unknown): number {
  let n = 0
  const add = (v: unknown) => { try { n += typeof v === 'string' ? v.length : JSON.stringify(v ?? '').length } catch { n += 0 } }
  if (Array.isArray(prompt)) for (const m of prompt as Array<{ content?: unknown }>) {
    const c = m?.content
    if (typeof c === 'string') add(c)
    else if (Array.isArray(c)) for (const p of c as Array<Record<string, unknown>>) add(p.type === 'text' ? p.text : p.type === 'image' ? 'i'.repeat(9_000) : p) // an image: counted as ~3 000 tokens
  }
  if (tools !== undefined) add(tools)
  return n
}
