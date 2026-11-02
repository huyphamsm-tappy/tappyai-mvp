// ── Phase 8 agent runtime (TAPPY_AGENT=2) — the loop ───────────────────────────────────────────────────────────────────────
//
//   conversation → Luna step → ANSWER | ASK (ask_user) | TOOLS → results → Luna step ("đủ chưa?") → … → RESPOND
//
// Luna decides every branch; this loop only executes, bounds and records. One round = one model step (tools are schemas only). The
// model answers (done), asks (done — the reply is its question), or names tool calls, which the loop runs under the guards and
// budgets and feeds back. It may iterate — search, read the result, search again — until it answers or a ceiling forces the final
// step, which has NO tools and is told which parts could not be checked.
//
// Ceilings (limits.ts): model rounds ≤ 6 · tool calls ≤ 8 · Serper ≤ 8/10 (enforced in serperAdmit by the turn scope the caller
// opens) · overall deadline (85 s from the start of the request).
//
// Cancellation: every model step and every tool invocation runs under its OWN AbortController. On a timeout the controller is aborted
// (the model request is cancelled; the tool's Serper scope refuses further requests and aborts the in-flight fetch) BEFORE the loop
// moves on — nothing that timed out keeps running or billing. The model layer's one retry (role `agent`) aborts its primary first too
// (llm/fallback.ts generateAbortingPrimary).
//
// Every decision is recorded on the run trace (trace.ts): model rounds, tool calls and results, timeouts, retries, budget refusals,
// the ask, errors and the final status.
//
// Reused from the Phase 7 loop: the input / output guards (guards.ts), `why` stripping, the final-step note, the event shape (so the
// state patch and the stream adapter work unchanged).

import type { CoreMessage } from 'ai'
import { guardToolInput, guardToolOutput } from '../guards'
import { stripWhy, finalStepNote, type AgentStep, type AgentToolCall, type AgentExecutableTool, type ToolEvent } from '../loop'
import { RUNTIME_LIMITS, type RuntimeLimits } from './limits'
import { ASK_USER, UPDATE_TASK, CONTROL_TOOLS, parseAskUser, renderAsk, type AskUser } from './controlTools'
import { toolInputHash, traceQuery, resultCount, type AgentRunTrace } from './trace'
import { toolStateOf, withToolState } from './toolState'
import { withFreshness } from '../../freshness'
import { checkApplies, checkNote, composeFinal, parseCheck, prefaceNote } from './answerFirst'
import { auditTrace, auditTraceOn } from '../../auditTrace'
import { needsCard, validCard, cardRetryNote, lastUserText } from './cardRetry'
import { isThinPreface, needsContent, isThin, contentRetryNote, needsFullAnswer, isShortKnowledgeAnswer, fullAnswerRetryNote, needsPlanNotQuestion, isAskOnly, planNotQuestionRetryNote, contractRetryNote, turnResolution, type TurnResolution } from './contentFloor'
import { parseTaskFrame, stripTaskFrame, taskToolGate, missingDeliverables, deliverablesRetryNote, dedupeAroundTaskFrame, dropMetaNotes, scrubDegenerate, type TaskFrame } from './taskFrame'
import { joinContinuation } from './c2Policy'
import { AnswerStreamGate } from './answerStream'
import type { ToolSyntaxGuard } from '../../retrievalV5/toolSyntax'

export type RuntimeStatus = 'answered' | 'asked' | 'answered_after_tool_budget' | 'answered_after_round_budget' | 'answered_after_time_budget' | 'answered_after_request_budget' | 'model_error' | 'aborted'
export type RuntimeStop = 'model_answered' | 'asked' | 'tool_budget' | 'round_budget' | 'time_budget' | 'request_budget' | 'model_error' | 'aborted'

/** C2_REQUEST_BUDGET: what the request ledger allows for the NEXT model round (see RuntimeInput.budgetGate). */
export type BudgetVerdict = 'ok' | 'final_only' | 'stop'
/** Why an answer is marked incomplete (RuntimeRun.incomplete): cut at the output limit after the one rescue, or stopped by the request budget / deadline. */
export type IncompleteReason = 'length_limit' | 'request_budget' | 'deadline'

/** Tools that change application state run one at a time, after the read-only ones. */
export const RUNTIME_SEQUENTIAL_TOOLS: ReadonlySet<string> = new Set(['request_action'])

export interface RuntimeStep extends AgentStep { modelId?: string }

