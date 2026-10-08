// ── Phase 8 agent runtime (TAPPY_AGENT=2) — one turn ──────────────────────────────────────────────────────────────────────
//
// OFF unless the server env TAPPY_AGENT is exactly '2'. '1' keeps the Phase 7 bounded agent; unset keeps the legacy Consultative path
// (what production runs). Rollback = an env change.
//
// Reuses the production tool surface unchanged (route tools + the Phase 7 agent tools: films, trip bundle, request_action), the
// trust-split context (agentContext), the output guards and the AI-SDK stream adapter — so Card / Make Plan / Map / Actions and the
// stream guards see exactly what they see today. New here: the runtime loop (ceilings, ask_user, cancellation), the `agent` model role
// (same Luna model, its own timeout + abort-before-retry) and the per-run trace.

import type { CoreMessage } from 'ai'
import { AI } from '@/lib/ai/llm'
import type { ModelRole } from '@/lib/ai/llm/types'
import { withSerperTurnBudget, withSerperToolScope } from '@/lib/ai/tools/serperToolBudget'
import { searchingFrame } from '@/lib/recommendation/progressAnnotation'
import { redactForTrace, guardToolOutput } from '../guards'
import { buildAgentTools, statePatchFrom, TRIP_PART_CREDITS, type AgentTurnInput } from '../index'
import { toModelSchemas, SIDE_EFFECT_TOOLS } from '../agentTools'
import { AGENT_SYSTEM_EN_NOTE } from '../prompt'
import { agentStreamResult, type AgentStreamResult } from '../dataStream'
import { runAgentRuntime, type RuntimeStep } from './loop'
import { RUNTIME_LIMITS } from './limits'
import { ASK_USER, askUserTool } from './controlTools'
import { AGENT_SYSTEM_V2 } from './prompt'
import type { AgentRunTrace } from './trace'

export const agentRuntimeV2Enabled = (env: Record<string, string | undefined> = process.env): boolean => env.TAPPY_AGENT === '2'

export interface RuntimeTurnInput extends Omit<AgentTurnInput, 'callModel'> {
  trace: AgentRunTrace
  /** Test seam: replace the model step. */
  callModel?: Parameters<typeof runAgentRuntime>[0]['callModel']
}

export function startAgentRuntimeTurn(i: RuntimeTurnInput): AgentStreamResult {
  let emitLine: (line: string) => void = () => {}
  let subN = 0
  const tools = buildAgentTools(i, (name, args, result) => {
    const id = `sub_${Date.now().toString(36)}_${subN++}`
    emitLine(`9:${JSON.stringify({ toolCallId: id, toolName: name, args })}`)
    emitLine(`a:${JSON.stringify({ toolCallId: id, result: guardToolOutput(result).forClient })}`)
  })
  // The control action is offered on every non-final step, even on a plan-only turn that gets no retrieval tool.
  const schemas = { ...toModelSchemas(tools), ...toModelSchemas({ [ASK_USER]: askUserTool() as never }) }
  const system = i.context.system + (i.lang === 'en' ? AGENT_SYSTEM_EN_NOTE : '')
  const messages: CoreMessage[] = (() => {
    if (!i.context.data) return i.messages
    const at = i.messages.map(m => m.role).lastIndexOf('user')
    const dataMsg: CoreMessage = { role: 'user', content: i.context.data }
    return at < 0 ? [...i.messages, dataMsg] : [...i.messages.slice(0, at), dataMsg, ...i.messages.slice(at)]
  })()

  const callModel: Parameters<typeof runAgentRuntime>[0]['callModel'] = i.callModel ?? (async o => {
    const role: ModelRole = o.final ? i.finalRole : 'agent'
    const r = await AI.step({
      role,
      systemShared: AGENT_SYSTEM_V2,
      system: o.system,
      messages: o.messages,
      tools: (o.tools && Object.keys(o.tools).length ? o.tools : undefined) as never,
      parallelTools: true,
      maxTokens: i.maxTokens,
      abortSignal: o.signal,
    })
    return {
      text: r.text ?? '',
      toolCalls: (r.toolCalls ?? []).map(c => ({ toolCallId: c.toolCallId, toolName: c.toolName, args: (c.args ?? {}) as Record<string, unknown> })),
      finishReason: r.finishReason,
      usage: r.usage ? { promptTokens: r.usage.promptTokens, completionTokens: r.usage.completionTokens } : undefined,
      providerMetadata: r.providerMetadata as Record<string, unknown> | undefined,
      modelId: (r as { response?: { modelId?: string } }).response?.modelId,
    } satisfies RuntimeStep
  })

  return agentStreamResult(async emit => {
    let progressSent = false
    const lastResults = new Map<string, unknown>()
    emitLine = emit
    const turn = await withSerperTurnBudget(i.serperTurnCredits, () => runAgentRuntime({
      system,
      messages,
      tools,
      schemas,
      callModel,
      deadlineAt: i.deadlineAt,
      signal: i.signal,
      lang: i.lang,
      trace: i.trace,
      disallowedTools: SIDE_EFFECT_TOOLS,
      onToolStart: () => { if (!progressSent) { progressSent = true; emit(searchingFrame(i.lang)) } },
      onToolResult: (call, result, event) => {
        lastResults.set(`${event.round}:${call.toolName}`, result)
        if (call.toolName === 'get_trip_data' && event.outcome === 'ok') return // its parts already went out as their own frames
        emit(`9:${JSON.stringify({ toolCallId: call.toolCallId, toolName: call.toolName, args: call.args })}`)
        emit(`a:${JSON.stringify({ toolCallId: call.toolCallId, result })}`)
      },
      prepareArgs: (name, args) => {
        let a = args
        if (typeof a.query === 'string') {
          const s = i.sanitizeQuery(a.query)
          if (s.cut.length) { i.trace.add('budget', { decision: 'query_sanitized', tool: name, cut: s.cut.length }); a = { ...a, query: s.query } }
        }
        const dk = ({ get_flight_prices: 'departDate', get_hotel_prices: 'checkIn' } as Record<string, string>)[name]
        if (dk && i.codeDate && a[dk] !== i.codeDate) {
          i.trace.add('budget', { decision: 'date_overridden_by_code', tool: name })
          a = { ...a, [dk]: i.codeDate }
        }
        return a
      },
      runTool: async (name, signal, fn) => {
        const r = await withSerperToolScope(name === 'get_trip_data' ? TRIP_PART_CREDITS * 3 : RUNTIME_LIMITS.serperCreditsPerTool, signal, fn)
        return { value: r.value, credits: r.spent }
      },
    }))
    const run = turn.value
    i.trace.counters.serperCredits = turn.spent
    if (turn.refused) i.trace.add('budget', { decision: 'serper_refused', refused: turn.refused, limit: i.serperTurnCredits })
    try { i.onSerperSpent?.(turn.spent) } catch { /* accounting only */ }
    try { i.onState?.(statePatchFrom(run, lastResults)) } catch { /* state is best effort */ }
    // Phase 7 parity: the old one-line trace keeps its shape for the dashboards that read it.
    console.log(JSON.stringify({ type: 'tappyai_agent_trace', runtime: 2, trace_id: i.trace.traceId, status: run.status, stop: run.stopReason, model_calls: run.modelCalls, tool_calls: run.toolCalls, tools: run.toolEvents.map(e => ({ round: e.round, name: e.name, why: redactForTrace(e.why), ms: e.ms, outcome: e.outcome })), serper_turn: { spent: turn.spent, refused: turn.refused, limit: i.serperTurnCredits } }))
    return run
  }, i.onFinish)
}
