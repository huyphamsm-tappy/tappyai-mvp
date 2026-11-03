// ── Bounded agent loop (TAPPY_AGENT) ───────────────────────────────────────────────────────────────────────────────────────
//
// Luna decides, code bounds. Each round is ONE model step whose tools are SCHEMAS ONLY; the model either answers (done) or names
// tool calls, which THIS loop executes — under a per-turn budget of 3 agent-level tool invocations, a per-tool timeout, a turn
// deadline, de-duplication and error capture — and feeds back. When the budget or the time runs out, the next step is forced
// to answer with NO tools and is told which parts could not be checked. There is no other way out of the loop.
//
// Rules this file enforces (each has a test in agent.test.ts):
//   · at most `maxToolCalls` executed tool invocations per turn; a further request is answered `tool_budget_exhausted`;
//   · the same tool with the same arguments is never executed twice in a turn;
//   · a tool that throws or times out becomes an error RESULT the model reads — the turn continues;
//   · a tool never sees the agent: it is given its arguments and a call id, nothing that could start another loop;
//   · the final step has no tools, so the turn always ends in text;
//   · the model's `why` (reason for the call) is kept for the trace and removed before the tool and before any client frame.
// Patterned on the public OpenAI Agents SDK loop (call model → run tools → feed results → repeat until a final output or the
// turn limit) but with the limit turned from an error into a forced, honest final answer.

import type { CoreMessage } from 'ai'
import { guardToolInput, guardToolOutput } from './guards'

/** Tools that must never run concurrently with others (they change application state). */
export const SEQUENTIAL_TOOLS: ReadonlySet<string> = new Set(['request_action'])

export const AGENT_LIMITS = {
  /** Agent-level tool invocations per turn. */
  maxToolCalls: 3,
  /** One tool invocation. */
  toolTimeoutMs: 15_000,
  /** One model step. */
  stepTimeoutMs: 30_000,
  /** Time kept back for the forced final answer: below this, no further tool is run. */
  finalReserveMs: 20_000,
  /** Serper credits ONE tool invocation may spend inside (provider fan-out, serperToolBudget.ts). */
  serperCreditsPerTool: 8,
} as const
export type AgentLimits = { -readonly [K in keyof typeof AGENT_LIMITS]: number }

export interface AgentToolCall { toolCallId: string; toolName: string; args: Record<string, unknown> }
export interface AgentStep {
  text: string
  toolCalls: AgentToolCall[]
  finishReason: string
  usage?: { promptTokens: number; completionTokens: number }
  providerMetadata?: Record<string, unknown>
}
export interface AgentExecutableTool { execute?: (args: Record<string, unknown>, ctx: { toolCallId: string; messages: CoreMessage[] }) => unknown }

export type ToolOutcome = 'ok' | 'error' | 'timeout' | 'duplicate' | 'budget' | 'unknown_tool' | 'blocked'
export interface ToolEvent { round: number; name: string; args: Record<string, unknown>; why: string | null; ms: number; outcome: ToolOutcome; error?: string }
export type AgentStatus = 'answered' | 'answered_after_tool_budget' | 'answered_after_time_budget' | 'model_error' | 'aborted'

export interface AgentRunInput {
  system: string
  messages: CoreMessage[]
  /** Executable tools (production logic). */
  tools: Record<string, AgentExecutableTool>
  /** What the model sees: the same tools as schemas (no execute). */
  schemas: Record<string, unknown>
  callModel: (o: { system: string; messages: CoreMessage[]; tools?: Record<string, unknown>; final: boolean; signal: AbortSignal }) => Promise<AgentStep>
  /** Called after each tool call resolves (client frames: `9:` + `a:`). `args` has no `why`. */
  onToolResult?: (call: AgentToolCall, result: unknown, event: ToolEvent) => void
  /** Called right before a tool runs (progress frame). */
  onToolStart?: (call: AgentToolCall) => void
  /** Deterministic argument guard (private-data cut, code-resolved dates). */
  prepareArgs?: (name: string, args: Record<string, unknown>) => Record<string, unknown>
  /** Tool names the model may never execute (side-effect tools): the input guard refuses them even if a schema slipped through. */
  disallowedTools?: ReadonlySet<string>
  /** Wraps one tool invocation (the Serper fan-out cap). */
  runTool?: <T>(name: string, fn: () => Promise<T>) => Promise<T>
  deadlineAt: number
  limits?: Partial<AgentLimits>
  now?: () => number
  signal?: AbortSignal
  lang: string
}

export interface AgentRun {
  text: string
  status: AgentStatus
  steps: AgentStep[]
  toolEvents: ToolEvent[]
  modelCalls: number
  toolCalls: number
  /** Why the loop stopped calling tools: the model answered, or which budget ran out. */
  stopReason: 'model_answered' | 'tool_budget' | 'time_budget' | 'model_error' | 'aborted'
}