export interface RuntimeInput {
  system: string
  messages: CoreMessage[]
  /** Executable tools (production logic). Control tools (ask_user) have no entry here — they are intercepted. */
  tools: Record<string, AgentExecutableTool>
  /** What the model sees: executable tools + control tools, as schemas. */
  schemas: Record<string, unknown>
  /** `rescue` (C2_LENGTH_RECOVERY): this call is the request's ONE rescue (an empty re-run or a continuation) — same output cap, no boost (P2 contract). */
  callModel: (o: { system: string; messages: CoreMessage[]; tools?: Record<string, unknown>; final: boolean; signal: AbortSignal; rescue?: boolean; onTextDelta?: (delta: string) => void }) => Promise<RuntimeStep>
  /** Runs one tool invocation under `signal` (the Serper scope + cancellation); returns the value and the Serper credits it spent. */
  runTool?: <T>(name: string, signal: AbortSignal, fn: () => Promise<T>) => Promise<{ value: T; credits: number }>
  onToolStart?: (call: AgentToolCall) => void
  onToolResult?: (call: AgentToolCall, guardedForClient: unknown, event: ToolEvent) => void
  prepareArgs?: (name: string, args: Record<string, unknown>) => Record<string, unknown>
  disallowedTools?: ReadonlySet<string>
  deadlineAt: number
  limits?: Partial<RuntimeLimits>
  /**
   * TAPPY_ANSWER_V4: tools with their own time budget instead of `toolTimeoutMs`, which also receive the cancellation signal (`abortSignal`) so a
   * timed-out call really stops. UAT 19/10: the hosted web search takes 16–22 s; at 15 s it was cut every time — the model got nothing and said
   * "can't verify", while the call ran on (and was billed) and the model searched again. Still bounded by the deadline and the final reserve.
   */
  toolTimeouts?: Readonly<Record<string, number>>
  /**
   * RETRIEVAL_V5: the note of a final round that the round policy made final, by the policy's reason (null = the generic final note). The generic
   * note says the lookups are used up and asks to name what is not checked — wrong for a round whose research is complete.
   */
  finalNoteFor?: (reason: string) => string | null
  /**
   * RETRIEVAL_V5: a tool call written as text (retrievalV5/toolSyntax.ts) is never shown — the stream gate stops before such a line, and an
   * answer that holds one is rewritten once without tools (still there → `fallback`); after part of it streamed, it is cut before the line.
   */
  toolSyntax?: ToolSyntaxGuard
  /**
   * RETRIEVAL_V5: the turn needs current facts (the understanding said so) but the model answered its first round without any lookup → the
   * lookup this returns runs instead of that answer (the model's draft is dropped; nothing of it streamed — a round with tools never streams).
   */
  requireLookup?: () => Promise<{ tool: string; args: Record<string, unknown> } | null>
  now?: () => number
  signal?: AbortSignal
  lang: string
  trace: AgentRunTrace
  /**
   * Latency pass: an optional per-step note appended to the instructions of a NON-final step (e.g. "you already researched twice — answer
   * unless a key point is missing"). Guidance only; the hard ceilings are unchanged.
   */
  stepNote?: (s: { round: number; toolEvents: readonly ToolEvent[] }) => string | null
  /**
   * M2: applies Luna's update_task delta to the turn's task (task.ts, deterministic) and returns what the model reads back. Absent →
   * update_task calls are answered `task_state_unavailable`.
   */
  onTaskUpdate?: (args: Record<string, unknown>) => { view: unknown; applied: string[]; rejected: string[] }
  /**
   * M6: resolves a proxy call (`use_tool`, toolRegistry.ts) into the real tool BEFORE the input guard, so the real tool takes the normal
   * path (guard, budgets, de-duplication, Serper scope, timeout, output guard, frames) under its own name. Returns null for an ordinary
   * call; `refused` answers the model with a structured result and executes nothing.
   */
  resolveCall?: (call: { toolName: string; args: Record<string, unknown> }) => null | { toolName: string; args: Record<string, unknown> } | { refused: string; result: Record<string, unknown> }
  /**
   * Answer-before-lookup check (answerFirst.ts). Runs at most ONCE per turn: when the first tool step is lookup-only research with no
   * text, this text-only Luna call is asked to write the part of the request that stable knowledge already answers (or NOTHING_YET).
   * Absent (tests, model seams) → the check is not run and the run records `answerFirst: 'not_checked'`.
   */
  answerFirstModel?: (o: { system: string; messages: CoreMessage[]; signal: AbortSignal }) => Promise<{ text: string; usd?: number; promptTokens?: number; completionTokens?: number }>
  /**
   * CONSULTATIVE_IN_AGENT (askGate.ts): a note when this question must not be asked first (null = ask it). The model reads the note as the result
   * of its ask_user call and goes on; at most two refusals per turn, so a later question is always shown. Absent → every question is shown.
   */
  refuseAsk?: (a: AskUser) => string | { note: string; kind: string } | null
  /** CONSULT_ASK_GATE=shadow: the gate only logs what it would refuse (askGate.ts); every question is shown. */
  askGateShadow?: boolean
  /** CONSULTATIVE_IN_AGENT: no answer-first check on a verification / exact-number turn (the lookup is the answer). */
  skipAnswerFirst?: boolean
  /**
   * CONSULTATIVE_IN_AGENT (discoveryGate.ts): this turn must ask the user what they want BEFORE any lookup. No tool is offered; if the model proposes one anyway, EVERY such
   * call (search, news, weather, … anything that is not a control action) is blocked, nothing is executed, the model is told to ask, and after two such rounds the next step is
   * the final tool-less one. Absent → no effect.
   */
  blockRetrieval?: boolean
  /** CONSULTATIVE_IN_AGENT + audit trace: one `tool_status` event per tool call and state — proposed (the model asked), then executed (it ran) or blocked (it never ran). */
  toolStatusTrace?: boolean
  /** CONSULTATIVE_IN_AGENT: a preface paragraph the researched answer restates in other words is dropped (answerFirst.ts). */
  dedupeParaphrase?: boolean
  /** CONSULTATIVE_IN_AGENT: the answer-before-lookup check runs concurrently with the lookup instead of before it (same output, less waiting). */
  parallelAnswerFirst?: boolean
  /** CONSULTATIVE_IN_AGENT: a multi-day plan answered as plain text after get_trip_data gets ONE extra no-tools model call to produce the card (cardRetry.ts). */
  cardRetry?: boolean
  /** CONSULTATIVE_IN_AGENT (contentFloor.ts): an acknowledgement-only text next to a lookup is not kept as a "preface"; a "biết X không" turn or the answer to our clarification that still ends thin gets ONE extra no-tools model call for the content. */
  contentRetry?: boolean
  /** CONSULT_V3 (contentFloor.ts needsFullAnswer): a knowledge answer under the word floor with no points gets ONE no-tools retry for the full answer. */
  fullAnswerRetry?: boolean
  /**
   * CONSULT_V3 task frame (taskFrame.ts): the model's [TAPPY_TASK] line is read (and removed) from every step; the declared kind gates tool
   * calls (refused with a note) and its deliverables are checked before the answer is final (ONE retry for what is missing).
   */
  taskFrameOn?: boolean
  onTaskFrame?: (frame: TaskFrame) => void
  /** CONSULT_V3 A/B measurement (CONSULT_V3_FINAL_REWRITE=1, default off): the answer of a tool-offering step is rewritten once with no tools by the final role. */
  finalRewrite?: boolean
  /** CONSULT_V3 turn contract: told the turn's resolution once, when the answer is final (the route refunds an `unresolved` turn). */
  onTurnContract?: (resolution: TurnResolution) => void
  /**
   * C2_ROUND_CAP (c2Policy.ts roundDecision): asked before every round that is not already forced final — must this round be the final, tool-less one?
   * `toolRounds` = rounds that ran lookups so far; `lastRoundStates` = tool states of the latest lookup round. The reason is traced (decision `round_cap`).
   */
  roundPolicy?: (s: { toolRounds: number; lastRoundStates: readonly string[]; elapsedMs: number }) => { final: boolean; reason: string }
  /** C2_BATCH_NOTE: appended to the instructions of every non-final round that offers tools. */
  toolRoundNote?: string
  /**
   * C2_LENGTH_RECOVERY (P2 contract): the request has ONE rescue, shared by both cases — a round with no visible output that ended on the output
   * limit is re-run once, OR a cut answer gets one continuation (no tools, at most `maxMs`). Same output cap (no ×2), nothing reset. No rescue
   * left / no time / refused by the request budget / still cut → the run is flagged `incomplete` (reason `length_limit`); nothing is appended to
   * the answer text (the status travels as its own annotation, index.ts).
   */
  lengthRecovery?: { continuationPrompt: string; maxMs: number }
  /** C2_PROGRESS: told when each model round starts (`afterLookup` = a lookup round already ran). Presentation only; a throw is ignored. */
  onRoundStart?: (r: { round: number; final: boolean; afterLookup: boolean }) => void
  /**
   * C2_REQUEST_BUDGET: asked before every model round (with the call it would make): `ok`, `final_only` (no budget / time for another lookup
   * round AND the final answer — this round must be the final one), or `stop` (not even the final answer fits — end, flagged incomplete).
   */
  budgetGate?: (o: { system: string; messages: CoreMessage[]; tools?: Record<string, unknown> }) => { verdict: BudgetVerdict; reason: string }
  /**
   * C2_STREAM_DATASTREAM: where released answer text goes (index.ts → `0:` frames). Only a round that offers NO tools (the final round, or a turn
   * the tool gate left tool-less), with no preface text, streams — through AnswerStreamGate (answerStream.ts). `streamable: false` = this turn
   * never streams (plan turns: the card retry may replace the text; a final rewrite: it replaces it). A function is asked again before every
   * round (C2 P2 6.0 F-1: once the turn holds news / editorial results, the post-run source attribution may rewrite any sentence → no stream).
   */
  streamAnswer?: (text: string) => void
  streamable?: boolean | (() => boolean)
}

export interface RuntimeRun {
  text: string
  status: RuntimeStatus
  stopReason: RuntimeStop
  steps: RuntimeStep[]
  toolEvents: ToolEvent[]
  modelCalls: number
  toolCalls: number
  ask: AskUser | null
  /**
   * What happened to the advice that can be given before a lookup: `provided` (the check wrote it), `with_step` (the model wrote it next
   * to its tool call / ask), `nothing_yet` (the check found nothing answerable yet), `failed` (the check errored; the lookup went on),
   * `not_checked` (a lookup-only first step with no text and no check available), `n/a` (no such situation).
   */
  answerFirst: 'provided' | 'with_step' | 'nothing_yet' | 'failed' | 'not_checked' | 'n/a'
  /** C2_LENGTH_RECOVERY / C2_REQUEST_BUDGET: the answer is not complete (still cut after the one rescue, or stopped by the budget) — never a normal success. */
  incomplete?: boolean
  incompleteReason?: IncompleteReason
  /** C2_STREAM_DATASTREAM: the answer text already released to the data stream, and why releasing stopped early (null = it did not). */
  streamed?: { released: string; stop: string | null }
  /** A server / provider error broke the answer after part of it had streamed (the part shown stays; nothing is appended). */
  interrupted?: boolean
}

const stable = (v: unknown): string => {
  if (v === null || typeof v !== 'object') return typeof v === 'string' ? JSON.stringify(v.trim().toLowerCase()) : JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  return `{${Object.keys(v as Record<string, unknown>).sort().map(k => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`
}

class TimeoutError extends Error { constructor() { super('timeout') } }

/** Runs `fn` with its own AbortController; on timeout (or the outer signal) the controller is ABORTED before the rejection settles. */
async function cancellable<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number, outer?: AbortSignal): Promise<T> {
  const ctrl = new AbortController()
  const onOuter = () => ctrl.abort(outer?.reason)
  outer?.addEventListener('abort', onOuter, { once: true })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      fn(ctrl.signal),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { ctrl.abort(new TimeoutError()); reject(new TimeoutError()) }, Math.max(1, ms)) }),
    ])
  } finally {
    clearTimeout(timer)
    outer?.removeEventListener('abort', onOuter)
  }
}

const FALLBACK = (lang: string) => lang === 'en'
  ? "Sorry — I couldn't finish that just now. Please try again in a moment."
  : 'Xin lỗi, mình chưa trả lời được lúc này. Bạn thử lại sau ít phút nhé.'

