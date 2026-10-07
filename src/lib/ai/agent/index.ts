// ── Bounded agent — wiring (TAPPY_AGENT=1) ─────────────────────────────────────────────────────────────────────────────────
//
// OFF by default. ON = the server env TAPPY_AGENT=1 (a Vercel env change + redeploy, or a restart locally — no client build).
// Rollback = unset / 0: the route takes the existing Consultative path, byte-for-byte as before.
//
// One turn = one trace line `tappyai_agent_trace`: model calls, each tool (why, ms, outcome, Serper credits spent inside), status,
// stop reason, tokens and Luna cost. The model's private reasoning never enters the trace or the reply.

import type { FlightContext } from '@/lib/ai/consultative/chatSessionState'
import type { CoreMessage } from 'ai'
import { tool } from 'ai'
import { z } from 'zod'
import { AI } from '@/lib/ai/llm'
import type { ModelRole } from '@/lib/ai/llm/types'
import { withSerperToolBudget, withSerperTurnBudget } from '@/lib/ai/tools/serperToolBudget'
import { redactForTrace, guardToolOutput } from './guards'
import { searchingFrame } from '@/lib/ai/consultative/presearch'
import { runBoundedAgent, AGENT_LIMITS, type AgentStep, type AgentExecutableTool, type AgentRun } from './loop'
import { toModelSchemas, nowShowingTool, movieShowtimesTool, labelFlightVerification, requestActionTool, SIDE_EFFECT_TOOLS, type PendingAction } from './agentTools'
import { AGENT_SYSTEM, AGENT_SYSTEM_EN_NOTE } from './prompt'
import { agentStreamResult, type AgentStreamResult } from './dataStream'

export const tappyAgentEnabled = (env: Record<string, string | undefined> = process.env): boolean => env.TAPPY_AGENT === '1'

type RouteTool = { description?: string; parameters?: unknown; execute?: (args: Record<string, unknown>, ctx: { toolCallId: string; messages: unknown[] }) => unknown }

export interface AgentTurnInput {
  routeTools: Record<string, RouteTool> | undefined
  /** A plan-only turn: the model gets no tools (no retrieval, no cards). Set by the route from the user's own words. */
  noRetrieval?: boolean
  /** Trusted context (system) + untrusted app-state DATA block (sent as a user-role message), from agentContext(). */
  context: { system: string; data: string | null }
  /** Serper credits the agent's tools may spend in this turn, all tools together (8 normal / 10 travel minus the photo reserve). */
  serperTurnCredits: number
  messages: CoreMessage[]
  lang: string
  deadlineAt: number
  signal?: AbortSignal
  /** Role for the forced/plain final answer step (tool steps always run at the consult role — Luna takes tools at effort none). */
  finalRole: ModelRole
  maxTokens: number
  canConfirmActions: boolean
  onPendingAction: (p: PendingAction) => void
  /** Private-data cut for search queries (route's sanitizeSearchQuery). */
  sanitizeQuery: (q: string) => { query: string; cut: string[] }
  /** The code-resolved date of the user's relative-day words; overrides a model-written travel date. */
  codeDate?: string
  onFinish?: Parameters<typeof agentStreamResult>[1]
  /** Serper credits the agent's tools spent this turn (the card-photo lookup afterwards gets only what is left of the turn budget). */
  onSerperSpent?: (credits: number) => void
  /** App-state facts derived from this turn's tool calls (flight / movie / plan context) for the chat-session state. */
  onState?: (patch: AgentStatePatch) => void
  /** Test seam: replace the model step. */
  callModel?: Parameters<typeof runBoundedAgent>[0]['callModel']
}

const DATE_ARGS: Record<string, string> = { get_flight_prices: 'departDate', get_hotel_prices: 'checkIn' }

export interface AgentStatePatch {
  flight?: FlightContext
  movie?: { title: string; date?: string; city?: string; at: string }
  plan?: { destination: string; at: string }
}