const stable = (v: unknown): string => {
  if (v === null || typeof v !== 'object') return typeof v === 'string' ? JSON.stringify(v.trim().toLowerCase()) : JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  return `{${Object.keys(v as Record<string, unknown>).sort().map(k => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`
}

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    p.finally(() => clearTimeout(t)),
    new Promise<never>((_, reject) => { t = setTimeout(() => { onTimeout?.(); reject(new Error('timeout')) }, Math.max(1, ms)) }),
  ])
}

export function finalStepNote(reason: 'tool_budget' | 'time_budget', lang: string, unchecked: string[]): string {
  const vi = reason === 'tool_budget'
    ? 'Lượt này đã dùng hết số lần tra cứu cho phép.'
    : 'Lượt này đã hết thời gian tra cứu.'
  const en = reason === 'tool_budget' ? 'This turn has used all of its lookups.' : 'This turn has run out of lookup time.'
  const list = unchecked.length ? (lang === 'en' ? ` Not checked: ${unchecked.join('; ')}.` : ` Chưa kiểm tra được: ${unchecked.join('; ')}.`) : ''
  return lang === 'en'
    ? `\n\n===== FINAL ANSWER NOW =====\n${en}${list} Answer now from the data you already have. Say plainly which parts are not checked yet. Never fill a gap from memory.`
    : `\n\n===== TRẢ LỜI NGAY =====\n${vi}${list} Trả lời ngay từ dữ liệu đã có. Nói rõ phần nào chưa kiểm tra được. Không lấp chỗ trống bằng phỏng đoán.`
}

const FALLBACK = (lang: string) => lang === 'en'
  ? "Sorry — I couldn't finish that just now. Please try again in a moment."
  : 'Xin lỗi, mình chưa trả lời được lúc này. Bạn thử lại sau ít phút nhé.'

