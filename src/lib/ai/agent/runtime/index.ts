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
import { serperLedgerSnapshot, serperLedgerDelta } from '@/lib/ai/tools/serperMeter'
import { withSerperTurnBudget, withSerperToolScope } from '@/lib/ai/tools/serperToolBudget'
import { searchingFrame } from '@/lib/recommendation/progressAnnotation'
import { redactForTrace, guardToolOutput } from '../guards'
import { buildAgentTools, statePatchFrom, TRIP_PART_CREDITS, type AgentTurnInput } from '../index'
import { toModelSchemas, SIDE_EFFECT_TOOLS } from '../agentTools'
import { AGENT_SYSTEM_EN_NOTE } from '../prompt'
import { agentStreamResult, type AgentStreamResult } from '../dataStream'
import { runAgentRuntime, type RuntimeStep } from './loop'
import { RUNTIME_LIMITS } from './limits'
import { ASK_USER, UPDATE_TASK, askUserTool, updateTaskTool } from './controlTools'
import { applyTaskDelta, recordResearch, finishTurn, taskView, type AgentTask, type TaskSummary } from './task'
import { trackTask, type TrackerInput } from './taskTracker'
import { resultCount } from './trace'
import { EvidenceLedger, normUrl, planCitations, type SourceLink } from './evidence'
import { createPageReader, readPageTool, urlsIn, urlsInText, READ_PAGE } from './readPage'
import { researchSearchTool } from './researchSearch'
import { withProductFallback, withNewsFallback } from './toolState'
import { editorialItemsIn, attributeEditorial } from './editorialSources'
import { selectTools, proxyToolSchema, resolveUseTool, USE_TOOL } from './toolRegistry'
import { attachEvidence, taskConstraintsSig } from './task'
import type { PageFetchResult } from '@/lib/security/safePageFetch'
import { createHash } from 'node:crypto'
import { agentSystemV2For } from './consultativeVoice'
import { unreadableSourceLinks } from './unreadableSources'
import { STYLE_LUNA6_BLOCK } from '@/lib/ai/consultative/styleLuna6'
import type { AgentRunTrace } from './trace'
import type { GuardEvidence } from '@/lib/ai/guardEvidence'

export const agentRuntimeV2Enabled = (env: Record<string, string | undefined> = process.env): boolean => env.TAPPY_AGENT === '2'

/**
 * M2: the task this turn works on, owned by the caller (route) and mutated here: Luna's update_task deltas, then — at the end of the
 * loop — the research log and the ask / answered-question lifecycle. The caller persists `task` + `history` with the chat-session state.
 */
export interface TaskBox {
  task: AgentTask
  history: TaskSummary[]
  conversationId: string | null
  persisted: boolean
  /** What the task tracker reads (taskTracker.ts): the new message, the end of the previous reply, the card names on screen. */
  turn: { userText: string; previousReply: string | null; cards: string[] }
  /** Test seam for the tracker's Luna call. */
  extract?: TrackerInput['extract']
  /** Test seam: the grace after the loop (default TRACKER_GRACE_MS). */
  graceMs?: number
  /**
   * Latency pass: the tracker's delta is applied AFTER the reply (it never delays the answer). The caller awaits this before persisting
   * the task (route onEvidence, after the last byte).
   */
  settled?: Promise<void>
}

/**
 * Conversation-flow guardrail (like the budget ceilings, not a semantic rule): when the previous turn ASKED (a question is pending), this
 * turn is the user's answer, so ask_user is not offered — the turn must make progress. Measured on the M2 follow-up eval: with the rule
 * only in the instructions Luna still asked a second question right after the answer in 4 of 23 turns. A refinement question at the end
 * of a real answer stays possible (prose).
 */
export function askAllowed(box: TaskBox | undefined): boolean {
  return !box?.task.pending_question
}