export async function runAgentRuntime(input: RuntimeInput): Promise<RuntimeRun> {
  const L: RuntimeLimits = { ...RUNTIME_LIMITS, ...(input.limits ?? {}) }
  const now = input.now ?? Date.now
  const T = input.trace
  const messages: CoreMessage[] = [...input.messages]
  const steps: RuntimeStep[] = []
  const toolEvents: ToolEvent[] = []
  const seen = new Set<string>()
  const unchecked: string[] = []
  let toolCalls = 0
  let modelCalls = 0
  let forceFinal: RuntimeStop | null = null
  // CONSULT_V3: the task the model declared this turn (the latest valid [TAPPY_TASK] line), or none.
  let taskFrame: TaskFrame | null = null
  let blockedRetrievalRounds = 0
  // (audit trace, CONSULTATIVE_IN_AGENT only) which state each tool call reached; auditTrace() itself is a no-op unless the trace is on
  const statusTrace = (round: number, tool: string, status: 'proposed' | 'executed' | 'blocked', extra: Record<string, unknown> = {}) => { if (input.toolStatusTrace) auditTrace('tool_status', 'tool_call', { round, tool, status, ...extra }) }
  let taskUpdates = 0
  // Text the model wrote next to a lookup / an ask, or the check wrote before a lookup: kept and shown BEFORE the rest of the answer.
  const prefaces: string[] = []
  let answerFirst: RuntimeRun['answerFirst'] = 'n/a'
  let askRefusals = 0
  // C2 (c2Policy.ts): lookup rounds so far and the tool states of the latest one (round cap), the turn start (soft time budget), the request's
  // ONE rescue (shared by the empty re-run and the continuation — P2 contract) and why the answer is incomplete, if it is.
  let toolRounds = 0
  let lastRoundStates: string[] = []
  const startedAt = now()
  let rescueNext = false
  let rescueUsed = false
  let incomplete: IncompleteReason | null = null
  // C2_STREAM_DATASTREAM: the gate of the answer round that streams (created on the first streamable round), and whether an error broke it.
  let gate: AnswerStreamGate | null = null
  let interrupted = false
  const streamedSomething = (): boolean => !!gate && gate.released().trim().length > 0

  const done = (text: string, status: RuntimeStatus, stopReason: RuntimeStop, ask: AskUser | null = null): RuntimeRun => {
    T.status = status
    T.stopReason = stopReason
    T.counters.toolCalls = toolCalls
    // Local UAT only, opt-in (never in production): what the runtime composed from the prefaces and the final step.
    if (process.env.TAPPY_UAT_STREAM_TRACE === '1' && process.env.NODE_ENV !== 'production') {
      try { console.log(JSON.stringify({ type: 'tappyai_uat_stream_trace', ev: 'compose', prefaces, final: text, composed: composeFinal(prefaces, text, { dedupeParaphrase: input.dedupeParaphrase }) })) } catch { /* diagnostics only */ }
    }
    // (audit-only) the compose steps one by one, so a cut / repeat can be placed in the join itself
    const stages: Record<string, unknown> = {}
    const composedForTrace = auditTraceOn() ? composeFinal(prefaces, text, { dedupeParaphrase: input.dedupeParaphrase, trace: (stage, value) => { stages[stage] = value } }) : ''
    auditTrace('compose', 'compose', { prefaces: [...prefaces], final: text, composed: composedForTrace, stage_lens: Object.fromEntries(Object.entries(stages).map(([k, v]) => [k, Array.isArray(v) ? v.map(x => String(x).length) : String(v).length])), status })
    // CONSULT_V3 task frame: a [TAPPY_TASK] line that slipped into a retry's text never reaches the reply; English planning notes that leaked
    // into a Vietnamese answer (eval 17/10, rc-3) are removed.
    const composed = composeFinal(prefaces, text, { dedupeParaphrase: input.dedupeParaphrase })
    let shownFinal = composed
    if (input.taskFrameOn) {
      const notes = dropMetaNotes(stripTaskFrame(composed), input.lang)
      if (notes.removed) T.add('task', { decision: 'meta_notes_removed', count: notes.removed })
      // C2 P2: once part of the answer streamed, the copy that streamed is the one kept (text that left is never replaced)
      const scrub = scrubDegenerate(notes.text, input.lang, { keepFirstCopy: streamedSomething(), userText: lastUserText(input.messages) })
      if (scrub.fixes.length) T.add('task', { decision: 'degenerate_scrubbed', fixes: scrub.fixes })
      shownFinal = scrub.text
      // CONSULT_V3 TURN CONTRACT: the turn's resolution, from the text the user receives (an ask / an error resolves nothing by itself).
      const resolution: TurnResolution = status === 'model_error' || status === 'aborted' ? 'unresolved' : ask ? (taskFrame?.missing?.length ? 'clarify' : 'unresolved') : turnResolution(shownFinal, taskFrame?.missing)
      T.add('task', { decision: 'turn_contract', resolution, declared: !!taskFrame, kind: taskFrame?.kind ?? null, missing_declared: taskFrame?.missing?.length ?? 0, retried: contentRetried })
      try { console.log(JSON.stringify({ type: 'tappyai_turn_contract', resolution, declared: !!taskFrame, kind: taskFrame?.kind ?? null, missing_declared: taskFrame?.missing?.length ?? 0, retried: contentRetried })) } catch { /* log only */ }
      try { input.onTurnContract?.(resolution) } catch { /* the caller's bookkeeping never affects the reply */ }
    }
    if (incomplete) {
      T.add('final', { decision: 'incomplete', reason: incomplete })
      try { console.log(JSON.stringify({ type: 'tappyai_output_incomplete', reason: incomplete, status })) } catch { /* log only */ }
    }
    return { text: shownFinal || FALLBACK(input.lang), status, stopReason, steps, toolEvents, modelCalls, toolCalls, ask, answerFirst, ...(incomplete ? { incomplete: true, incompleteReason: incomplete } : {}), ...(gate ? { streamed: { released: gate.released(), stop: gate.stopReason() } } : {}), ...(interrupted ? { interrupted: true } : {}) }
  }

  // C2_LENGTH_RECOVERY (P2 contract): an answer the provider cut at the output limit gets the request's ONE rescue as a continuation (no tools,
  // bounded time, the same output cap); the parts are joined without the overlap. Rescue already used, no time, refused by the request budget,
  // failed, empty or still cut → the text is kept AS IS and the run is flagged incomplete (`length_limit`) — no line is added to the answer.
  // Every outcome is logged (tappyai_length_recovery). Off (no `lengthRecovery`) → the text is returned untouched.
  const recoverLength = async (text: string, step: RuntimeStep, system: string, round: number): Promise<string> => {
    const lr = input.lengthRecovery
    if (!lr || step.finishReason !== 'length' || !text.trim()) return text
    const log = (outcome: string, extra: Record<string, unknown> = {}) => { try { console.log(JSON.stringify({ type: 'tappyai_length_recovery', round, outcome, head_chars: text.length, ...extra })) } catch { /* log only */ } }
    if (rescueUsed) { incomplete = 'length_limit'; log('no_rescue_left'); return text }
    const left = input.deadlineAt - now()
    if (left < L.minStepMs + 2_000 || input.signal?.aborted) { incomplete = 'length_limit'; log('skipped_no_time', { time_left_ms: left }); return text }
    rescueUsed = true
    const contMessages: CoreMessage[] = [...messages, { role: 'assistant', content: text }, { role: 'user', content: lr.continuationPrompt }]
    const gate = input.budgetGate?.({ system, messages: contMessages, tools: undefined })
    if (gate && gate.verdict === 'stop') { incomplete = 'length_limit'; log('skipped_budget', { reason: gate.reason }); return text }
    const t0 = now()
    try {
      modelCalls++
      const cont = await cancellable(signal => input.callModel({ system, messages: contMessages, tools: undefined, final: true, signal, rescue: true }), Math.min(lr.maxMs, left - 1_000), input.signal)
      steps.push(cont)
      const meta = (cont.providerMetadata?.tappy ?? {}) as { cost?: { usd?: number } }
      T.modelRound({ round, final: true, ms: now() - t0, decision: 'continuation', toolCalls: 0, promptTokens: cont.usage?.promptTokens, completionTokens: cont.usage?.completionTokens, usd: Number(meta.cost?.usd ?? 0), modelId: cont.modelId, finishReason: cont.finishReason })
      const more = (input.taskFrameOn ? stripTaskFrame(cont.text ?? '') : (cont.text ?? '')).trim()
      if (!more) { incomplete = 'length_limit'; log('empty', { ms: now() - t0 }); return text }
      const joined = joinContinuation(text, more)
      if (cont.finishReason === 'length') { incomplete = 'length_limit'; log('still_cut', { ms: now() - t0, added_chars: joined.length - text.length }); return joined }
      log('ok', { ms: now() - t0, added_chars: joined.length - text.length })
      return joined
    } catch (e) {
      incomplete = 'length_limit'
      log(input.signal?.aborted ? 'aborted' : (e as Error)?.name === 'RequestBudgetError' ? 'refused_budget' : 'error', { message: String(e instanceof Error ? e.message : e).slice(0, 120) })
      return text
    }
  }

  // CONSULTATIVE_IN_AGENT (cardRetry.ts): the final text answer of a multi-day plan that skipped the [TAPPY_PLAN] card. At most ONE extra model call, no tools
  // offered, any tool call in its reply ignored, never repeated; no valid card / failure / no time → the text answer is kept (fallback) and the outcome logged.
  let cardRetried = false
  let contentRetried = false
  // RETRIEVAL_V5: the required lookup was already forced once this turn
  let lookupForced = false
  /**
   * RETRIEVAL_V5 (input.toolSyntax): an answer holding a tool call written as text. Part of it already streamed (the gate stopped before the
   * line) → the text is cut before that line. Nothing streamed → one rewrite without tools; still a tool call → the fixed fallback line.
   */
  const guardToolSyntax = async (text: string, system: string, round: number): Promise<string> => {
    const g = input.toolSyntax
    if (!g || !g.detect(text)) return text
    if (streamedSomething()) {
      T.add('guard', { round, stage: 'tool_syntax', outcome: 'cut_after_stream', chars_before: text.length })
      return g.cut(text)
    }
    const left = input.deadlineAt - now()
    if (left >= L.minStepMs + 2_000 && !input.signal?.aborted) {
      try {
        modelCalls++
        const step2 = await cancellable(signal => input.callModel({ system: system + g.retryNote, messages, tools: undefined, final: true, signal }), Math.min(L.stepTimeoutMs, left - 1_000), input.signal)
        steps.push(step2)
        const t2 = (step2.text ?? '').trim()
        if (t2 && !g.detect(t2)) { T.add('guard', { round, stage: 'tool_syntax', outcome: 'rewritten' }); return t2 }
      } catch { /* the fallback line below */ }
    }
    T.add('guard', { round, stage: 'tool_syntax', outcome: 'fallback' })
    return g.fallback
  }
  // CONSULT_V3 A/B (eval 17/10, measurement flag, default off): the answer a tool-offering step wrote — always at effort none, the only
  // effort the API takes with tools — is written ONCE more with no tools by the final role (its effort is LLM_<ROLE>_REASONING), from the
  // same system and messages. Failure, no time or an empty text → the draft stays. Logged as tappyai_final_rewrite.
  const rewriteFinal = async (draft: string, system: string, round: number): Promise<string> => {
    if (input.finalRewrite !== true || streamedSomething()) return draft
    const left = input.deadlineAt - now()
    const log = (outcome: string, extra: Record<string, unknown> = {}) => { try { console.log(JSON.stringify({ type: 'tappyai_final_rewrite', round, outcome, draft_chars: draft.length, ...extra })) } catch { /* log only */ } }
    if (left < L.minStepMs + 2_000 || input.signal?.aborted) { log('skipped_no_time', { time_left_ms: left }); return draft }
    const t0 = now()
    try {
      modelCalls++
      const step2 = await cancellable(signal => input.callModel({ system, messages, tools: undefined, final: true, signal }), Math.min(L.stepTimeoutMs, left - 1_000), input.signal)
      steps.push(step2)
      const meta = (step2.providerMetadata?.tappy ?? {}) as { cost?: { usd?: number; effort?: string } }
      T.modelRound({ round, final: true, ms: now() - t0, decision: 'final_rewrite', toolCalls: 0, promptTokens: step2.usage?.promptTokens, completionTokens: step2.usage?.completionTokens, usd: Number(meta.cost?.usd ?? 0), modelId: step2.modelId, finishReason: step2.finishReason })
      const text = (input.taskFrameOn ? parseTaskFrame(step2.text ?? '').text : (step2.text ?? '')).trim()
      log(text ? 'ok' : 'empty', { ms: now() - t0, chars: text.length, effort: meta.cost?.effort ?? null, usd: Number(meta.cost?.usd ?? 0) })
      return text || draft
    } catch (e) {
      log('error', { ms: now() - t0, message: String(e instanceof Error ? e.message : e).slice(0, 120) })
      return draft
    }
  }
  const finishAnswer = async (text: string, status: RuntimeStatus, stop: RuntimeStop): Promise<RuntimeRun> => {
    // Round 30 (CONSULTATIVE_IN_AGENT, contentFloor.ts): what the user would read is thin although they asked "biết X không" or answered our clarification → ONE no-tools retry for the content.
    const composedNow = composeFinal(prefaces, text, { dedupeParaphrase: input.dedupeParaphrase })
    const thin = input.contentRetry === true && needsContent({ messages: input.messages, composed: composedNow })
    // CONSULT_V3: the full-answer floor (a not-thin but two-sentence knowledge answer).
    const short = !thin && input.fullAnswerRetry === true && needsFullAnswer({ messages: input.messages, composed: composedNow })
    // CONSULT_V3 task frame: the declared task's deliverables (a recipe's quantities and steps, a comparison, a promised table) are checked.
    // CONSULT_V3 TURN CONTRACT (contentFloor.ts): a DECLARED turn whose answer is only a question gets one retry — answer on assumptions, or,
    // with essential information declared missing, explain + help before asking. It comes BEFORE the deliverables check (a question-only
    // trip answer also "lacks the day plan", but the contract note is the one that says answer-first). An undeclared one keeps the narrower
    // trip-length rule.
    const contractAskOnly = !thin && !short && input.taskFrameOn === true && !!taskFrame && isAskOnly(composedNow)
    const missing = !thin && !short && !contractAskOnly && input.taskFrameOn && taskFrame ? missingDeliverables(taskFrame, composedNow, input.lang) : []
    const incomplete = missing.length > 0
    // CONSULT_V3: a trip of a stated length answered with a question only — plan first (contentFloor.ts needsPlanNotQuestion).
    const askedPlan = !thin && !short && !incomplete && !contractAskOnly && input.taskFrameOn === true && needsPlanNotQuestion({ messages: input.messages, composed: composedNow })
    // C2 P2: a retry REPLACES the answer — impossible once part of it streamed (text that left is never replaced): skipped, and logged.
    if ((thin || short || incomplete || contractAskOnly || askedPlan) && !contentRetried && streamedSomething()) {
      T.add('task', { decision: 'content_retry_skipped_streamed', kind: incomplete ? 'deliverables' : short ? 'full_answer' : contractAskOnly ? 'contract_ask_only' : askedPlan ? 'plan_not_question' : 'thin' })
      try { console.log(JSON.stringify({ type: 'tappyai_content_retry', outcome: 'skipped_streamed' })) } catch { /* log only */ }
    } else if ((thin || short || incomplete || contractAskOnly || askedPlan) && !contentRetried) {
      contentRetried = true
      const left = input.deadlineAt - now()
      const log = (outcome: string, extra: Record<string, unknown> = {}) => { try { console.log(JSON.stringify({ type: 'tappyai_content_retry', kind: incomplete ? 'deliverables' : short ? 'full_answer' : contractAskOnly ? 'contract_ask_only' : askedPlan ? 'plan_not_question' : 'thin', ...(incomplete ? { task: taskFrame?.kind, missing: missing.length } : {}), outcome, ...extra })) } catch { /* log only */ } }
      if (left < L.minStepMs + 2_000 || input.signal?.aborted) log('skipped_no_time', { time_left_ms: left })
      else {
        try {
          modelCalls++
          const t0 = now()
          const shown = composeFinal(prefaces, text, { dedupeParaphrase: input.dedupeParaphrase })
          const retryMessages: CoreMessage[] = [...messages, { role: 'assistant', content: shown || '…' }, { role: 'user', content: input.lang === 'en' ? 'Please say more.' : 'Nói rõ hơn nhé.' }]
          const note = incomplete && taskFrame ? deliverablesRetryNote(taskFrame, missing, input.lang) : short ? fullAnswerRetryNote(input.lang) : contractAskOnly ? contractRetryNote(input.lang, taskFrame?.missing) : askedPlan ? planNotQuestionRetryNote(input.lang) : contentRetryNote(input.lang)
          const step2 = await cancellable(signal => input.callModel({ system: input.system + note, messages: retryMessages, tools: undefined, final: true, signal }), Math.min(L.stepTimeoutMs, left - 1_000), input.signal)
          steps.push(step2)
          auditTrace('content_retry', 'snapshot', { ms: now() - t0, tools_ignored: (step2.toolCalls ?? []).map(c => c.toolName), text: step2.text ?? '' })
          const better = (input.taskFrameOn ? stripTaskFrame(step2.text ?? '') : (step2.text ?? '')).trim()
          // the full-answer retry is kept only when it is really fuller (not short any more, or at least half as long again); the deliverables
          // retry only when it lacks fewer of them
          const accepted = incomplete && taskFrame ? !!better && missingDeliverables(taskFrame, better, input.lang).length < missing.length
            : short ? !!better && (!isShortKnowledgeAnswer(better) || better.length >= shown.length * 1.5)
              : contractAskOnly || askedPlan ? !!better && !isAskOnly(better)
                : !!better && !isThin(better)
          if (accepted) { log('ok', { ms: now() - t0, chars: better.length }); return finishAnswer2(better, status, stop) }
          log('still_thin', { ms: now() - t0, chars: better.length })
        } catch (e) {
          log('error', { message: String(e instanceof Error ? e.message : e).slice(0, 120) })
        }
      }
    }
    return finishAnswer2(text, status, stop)
  }
  const finishAnswer2 = async (text: string, status: RuntimeStatus, stop: RuntimeStop): Promise<RuntimeRun> => {
    if (input.cardRetry !== true || cardRetried || streamedSomething() || !needsCard({ userText: lastUserText(input.messages), toolEvents, text })) return done(text, status, stop)
    cardRetried = true
    const log = (outcome: string, extra: Record<string, unknown> = {}) => { try { console.log(JSON.stringify({ type: 'tappyai_card_retry', outcome, ...extra })) } catch { /* log only */ } }
    const left = input.deadlineAt - now()
    if (left < L.minStepMs + 2_000 || input.signal?.aborted) { log('skipped_no_time', { time_left_ms: left }); return done(text, status, stop) }
    try {
      modelCalls++
      const retryMessages: CoreMessage[] = [...messages, { role: 'assistant', content: text }, { role: 'user', content: input.lang === 'en' ? 'Now the card, please.' : 'Giờ làm thẻ lịch trình nhé.' }]
      const t0 = now()
      const step2 = await cancellable(signal => input.callModel({ system: input.system + cardRetryNote(input.lang), messages: retryMessages, tools: undefined, final: true, signal }), Math.min(L.stepTimeoutMs, left - 1_000), input.signal)
      steps.push(step2)
      auditTrace('card_retry', 'snapshot', { ms: now() - t0, tools_ignored: (step2.toolCalls ?? []).map(c => c.toolName), text: step2.text ?? '' })
      if (validCard(step2.text ?? '')) { log('ok', { ms: now() - t0, ignored_tool_calls: (step2.toolCalls ?? []).length }); return done(step2.text, status, stop) }
      log('invalid_card', { ms: now() - t0, ignored_tool_calls: (step2.toolCalls ?? []).length })
    } catch (e) {
      log('error', { message: String(e instanceof Error ? e.message : e).slice(0, 120) })
    }
    return done(text, status, stop)
  }

  for (let round = 1; round <= L.maxModelRounds; round++) {
    if (input.signal?.aborted) return done('', 'aborted', 'aborted')
    const timeLeft = input.deadlineAt - now()
    if (timeLeft < L.minStepMs) {
      T.add('budget', { round, decision: 'no_time_for_a_model_step', time_left_ms: timeLeft })
      return done('', 'answered_after_time_budget', 'time_budget')
    }
    // Why this step must be the final one (precedence: time > tools > rounds > an earlier failure).
    const reason0: RuntimeStop | null =
      timeLeft < L.finalReserveMs ? 'time_budget'
        : toolCalls >= L.maxToolCalls ? 'tool_budget'
          : round === L.maxModelRounds ? 'round_budget'
            : forceFinal
    // C2_ROUND_CAP: after a lookup round the next round answers, unless the policy names an exception (logged either way).
    const policy: { final: boolean; reason: string } | null = reason0 === null && input.roundPolicy && toolRounds > 0 && Object.keys(input.schemas).length ? input.roundPolicy({ toolRounds, lastRoundStates, elapsedMs: now() - startedAt }) : null
    if (policy) T.add('budget', { round, decision: policy.final ? 'round_cap' : 'round_allowed', reason: policy.reason, tool_rounds: toolRounds, elapsed_ms: now() - startedAt })
    let reason: RuntimeStop | null = reason0 ?? (policy?.final ? (policy.reason === 'soft_time_budget' ? 'time_budget' : 'round_budget') : null)
    // C2_REQUEST_BUDGET: the request ledger decides whether this round may still offer tools (it must leave room for the final answer), may only
    // answer, or cannot even answer (then the turn ends here, flagged incomplete — what was already composed is kept).
    if (input.budgetGate) {
      const g = input.budgetGate({ system: input.system, messages, tools: reason === null ? input.schemas : undefined })
      if (g.verdict !== 'ok') T.add('budget', { round, decision: g.verdict === 'stop' ? 'request_budget_stop' : 'request_budget_final', reason: g.reason })
      if (g.verdict === 'stop') { incomplete = /time|deadline/.test(g.reason) ? 'deadline' : 'request_budget'; return done('', 'answered_after_request_budget', 'request_budget') }
      if (g.verdict === 'final_only' && reason === null) reason = /time|deadline|lookup_cutoff/.test(g.reason) ? 'time_budget' : 'request_budget'
    }
    const final = reason !== null
    if (final && reason !== forceFinal) T.add('budget', { round, decision: 'force_final', reason, tool_calls: toolCalls, time_left_ms: timeLeft })
    const noteReason = reason === 'time_budget' ? 'time_budget' : 'tool_budget'
    const note = !final && input.stepNote ? input.stepNote({ round, toolEvents }) : null
    if (note) T.add('budget', { round, decision: 'research_nudge' })
    const base = prefaces.length ? input.system + prefaceNote(input.lang, prefaces, input.dedupeParaphrase === true) : input.system
    const toolNote = !final && input.toolRoundNote && Object.keys(input.schemas).length ? input.toolRoundNote : ''
    const policyNote = final && policy?.final && reason0 === null ? input.finalNoteFor?.(policy.reason) ?? null : null
    const system = final ? base + (policyNote ?? finalStepNote(noteReason, input.lang, unchecked)) : (note ? base + note : base) + toolNote
    const t0 = now()
    let step: RuntimeStep
    const rescue = rescueNext
    rescueNext = false
    // C2_STREAM_DATASTREAM: this round streams only if it offers no tools (it can only answer), nothing was written before it (prefaces would be
    // composed in front of it) and nothing streamed yet; the gate releases complete, already-cleaned lines (answerStream.ts).
    const streamRound = !!input.streamAnswer && (typeof input.streamable === 'function' ? input.streamable() : input.streamable !== false) && (final || Object.keys(input.schemas).length === 0) && prefaces.length === 0 && !streamedSomething()
    if (streamRound) gate ??= new AnswerStreamGate(input.streamAnswer!, input.lang, lastUserText(input.messages), input.toolSyntax?.detectLine)
    try { input.onRoundStart?.({ round, final, afterLookup: toolRounds > 0 }) } catch { /* presentation only */ }
    try {
      modelCalls++
      step = await cancellable(signal => input.callModel({ system, messages, tools: final ? undefined : input.schemas, final, signal, ...(rescue ? { rescue: true } : {}), ...(streamRound ? { onTextDelta: (d: string) => gate!.push(d) } : {}) }), Math.min(L.stepTimeoutMs, timeLeft - 500), input.signal)
    } catch (e) {
      // C2 P2: a failure after part of the answer streamed = INTERRUPTED — what the user has stays, nothing is appended, the turn is an error
      if (streamedSomething()) {
        gate!.stop('error')
        interrupted = true
        T.add('error', { round, scope: 'model', message: 'interrupted_after_streaming', aborted: !!input.signal?.aborted })
        try { console.log(JSON.stringify({ type: 'tappyai_answer_interrupted', round, released_chars: gate!.released().length, aborted: !!input.signal?.aborted })) } catch { /* log only */ }
        return done('', input.signal?.aborted ? 'aborted' : 'model_error', input.signal?.aborted ? 'aborted' : 'model_error')
      }
      if (input.signal?.aborted) return done('', 'aborted', 'aborted')
      // C2_REQUEST_BUDGET: the ledger refused the call — the request is out of budget; end honestly (incomplete), never retry around it.
      if ((e as Error)?.name === 'RequestBudgetError') {
        T.add('budget', { round, decision: 'request_budget_refused' })
        incomplete = 'request_budget'
        return done('', 'answered_after_request_budget', 'request_budget')
      }
      const timedOut = e instanceof TimeoutError
      if (timedOut) { T.counters.timeouts++; T.add('timeout', { round, scope: 'model', ms: now() - t0, cancelled: true }) } else { T.counters.errors++; T.add('error', { round, scope: 'model', message: String(e instanceof Error ? e.message : e).slice(0, 120) }) }
      T.counters.modelRounds++
      // A failed step: if a final attempt is still possible, make the next step the final one (no tools); otherwise end honestly.
      if (!final) { forceFinal = 'model_error'; unchecked.push(input.lang === 'en' ? 'the last step failed' : 'bước cuối bị lỗi'); continue }
      return done('', 'model_error', timedOut ? 'time_budget' : 'model_error')
    }
    // CONSULT_V3 task frame: read and remove the [TAPPY_TASK] line before the step's text is used anywhere (preface, history, answer).
    if (input.taskFrameOn) {
      // the answer written twice around the line (eval 17/10): keep the longer part only
      const deduped = dedupeAroundTaskFrame(step.text ?? '', { keepBefore: streamedSomething() })
      if (deduped !== null) T.add('task', { decision: 'frame_split_dedupe', round, kept_chars: deduped.length, dropped_chars: (step.text ?? '').length - deduped.length })
      const framesOnly = deduped !== null ? `${deduped}\n${((step.text ?? '').match(/\[\s*TAPPY_TASK\s*\][\s\S]*?\[\s*\/\s*TAPPY_TASK\s*\]/gi) ?? []).join('\n')}` : (step.text ?? '')
      const pf = parseTaskFrame(framesOnly)
      if (pf.text !== (step.text ?? '')) step = { ...step, text: pf.text }
      if (pf.frame) {
        taskFrame = pf.frame
        T.add('task', { decision: 'frame', round, task_kind: pf.frame.kind, constraints: pf.frame.constraints.length, servings: pf.frame.servings })
        try { input.onTaskFrame?.(pf.frame) } catch { /* presentation only */ }
      }
    }
    steps.push(step)
    // Audit-only trace (auditTrace.ts, off by default): what this model step wrote, whole, before anything touches it.
    auditTrace('model_step', 'snapshot', { round, step: steps.length, final, modelId: step.modelId ?? null, finish: step.finishReason ?? null, tools: (step.toolCalls ?? []).map(c => c.toolName), text: step.text ?? '' })
    // RETRIEVAL_V5: a turn that needs current facts answered in its first round without a lookup → the required lookup runs instead (the draft
    // is dropped; a round that offers tools never streams, so nothing of it was shown)
    if (!final && input.requireLookup && !lookupForced && toolRounds === 0 && (step.toolCalls ?? []).length === 0 && step.text.trim()) {
      lookupForced = true
      const need = await input.requireLookup().catch(() => null)
      if (need && input.tools[need.tool]?.execute) {
        T.add('budget', { round, decision: 'forced_lookup', tool: need.tool, dropped_chars: step.text.length })
        step = { ...step, text: '', toolCalls: [{ toolCallId: `forced_${round}`, toolName: need.tool, args: need.args }] }
      }
    }
    const meta =(step.providerMetadata?.tappy ?? {}) as { cost?: { usd?: number }; fellBack?: boolean; primaryAborted?: boolean; fallbackReason?: string }
    const calls = final ? [] : step.toolCalls
    const askCall = calls.find(c => c.toolName === ASK_USER)
    const decision = final ? 'final_answer' : askCall ? 'ask' : calls.length ? 'tools' : step.text.trim() ? 'answer' : 'empty'
    T.modelRound({ round, final, ms: now() - t0, decision, toolCalls: calls.length, promptTokens: step.usage?.promptTokens, completionTokens: step.usage?.completionTokens, usd: Number(meta.cost?.usd ?? 0), fellBack: meta.fellBack, primaryAborted: meta.primaryAborted, fallbackReason: meta.fallbackReason, modelId: step.modelId, finishReason: step.finishReason })

    // C2_LENGTH_RECOVERY: a round that wrote nothing visible because the output limit was spent (on reasoning) uses the request's ONE rescue: it is
    // run once more (same cap, no boost) instead of being treated as a failed step; a final round stays final. Rescue already used → the turn
    // stops here, flagged incomplete — no further call is made to save it.
    if (input.lengthRecovery && step.finishReason === 'length' && !step.text.trim() && calls.length === 0) {
      if (!rescueUsed && round < L.maxModelRounds) {
        rescueUsed = true
        rescueNext = true
        T.add('budget', { round, decision: 'empty_length_rerun' })
        if (final) forceFinal = reason
        continue
      }
      T.add('budget', { round, decision: 'empty_length_no_rescue_left' })
      incomplete = 'length_limit'
      // text already written in earlier rounds (prefaces) is the answer the user gets → an (incomplete) answer; nothing at all → the error path
      return done('', prefaces.length ? 'answered' : 'model_error', prefaces.length ? 'model_answered' : 'model_error')
    }

    if (final) {
      const status: RuntimeStatus = reason === 'time_budget' ? 'answered_after_time_budget' : reason === 'tool_budget' ? 'answered_after_tool_budget' : reason === 'round_budget' ? 'answered_after_round_budget' : reason === 'request_budget' ? 'answered_after_request_budget' : 'answered'
      return finishAnswer(await guardToolSyntax(await recoverLength(step.text, step, system, round), system, round), status, reason === 'model_error' || reason === null ? 'model_answered' : reason)
    }

    // TASK (M2): Luna's update_task deltas are applied FIRST (deterministic merge in task.ts), whatever else the step does — an ask or
    // an answer in the same step keeps them. Never counted as tool calls; at most `maxTaskUpdates` per turn.
    const taskCalls = calls.filter(c => c.toolName === UPDATE_TASK)
    const taskResults = new Map<string, unknown>()
    for (const tc of taskCalls) {
      if (!input.onTaskUpdate || taskUpdates >= L.maxTaskUpdates) {
        taskResults.set(tc.toolCallId, { error: input.onTaskUpdate ? 'task_update_limit' : 'task_state_unavailable' })
        T.add('budget', { round, decision: 'task_update_refused', reason: input.onTaskUpdate ? 'limit' : 'unavailable' })
        continue
      }
      taskUpdates++
      try {
        const r = input.onTaskUpdate(stripWhy(tc.args))
        taskResults.set(tc.toolCallId, { ok: true, task: r.view, ...(r.rejected.length ? { not_applied: r.rejected } : {}) })
        T.add('task', { round, decision: 'update', applied: r.applied.slice(0, 16), rejected: r.rejected.slice(0, 8) })
      } catch (e) {
        taskResults.set(tc.toolCallId, { error: 'task_update_failed' })
        T.counters.errors++
        T.add('error', { round, scope: 'task', message: String(e instanceof Error ? e.message : e).slice(0, 120) })
      }
    }
    const taskParts = () => taskCalls.map(tc => ({ type: 'tool-result' as const, toolCallId: tc.toolCallId, toolName: tc.toolName, result: taskResults.get(tc.toolCallId) ?? { error: 'not_applied' } }))
    const taskCallParts = () => taskCalls.map(tc => ({ type: 'tool-call' as const, toolCallId: tc.toolCallId, toolName: tc.toolName, args: stripWhy(tc.args) }))

    // ASK: Luna decided a missing piece changes the decision. The question IS the reply; nothing else of this step runs.
    if (askCall) {
      const ask = parseAskUser(stripWhy(askCall.args))
      const others = calls.filter(c => c !== askCall && c.toolName !== UPDATE_TASK).map(c => c.toolName)
      const verdict = ask && input.refuseAsk && askRefusals < 2 && others.length === 0 ? input.refuseAsk(ask) : null
      const refusal = typeof verdict === 'string' ? verdict : verdict?.note ?? null
      // SHADOW mode (CONSULT_ASK_GATE=shadow): the question is shown as the model asked it; only the fact that the gate WOULD have refused it is logged.
      if (ask && refusal && input.askGateShadow) {
        const kind = typeof verdict === 'object' && verdict ? verdict.kind : 'unspecified'
        T.add('ask', { round, decision: 'would_refuse', kind })
        console.log(JSON.stringify({ type: 'tappyai_ask_gate', decision: 'would_refuse', kind }))
      } else if (ask && refusal) {
        askRefusals++
        const kind = typeof verdict === 'object' && verdict ? verdict.kind : 'unspecified'
        T.add('ask', { round, decision: 'refused', refusals: askRefusals, kind })
        // the condition TYPE only — never the user's words or the question
        console.log(JSON.stringify({ type: 'tappyai_ask_gate', decision: 'refused', kind, refusals: askRefusals }))
        messages.push({ role: 'assistant', content: [...(step.text.trim() ? [{ type: 'text' as const, text: step.text }] : []), ...taskCallParts(), { type: 'tool-call' as const, toolCallId: askCall.toolCallId, toolName: askCall.toolName, args: stripWhy(askCall.args) }] })
        messages.push({ role: 'tool', content: [...taskParts(), { type: 'tool-result' as const, toolCallId: askCall.toolCallId, toolName: askCall.toolName, result: { refused: true, note: refusal } }] })
        continue
      }
      if (ask) {
        // Advice written in the same step as the question is not thrown away: it comes first, the question closes the reply.
        if (step.text.trim()) { prefaces.push(step.text); answerFirst = 'with_step' }
        if (others.length) T.add('budget', { round, decision: 'ask_preempts_tools', dropped: others })
        T.add('ask', { round, choices: ask.choices.length, chars: ask.question.length })
        return done(renderAsk(ask), 'asked', 'asked', ask)
      }
      T.add('error', { round, scope: 'ask_user', message: 'invalid_question' })
      T.counters.errors++
    }
    const toolCallsThisStep = calls.filter(c => !CONTROL_TOOLS.has(c.toolName))
    // CONSULTATIVE_IN_AGENT (discoveryGate.ts): a turn that must ask first runs NO lookup. Everything the model proposes is recorded as proposed → blocked and answered with
    // the instruction to ask; no answer-first check, no budget spent, nothing executed.
    if (input.blockRetrieval && toolCallsThisStep.length) {
      blockedRetrievalRounds++
      const note = input.lang === 'en' ? 'Not allowed this turn: the user must first say what they want. Do not call any tool. Ask ONE short question instead.' : 'Lượt này chưa được tra cứu: người dùng cần nói họ muốn gì trước. Không gọi công cụ nào. Hãy hỏi MỘT câu ngắn.'
      for (const tc of toolCallsThisStep) {
        statusTrace(round, tc.toolName, 'proposed')
        statusTrace(round, tc.toolName, 'blocked', { reason: 'clarify_first' })
        T.add('tool_call', { round, tool: tc.toolName, admitted: false, outcome_planned: 'blocked', gate: 'clarify_first' })
        toolEvents.push({ round, name: tc.toolName, args: {}, why: null, ms: 0, outcome: 'blocked' })
      }
      messages.push({ role: 'assistant', content: [...(step.text.trim() ? [{ type: 'text' as const, text: step.text }] : []), ...taskCallParts(), ...toolCallsThisStep.map(tc => ({ type: 'tool-call' as const, toolCallId: tc.toolCallId, toolName: tc.toolName, args: stripWhy(tc.args) }))] })
      messages.push({ role: 'tool', content: [...taskParts(), ...toolCallsThisStep.map(tc => ({ type: 'tool-result' as const, toolCallId: tc.toolCallId, toolName: tc.toolName, result: { blocked: true, note } }))] })
      if (blockedRetrievalRounds >= 2) forceFinal = 'tool_budget'
      continue
    }
    let pendingCheck: Promise<{ aborted: boolean }> | null = null
    if (toolCallsThisStep.length === 0) {
      if (step.text.trim()) return finishAnswer(await guardToolSyntax(await rewriteFinal(await recoverLength(step.text, step, system, round), system, round), system, round), 'answered', 'model_answered')
      // Only a task update this step: feed its result back; the answer (or a lookup) comes next round.
      if (taskCalls.length) {
        messages.push({ role: 'assistant', content: taskCallParts() })
        messages.push({ role: 'tool', content: taskParts() })
        continue
      }
      forceFinal = 'model_error' // an empty step with no call: the next one is the final, tool-less attempt
      continue
    }

    // ANSWER BEFORE LOOKUP (answerFirst.ts). Text next to the tool call is kept (it used to be dropped from the final answer). A
    // lookup-only research step with no text gets ONE check, so a request with an answerable part is answered before the lookup.
    if (step.text.trim()) {
      if (input.contentRetry === true && isThinPreface(step.text)) {
        // Round 30 (contentFloor.ts): an acknowledgement ("À, Nikola Tesla chứ gì.") is not advice the user has "already read": it must not make the answer after the lookup skip its content.
        T.add('answer_first', { round, outcome: 'thin_preface_dropped', chars: step.text.length })
        if (answerFirst === 'n/a') answerFirst = 'nothing_yet'
      } else {
        prefaces.push(step.text)
        if (answerFirst === 'n/a') answerFirst = 'with_step'
      }
    } else if (answerFirst === 'n/a' && prefaces.length === 0 && toolCalls === 0) {
      const names = toolCallsThisStep.map(tc => { const r = input.resolveCall?.({ toolName: tc.toolName, args: stripWhy(tc.args) }); return r && 'toolName' in r ? r.toolName : tc.toolName })
      if (checkApplies(names) && input.skipAnswerFirst === true) {
        // CONSULTATIVE_IN_AGENT: a "nghe nói … đúng không" / "bao nhiêu" turn is answered ONCE, from the lookup (a no-tools guess written before it
        // contradicted the researched answer: live Snow Crash 2026-10-11).
        answerFirst = 'nothing_yet'
        T.add('answer_first', { round, outcome: 'skipped_verify_turn', chars: 0, ms: 0 })
      } else if (checkApplies(names)) {
        const left = input.deadlineAt - now()
        if (!input.answerFirstModel) answerFirst = 'not_checked'
        else if (left > L.finalReserveMs + 6_000) {
          const c0 = now()
          const snapshot = [...messages] // the check reads the conversation as it is NOW (before this step's assistant message)
          modelCalls++
          const runCheck = async (): Promise<{ aborted: boolean }> => {
            try {
              const r = await cancellable(signal => input.answerFirstModel!({ system: input.system + checkNote(toolCallsThisStep, input.lang), messages: input.parallelAnswerFirst ? snapshot : messages, signal }), Math.min(L.stepTimeoutMs, left - L.finalReserveMs - 2_000), input.signal)
              const kept = parseCheck(r.text)
              T.modelRound({ round, final: false, ms: now() - c0, decision: 'answer_first_check', toolCalls: 0, promptTokens: r.promptTokens, completionTokens: r.completionTokens, usd: r.usd })
              if (kept && !(input.contentRetry === true && isThinPreface(kept))) { prefaces.push(kept); answerFirst = 'provided' } else answerFirst = 'nothing_yet'
              T.add('answer_first', { round, outcome: answerFirst, chars: kept ? kept.length : 0, ms: now() - c0 })
            } catch (e) {
              if (input.signal?.aborted) return { aborted: true }
              answerFirst = 'failed'
              T.counters.errors++
              T.add('error', { round, scope: 'answer_first', message: String(e instanceof Error ? e.message : e).slice(0, 120) })
            }
            return { aborted: false }
          }
          // CONSULTATIVE_IN_AGENT (`parallelAnswerFirst`): the check runs WHILE the lookup runs (same result, same text, ~2–3 s less wait); the
          // assistant message that carries its text is added once both are done. Without it: the check first, then the lookup, as before.
          if (input.parallelAnswerFirst) pendingCheck = runCheck()
          else if ((await runCheck()).aborted) return done('', 'aborted', 'aborted')
        }
      }
    }

    const pushAssistant = () => messages.push({
      role: 'assistant',
      content: [
        ...(step.text.trim() ? [{ type: 'text' as const, text: step.text }] : prefaces.length && answerFirst === 'provided' ? [{ type: 'text' as const, text: prefaces[prefaces.length - 1] }] : []),
        ...taskCallParts(),
        ...toolCallsThisStep.map(tc => ({ type: 'tool-call' as const, toolCallId: tc.toolCallId, toolName: tc.toolName, args: stripWhy(tc.args) })),
      ],
    })
    if (!pendingCheck) pushAssistant()

    // Phase 1 (sequential, deterministic): input guard, budgets, dedupe, allow-list.
    // `name` = the tool that runs (a resolved proxy call runs as its real tool); `tc` stays the model's own call (history, ids).
    type Planned = { tc: AgentToolCall; name: string; via?: string; why: string | null; args: Record<string, unknown>; key: string; outcome: ToolEvent['outcome']; result?: unknown; error?: string; started: number; credits: number }
    const planned: Planned[] = []
    for (const tc of toolCallsThisStep) {
      const why = typeof tc.args?.why === 'string' ? (tc.args.why as string).slice(0, 160) : null
      let args = stripWhy(tc.args)
      let name = tc.toolName
      const resolved = input.resolveCall ? input.resolveCall({ toolName: tc.toolName, args }) : null
      if (resolved && 'toolName' in resolved) { name = resolved.toolName; args = resolved.args }
      const verdict = guardToolInput(name, args, { disallowed: input.disallowedTools ?? new Set() })
      if (verdict.ok) args = verdict.args
      const key = `${name}:${stable(args)}`
      const pl: Planned = { tc, name, ...(name !== tc.toolName ? { via: tc.toolName } : {}), why, args, key, outcome: 'ok', started: now(), credits: 0 }
      const left = input.deadlineAt - now()
      if (resolved && 'refused' in resolved) {
        pl.outcome = 'blocked'
        pl.result = resolved.result
      } else if (!verdict.ok) {
        pl.outcome = 'blocked'
        pl.result = { error: verdict.reason, note: input.lang === 'en' ? 'This tool is not available to you. Continue without it.' : 'Công cụ này không dùng được. Tiếp tục mà không có nó.' }
      } else if (input.taskFrameOn && taskFrame && taskToolGate(taskFrame.kind, name, input.lang)) {
        // (An undeclared place search is NOT refused: measured eval round 2, 17/10 — a tool-call step usually carries no text, so the
        // declaration often arrives later; refusing made place_find turns answer without any search. The card gate covers the visible part.)
        // CONSULT_V3 task frame: a tool the declared task does not need (Maps for a recipe) is refused with a note; nothing runs, no credit spent.
        pl.outcome = 'blocked'
        pl.result = { error: 'task_gate', note: taskToolGate(taskFrame.kind, name, input.lang) }
        T.add('task', { decision: 'tool_gate', round, tool: name, task_kind: taskFrame.kind })
      } else if (CONTROL_TOOLS.has(name)) {
        pl.outcome = 'blocked'
        pl.result = { error: 'control_action_alone', note: input.lang === 'en' ? 'ask_user must be called alone.' : 'ask_user phải được gọi riêng.' }
      } else if (toolCalls >= L.maxToolCalls || left < L.finalReserveMs) {
        pl.outcome = 'budget'
        pl.result = { error: 'tool_budget_exhausted', note: input.lang === 'en' ? 'No more lookups this turn — answer from the data you have.' : 'Hết lượt tra cứu trong lượt này — trả lời từ dữ liệu đã có.' }
        unchecked.push(name)
        T.counters.budgetRefusals++
        T.add('budget', { round, decision: 'tool_refused', tool: name, reason: toolCalls >= L.maxToolCalls ? 'tool_budget' : 'time_budget', tool_calls: toolCalls, time_left_ms: left })
      } else if (seen.has(key)) {
        pl.outcome = 'duplicate'
        pl.result = { error: 'duplicate_call', note: input.lang === 'en' ? 'Same lookup already done this turn; use its result above.' : 'Đã tra cứu đúng như vậy trong lượt này; dùng kết quả ở trên.' }
        T.add('budget', { round, decision: 'duplicate_refused', tool: name })
      } else if (!input.tools[name]?.execute) {
        pl.outcome = 'unknown_tool'
        pl.result = { error: 'unknown_tool' }
      } else {
        toolCalls++
        seen.add(key)
        pl.args = input.prepareArgs ? input.prepareArgs(name, args) : args
      }
      T.add('tool_call', { round, tool: name, ...(pl.via ? { via: pl.via } : {}), ...(resolved && 'refused' in resolved ? { refused: resolved.refused } : {}), admitted: pl.outcome === 'ok', outcome_planned: pl.outcome, input_hash: toolInputHash(name, pl.args), query: traceQuery(pl.args), why: why ? why.slice(0, 80) : null })
      statusTrace(round, name, 'proposed', { ...(pl.via ? { via: pl.via } : {}), planned: pl.outcome })
      planned.push(pl)
    }

    // Phase 2: admitted calls run — read-only ones concurrently, side-effect ones one by one — each cancellable on its own.
    const execute = async (pl: Planned) => {
      const tool = input.tools[pl.name]
      input.onToolStart?.({ ...pl.tc, toolName: pl.name, args: pl.args })
      pl.started = now()
      const ownBudget = input.toolTimeouts?.[pl.name]
      const budgetMs = Math.max(1_000, Math.min(ownBudget ?? L.toolTimeoutMs, input.deadlineAt - now() - L.finalReserveMs))
      try {
        const r = await cancellable(signal => {
          const run = () => Promise.resolve(tool.execute!(pl.args, { toolCallId: pl.tc.toolCallId, messages: [], ...(ownBudget !== undefined ? { abortSignal: signal } : {}) }))
          return input.runTool ? input.runTool(pl.name, signal, run) : run().then(value => ({ value, credits: 0 }))
        }, budgetMs, input.signal)
        pl.result = r.value
        pl.credits = r.credits
      } catch (e) {
        const timedOut = e instanceof TimeoutError
        pl.outcome = timedOut ? 'timeout' : 'error'
        pl.error = e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200)
        // WS2: a failed lookup is a reason to try ANOTHER source when the fact is still needed (research iterates), not to give up —
        // measured WS-P1: search_products timed out and Luna, told only "say it is not checked", answered with a question.
        pl.result = { error: timedOut ? 'tool_timeout' : 'tool_failed', note: input.lang === 'en' ? 'This lookup failed. If you still need this fact, try another source or tool (e.g. web_search) — not the same call again; otherwise say this part is not checked.' : 'Tra cứu này lỗi. Nếu vẫn cần dữ kiện này, thử nguồn / công cụ khác (vd web_search) — không gọi lại đúng lệnh vừa lỗi; không được thì nói rõ phần này chưa kiểm tra được.' }
        unchecked.push(pl.name)
        if (timedOut) { T.counters.timeouts++; T.add('timeout', { round, scope: 'tool', tool: pl.name, ms: now() - pl.started, cancelled: true }) } else { T.counters.errors++; T.add('error', { round, scope: 'tool', tool: pl.name, message: (pl.error ?? '').slice(0, 120) }) }
      }
    }
    const runnable = planned.filter(pl => pl.outcome === 'ok')
    if (runnable.length) toolRounds++
    await Promise.all(runnable.filter(pl => !RUNTIME_SEQUENTIAL_TOOLS.has(pl.name)).map(execute))
    for (const pl of runnable.filter(pl => RUNTIME_SEQUENTIAL_TOOLS.has(pl.name))) await execute(pl)
    if (pendingCheck) {
      if ((await pendingCheck).aborted) return done('', 'aborted', 'aborted')
      pushAssistant()
    }

    // Phase 3 (model order): output guard, events, client frames, the model's tool message.
    const parts: Array<{ type: 'tool-result'; toolCallId: string; toolName: string; result: unknown }> = [...taskParts()]
    const roundStates: string[] = []
    for (const pl of planned) {
      const event: ToolEvent = { round, name: pl.name, args: pl.args, why: pl.why, ms: now() - pl.started, outcome: pl.outcome, ...(pl.error ? { error: pl.error } : {}) }
      toolEvents.push(event)
      statusTrace(round, pl.name, pl.outcome === 'ok' || pl.outcome === 'timeout' || pl.outcome === 'error' ? 'executed' : 'blocked', { outcome: pl.outcome })
      // (audit-only, masked) the call and what the tool returned — snippets vs page text can be told apart by the field names in the JSON
      if (auditTraceOn()) {
        let res = ''
        try { res = JSON.stringify(pl.result) ?? '' } catch { res = '[unserialisable]' }
        auditTrace('tool_result', 'tool_result', { round, tool: pl.name, outcome: pl.outcome, ms: event.ms, args: JSON.stringify(pl.args ?? {}).slice(0, 600), result: res.slice(0, 24000) })
      }
      // WS2 final: every result carries ONE explicit state (SUCCESS · EMPTY · TIMEOUT · ERROR · UNAVAILABLE) — a failure is never evidence.
      const state = toolStateOf(pl.outcome, pl.result)
      pl.result = withToolState(pl.result, state, input.lang)
      if (pl.outcome === 'ok' || pl.outcome === 'timeout' || pl.outcome === 'error') roundStates.push(String(state))
      // Phase 8 freshness: when the rows were really fetched and whether that still counts as "now" for this kind of data (freshness.ts).
      pl.result = withFreshness(pl.result, pl.name, pl.args, state, new Date(now()))
      const guarded = guardToolOutput(pl.result)
      T.counters.serperCredits += pl.credits
      T.add('tool_result', { round, tool: pl.name, outcome: pl.outcome, state, freshness: (pl.result as { freshness?: { status?: string } } | null)?.freshness?.status ?? null, ms: event.ms, credits: pl.credits, result_count: pl.outcome === 'ok' ? resultCount(pl.result) : 0, dropped_keys: guarded.stats.droppedKeys, cleaned_strings: guarded.stats.cleanedStrings, truncated: guarded.stats.truncated })
      if (pl.outcome === 'ok' || pl.outcome === 'timeout' || pl.outcome === 'error') input.onToolResult?.({ ...pl.tc, toolName: pl.name, args: pl.args }, guarded.forClient, event)
      parts.push({ type: 'tool-result', toolCallId: pl.tc.toolCallId, toolName: pl.tc.toolName, result: guarded.forModel })
    }
    messages.push({ role: 'tool', content: parts })
    if (roundStates.length) lastRoundStates = roundStates
  }
  // Unreachable in practice: the last round is always final. Kept as the loop's only other exit.
  return done('', 'model_error', 'model_error')
}