/** Follow-up state from what the agent actually executed this turn (successful calls only). Pure. */
export function statePatchFrom(run: Pick<AgentRun, 'toolEvents' | 'text'>, results: ReadonlyMap<string, unknown>, now = new Date()): AgentStatePatch {
  const at = now.toISOString()
  const ok = run.toolEvents.filter(e => e.outcome === 'ok')
  const patch: AgentStatePatch = {}
  const f = [...ok].reverse().find(e => e.name === 'get_flight_prices')
  if (f && typeof f.args.origin === 'string' && typeof f.args.destination === 'string') {
    const links = (results.get(`${f.round}:get_flight_prices`) as { booking_links?: Array<{ name?: unknown }> } | undefined)?.booking_links
    const sources = Array.isArray(links) ? [...new Set(links.map(l => l?.name).filter((n): n is string => typeof n === 'string' && n.length > 0))].slice(0, 4) : []
    patch.flight = { origin: f.args.origin, destination: f.args.destination, ...(typeof f.args.departDate === 'string' ? { departDate: f.args.departDate } : {}), ...(typeof f.args.returnDate === 'string' ? { returnDate: f.args.returnDate } : {}), ...(typeof f.args.passengers === 'number' ? { passengers: f.args.passengers } : {}), ...(sources.length ? { sources } : {}), lastVerifiedAt: null, at }
  }
  const m = [...ok].reverse().find(e => e.name === 'get_movie_showtimes')
  if (m && typeof m.args.movieTitle === 'string') patch.movie = { title: m.args.movieTitle, ...(typeof m.args.date === 'string' ? { date: m.args.date } : {}), ...(typeof m.args.city === 'string' ? { city: m.args.city } : {}), at }
  const h = ok.find(e => e.name === 'get_hotel_prices' || e.name === 'get_trip_data')
  const dest = h ? (h.args.location ?? h.args.destination) : undefined
  if (typeof dest === 'string' && /\[TAPPY_PLAN\]/.test(run.text)) patch.plan = { destination: dest, at }
  return patch
}

/** Sub-call frames of a bundled tool: emitted as the ORIGINAL tool's own `9:`/`a:` pair so cards, evidence and guards read them unchanged. */
export type SubResultSink = (toolName: string, args: Record<string, unknown>, result: unknown) => void

/** Serper credits each part of the travel bundle may spend (3 parts × 3 = 9, the travel turn's tool budget). */
export const TRIP_PART_CREDITS = 3

/**
 * ONE agent-level invocation for a trip plan's independent reads — hotels, sights, local food at the destination — fetched in PARALLEL through the
 * same production tools, each part under its own Serper cap. No model call, no agent loop inside. Flights stay a separate, explicit call.
 */
export function tripDataTool(base: Record<string, RouteTool>, sink: SubResultSink) {
  return tool({
    description: 'Gói dữ liệu cho KẾ HOẠCH DU LỊCH ở MỘT điểm đến: khách sạn + điểm tham quan + quán đặc sản, tra song song trong MỘT lần gọi. Chỉ gọi khi kế hoạch cần khách sạn / quán / điểm tham quan CỤ THỂ, giá hoặc giờ mở cửa; lịch trình tổng quát thì lập thẳng, không cần gọi. Vé máy bay: gọi get_flight_prices riêng khi người dùng hỏi vé.',
    parameters: z.object({
      destination: z.string().describe('Điểm đến, vd Đà Nẵng'),
      interests: z.string().optional().describe('Sở thích ăn uống / vui chơi người dùng đã nói (vd hải sản, biển), nếu có'),
      why: z.string().max(160).optional(),
    }),
    execute: async ({ destination, interests }) => {
      const dest = destination.trim().slice(0, 60)
      const extra = (interests ?? '').trim().slice(0, 40)
      const parts: Array<[string, Record<string, unknown>]> = [
        ['get_hotel_prices', { location: dest }],
        ['search_places', { query: `điểm tham quan nổi tiếng ${dest}`, location: dest, type: 'attraction' }],
        ['search_places', { query: `${extra ? `${extra} ` : ''}quán đặc sản ngon ${dest}`.trim(), location: dest, type: 'restaurant' }],
      ]
      const results = await Promise.all(parts.map(async ([name, args], k) => {
        const t = base[name]
        if (!t?.execute) return { error: 'unavailable' }
        try {
          const r = await withSerperToolBudget(TRIP_PART_CREDITS, () => Promise.resolve(t.execute!(args, { toolCallId: `trip_${k}`, messages: [] })))
          sink(name, args, r.value)
          return r.value
        } catch { return { error: 'tool_failed' } }
      }))
      return { destination: dest, hotels: results[0], attractions: results[1], food: results[2], note: 'Dữ liệu cho kế hoạch: chỉ dùng tên/giá/giờ có trong đây; phần không có ghi "chưa có thông tin".' }
    },
  })
}