/** The tracker runs beside the loop; after the loop it gets at most this long to finish (off the reply's path) before it is aborted. */
export const TRACKER_GRACE_MS = 6_000

export interface RuntimeTurnInput extends Omit<AgentTurnInput, 'callModel'> {
  trace: AgentRunTrace
  /** CONSULTATIVE_IN_AGENT (default OFF): the voice block + advice principles in the static system message (consultativeVoice.ts). */
  consultative?: boolean
  taskBox?: TaskBox
  /** Test seam: replace the model step. */
  callModel?: Parameters<typeof runAgentRuntime>[0]['callModel']
  /** M3 test seam: the page fetch. */
  research?: { fetchPage?: (url: string, signal?: AbortSignal) => Promise<PageFetchResult> }
  /** M3: the pages read this turn, for the enrichment site to turn [S#] markers into source links (streamEnrichment citeSources). */
  onCitationSources?: (sources: SourceLink[]) => void
  /**
   * M4: the provenance the settle-path guards judge the reply against (guardEvidence.ts): this turn's sources with their extracts, the
   * ledger's conflicts, and the task's evidence references as they were at the START of the turn (with that constraint signature).
   */
  onGuardEvidence?: (ev: GuardEvidence) => void
}

export function startAgentRuntimeTurn(i: RuntimeTurnInput): AgentStreamResult {
  let emitLine: (line: string) => void = () => {}
  let subN = 0
  const tools = buildAgentTools(i, (name, args, result) => {
    const id = `sub_${Date.now().toString(36)}_${subN++}`
    emitLine(`9:${JSON.stringify({ toolCallId: id, toolName: name, args })}`)
    emitLine(`a:${JSON.stringify({ toolCallId: id, result: guardToolOutput(result).forClient })}`)
  })
  // M3 research: one evidence ledger per turn; pages may be opened only if they appeared in this research (results, the user's message,
  // the task's earlier evidence) — no crawling of links found inside pages.
  const ledger = new EvidenceLedger()
  const readable = new Set<string>()
  const allow = (u: string) => { if (/^https?:\/\//i.test(u)) readable.add(normUrl(u)) }
  const lastUser = [...i.messages].reverse().find(m => m.role === 'user')
  for (const u of urlsInText(typeof lastUser?.content === 'string' ? lastUser.content : Array.isArray(lastUser?.content) ? (lastUser.content as Array<{ text?: string }>).map(p => p.text ?? '').join(' ') : '')) allow(u)
  for (const e of i.taskBox?.task.research_state.evidence ?? []) allow(e.url)
  if (Object.keys(tools).length) {
    // One page reader per turn (shared page budget, de-duplication, failure memo). web_search = several queries in parallel + the best
    // pages opened in the same call; read_page = 1–3 given pages in parallel. Evidence is deterministic (no per-page model call).
    const reader = createPageReader({ ledger, allowed: u => readable.has(normUrl(u)), trace: i.trace, lang: i.lang, maxReads: i.consultative === true ? RUNTIME_LIMITS.maxPageReadsConsult : RUNTIME_LIMITS.maxPageReads, ...(i.research ?? {}) })
    const ws = tools.web_search
    if (ws?.execute) tools.web_search = researchSearchTool({ base: ws.execute as never, reader, allow, lang: i.lang }) as never
    tools[READ_PAGE] = readPageTool(reader) as never
    // WS2 final: a failed product provider falls back ONCE to a public-web price search (bounded, inside the same tool call); a failure
    // that the fallback cannot cover stays a failure — the price is UNKNOWN, never filled from memory (toolState.ts).
    const sp = tools.search_products
    if (sp?.execute) tools.search_products = { ...sp, execute: withProductFallback(sp.execute as never, (tools.web_search?.execute as never) ?? null, { lang: i.lang, onFallback: d => i.trace.add('fallback', { tool: 'search_products', state: d.state, fallback: 'web_search', fallback_state: d.fallbackState, ...(d.usability ? { usability: d.usability } : {}) }) }) } as never
    // CONSULTATIVE_IN_AGENT: a news topic the three RSS feeds do not cover falls back ONCE to a public-web news search in the same call.
    const gn = tools.get_news
    if (i.consultative === true && gn?.execute) tools.get_news = { ...gn, execute: withNewsFallback(gn.execute as never, (tools.web_search?.execute as never) ?? null, { lang: i.lang, onFallback: d => i.trace.add('fallback', { tool: 'get_news', state: d.state, fallback: 'web_search', fallback_state: d.fallbackState }) }) } as never
  }
  // The control action is offered on every non-final step, even on a plan-only turn that gets no retrieval tool.
  // M6: a small core every round; deferred tools by this turn's capability hints / the task's last tools; the rest through use_tool.
  // One set per turn (the tool list is part of the cached prompt prefix). See toolRegistry.ts.
  const userTexts = i.messages.filter(m => m.role === 'user').slice(-2).map(m => typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? (m.content as Array<{ text?: string }>).map(p => p.text ?? '').join(' ') : '')
  const lastTurnTools = (() => { const s = i.taskBox?.task.research_state.searches ?? []; const t = Math.max(-1, ...s.map(x => x.turn)); return s.filter(x => x.turn === t).map(x => x.tool) })()
  const selection = selectTools(tools, { texts: userTexts, recentTools: lastTurnTools })
  const proxy = proxyToolSchema(tools, selection.catalog, i.lang)
  const exposedTools = Object.fromEntries(selection.exposed.map(n => [n, tools[n]]))
  const schemas = { ...toModelSchemas(exposedTools), ...(proxy ? { [USE_TOOL]: proxy } : {}), ...(askAllowed(i.taskBox) ? toModelSchemas({ [ASK_USER]: askUserTool({ consultative: i.consultative === true }) } as never) : {}) }
  i.trace.add('tools', { exposed: selection.exposed, preselected: selection.preselected, deferred: selection.catalog.length, schemas: Object.keys(schemas).length })
  const box = i.taskBox
  if (box) i.trace.taskId = box.task.task_id
  const system = i.context.system + (i.lang === 'en' ? AGENT_SYSTEM_EN_NOTE : '')
  // The static system message of this run: AGENT_SYSTEM_V2 itself unless the consultative flag is on (consultativeVoice.ts).
  const sharedPrompt = agentSystemV2For(i.consultative === true)
  // Per-turn evidence of what actually reaches the model (metadata only: lengths, short hashes, booleans — never prompt or user text).
  {
    const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 12)
    const block = (s: string) => ({ chars: s.length, sha: sha(s) })
    const data = i.context.data ?? ''
    const blocks = {
      type: 'tappyai_agent_prompt_blocks', path: 'agent_v2', consultative_in_agent: i.consultative === true,
      system_static: block(sharedPrompt), system_dynamic: block(system), data: block(data),
      voice_in_system: sharedPrompt.includes(STYLE_LUNA6_BLOCK), memory_in_system: sharedPrompt.includes('Trí nhớ —') || system.includes('Trí nhớ —'),
      memory_in_data: data.includes('Trí nhớ —'),
    }
    console.log(JSON.stringify(blocks))
  }
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
      systemShared: sharedPrompt,
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

  // Answer-before-lookup check (answerFirst.ts): one text-only Luna call, no tools. Not wired when a model seam replaces the step (tests).
  const answerFirstModel: NonNullable<Parameters<typeof runAgentRuntime>[0]['answerFirstModel']> = async o => {
    const r = await AI.step({ role: 'agent', systemShared: sharedPrompt, system: o.system, messages: o.messages, maxTokens: 700, abortSignal: o.signal })
    const usd = Number(((r.providerMetadata as { tappy?: { cost?: { usd?: number } } } | undefined)?.tappy?.cost?.usd) ?? 0)
    return { text: r.text ?? '', promptTokens: r.usage?.promptTokens, completionTokens: r.usage?.completionTokens, usd }
  }

  // M4: the task's carried evidence as this turn found it (the tracker may replace the task after the reply).
  const carriedAtStart = box ? [...(box.task.research_state.evidence ?? [])] : []
  const sigAtStart = box ? taskConstraintsSig(box.task) : null

  return agentStreamResult(async emit => {
    let progressSent = false
    const lastResults = new Map<string, unknown>()
    emitLine = emit
    // M2: the task tracker (one structured Luna call) runs CONCURRENTLY with the loop — no extra round on the critical path.
    const trackerCtrl = new AbortController()
    const onOuterAbort = () => trackerCtrl.abort()
    i.signal?.addEventListener('abort', onOuterAbort, { once: true })
    const tracking = box ? trackTask({ task: box.task, userText: box.turn.userText, previousReply: box.turn.previousReply, cards: box.turn.cards, lang: i.lang, signal: trackerCtrl.signal, extract: box.extract }) : null
    const ledgerAtStart = serperLedgerSnapshot()
    const turn = await withSerperTurnBudget(i.serperTurnCredits, () => runAgentRuntime({
      system,
      messages,
      tools,
      schemas,
      callModel,
      ...(i.callModel ? {} : { answerFirstModel }),
      deadlineAt: i.deadlineAt,
      signal: i.signal,
      lang: i.lang,
      trace: i.trace,
      disallowedTools: SIDE_EFFECT_TOOLS,
      onToolStart: () => { if (!progressSent) { progressSent = true; emit(searchingFrame(i.lang)) } },
      onToolResult: (call, result, event) => {
        lastResults.set(`${event.round}:${call.toolName}`, result)
        if (call.toolName !== READ_PAGE) for (const u of urlsIn(result)) allow(u)
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
        if (Array.isArray(a.queries)) {
          const qs = (a.queries as unknown[]).map(q => typeof q === 'string' ? i.sanitizeQuery(q) : { query: '', cut: [] })
          const cut = qs.reduce((n, q) => n + q.cut.length, 0)
          if (cut) { i.trace.add('budget', { decision: 'query_sanitized', tool: name, cut }); a = { ...a, queries: qs.map(q => q.query) } }
        }
        const dk = ({ get_flight_prices: 'departDate', get_hotel_prices: 'checkIn' } as Record<string, string>)[name]
        if (dk && i.codeDate && a[dk] !== i.codeDate) {
          i.trace.add('budget', { decision: 'date_overridden_by_code', tool: name })
          a = { ...a, [dk]: i.codeDate }
        }
        return a
      },
      resolveCall: call => call.toolName === USE_TOOL ? resolveUseTool(call.args, tools, selection, i.lang) : null,
      onTaskUpdate: box ? (args => {
        const r = applyTaskDelta(box.task, box.history, args, { now: new Date(), conversationId: box.conversationId })
        box.task = r.task
        box.history = r.history
        i.trace.taskId = box.task.task_id
        return { view: taskView(r.task), applied: r.applied, rejected: r.rejected }
      }) : undefined,
      // Latency pass: after two research calls, a reminder that six rounds is a ceiling, not a workflow (Luna still decides).
      stepNote: ({ toolEvents }) => toolEvents.filter(e => (e.name === 'web_search' || e.name === READ_PAGE) && e.outcome === 'ok').length >= 2
        ? (i.lang === 'en' ? '\n\nYou have already researched twice this turn. Answer now from the evidence you have, unless one specific key point is still missing.' : '\n\nLượt này đã tra cứu 2 lần. Trả lời ngay từ bằng chứng đã có, trừ khi còn thiếu đúng một điểm then chốt.')
        : null,
      runTool: async (name, signal, fn) => {
        const r = await withSerperToolScope(name === 'get_trip_data' ? TRIP_PART_CREDITS * 3 : RUNTIME_LIMITS.serperCreditsPerTool, signal, fn)
        return { value: r.value, credits: r.spent }
      },
    }))
    const run = turn.value
    // Serper request ledger of this turn — attempts, outcomes, provider-reported credits, cache hits and L2 status, kept apart (an
    // attempt is not money spent; `reconciled` is always 0 until the owner matches it to the Activity Log). The ledger is process-wide,
    // so under concurrent turns this is an upper bound for the turn.
    try {
      const d = serperLedgerDelta(ledgerAtStart)
      const att = (Object.values(d.endpoints) as Array<{ attempted: number }>).reduce((n, r) => n + r.attempted, 0)
      if (att || d.l1Hits || d.l2Bypass) i.trace.add('budget', { decision: 'serper_ledger', endpoints: Object.fromEntries(Object.entries(d.endpoints).filter(([, r]) => r.attempted || r.refused)), estimated_billable: d.estimatedBillable, estimated_unknown_basis: d.estimatedUnknownBasis, provider_reported: d.reported, reconciled: d.reconciled, l1_hits: d.l1Hits, cache_l2: d.l2Bypass ? 'not_configured' : 'configured_or_unused', l2_bypass_reads: d.l2Bypass })
    } catch { /* trace only */ }
    // M3: [S#] markers checked against the pages actually read; the enrichment site builds the links (or a short sources line). Never on an ask.
    // POST-UAT B6: an article a tool returned whole (travel_editorial / news) and the reply restates gets its own [S#] → real link.
    const editorial = run.status !== 'asked' ? editorialItemsIn([...lastResults.values()]) : []
    if (ledger.sources.length && run.status !== 'asked') {
      const c = planCitations(run.text, ledger.sources)
      const ed = attributeEditorial(c.text, editorial, ledger.sources.length + 1)
      run.text = ed.text
      i.trace.citations = (c.cited + ed.links.length) || Math.min(3, ledger.sources.length)
      try { i.onCitationSources?.([...c.sources, ...ed.links]) } catch { /* presentation only */ }
    } else if (run.status !== 'asked') {
      // M4 citation integrity: no page was read (all failed / none opened) — a [S#] marker would point at nothing (M4 eval RS-E1 run 2).
      const base = /\[S\d/.test(run.text) ? planCitations(run.text, []).text : run.text
      const ed = attributeEditorial(base, editorial, 1)
      run.text = ed.text
      if (ed.links.length) {
        i.trace.citations = ed.links.length
        try { i.onCitationSources?.(ed.links) } catch { /* presentation only */ }
      } else if (i.consultative === true) {
        // CONSULTATIVE_IN_AGENT: no page could be read and the reply says it could not verify → the search results the tool returned become
        // the source buttons ("Nguồn: host"), so the user can open the page themselves. Only after an admitted non-verification (unreadableSources.ts).
        const srcs = unreadableSourceLinks([...lastResults.values()], run.text)
        if (srcs.length) {
          i.trace.add('evidence', { decision: 'unreadable_sources_offered', links: srcs.length })
          try { i.onCitationSources?.(srcs) } catch { /* presentation only */ }
        }
      }
    }
    if (editorial.length) i.trace.add('evidence', { decision: 'editorial_attribution', articles: editorial.length, cited: (run.text.match(/\[S\d+\]/g) ?? []).length })
    if (run.status !== 'asked' && (ledger.sources.length || carriedAtStart.length)) {
      try {
        const view = ledger.guardView()
        i.onGuardEvidence?.({ ...view, carried: carriedAtStart, constraintsSig: sigAtStart, userText: box?.turn.userText ?? (typeof lastUser?.content === 'string' ? lastUser.content : '') })
      } catch { /* guards then run without page provenance, as before M4 */ }
    }
    if (box) {
      try {
        const now = new Date()
        // This turn's research log, ask lifecycle and evidence references — applied now, and again on top of a NEW task if the tracker
        // (below, off the reply path) decides the message started one.
        const finalize = (t: AgentTask): AgentTask => attachEvidence(finishTurn(recordResearch(t, run.toolEvents.map(e => ({ name: e.name, args: e.args, outcome: e.outcome, results: resultCount(lastResults.get(`${e.round}:${e.name}`)) })), now), { asked: run.ask, now }), ledger.toTaskRefs(taskConstraintsSig(t), now.toISOString()), now)
        box.task = finalize(box.task)
        if (tracking) {
          // Latency pass: the tracker never delays the answer. It gets a grace after the loop (bounded by the deadline), then is aborted;
          // the caller awaits `settled` before persisting the task.
          box.settled = (async () => {
            const grace = Math.max(0, Math.min(box.graceMs ?? TRACKER_GRACE_MS, i.deadlineAt - Date.now() - 500))
            let timer: ReturnType<typeof setTimeout> | undefined
            const tracked = await Promise.race([tracking, new Promise<null>(r => { timer = setTimeout(() => r(null), grace) })])
            clearTimeout(timer)
            i.signal?.removeEventListener('abort', onOuterAbort)
            if (!tracked) { trackerCtrl.abort(); i.trace.counters.timeouts++; i.trace.add('timeout', { scope: 'task_tracker', cancelled: true }); return }
            i.trace.counters.usd += tracked.usd
            if (!tracked.delta) { i.trace.counters.errors++; i.trace.add('error', { scope: 'task_tracker', message: tracked.error ?? 'no_delta', ms: tracked.ms }); return }
            const r = applyTaskDelta(box.task, box.history, tracked.delta, { now: new Date(), conversationId: box.conversationId })
            box.task = tracked.delta.new_task === true ? finalize(r.task) : r.task
            box.history = r.history
            i.trace.taskId = box.task.task_id
            i.trace.add('task', { decision: 'tracked', ms: tracked.ms, applied: r.applied.slice(0, 16), rejected: r.rejected.slice(0, 8), new_task: tracked.delta.new_task === true, constraints: box.task.constraints.length })
          })().catch(e => { i.trace.add('error', { scope: 'task_tracker', message: String(e instanceof Error ? e.message : e).slice(0, 120) }) })
        }
        i.trace.taskId = box.task.task_id
        i.trace.add('task', { decision: 'end', status: box.task.status, task_type: box.task.task_type, constraints: box.task.constraints.length, preferences: box.task.preferences.length, selected: box.task.selected_items.length, searches: box.task.research_state.searches.length, evidence_refs: box.task.research_state.evidence.length, pending: !!box.task.pending_question, persisted: box.persisted })
      } catch (e) { i.trace.add('error', { scope: 'task', message: String(e instanceof Error ? e.message : e).slice(0, 120) }) }
    }
    i.trace.counters.serperCredits = turn.spent
    if (turn.refused) i.trace.add('budget', { decision: 'serper_refused', refused: turn.refused, limit: i.serperTurnCredits })
    try { i.onSerperSpent?.(turn.spent) } catch { /* accounting only */ }
    try { i.onState?.(statePatchFrom(run, lastResults)) } catch { /* state is best effort */ }
    // Phase 7 parity: the old one-line trace keeps its shape for the dashboards that read it.
    console.log(JSON.stringify({ type: 'tappyai_agent_trace', runtime: 2, trace_id: i.trace.traceId, status: run.status, stop: run.stopReason, model_calls: run.modelCalls, tool_calls: run.toolCalls, tools: run.toolEvents.map(e => ({ round: e.round, name: e.name, why: redactForTrace(e.why), ms: e.ms, outcome: e.outcome })), serper_turn: { spent: turn.spent, refused: turn.refused, limit: i.serperTurnCredits } }))
    return run
  }, i.onFinish)
}

