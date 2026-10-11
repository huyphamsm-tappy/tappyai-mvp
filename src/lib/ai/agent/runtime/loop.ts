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

export type RuntimeStatus = 'answered' | 'asked' | 'answered_after_tool_budget' | 'answered_after_round_budget' | 'answered_after_time_budget' | 'model_error' | 'aborted'
export type RuntimeStop = 'model_answered' | 'asked' | 'tool_budget' | 'round_budget' | 'time_budget' | 'model_error' | 'aborted'

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
  callModel: (o: { system: string; messages: CoreMessage[]; tools?: Record<string, unknown>; final: boolean; signal: AbortSignal }) => Promise<RuntimeStep>
  /** Runs one tool invocation under `signal` (the Serper scope + cancellation); returns the value and the Serper credits it spent. */
  runTool?: <T>(name: string, signal: AbortSignal, fn: () => Promise<T>) => Promise<{ value: T; credits: number }>
  onToolStart?: (call: AgentToolCall) => void
  onToolResult?: (call: AgentToolCall, guardedForClient: unknown, event: ToolEvent) => void
  prepareArgs?: (name: string, args: Record<string, unknown>) => Record<string, unknown>
  disallowedTools?: ReadonlySet<string>
  deadlineAt: number
  limits?: Partial<RuntimeLimits>
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
  refuseAsk?: (a: AskUser) => string | null
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
  let taskUpdates = 0
  // Text the model wrote next to a lookup / an ask, or the check wrote before a lookup: kept and shown BEFORE the rest of the answer.
  const prefaces: string[] = []
  let answerFirst: RuntimeRun['answerFirst'] = 'n/a'
  let askRefusals = 0

  const done = (text: string, status: RuntimeStatus, stopReason: RuntimeStop, ask: AskUser | null = null): RuntimeRun => {
    T.status = status
    T.stopReason = stopReason
    T.counters.toolCalls = toolCalls
    return { text: composeFinal(prefaces, text) || FALLBACK(input.lang), status, stopReason, steps, toolEvents, modelCalls, toolCalls, ask, answerFirst }
  }

  for (let round = 1; round <= L.maxModelRounds; round++) {
    if (input.signal?.aborted) return done('', 'aborted', 'aborted')
    const timeLeft = input.deadlineAt - now()
    if (timeLeft < L.minStepMs) {
      T.add('budget', { round, decision: 'no_time_for_a_model_step', time_left_ms: timeLeft })
      return done('', 'answered_after_time_budget', 'time_budget')
    }
    // Why this step must be the final one (precedence: time > tools > rounds > an earlier failure).
    const reason: RuntimeStop | null =
      timeLeft < L.finalReserveMs ? 'time_budget'
        : toolCalls >= L.maxToolCalls ? 'tool_budget'
          : round === L.maxModelRounds ? 'round_budget'
            : forceFinal
    const final = reason !== null
    if (final && reason !== forceFinal) T.add('budget', { round, decision: 'force_final', reason, tool_calls: toolCalls, time_left_ms: timeLeft })
    const noteReason = reason === 'time_budget' ? 'time_budget' : 'tool_budget'
    const note = !final && input.stepNote ? input.stepNote({ round, toolEvents }) : null
    if (note) T.add('budget', { round, decision: 'research_nudge' })
    const base = prefaces.length ? input.system + prefaceNote(input.lang, prefaces) : input.system
    const system = final ? base + finalStepNote(noteReason, input.lang, unchecked) : note ? base + note : base
    const t0 = now()
    let step: RuntimeStep
    try {
      modelCalls++
      step = await cancellable(signal => input.callModel({ system, messages, tools: final ? undefined : input.schemas, final, signal }), Math.min(L.stepTimeoutMs, timeLeft - 500), input.signal)
    } catch (e) {
      if (input.signal?.aborted) return done('', 'aborted', 'aborted')
      const timedOut = e instanceof TimeoutError
      if (timedOut) { T.counters.timeouts++; T.add('timeout', { round, scope: 'model', ms: now() - t0, cancelled: true }) } else { T.counters.errors++; T.add('error', { round, scope: 'model', message: String(e instanceof Error ? e.message : e).slice(0, 120) }) }
      T.counters.modelRounds++
      // A failed step: if a final attempt is still possible, make the next step the final one (no tools); otherwise end honestly.
      if (!final) { forceFinal = 'model_error'; unchecked.push(input.lang === 'en' ? 'the last step failed' : 'bước cuối bị lỗi'); continue }
      return done('', 'model_error', timedOut ? 'time_budget' : 'model_error')
    }
    steps.push(step)
    const meta = (step.providerMetadata?.tappy ?? {}) as { cost?: { usd?: number }; fellBack?: boolean; primaryAborted?: boolean; fallbackReason?: string }
    const calls = final ? [] : step.toolCalls
    const askCall = calls.find(c => c.toolName === ASK_USER)
    const decision = final ? 'final_answer' : askCall ? 'ask' : calls.length ? 'tools' : step.text.trim() ? 'answer' : 'empty'
    T.modelRound({ round, final, ms: now() - t0, decision, toolCalls: calls.length, promptTokens: step.usage?.promptTokens, completionTokens: step.usage?.completionTokens, usd: Number(meta.cost?.usd ?? 0), fellBack: meta.fellBack, primaryAborted: meta.primaryAborted, fallbackReason: meta.fallbackReason, modelId: step.modelId, finishReason: step.finishReason })

    if (final) {
      const status: RuntimeStatus = reason === 'time_budget' ? 'answered_after_time_budget' : reason === 'tool_budget' ? 'answered_after_tool_budget' : reason === 'round_budget' ? 'answered_after_round_budget' : 'answered'
      return done(step.text, status, reason === 'model_error' || reason === null ? 'model_answered' : reason)
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
      const refusal = ask && input.refuseAsk && askRefusals < 2 && others.length === 0 ? input.refuseAsk(ask) : null
      if (ask && refusal) {
        askRefusals++
        T.add('ask', { round, decision: 'refused', refusals: askRefusals })
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
    if (toolCallsThisStep.length === 0) {
      if (step.text.trim()) return done(step.text, 'answered', 'model_answered')
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
      prefaces.push(step.text)
      if (answerFirst === 'n/a') answerFirst = 'with_step'
    } else if (answerFirst === 'n/a' && prefaces.length === 0 && toolCalls === 0) {
      const names = toolCallsThisStep.map(tc => { const r = input.resolveCall?.({ toolName: tc.toolName, args: stripWhy(tc.args) }); return r && 'toolName' in r ? r.toolName : tc.toolName })
      if (checkApplies(names)) {
        const left = input.deadlineAt - now()
        if (!input.answerFirstModel) answerFirst = 'not_checked'
        else if (left > L.finalReserveMs + 6_000) {
          const c0 = now()
          try {
            modelCalls++
            const r = await cancellable(signal => input.answerFirstModel!({ system: input.system + checkNote(toolCallsThisStep, input.lang), messages, signal }), Math.min(L.stepTimeoutMs, left - L.finalReserveMs - 2_000), input.signal)
            const kept = parseCheck(r.text)
            T.modelRound({ round, final: false, ms: now() - c0, decision: 'answer_first_check', toolCalls: 0, promptTokens: r.promptTokens, completionTokens: r.completionTokens, usd: r.usd })
            if (kept) { prefaces.push(kept); answerFirst = 'provided' } else answerFirst = 'nothing_yet'
            T.add('answer_first', { round, outcome: answerFirst, chars: kept ? kept.length : 0, ms: now() - c0 })
          } catch (e) {
            if (input.signal?.aborted) return done('', 'aborted', 'aborted')
            answerFirst = 'failed'
            T.counters.errors++
            T.add('error', { round, scope: 'answer_first', message: String(e instanceof Error ? e.message : e).slice(0, 120) })
          }
        }
      }
    }

    messages.push({
      role: 'assistant',
      content: [
        ...(step.text.trim() ? [{ type: 'text' as const, text: step.text }] : prefaces.length && answerFirst === 'provided' ? [{ type: 'text' as const, text: prefaces[prefaces.length - 1] }] : []),
        ...taskCallParts(),
        ...toolCallsThisStep.map(tc => ({ type: 'tool-call' as const, toolCallId: tc.toolCallId, toolName: tc.toolName, args: stripWhy(tc.args) })),
      ],
    })

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
      planned.push(pl)
    }

    // Phase 2: admitted calls run — read-only ones concurrently, side-effect ones one by one — each cancellable on its own.
    const execute = async (pl: Planned) => {
      const tool = input.tools[pl.name]
      input.onToolStart?.({ ...pl.tc, toolName: pl.name, args: pl.args })
      pl.started = now()
      const budgetMs = Math.max(1_000, Math.min(L.toolTimeoutMs, input.deadlineAt - now() - L.finalReserveMs))
      try {
        const r = await cancellable(signal => {
          const run = () => Promise.resolve(tool.execute!(pl.args, { toolCallId: pl.tc.toolCallId, messages: [] }))
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
    await Promise.all(runnable.filter(pl => !RUNTIME_SEQUENTIAL_TOOLS.has(pl.name)).map(execute))
    for (const pl of runnable.filter(pl => RUNTIME_SEQUENTIAL_TOOLS.has(pl.name))) await execute(pl)

    // Phase 3 (model order): output guard, events, client frames, the model's tool message.
    const parts: Array<{ type: 'tool-result'; toolCallId: string; toolName: string; result: unknown }> = [...taskParts()]
    for (const pl of planned) {
      const event: ToolEvent = { round, name: pl.name, args: pl.args, why: pl.why, ms: now() - pl.started, outcome: pl.outcome, ...(pl.error ? { error: pl.error } : {}) }
      toolEvents.push(event)
      // WS2 final: every result carries ONE explicit state (SUCCESS · EMPTY · TIMEOUT · ERROR · UNAVAILABLE) — a failure is never evidence.
      const state = toolStateOf(pl.outcome, pl.result)
      pl.result = withToolState(pl.result, state, input.lang)
      // Phase 8 freshness: when the rows were really fetched and whether that still counts as "now" for this kind of data (freshness.ts).
      pl.result = withFreshness(pl.result, pl.name, pl.args, state, new Date(now()))
      const guarded = guardToolOutput(pl.result)
      T.counters.serperCredits += pl.credits
      T.add('tool_result', { round, tool: pl.name, outcome: pl.outcome, state, freshness: (pl.result as { freshness?: { status?: string } } | null)?.freshness?.status ?? null, ms: event.ms, credits: pl.credits, result_count: pl.outcome === 'ok' ? resultCount(pl.result) : 0, dropped_keys: guarded.stats.droppedKeys, cleaned_strings: guarded.stats.cleanedStrings, truncated: guarded.stats.truncated })
      if (pl.outcome === 'ok' || pl.outcome === 'timeout' || pl.outcome === 'error') input.onToolResult?.({ ...pl.tc, toolName: pl.name, args: pl.args }, guarded.forClient, event)
      parts.push({ type: 'tool-result', toolCallId: pl.tc.toolCallId, toolName: pl.tc.toolName, result: guarded.forModel })
    }
    messages.push({ role: 'tool', content: parts })
  }
  // Unreachable in practice: the last round is always final. Kept as the loop's only other exit.
  return done('', 'model_error', 'model_error')
}