export function buildAgentTools(i: Pick<AgentTurnInput, 'routeTools' | 'lang' | 'canConfirmActions' | 'onPendingAction' | 'noRetrieval'>, sink: SubResultSink = () => {}): Record<string, AgentExecutableTool & RouteTool> {
  // A plan-only turn (see planNeedsNoRetrieval) offers no tool at all: the model answers from what it knows.
  if (i.noRetrieval) return {}
  const base = Object.fromEntries(Object.entries(i.routeTools ?? {}).filter(([n, t]) => !!t?.execute && !SIDE_EFFECT_TOOLS.has(n))) as Record<string, RouteTool>
  // Fare results carry verification labels (fare for the asked date / schedule / live status) so nothing unverified reads as fact.
  const fares = base.get_flight_prices
  if (fares?.execute) base.get_flight_prices = { ...fares, execute: async (a, c) => labelFlightVerification(await fares.execute!(a, c)) }
  return {
    ...base,
    get_now_showing: nowShowingTool(i.lang) as unknown as RouteTool,
    get_movie_showtimes: movieShowtimesTool(i.lang) as unknown as RouteTool,
    ...(base.get_hotel_prices?.execute && base.search_places?.execute ? { get_trip_data: tripDataTool(base, sink) as unknown as RouteTool } : {}),
    request_action: requestActionTool({ tools: i.routeTools ?? {}, canConfirm: i.canConfirmActions, lang: i.lang, park: i.onPendingAction }) as unknown as RouteTool,
  } as Record<string, AgentExecutableTool & RouteTool>
}