export async function runBoundedAgent(input: AgentRunInput): Promise<AgentRun> {
  const L: AgentLimits = { ...AGENT_LIMITS, ...(input.limits ?? {}) }
  const now = input.now ?? Date.now
  const messages: CoreMessage[] = [...input.messages]
  const steps: AgentStep[] = []
  const toolEvents: ToolEvent[] = []
  const seen = new Map<string, unknown>()
  let toolCalls = 0
  let modelCalls = 0
  const unchecked: string[] = []

  const done = (text: string, status: AgentStatus, stopReason: AgentRun['stopReason']): AgentRun =>
    ({ text: text.trim() || FALLBACK(input.lang), status, steps, toolEvents, modelCalls, toolCalls, stopReason })

  // Hard cap on rounds: one per allowed tool call + the forced final step + one retry for an empty answer.
  for (let round = 0; round < L.maxToolCalls + 3; round++) {
    if (input.signal?.aborted) return done('', 'aborted', 'aborted')
    const timeLeft = input.deadlineAt - now()
    const outOfTools = toolCalls >= L.maxToolCalls
    const outOfTime = timeLeft < L.finalReserveMs
    const lastChance = round >= L.maxToolCalls + 1
    const final = outOfTools || outOfTime || lastChance
    const reason: 'tool_budget' | 'time_budget' = outOfTime ? 'time_budget' : 'tool_budget'
    const ctrl = new AbortController()
    const onAbort = () => ctrl.abort()
    input.signal?.addEventListener('abort', onAbort, { once: true })
    let step: AgentStep
    try {
      modelCalls++
      step = await withTimeout(input.callModel({
        system: final && (outOfTools || outOfTime) ? input.system + finalStepNote(reason, input.lang, unchecked) : input.system,
        messages,
        tools: final ? undefined : input.schemas,
        final,
        signal: ctrl.signal,
      }), Math.min(L.stepTimeoutMs, Math.max(5_000, timeLeft - 1_000)), () => ctrl.abort())
    } catch (e) {
      input.signal?.removeEventListener('abort', onAbort)
      if (input.signal?.aborted) return done('', 'aborted', 'aborted')
      // A failed step after tools ran: one forced final attempt is still worth it; a failed final attempt ends the turn.
      if (!final && toolCalls > 0) { unchecked.push(input.lang === 'en' ? 'the last step failed' : 'bước cuối bị lỗi'); continue }
      return done('', 'model_error', 'model_error')
    }
    input.signal?.removeEventListener('abort', onAbort)
    steps.push(step)

    if (final) {
      const status: AgentStatus = outOfTime ? 'answered_after_time_budget' : outOfTools ? 'answered_after_tool_budget' : 'answered'
      return done(step.text, status, outOfTime ? 'time_budget' : outOfTools ? 'tool_budget' : 'model_answered')
    }
    if (step.toolCalls.length === 0) {
      if (step.text.trim()) return done(step.text, 'answered', 'model_answered')
      continue // empty answer with no call: next round is a forced-final retry at most once more (lastChance)
    }

    messages.push({
      role: 'assistant',
      content: [
        ...(step.text.trim() ? [{ type: 'text' as const, text: step.text }] : []),
        ...step.toolCalls.map(tc => ({ type: 'tool-call' as const, toolCallId: tc.toolCallId, toolName: tc.toolName, args: stripWhy(tc.args) })),
      ],
    })
    // Phase 1 (sequential, deterministic): input guard, budget, dedupe, allow-list — each call gets its outcome or a reserved slot.
    type Planned = { tc: AgentToolCall; why: string | null; args: Record<string, unknown>; key: string; outcome: ToolOutcome; result?: unknown; error?: string; started: number }
    const planned: Planned[] = []
    for (const tc of step.toolCalls) {
      const why = typeof tc.args?.why === 'string' ? (tc.args.why as string).slice(0, 160) : null
      let args = stripWhy(tc.args)
      const verdict = guardToolInput(tc.toolName, args, { disallowed: input.disallowedTools ?? new Set() })
      if (verdict.ok) args = verdict.args
      const key = `${tc.toolName}:${stable(args)}`
      const tool = input.tools[tc.toolName]
      const pl: Planned = { tc, why, args, key, outcome: 'ok', started: now() }
      if (!verdict.ok) {
        pl.outcome = 'blocked'
        pl.result = { error: verdict.reason, note: input.lang === 'en' ? 'This tool is not available to you. Continue without it.' : 'Công cụ này không dùng được. Tiếp tục mà không có nó.' }
      } else if (toolCalls >= L.maxToolCalls || input.deadlineAt - now() < L.finalReserveMs) {
        pl.outcome = 'budget'
        pl.result = { error: 'tool_budget_exhausted', note: input.lang === 'en' ? 'No more lookups this turn — answer from the data you have.' : 'Hết lượt tra cứu trong lượt này — trả lời từ dữ liệu đã có.' }
        unchecked.push(`${tc.toolName}`)
      } else if (seen.has(key)) {
        pl.outcome = 'duplicate'
        pl.result = { error: 'duplicate_call', note: input.lang === 'en' ? 'Same lookup already done this turn; use its result above.' : 'Đã tra cứu đúng như vậy trong lượt này; dùng kết quả ở trên.' }
      } else if (!tool?.execute) {
        pl.outcome = 'unknown_tool'
        pl.result = { error: 'unknown_tool' }
      } else {
        toolCalls++
        seen.set(key, true) // reserved now, so a same-step duplicate is refused before anything runs
        pl.args = input.prepareArgs ? input.prepareArgs(tc.toolName, args) : args
      }
      planned.push(pl)
    }
    // Phase 2: the reserved calls run — read-only tools concurrently (each already counted against the turn budget), sequential tools one by one.
    const execute = async (pl: Planned) => {
      const tool = input.tools[pl.tc.toolName]
      input.onToolStart?.({ ...pl.tc, args: pl.args })
      pl.started = now()
      try {
        const run = () => Promise.resolve(tool.execute!(pl.args, { toolCallId: pl.tc.toolCallId, messages: [] }))
        pl.result = await withTimeout(input.runTool ? input.runTool(pl.tc.toolName, run) : run(), L.toolTimeoutMs)
      } catch (e) {
        const timedOut = e instanceof Error && e.message === 'timeout'
        pl.outcome = timedOut ? 'timeout' : 'error'
        pl.error = e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200)
        pl.result = { error: timedOut ? 'tool_timeout' : 'tool_failed', note: input.lang === 'en' ? 'This lookup failed; say this part is not checked.' : 'Tra cứu này lỗi; nói rõ phần này chưa kiểm tra được.' }
        unchecked.push(pl.tc.toolName)
      }
    }
    const runnable = planned.filter(pl => pl.outcome === 'ok')
    await Promise.all(runnable.filter(pl => !SEQUENTIAL_TOOLS.has(pl.tc.toolName)).map(execute))
    for (const pl of runnable.filter(pl => SEQUENTIAL_TOOLS.has(pl.tc.toolName))) await execute(pl)
    // Phase 3 (model order): output guard, trace event, client frames, the model's tool message.
    const parts: Array<{ type: 'tool-result'; toolCallId: string; toolName: string; result: unknown }> = []
    for (const pl of planned) {
      const event: ToolEvent = { round, name: pl.tc.toolName, args: pl.args, why: pl.why, ms: now() - pl.started, outcome: pl.outcome, ...(pl.error ? { error: pl.error } : {}) }
      toolEvents.push(event)
      // Tool OUTPUT guard: credential keys out of both copies; the model reads cleaned, size-capped, fenced DATA.
      const guarded = guardToolOutput(pl.result)
      input.onToolResult?.({ ...pl.tc, args: pl.args }, guarded.forClient, event)
      parts.push({ type: 'tool-result', toolCallId: pl.tc.toolCallId, toolName: pl.tc.toolName, result: guarded.forModel })
    }
    messages.push({ role: 'tool', content: parts })
  }
  return done('', 'model_error', 'model_error')
}

export function stripWhy(args: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!args || typeof args !== 'object') return {}
  const { why: _why, ...rest } = args
  return rest
}
