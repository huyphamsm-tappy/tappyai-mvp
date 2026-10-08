// ── Phase 8 agent runtime (TAPPY_AGENT=2) — the loop ───────────────────────────────────────────────────────────────────────
//
//   conversation → Luna step → ANSWER | ASK (ask_user) | TOOLS → results → Luna step ("đủ chưa?") → … → RESPOND
//
// Luna decides every branch; this loop only executes, bounds and records. One round = one model step (tools are schemas only). The
// model answers (done), asks (done — the reply is its question), or names tool calls, which the loop runs under the guards and
// budgets and feeds back. It may iterate — search, read the result, search again — until it answers or a ceiling forces the final
// step, which has NO tools and is told which parts could not be checked.
//
// Ceilings (limits.ts): model rounds ≤ 6 · tool calls ≤ 8 · Serper ≤ 12/15 (enforced in serperAdmit by the turn scope the caller
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
import { ASK_USER, CONTROL_TOOLS, parseAskUser, renderAsk, type AskUser } from './controlTools'
import { toolInputHash, traceQuery, resultCount, type AgentRunTrace } from './trace'

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

  const done = (text: string, status: RuntimeStatus, stopReason: RuntimeStop, ask: AskUser | null = null): RuntimeRun => {
    T.status = status
    T.stopReason = stopReason
    T.counters.toolCalls = toolCalls
    return { text: text.trim() || FALLBACK(input.lang), status, stopReason, steps, toolEvents, modelCalls, toolCalls, ask }
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
    const system = final ? input.system + finalStepNote(noteReason, input.lang, unchecked) : input.system
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

    // ASK: Luna decided a missing piece changes the decision. The question IS the reply; nothing else of this step runs.
    if (askCall) {
      const ask = parseAskUser(stripWhy(askCall.args))
      const others = calls.filter(c => c !== askCall).map(c => c.toolName)
      if (ask) {
        if (others.length) T.add('budget', { round, decision: 'ask_preempts_tools', dropped: others })
        T.add('ask', { round, choices: ask.choices.length, chars: ask.question.length })
        return done(renderAsk(ask), 'asked', 'asked', ask)
      }
      T.add('error', { round, scope: 'ask_user', message: 'invalid_question' })
      T.counters.errors++
    }
    const toolCallsThisStep = calls.filter(c => c.toolName !== ASK_USER)
    if (toolCallsThisStep.length === 0) {
      if (step.text.trim()) return done(step.text, 'answered', 'model_answered')
      forceFinal = 'model_error' // an empty step with no call: the next one is the final, tool-less attempt
      continue
    }

    messages.push({
      role: 'assistant',
      content: [
        ...(step.text.trim() ? [{ type: 'text' as const, text: step.text }] : []),
        ...toolCallsThisStep.map(tc => ({ type: 'tool-call' as const, toolCallId: tc.toolCallId, toolName: tc.toolName, args: stripWhy(tc.args) })),
      ],
    })

    // Phase 1 (sequential, deterministic): input guard, budgets, dedupe, allow-list.
    type Planned = { tc: AgentToolCall; why: string | null; args: Record<string, unknown>; key: string; outcome: ToolEvent['outcome']; result?: unknown; error?: string; started: number; credits: number }
    const planned: Planned[] = []
    for (const tc of toolCallsThisStep) {
      const why = typeof tc.args?.why === 'string' ? (tc.args.why as string).slice(0, 160) : null
      let args = stripWhy(tc.args)
      const verdict = guardToolInput(tc.toolName, args, { disallowed: input.disallowedTools ?? new Set() })
      if (verdict.ok) args = verdict.args
      const key = `${tc.toolName}:${stable(args)}`
      const pl: Planned = { tc, why, args, key, outcome: 'ok', started: now(), credits: 0 }
      const left = input.deadlineAt - now()
      if (!verdict.ok) {
        pl.outcome = 'blocked'
        pl.result = { error: verdict.reason, note: input.lang === 'en' ? 'This tool is not available to you. Continue without it.' : 'Công cụ này không dùng được. Tiếp tục mà không có nó.' }
      } else if (CONTROL_TOOLS.has(tc.toolName)) {
        pl.outcome = 'blocked'
        pl.result = { error: 'control_action_alone', note: input.lang === 'en' ? 'ask_user must be called alone.' : 'ask_user phải được gọi riêng.' }
      } else if (toolCalls >= L.maxToolCalls || left < L.finalReserveMs) {
        pl.outcome = 'budget'
        pl.result = { error: 'tool_budget_exhausted', note: input.lang === 'en' ? 'No more lookups this turn — answer from the data you have.' : 'Hết lượt tra cứu trong lượt này — trả lời từ dữ liệu đã có.' }
        unchecked.push(tc.toolName)
        T.counters.budgetRefusals++
        T.add('budget', { round, decision: 'tool_refused', tool: tc.toolName, reason: toolCalls >= L.maxToolCalls ? 'tool_budget' : 'time_budget', tool_calls: toolCalls, time_left_ms: left })
      } else if (seen.has(key)) {
        pl.outcome = 'duplicate'
        pl.result = { error: 'duplicate_call', note: input.lang === 'en' ? 'Same lookup already done this turn; use its result above.' : 'Đã tra cứu đúng như vậy trong lượt này; dùng kết quả ở trên.' }
        T.add('budget', { round, decision: 'duplicate_refused', tool: tc.toolName })
      } else if (!input.tools[tc.toolName]?.execute) {
        pl.outcome = 'unknown_tool'
        pl.result = { error: 'unknown_tool' }
      } else {
        toolCalls++
        seen.add(key)
        pl.args = input.prepareArgs ? input.prepareArgs(tc.toolName, args) : args
      }
      T.add('tool_call', { round, tool: tc.toolName, admitted: pl.outcome === 'ok', outcome_planned: pl.outcome, input_hash: toolInputHash(tc.toolName, pl.args), query: traceQuery(pl.args), why: why ? why.slice(0, 80) : null })
      planned.push(pl)
    }

    // Phase 2: admitted calls run — read-only ones concurrently, side-effect ones one by one — each cancellable on its own.
    const execute = async (pl: Planned) => {
      const tool = input.tools[pl.tc.toolName]
      input.onToolStart?.({ ...pl.tc, args: pl.args })
      pl.started = now()
      const budgetMs = Math.max(1_000, Math.min(L.toolTimeoutMs, input.deadlineAt - now() - L.finalReserveMs))
      try {
        const r = await cancellable(signal => {
          const run = () => Promise.resolve(tool.execute!(pl.args, { toolCallId: pl.tc.toolCallId, messages: [] }))
          return input.runTool ? input.runTool(pl.tc.toolName, signal, run) : run().then(value => ({ value, credits: 0 }))
        }, budgetMs, input.signal)
        pl.result = r.value
        pl.credits = r.credits
      } catch (e) {
        const timedOut = e instanceof TimeoutError
        pl.outcome = timedOut ? 'timeout' : 'error'
        pl.error = e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200)
        pl.result = { error: timedOut ? 'tool_timeout' : 'tool_failed', note: input.lang === 'en' ? 'This lookup failed; say this part is not checked.' : 'Tra cứu này lỗi; nói rõ phần này chưa kiểm tra được.' }
        unchecked.push(pl.tc.toolName)
        if (timedOut) { T.counters.timeouts++; T.add('timeout', { round, scope: 'tool', tool: pl.tc.toolName, ms: now() - pl.started, cancelled: true }) } else { T.counters.errors++; T.add('error', { round, scope: 'tool', tool: pl.tc.toolName, message: (pl.error ?? '').slice(0, 120) }) }
      }
    }
    const runnable = planned.filter(pl => pl.outcome === 'ok')
    await Promise.all(runnable.filter(pl => !RUNTIME_SEQUENTIAL_TOOLS.has(pl.tc.toolName)).map(execute))
    for (const pl of runnable.filter(pl => RUNTIME_SEQUENTIAL_TOOLS.has(pl.tc.toolName))) await execute(pl)

    // Phase 3 (model order): output guard, events, client frames, the model's tool message.
    const parts: Array<{ type: 'tool-result'; toolCallId: string; toolName: string; result: unknown }> = []
    for (const pl of planned) {
      const event: ToolEvent = { round, name: pl.tc.toolName, args: pl.args, why: pl.why, ms: now() - pl.started, outcome: pl.outcome, ...(pl.error ? { error: pl.error } : {}) }
      toolEvents.push(event)
      const guarded = guardToolOutput(pl.result)
      T.counters.serperCredits += pl.credits
      T.add('tool_result', { round, tool: pl.tc.toolName, outcome: pl.outcome, ms: event.ms, credits: pl.credits, result_count: pl.outcome === 'ok' ? resultCount(pl.result) : 0, dropped_keys: guarded.stats.droppedKeys, cleaned_strings: guarded.stats.cleanedStrings, truncated: guarded.stats.truncated })
      if (pl.outcome === 'ok' || pl.outcome === 'timeout' || pl.outcome === 'error') input.onToolResult?.({ ...pl.tc, args: pl.args }, guarded.forClient, event)
      parts.push({ type: 'tool-result', toolCallId: pl.tc.toolCallId, toolName: pl.tc.toolName, result: guarded.forModel })
    }
    messages.push({ role: 'tool', content: parts })
  }
  // Unreachable in practice: the last round is always final. Kept as the loop's only other exit.
  return done('', 'model_error', 'model_error')
}