export function startAgentTurn(i: AgentTurnInput): AgentStreamResult {
  const started = Date.now()
  let emitLine: (line: string) => void = () => {}
  let subN = 0
  // A bundled tool's parts reach the client as the original tools' own frames (guarded like every tool output).
  const tools = buildAgentTools(i, (name, args, result) => {
    const id = `sub_${Date.now().toString(36)}_${subN++}`
    emitLine(`9:${JSON.stringify({ toolCallId: id, toolName: name, args })}`)
    emitLine(`a:${JSON.stringify({ toolCallId: id, result: guardToolOutput(result).forClient })}`)
  })
  const schemas = toModelSchemas(tools)
  const credits: Record<string, number> = {}
  const system = i.context.system + (i.lang === 'en' ? AGENT_SYSTEM_EN_NOTE : '')
  // The untrusted state block goes in as DATA right before the user's latest message — never into the system message.
  const messages: CoreMessage[] = (() => {
    if (!i.context.data) return i.messages
    const at = i.messages.map(m => m.role).lastIndexOf('user')
    const dataMsg: CoreMessage = { role: 'user', content: i.context.data }
    return at < 0 ? [...i.messages, dataMsg] : [...i.messages.slice(0, at), dataMsg, ...i.messages.slice(at)]
  })()

  const callModel: Parameters<typeof runBoundedAgent>[0]['callModel'] = i.callModel ?? (async o => {
    const r = await AI.step({
      role: o.final ? i.finalRole : 'consult',
      systemShared: AGENT_SYSTEM,
      system: o.system,
      messages: o.messages,
      tools: (o.tools && Object.keys(o.tools).length ? o.tools : undefined) as never,
      parallelTools: true,
      // The same ceiling on every step (route: 4096 for a plan, 1500 otherwise): the model may write its answer — a whole trip plan — in any
      // step, not only the forced final one. UAT 04/10: a 1500 cap on non-final steps cut a plan reply mid-sentence. A ceiling bills nothing unused.
      maxTokens: i.maxTokens,
      abortSignal: o.signal,
    })
    return {
      text: r.text ?? '',
      toolCalls: (r.toolCalls ?? []).map(c => ({ toolCallId: c.toolCallId, toolName: c.toolName, args: (c.args ?? {}) as Record<string, unknown> })),
      finishReason: r.finishReason,
      usage: r.usage ? { promptTokens: r.usage.promptTokens, completionTokens: r.usage.completionTokens } : undefined,
      providerMetadata: r.providerMetadata as Record<string, unknown> | undefined,
    } satisfies AgentStep
  })

  return agentStreamResult(async emit => {
    let progressSent = false
    const lastResults = new Map<string, unknown>()
    emitLine = emit
    const turn = await withSerperTurnBudget(i.serperTurnCredits, () => runBoundedAgent({
      system,
      messages,
      disallowedTools: SIDE_EFFECT_TOOLS,
      tools,
      schemas,
      callModel,
      deadlineAt: i.deadlineAt,
      signal: i.signal,
      lang: i.lang,
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
          if (s.cut.length) { console.log(JSON.stringify({ type: 'tappyai_agent_query_sanitized', tool: name, cut: s.cut.length })); a = { ...a, query: s.query } }
        }
        const dk = DATE_ARGS[name]
        if (dk && i.codeDate && a[dk] !== i.codeDate) {
          console.log(JSON.stringify({ type: 'tappyai_agent_date_guard', tool: name, model: a[dk] ?? null, code: i.codeDate }))
          a = { ...a, [dk]: i.codeDate }
        }
        return a
      },
      runTool: async (name, fn) => {
        const r = await withSerperToolBudget(name === 'get_trip_data' ? TRIP_PART_CREDITS * 3 : AGENT_LIMITS.serperCreditsPerTool, fn)
        credits[name] = (credits[name] ?? 0) + r.spent
        return r.value
      },
    }))
    const run: AgentRun = turn.value
    try { i.onSerperSpent?.(turn.spent) } catch { /* accounting only */ }
    try { i.onState?.(statePatchFrom(run, lastResults)) } catch { /* state is best effort */ }
    const cost = run.steps.reduce((n, s) => n + Number(((s.providerMetadata?.tappy as { cost?: { usd?: number } } | undefined)?.cost?.usd) ?? 0), 0)
    console.log(JSON.stringify({
      type: 'tappyai_agent_trace',
      status: run.status, stop: run.stopReason, model_calls: run.modelCalls, tool_calls: run.toolCalls, ms: Date.now() - started,
      tools: run.toolEvents.map(e => ({ round: e.round, name: e.name, why: redactForTrace(e.why), ms: e.ms, outcome: e.outcome, ...(e.error ? { error: e.error } : {}), credits: credits[e.name] ?? 0 })),
      serper_turn: { spent: turn.spent, refused: turn.refused, limit: i.serperTurnCredits },
      no_tool_reason: run.toolCalls === 0 && run.stopReason === 'model_answered' ? 'model answered directly' : null,
      tokens_in: run.steps.reduce((n, s) => n + (s.usage?.promptTokens ?? 0), 0), tokens_out: run.steps.reduce((n, s) => n + (s.usage?.completionTokens ?? 0), 0),
      usd_model: Math.round(cost * 1e7) / 1e7,
    }))
    return run
  }, i.onFinish)
}

export { AGENT_LIMITS } from './loop'
export { agentContext, codeResolvedDate, afterOutbound, priorDateFromHistory, cityFromGps, followUpContextLines, AGENT_SYSTEM } from './prompt'
export { confirmationOf, isRejectionTurn, actionOutcomeText, revalidatePendingAction, claimActionExecution } from './agentTools'
