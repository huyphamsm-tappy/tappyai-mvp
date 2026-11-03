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
import { searchingFrame, statusFrame } from '@/lib/recommendation/progressAnnotation'
import { c2ToolGateOn, c2RoundCapOn, c2BatchNoteOn, c2LengthRecoveryOn, c2ProgressOn, c2StreamDataStreamOn, c2ToolRoundEffort, c2SoftBudgetMs, toolGate, planTurn, roundDecision, batchNote, continuationPrompt, progressLabelForTool, writingLabel } from './c2Policy'
import { currentBudget, estimateTokens, promptChars, reasoningHeadroomTokens, REQUEST_LIMITS, requestBudgetOn } from '@/lib/ai/budget/requestBudget'
import { turnStatusFrame } from '@/lib/recommendation/progressAnnotation'
import { currentMarks } from '@/lib/ai/latency/marks'
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
import { askVerdict, askGateEnabled, askGateMode } from './askGate'
import { isVerifyTurn } from './answerFirst'
import { withTripSearchName } from './tripDestination'
import { withTripLandmarks } from './tripLandmarks'
import { editorialItemsIn, attributeEditorial, tagNewsArticles, resolveNewsMarkers, citedNewsMedia, type EditorialItem } from './editorialSources'
import { sanitizeMediaBlock, type MediaBlock } from '@/lib/media/mediaHosts'
import { fetchWikiEntity, mainSubjectOf } from '@/lib/media/wikiEntity'
import { isKnowledgeQuestion, afterClarification, planFirstAskRefusal, type TurnResolution } from './contentFloor'
import { lastUserText } from './cardRetry'
import type { TaskFrame } from './taskFrame'
import { selectTools, proxyToolSchema, resolveUseTool, USE_TOOL } from './toolRegistry'
import { attachEvidence, taskConstraintsSig } from './task'
import type { PageFetchResult } from '@/lib/security/safePageFetch'
import { createHash } from 'node:crypto'
import { agentSystemV2For } from './consultativeVoice'
import { CONSULT_V3_SYSTEM, agentPromptVersion, type AgentPromptVersion } from './consultV3'
import { unreadableSourceLinks, noPageReadNote, noFigureReadNote, PRICE_INTENT } from './unreadableSources'
import { extractMoneyClaims } from '@/lib/ai/moneyGuard'
import { STYLE_LUNA6_BLOCK } from '@/lib/ai/consultative/styleLuna6'
import type { AgentRunTrace } from './trace'
import type { GuardEvidence } from '@/lib/ai/guardEvidence'
import { answerV4Enabled } from '@/lib/ai/answerV4/flag'
import { understandTurn, understandingTrace, type TurnUnderstanding, type UnderstandResult } from '@/lib/ai/answerV4/understand'
import { resolveDocMedia, type DocMediaDeps } from '@/lib/ai/answerV4/docMedia'
import { docMediaFrame, sanitizeDocMedia } from '@/lib/answerDoc/media'
import { createHostedResearch, hostedSearchOn, HOSTED_TOOL_TIMEOUT_MS } from '@/lib/ai/answerV4/hostedResearch'
import { retrievalV5Enabled } from '@/lib/ai/retrievalV5/flag'
import { createResearchV5, V5_LIMITS, V5_TOOL_TIMEOUT_MS, V5_VERTICAL_TOOLS, V5_FINAL_NOTE, V5_DONE_REASON } from '@/lib/ai/retrievalV5/research'
import { geoContext } from '@/lib/ai/retrievalV5/geo'
import type { GapCheckFn } from '@/lib/ai/retrievalV5/gapCheck'
import { toolSyntaxGuard } from '@/lib/ai/retrievalV5/toolSyntax'

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
  /** C2 P2 §7.2: the prompt version the ROUTE classified (agentPromptVersion) — used as is, so the prompt the turn runs with is the one its
   *  request-ledger scope was decided on. Absent (tests, other callers) → classified here with the same function. */
  promptVersion?: AgentPromptVersion
  taskBox?: TaskBox
  /** Test seam: replace the model step. */
  callModel?: Parameters<typeof runAgentRuntime>[0]['callModel']
  /** M3 test seam: the page fetch. */
  research?: { fetchPage?: (url: string, signal?: AbortSignal) => Promise<PageFetchResult> }
  /** M3: the pages read this turn, for the enrichment site to turn [S#] markers into source links (streamEnrichment citeSources). */
  onCitationSources?: (sources: SourceLink[]) => void
  /** CONSULTATIVE_IN_AGENT: search-result links held for the "chưa xác minh" sentence a guard may force at settle time (shown only then). */
  onUnverifiedSources?: (sources: SourceLink[]) => void
  /** CONSULT_V3 layouts: the validated media block (news pictures / Wikipedia subject card) for the enrichment site to attach. */
  onMedia?: (block: MediaBlock) => void
  /** CONSULT_V3 task frame (taskFrame.ts): the task the model declared this turn — the enrichment site gates the cards by it. */
  onTaskFrame?: (frame: TaskFrame) => void
  /** CONSULT_V3 turn contract: the turn's resolution when its answer is final (loop.ts). */
  onTurnContract?: (resolution: TurnResolution) => void
  /** CONSULT_V3 semantic check (phase B, shadow only): this turn's tool results, after the run. Never changes the turn. */
  onToolResults?: (results: unknown[]) => void
  /**
   * M4: the provenance the settle-path guards judge the reply against (guardEvidence.ts): this turn's sources with their extracts, the
   * ledger's conflicts, and the task's evidence references as they were at the START of the turn (with that constraint signature).
   */
  onGuardEvidence?: (ev: GuardEvidence) => void
  /** TAPPY_ANSWER_V4 (default: the env flag): model understanding of the question, every tool offered, document pictures. Test override. */
  answerV4?: boolean
  /** TAPPY_ANSWER_V4 test seams: the understanding call and the picture lookups. */
  understandExtract?: Parameters<typeof understandTurn>[0]['extract']
  docMediaDeps?: DocMediaDeps
  /** TAPPY_ANSWER_V4: the turn's understanding once it has settled (the enrichment site reads its sensitivity / language). */
  onUnderstanding?: (u: TurnUnderstanding) => void
  /** TAPPY_ANSWER_V4 hosted web search: override of hostedSearchOn() (tests) and the hosted call seam. */
  hostedSearch?: boolean
  hostedSearchFn?: Parameters<typeof createHostedResearch>[0]['search']
  /** RETRIEVAL_V5: force on/off for this turn (default: the RETRIEVAL_V5 env flag). Needs V4. */
  retrievalV5?: boolean
  /** RETRIEVAL_V5 test seam: the gap check. */
  gapCheckFn?: GapCheckFn
}

/** TAPPY_ANSWER_V4: after the answer, how long the media step still waits for the understanding call (it normally settled long before). */
export const UNDERSTAND_GRACE_MS = 2_500
/** TAPPY_ANSWER_V4: how long a hosted search that starts before the understanding settled waits for its reply language. */
export const UNDERSTANDING_WAIT_MS = 3_000

export function startAgentRuntimeTurn(i: RuntimeTurnInput): AgentStreamResult {
  // C2 P2 §7.2: the static prompt of this turn, decided ONCE (every CONSULT_V3 branch below reads `v3`).
  const promptVersion: AgentPromptVersion = i.promptVersion ?? agentPromptVersion(i.consultative === true)
  const v3 = promptVersion === 'consult_v3'
  // TAPPY_ANSWER_V4 (owner 19/10): on top of V3 only.
  const v4 = v3 && (i.answerV4 ?? answerV4Enabled())
  // RETRIEVAL_V5 (owner 20/10): on top of V4 only.
  const v5 = v4 && (i.retrievalV5 ?? retrievalV5Enabled())
  // The request ledger exists only for a consult_v3 turn (the route opens it). A ledger on any other prompt is a scope mismatch: logged loudly and
  // NOT used by this turn (no budget gate) — never a silent run under the wrong policy.
  const ledgerInScope = !!currentBudget() && v3
  if (requestBudgetOn()) {
    console.log(JSON.stringify({ type: 'tappyai_prompt_version', prompt_version: promptVersion, ledger: !!currentBudget(), consistent: !!currentBudget() === v3, deadline_in_ms: Math.round(i.deadlineAt - Date.now()) }))
    if (!!currentBudget() !== v3) console.error(JSON.stringify({ type: 'tappyai_prompt_scope_mismatch', prompt_version: promptVersion, ledger: !!currentBudget() }))
  }
  let emitLine: (line: string) => void = () => {}
  let subN = 0
  const emitSubTool = (name: string, args: unknown, result: unknown) => {
    const id = `sub_${Date.now().toString(36)}_${subN++}`
    emitLine(`9:${JSON.stringify({ toolCallId: id, toolName: name, args })}`)
    emitLine(`a:${JSON.stringify({ toolCallId: id, result: guardToolOutput(result).forClient })}`)
  }
  const tools = buildAgentTools(i, emitSubTool)
  // M3 research: one evidence ledger per turn; pages may be opened only if they appeared in this research (results, the user's message,
  // the task's earlier evidence) — no crawling of links found inside pages.
  // RETRIEVAL_V5 lần 2c (B3): conflicts only between claims about a NAMED subject (evidence.ts)
  const ledger = new EvidenceLedger(v5 ? { namedConflictsOnly: true } : {})
  // TAPPY_ANSWER_V4: per-tool time budgets of the hosted search (set below when it serves web_search / get_news) — or of the RETRIEVAL_V5 lookups
  let hostedToolTimeouts: Record<string, number> | undefined
  // RETRIEVAL_V5: this turn's researcher (null off the flag)
  let v5Research: ReturnType<typeof createResearchV5> | null = null
  // RETRIEVAL_V5 lần 2c (B1): the question's geographic context from the understanding (geo.ts); nothing assumed before it settles
  const v5Geo = () => geoContext(lastUserText(i.messages), understood ? { needs_fresh_data: understood.needs_fresh_data, entities: understood.entities } : null)
  // CONSULT_V3: the news articles this turn's tools returned, in the order of their `cite` ids (N1 = newsBook[0]).
  const newsBook: EditorialItem[] = []
  const readable = new Set<string>()
  const allow = (u: string) => { if (/^https?:\/\//i.test(u)) readable.add(normUrl(u)) }
  const lastUser = [...i.messages].reverse().find(m => m.role === 'user')
  for (const u of urlsInText(typeof lastUser?.content === 'string' ? lastUser.content : Array.isArray(lastUser?.content) ? (lastUser.content as Array<{ text?: string }>).map(p => p.text ?? '').join(' ') : '')) allow(u)
  for (const e of i.taskBox?.task.research_state.evidence ?? []) allow(e.url)
  if (Object.keys(tools).length) {
    // One page reader per turn (shared page budget, de-duplication, failure memo). web_search = several queries in parallel + the best
    // pages opened in the same call; read_page = 1–3 given pages in parallel. Evidence is deterministic (no per-page model call).
    // TAPPY_ANSWER_V4 lookup part 1: the structure-preserving page reader (tables / lists whole, fact density, every picked block to the model).
    const reader = createPageReader({ ledger, allowed: u => readable.has(normUrl(u)), trace: i.trace, lang: i.lang, maxReads: i.consultative === true ? RUNTIME_LIMITS.maxPageReadsConsult : RUNTIME_LIMITS.maxPageReads, ...(v4 ? { structured: true } : {}), ...(i.research ?? {}) })
    const ws = tools.web_search
    // RETRIEVAL_V5 searches through the production web_search itself (one Serper search per call), not through the M3 wrapper below
    const wsBase = ws?.execute as ((args: Record<string, unknown>, ctx?: unknown) => unknown) | undefined
    if (ws?.execute) tools.web_search = researchSearchTool({ base: ws.execute as never, reader, allow, lang: i.lang }) as never
    tools[READ_PAGE] = readPageTool(reader) as never
    // WS2 final: a failed product provider falls back ONCE to a public-web price search (bounded, inside the same tool call); a failure
    // that the fallback cannot cover stays a failure — the price is UNKNOWN, never filled from memory (toolState.ts).
    const sp = tools.search_products
    if (sp?.execute) tools.search_products = { ...sp, execute: withProductFallback(sp.execute as never, (tools.web_search?.execute as never) ?? null, { lang: i.lang, onFallback: d => i.trace.add('fallback', { tool: 'search_products', state: d.state, fallback: 'web_search', fallback_state: d.fallbackState, ...(d.usability ? { usability: d.usability } : {}) }) }) } as never
    // CONSULTATIVE_IN_AGENT: a news topic the three RSS feeds do not cover falls back ONCE to a public-web news search in the same call.
    // …and the trip-data lookup is made for the place name only ("Lý Sơn", not "Lý Sơn, Quảng Ngãi"; tripDestination.ts).
    const gt = tools.get_trip_data
    // A destination the city table does not know gets its landmarks from the web instead of a map centred on Ho Chi Minh City (tripLandmarks.ts).
    if (i.consultative === true && gt?.execute) tools.get_trip_data = { ...gt, execute: withTripLandmarks(withTripSearchName(gt.execute as never), (tools.web_search?.execute as never) ?? null, { lang: i.lang, onFallback: d => i.trace.add('fallback', { tool: 'get_trip_data', fallback: 'web_landmarks', ok: d.ok }) }) } as never
    const gn = tools.get_news
    if (i.consultative === true && gn?.execute) tools.get_news = { ...gn, execute: withNewsFallback(gn.execute as never, (tools.web_search?.execute as never) ?? null, { lang: i.lang, onFallback: d => i.trace.add('fallback', { tool: 'get_news', state: d.state, fallback: 'web_search', fallback_state: d.fallbackState }) }) } as never
    // CONSULT_V3: each article carries `cite: "N#"` so the model can cite it; the runtime links the marker after the run (editorialSources.ts).
    const gnV3 = tools.get_news
    if (v3 && gnV3?.execute) {
      const exec = gnV3.execute as unknown as (args: Record<string, unknown>, ctx: unknown) => Promise<unknown>
      tools.get_news = { ...gnV3, execute: async (args: Record<string, unknown>, ctx: unknown) => tagNewsArticles(await exec(args, ctx), newsBook) } as never
    }
    // TAPPY_ANSWER_V4 (owner 19/10 night, "đổi bộ máy tra cứu"): web_search and get_news are served by the HOSTED web search (answerV4/
    // hostedResearch.ts) — same tool names and arguments; its sources join this turn's ledger as S1, S2… and are allowed for read_page.
    // The trip-data landmark fallback above keeps the former web search (bound before this line). Kill switch: TAPPY_V4_HOSTED_SEARCH=0.
    if (v5 && wsBase) {
      // RETRIEVAL_V5 (owner 20/10): FIND → READ → GAP-FILL on Serper + Tappy's reader (retrievalV5/research.ts), then the next round is the final
      // one (roundPolicy below) — OpenAI's hosted web search is never used. Its own reader: up to V5_LIMITS.pages pages, same ledger / grants.
      const reader5 = createPageReader({ ledger, allowed: u => readable.has(normUrl(u)), trace: i.trace, lang: i.lang, maxReads: V5_LIMITS.pages, structured: true, retrievalV5: true, ...(i.research ?? {}) })
      v5Research = createResearchV5({
        search: wsBase, reader: reader5, allow, lang: i.lang, userText: lastUserText(i.messages), trace: i.trace,
        ...(i.gapCheckFn ? { gapCheck: i.gapCheckFn } : {}),
        sanitize: q => i.sanitizeQuery ? i.sanitizeQuery(q).query : q,
        onSpend: usd => { i.trace.counters.usd += usd },
        emitWebFrame: (args, result) => emitSubTool('web_search', args, result),
        // lần 2c (B1): the question's geographic context, once the understanding has settled (bounded wait, like the hosted brief's language)
        geo: async () => {
          if (!understood && understandingSettled) await Promise.race([understandingSettled, new Promise(r => setTimeout(r, UNDERSTANDING_WAIT_MS))])
          return v5Geo()
        },
      })
      if (tools.web_search) tools.web_search = { ...tools.web_search, execute: v5Research.execute('web') } as never
      if (tools.get_news) tools.get_news = { ...tools.get_news, execute: v5Research.execute('news') } as never
      const wrapped: string[] = []
      for (const name of V5_VERTICAL_TOOLS) {
        const t = tools[name]
        if (!t?.execute) continue
        tools[name] = { ...t, execute: v5Research.vertical(name, t.execute as never) } as never
        wrapped.push(name)
      }
      // a V5 lookup reads pages and may run gap rounds: its own time budget, cancellable (loop.ts toolTimeouts)
      hostedToolTimeouts = Object.fromEntries(['web_search', 'get_news', ...wrapped].map(n => [n, V5_TOOL_TIMEOUT_MS]))
      i.trace.add('tools', { decision: 'retrieval_v5', web_search: !!tools.web_search, get_news: !!tools.get_news, verticals: wrapped.length })
    } else if (v4 && (i.hostedSearch ?? hostedSearchOn())) {
      // the brief is written in the reply language the understanding read. The understanding runs beside the first round (1.6–3.4 s in the
      // acceptance log) and a search can start before it settles: the search waits for it, at most UNDERSTANDING_WAIT_MS.
      const replyLanguage = async (): Promise<string | null> => {
        if (!understood && understandingSettled) await Promise.race([understandingSettled, new Promise(r => setTimeout(r, UNDERSTANDING_WAIT_MS))])
        return understood?.reply_language ?? null
      }
      const hosted = createHostedResearch({ ledger, allow, lang: i.lang, userText: lastUserText(i.messages), trace: i.trace, onSpend: usd => { i.trace.counters.usd += usd }, replyLanguage, ...(i.hostedSearchFn ? { search: i.hostedSearchFn } : {}) })
      if (tools.web_search) tools.web_search = { ...tools.web_search, execute: hosted.execute('web') } as never
      if (tools.get_news) tools.get_news = { ...tools.get_news, execute: hosted.execute('news') } as never
      // a hosted search takes 7–22 s (UAT 19/10): its own budget, and a timed-out one is really cancelled (loop.ts toolTimeouts)
      hostedToolTimeouts = { web_search: HOSTED_TOOL_TIMEOUT_MS, get_news: HOSTED_TOOL_TIMEOUT_MS }
      i.trace.add('tools', { decision: 'hosted_search', web_search: !!tools.web_search, get_news: !!tools.get_news })
    }
  }
  // The control action is offered on every non-final step, even on a plan-only turn that gets no retrieval tool.
  // M6: a small core every round; deferred tools by this turn's capability hints / the task's last tools; the rest through use_tool.
  // One set per turn (the tool list is part of the cached prompt prefix). See toolRegistry.ts.
  const userTexts = i.messages.filter(m => m.role === 'user').slice(-2).map(m => typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? (m.content as Array<{ text?: string }>).map(p => p.text ?? '').join(' ') : '')
  const lastTurnTools = (() => { const s = i.taskBox?.task.research_state.searches ?? []; const t = Math.max(-1, ...s.map(x => x.turn)); return s.filter(x => x.turn === t).map(x => x.tool) })()
  // CONSULTATIVE_IN_AGENT (prompt cache): the tool list is the FIRST part of the cached prefix, and it was chosen from the LAST TWO user messages — a
  // hint word in message 1 ("xe buýt") dropped out of the window at message 3, the list changed, and the whole prefix was re-written (measured live
  // 2026-10-11: cache read 11,050 tokens on turn 2, 0 on turn 3 of one conversation). With the flag the hints come from every user message the
  // request carries (the history is already trimmed), so a conversation's tool list only GROWS and the prefix stays stable.
  const hintTexts = i.consultative === true
    ? i.messages.filter(m => m.role === 'user').map(m => typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? (m.content as Array<{ text?: string }>).map(p => p.text ?? '').join(' ') : '')
    : userTexts
  const selection = selectTools(tools, { texts: hintTexts, recentTools: lastTurnTools, all: v4 })
  const proxy = proxyToolSchema(tools, selection.catalog, i.lang)
  const exposedTools = Object.fromEntries(selection.exposed.map(n => [n, tools[n]]))
  // CONSULT_V3 turn contract (owner 17/10, TURN-CONTRACT-PLAN layer 1): no ask_user tool — it is the one path that ends a turn with a
  // question and nothing else (uat-4, tp-5). A question is asked at the END of an answer, in the text; a needed clarification still is.
  const askOffered = askAllowed(i.taskBox) && !v3
  const offered = { ...toModelSchemas(exposedTools), ...(proxy ? { [USE_TOOL]: proxy } : {}), ...(askOffered ? toModelSchemas({ [ASK_USER]: askUserTool({ consultative: i.consultative === true }) } as never) : {}) }
  // C2_TOOL_GATE (c2Policy.ts, default off): a plainly stable-knowledge / writing message gets NO tool schema, so it is answered in one round.
  // Read from the user's words (the latest message + the earlier ones, and whether a task question is pending); unsure → tools stay. The decision
  // and its reason are traced (never the text). A gated turn also gets NO executable tool, so nothing can run even if the model names one.
  const c2UserText = i.taskBox?.turn.userText || userTexts[userTexts.length - 1] || ''
  const userAll = i.messages.filter(m => m.role === 'user').map(m => typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? (m.content as Array<{ text?: string }>).map(p => p.text ?? '').join(' ') : '')
  // TAPPY_ANSWER_V4: no word-list gate — the model, which reads every language, decides whether to look anything up.
  const gate = c2ToolGateOn() && !v4 ? toolGate(c2UserText, { earlierUserTexts: userAll.slice(0, -1), pendingQuestion: !!i.taskBox?.task.pending_question }) : null
  if (gate) i.trace.add('budget', { decision: 'c2_tool_gate', gate: gate.gate, reason: gate.reason })
  const gated = gate?.gate === 'no_tools'
  const schemas: typeof offered = gated ? {} : offered
  i.trace.add('tools', { exposed: selection.exposed, preselected: selection.preselected, deferred: selection.catalog.length, schemas: Object.keys(schemas).length })
  // C2_ROUND_CAP: a plan turn may run up to 3 lookup rounds; any other turn answers after its first one (exceptions in c2Policy.roundDecision).
  const c2Plan = planTurn(c2UserText)
  const c2Effort = c2ToolRoundEffort()
  const box = i.taskBox
  if (box) i.trace.taskId = box.task.task_id
  // CONSULTATIVE_IN_AGENT: after a search, one more official page when none could be read, or when the pages read state no figure for a price / rate
  // question (unreadableSources.ts). Reads are free of Serper credits; the budget and deadline are the turn's own.
  // TAPPY_ANSWER_V4: the settled understanding of this turn (set by the concurrent call below; null until then, or on failure).
  let understood: TurnUnderstanding | null = null
  // …and the promise of that call (the hosted search waits on it briefly for the reply language)
  let understandingSettled: Promise<unknown> | null = null
  const consultResearchNote = (toolEvents: readonly { name: string; outcome: string }[]): string | null => {
    const readPageCalls = toolEvents.filter(e => e.name === READ_PAGE).length
    const first = noPageReadNote({ webSearchOk: toolEvents.filter(e => e.name === 'web_search' && e.outcome === 'ok').length, readPageCalls, pagesRead: ledger.sources.length }, i.lang)
    if (first) return first
    const asked = (userTexts[userTexts.length - 1] ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ')
    // V4: "does the user want a figure" comes from the understanding (any language); the Vietnamese/English word list only until it settles.
    const wantsFigures = understood ? understood.wants_figures : PRICE_INTENT.test(` ${asked} `)
    if (!wantsFigures || !ledger.sources.length) return null
    const withMoney = ledger.guardView().sources.filter(s => extractMoneyClaims(s.passages.join(' \n ')).length > 0).length
    return noFigureReadNote({ priceIntent: true, pagesRead: ledger.sources.length, pagesWithMoney: withMoney, readPageCalls }, i.lang)
  }
  const system = i.context.system + (i.lang === 'en' ? AGENT_SYSTEM_EN_NOTE : '')
  // The static system message of this run: AGENT_SYSTEM_V2 itself unless the consultative flag is on (consultativeVoice.ts).
  // CONSULT_V3 (owner 17/10, consultV3.ts): the short ChatGPT-like persona instead of the 38k-character rule prompt.
  const sharedPrompt = v3 ? CONSULT_V3_SYSTEM : agentSystemV2For(i.consultative === true)
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
    const offersTools = !!o.tools && Object.keys(o.tools).length > 0
    const stepOpts = {
      role,
      systemShared: sharedPrompt,
      system: o.system,
      messages: o.messages,
      tools: (offersTools ? o.tools : undefined) as never,
      parallelTools: true,
      // P2 contract: a rescue (empty re-run / continuation) has the SAME output cap — no ×2 (under C2_REQUEST_BUDGET every call is capped at 4 000).
      maxTokens: i.maxTokens,
      // C2_TOOL_ROUND_EFFORT: the effort of tool-offering rounds only; the answer round keeps its role's effort.
      ...(c2Effort && offersTools && !o.final ? { effort: c2Effort } : {}),
      abortSignal: o.signal,
      // AGENT_MODEL=haiku55: the final trip step (role `plan`) is the runtime's too. No effect with the flag unset.
      agentRuntime: true,
    }
    // C2_STREAM_DATASTREAM: the answer round the loop chose to stream — text deltas go to its gate as they arrive
    const r = o.onTextDelta ? await AI.stepStream({ ...stepOpts, onTextDelta: o.onTextDelta }) : await AI.step(stepOpts)
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
    const r = await AI.step({ role: 'agent', systemShared: sharedPrompt, system: o.system, messages: o.messages, maxTokens: 700, abortSignal: o.signal, budgetKind: 'aux' })
    const usd = Number(((r.providerMetadata as { tappy?: { cost?: { usd?: number } } } | undefined)?.tappy?.cost?.usd) ?? 0)
    return { text: r.text ?? '', promptTokens: r.usage?.promptTokens, completionTokens: r.usage?.completionTokens, usd }
  }

  // M4: the task's carried evidence as this turn found it (the tracker may replace the task after the reply).
  const carriedAtStart = box ? [...(box.task.research_state.evidence ?? [])] : []
  const sigAtStart = box ? taskConstraintsSig(box.task) : null

  return agentStreamResult(async emit => {
    let progressSent = false
    // C2_PROGRESS (P1): a status line before the first model round, one per KIND of lookup when it starts, and one when the answer round after a
    // lookup starts. Fixed server copy only (c2Policy labels) — never the user's words, a query, tool arguments or tool data; never answer text.
    const c2Progress = c2ProgressOn()
    const statusKinds = new Set<string>()
    let writingSent = false
    if (c2Progress) emit(statusFrame('thinking', i.lang))
    const lastResults = new Map<string, unknown>()
    let streamSkippedForSources = false
    emitLine = emit
    // M2: the task tracker (one structured Luna call) runs CONCURRENTLY with the loop — no extra round on the critical path.
    const trackerCtrl = new AbortController()
    const onOuterAbort = () => trackerCtrl.abort()
    i.signal?.addEventListener('abort', onOuterAbort, { once: true })
    const tracking = box ? trackTask({ task: box.task, userText: box.turn.userText, previousReply: box.turn.previousReply, cards: box.turn.cards, lang: i.lang, signal: trackerCtrl.signal, extract: box.extract }) : null
    // TAPPY_ANSWER_V4 layer 1: the question understood by the model (any language), CONCURRENTLY with the loop — nothing waits for it.
    const understanding: Promise<UnderstandResult> | null = v4
      ? understandTurn({ userText: c2UserText, previousUser: userAll.length > 1 ? userAll[userAll.length - 2] : null, previousReply: box?.turn.previousReply ?? null, signal: trackerCtrl.signal, ...(i.understandExtract ? { extract: i.understandExtract } : {}) })
        .then(r => {
          if (r.u) { understood = r.u; i.trace.add('task', { decision: 'understood', ms: r.ms, ...understandingTrace(r.u) }); try { i.onUnderstanding?.(r.u) } catch { /* bookkeeping only */ } }
          else i.trace.add('error', { scope: 'understand', message: r.error ?? 'no_result', ms: r.ms })
          i.trace.counters.usd += r.usd
          return r
        })
      : null
    understandingSettled = understanding
    const ledgerAtStart = serperLedgerSnapshot()
    const turn = await withSerperTurnBudget(i.serperTurnCredits, () => runAgentRuntime({
      system,
      messages,
      tools: gated ? {} : tools,
      schemas,
      callModel,
      ...(i.callModel ? {} : { answerFirstModel }),
      // CONSULTATIVE_IN_AGENT: origin / year / exact-day questions the owner's rule says are never asked first are refused (askGate.ts).
      // CONSULT_V3: no answer-before-lookup check (one extra model call whose preface was stitched before the researched answer); the
      // content floor (thin answer → one retry) and the plan-card retry stay.
      ...(i.consultative === true && v3 ? { dedupeParaphrase: true, cardRetry: true, contentRetry: true, fullAnswerRetry: true, toolStatusTrace: true, skipAnswerFirst: true, taskFrameOn: true, finalRewrite: process.env.CONSULT_V3_FINAL_REWRITE === '1', onTaskFrame: (f: TaskFrame) => { try { i.onTaskFrame?.(f) } catch { /* presentation only */ } }, onTurnContract: (r: TurnResolution) => { try { i.onTurnContract?.(r) } catch { /* bookkeeping only */ } } } : {}),
      ...(i.consultative === true && !v3 ? { dedupeParaphrase: true, parallelAnswerFirst: true, cardRetry: true, contentRetry: true, toolStatusTrace: true, skipAnswerFirst: isVerifyTurn(box?.turn.userText || userTexts[userTexts.length - 1] || '') } : {}),
      // CONSULTATIVE_IN_AGENT (discoveryGate.ts): ask first — no lookup runs, whatever the model proposes. Not under CONSULT_V3 (answer first).
      ...(i.consultative === true && !v3 && i.discoveryAsk === true ? { blockRetrieval: true } : {}),
      // Off with the flag, and on its own by CONSULT_ASK_GATE=off (askGate.ts). Not under CONSULT_V3: the model decides when a question helps.
      ...(i.consultative === true && !v3 && askGateMode() === 'shadow' ? { askGateShadow: true } : {}),
      ...(i.consultative === true && !v3 && askGateEnabled() ? { refuseAsk: (a: { question: string }) => askVerdict(box?.turn.userText || userTexts[userTexts.length - 1] || '', a.question, i.lang, userTexts.slice(-3).join(' \n ')) } : {}),
      // CONSULT_V3 (owner 17/10, ASK-RULE-REQUEST approved: "lập lịch luôn khi đủ thông tin"; rerun 3, uat-4 asked through ask_user): a trip of a
      // stated length is planned before anything is asked — only that one condition (contentFloor.planFirstAskRefusal); at most two refusals per
      // turn (loop.ts), so a later question is still shown.
      ...(i.consultative === true && v3 ? { refuseAsk: () => planFirstAskRefusal(box?.turn.userText || userTexts[userTexts.length - 1] || '', i.lang) } : {}),
      deadlineAt: i.deadlineAt,
      ...(hostedToolTimeouts ? { toolTimeouts: hostedToolTimeouts } : {}),
      signal: i.signal,
      lang: i.lang,
      trace: i.trace,
      disallowedTools: SIDE_EFFECT_TOOLS,
      // LOC-CHIP-01: "Đang tìm chỗ quanh bạn…" only for a place search around a real current location.
      onToolStart: call => {
        if (!progressSent && call.toolName === 'search_places' && i.hasCurrentLocation === true) { progressSent = true; emit(searchingFrame(i.lang)); return }
        // (a place search around a real location already has its own "searching" line above — no second line for it)
        if (c2Progress && !(call.toolName === 'search_places' && progressSent) && !statusKinds.has(call.toolName)) { statusKinds.add(call.toolName); emit(statusFrame('researching', i.lang, progressLabelForTool(call.toolName, i.lang))) }
      },
      ...(c2Progress ? { onRoundStart: (r: { final: boolean; afterLookup: boolean }) => { if (r.final && r.afterLookup && !writingSent) { writingSent = true; emit(statusFrame('writing', i.lang, writingLabel(i.lang))) } } } : {}),
      // RETRIEVAL_V5: a tool call written as text is never shown (toolSyntax.ts); a turn the understanding marks as needing current facts never
      // ends without a lookup (the user's own question goes to web_search when the model answered first)
      ...(v5Research ? {
        toolSyntax: toolSyntaxGuard(i.lang),
        requireLookup: async () => {
          if (!understood && understandingSettled) await Promise.race([understandingSettled, new Promise(r => setTimeout(r, UNDERSTANDING_WAIT_MS))])
          const q = lastUserText(i.messages).replace(/\s+/g, ' ').trim().slice(0, 200)
          if (understood?.needs_fresh_data !== true || !q || !tools.web_search) return null
          return { tool: 'web_search', args: { queries: [i.sanitizeQuery ? i.sanitizeQuery(q).query : q] } }
        },
      } : {}),
      // RETRIEVAL_V5: once a research has completed, the next round writes the answer (one write, its own note); before that, C2's cap if on
      ...(v5Research
        ? { roundPolicy: (s: { toolRounds: number; lastRoundStates: readonly string[]; elapsedMs: number }) => v5Research!.done() ? { final: true, reason: V5_DONE_REASON } : c2RoundCapOn() ? roundDecision({ ...s, plan: c2Plan, softBudgetMs: c2SoftBudgetMs(c2Plan) }) : { final: false, reason: 'v5_research_pending' }, finalNoteFor: (reason: string) => reason === V5_DONE_REASON ? V5_FINAL_NOTE(i.lang, { defaultVietnam: v5Geo().defaultVietnam, replyLanguage: understood?.reply_language ?? null }) : null }
        : c2RoundCapOn() ? { roundPolicy: (s: { toolRounds: number; lastRoundStates: readonly string[]; elapsedMs: number }) => roundDecision({ ...s, plan: c2Plan, softBudgetMs: c2SoftBudgetMs(c2Plan) }) } : {}),
      ...(c2BatchNoteOn() ? { toolRoundNote: batchNote(i.lang) } : {}),
      ...(c2LengthRecoveryOn() ? { lengthRecovery: { continuationPrompt: continuationPrompt(i.lang), maxMs: 8_000 } } : {}),
      // C2_STREAM_DATASTREAM: released answer lines leave as `0:` frames at once (the route's own buffer / SafeFlush decides what the user sees).
      // Never on a plan turn (the card retry may replace the text) or under the final rewrite (it replaces the text).
      ...(c2StreamDataStreamOn() ? { streamAnswer: (t: string) => { currentMarks()?.markOnce('runtime_first_text'); emit(`0:${JSON.stringify(t)}\n`) }, streamable: (() => {
        const base = i.finalRole !== 'plan' && !c2Plan && process.env.CONSULT_V3_FINAL_REWRITE !== '1'
        // C2 P2 6.0 (F-1): news / editorial results let the post-run attribution (resolveNewsMarkers, attributeEditorial) rewrite ANY
        // sentence after the run — such a turn's answer does not stream (asked before every round: results arrive during the loop)
        return () => {
          if (!base) return false
          const sources = newsBook.length > 0 || editorialItemsIn([...lastResults.values()]).length > 0
          if (sources && !streamSkippedForSources) { streamSkippedForSources = true; i.trace.add('budget', { decision: 'stream_skipped', reason: 'news_or_editorial_sources' }) }
          return !sources
        }
      })() } : {}),
      // C2_REQUEST_BUDGET: the request ledger decides, before each round, whether a lookup round still fits WITH the final answer (budgetGate).
      // consult_v3 turns only (§7.2, ledgerInScope above).
      ...(ledgerInScope ? { budgetGate: (o: { system: string; messages: CoreMessage[]; tools?: Record<string, unknown> }) => {
        const b = currentBudget()!
        const chars = sharedPrompt.length + o.system.length + promptChars(o.messages)
        const finalIn = estimateTokens(chars)
        const lookupIn = o.tools ? estimateTokens(chars + promptChars([], o.tools)) : null
        return b.planRound({ lookupInputTokens: lookupIn, finalInputTokens: finalIn, outCap: Math.min(REQUEST_LIMITS.maxOutputPerCall, i.maxTokens + reasoningHeadroomTokens()), minStepMs: RUNTIME_LIMITS.minStepMs })
      } } : {}),
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
      stepNote: ({ toolEvents }) => (i.consultative === true ? consultResearchNote(toolEvents) : null) ?? (toolEvents.filter(e => (e.name === 'web_search' || e.name === READ_PAGE) && e.outcome === 'ok').length >= 2
        ? (i.lang === 'en' ? '\n\nYou have already researched twice this turn. Answer now from the evidence you have, unless one specific key point is still missing.' : '\n\nLượt này đã tra cứu 2 lần. Trả lời ngay từ bằng chứng đã có, trừ khi còn thiếu đúng một điểm then chốt.')
        : null),
      runTool: async (name, signal, fn) => {
        const r = await withSerperToolScope(name === 'get_trip_data' ? TRIP_PART_CREDITS * 3 : RUNTIME_LIMITS.serperCreditsPerTool, signal, fn)
        return { value: r.value, credits: r.spent }
      },
    }))
    const run = turn.value
    // C2 P2: an incomplete answer is SAID as its own annotation (tappy.turn_status.v1) — nothing is appended to the answer text.
    if (run.interrupted) emit(turnStatusFrame('interrupted', 'provider_error'))
    else if (run.incomplete) emit(turnStatusFrame('incomplete', run.incompleteReason ?? 'length_limit'))
    // C2_REQUEST_BUDGET: the ledger of the loop (every model call so far, estimate vs real usage); the task monitor may still add one after it.
    { const b = currentBudget(); if (b) { try { console.log(JSON.stringify({ ...b.summary(), stage: 'after_loop', deadline_ms: i.deadlineAt - b.startedAt })) } catch { /* log only */ } } }
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
    const editorial0 = run.status !== 'asked' ? editorialItemsIn([...lastResults.values()]) : []
    // CONSULT_V3: the model's [N#] news markers become [S#] links first (editorialSources.ts resolveNewsMarkers); the word-pair match then
    // only looks at the articles the model did not cite. An ask carries no source, so its markers are just removed.
    // Off the flag nothing is tagged and nothing here runs.
    if (v3 && run.status === 'asked') run.text = resolveNewsMarkers(run.text, [], 1).text
    const newsCited = (text: string, nextId: number) => !v3 || run.status === 'asked' ? { text, links: [] as SourceLink[] } : resolveNewsMarkers(text, newsBook, nextId)
    const editorialRest = (cited: readonly SourceLink[]) => editorial0.filter(e => !cited.some(l => l.url === e.url))
    let newsLinksCited: SourceLink[] = []
    if (ledger.sources.length && run.status !== 'asked') {
      const c = planCitations(run.text, ledger.sources)
      const nm = newsCited(c.text, ledger.sources.length + 1)
      newsLinksCited = nm.links
      const ed = attributeEditorial(nm.text, editorialRest(nm.links), ledger.sources.length + 1 + nm.links.length)
      run.text = ed.text
      i.trace.citations = (c.cited + nm.links.length + ed.links.length) || Math.min(3, ledger.sources.length)
      try { i.onCitationSources?.([...c.sources, ...nm.links, ...ed.links]) } catch { /* presentation only */ }
    } else if (run.status !== 'asked') {
      // M4 citation integrity: no page was read (all failed / none opened) — a [S#] marker would point at nothing (M4 eval RS-E1 run 2).
      const base = /\[S\d/.test(run.text) ? planCitations(run.text, []).text : run.text
      const nm = newsCited(base, 1)
      newsLinksCited = nm.links
      const ed0 = attributeEditorial(nm.text, editorialRest(nm.links), 1 + nm.links.length)
      const ed = { text: ed0.text, links: [...nm.links, ...ed0.links] }
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
        } else {
          // The reply did not admit it — but a guard may still cut every figure of it at settle time, and the one "chưa xác minh" sentence added
          // there needs a source button. The links are only HELD; nothing is shown unless that sentence is (streamEnrichment.ts).
          const held = unreadableSourceLinks([...lastResults.values()], run.text, 2, true)
          if (held.length) try { i.onUnverifiedSources?.(held) } catch { /* presentation only */ }
        }
      }
    }
    if (editorial0.length) i.trace.add('evidence', { decision: 'editorial_attribution', articles: editorial0.length, cited: (run.text.match(/\[S\d+\]/g) ?? []).length, news_ids: newsBook.length })
    // CONSULT_V3 layouts (owner 17/10, "trình bày và layout như ChatGPT"): the media block the server attaches — the CITED articles' own
    // pictures (news layout), else for a knowledge question the Wikipedia card of the answer's main subject. Built from tool / Wikipedia data
    // only, re-validated (mediaHosts.ts) and emitted as a server-only marker by the enrichment site; never from the model's text.
    // TAPPY_ANSWER_V4: the understanding (normally settled during the loop; waited for at most UNDERSTAND_GRACE_MS more, within the deadline).
    let settledU: TurnUnderstanding | null = null
    if (understanding && run.status !== 'asked') {
      let timer: ReturnType<typeof setTimeout> | undefined
      const grace = Math.max(0, Math.min(UNDERSTAND_GRACE_MS, i.deadlineAt - Date.now() - 1500))
      const r = await Promise.race([understanding, new Promise<null>(res => { timer = setTimeout(() => res(null), grace) })])
      clearTimeout(timer)
      settledU = r?.u ?? null
      if (!r) i.trace.add('timeout', { scope: 'understand', cancelled: false })
    }
    if (v3 && run.status !== 'asked') {
      try {
        const news = citedNewsMedia(newsBook, newsLinksCited)
        if (news.length) {
          const b = sanitizeMediaBlock({ v: 1, kind: 'news', items: news })
          if (b) { i.onMedia?.(b); i.trace.add('evidence', { decision: 'media_news', images: news.length }) }
        }
        if (settledU) {
          // V4 layer 2: subject cards for what the question is ABOUT (one, or a comparison row) and one picture per item of a list answer —
          // read from the understanding, not from the wording. A turn whose places / products already have their own cards gets no item pictures.
          const cardTurn = run.toolEvents.some(e => (e.name === 'search_places' || e.name === 'search_products' || e.name === 'get_hotel_prices') && e.outcome === 'ok')
          const dm = await resolveDocMedia(settledU, run.text, { skipItems: cardTurn, skipEntities: news.length > 0 }, i.docMediaDeps)
          const b = dm.block ? sanitizeMediaBlock(dm.block) : null
          if (b) i.onMedia?.(b)
          const ann = dm.annotation ? sanitizeDocMedia(dm.annotation) : null
          if (ann) emit(docMediaFrame(ann))
          i.trace.add('evidence', { decision: 'media_v4', block: b?.kind ?? null, item_images: ann?.items.length ?? 0, card_turn: cardTurn, ...dm.trace })
        } else if (!news.length && (isKnowledgeQuestion(lastUserText(i.messages)) || afterClarification(i.messages))) {
          const subject = mainSubjectOf(run.text, lastUserText(i.messages))
          const entity = subject ? await fetchWikiEntity(subject, i.lang) : null
          i.trace.add('evidence', { decision: 'media_entity', subject: subject ? subject.slice(0, 60) : null, found: !!entity, image: !!entity?.image })
          if (entity) i.onMedia?.({ v: 1, kind: 'entity', entity })
        }
      } catch { /* presentation only: no media block */ }
    }
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
    // CONSULT_V3 semantic check (phase B, shadow): what the tools returned this turn, for the checker's EVIDENCE. Read-only copy.
    try { i.onToolResults?.([...lastResults.values()]) } catch { /* measurement only */ }
    // Phase 7 parity: the old one-line trace keeps its shape for the dashboards that read it.
    console.log(JSON.stringify({ type: 'tappyai_agent_trace', runtime: 2, trace_id: i.trace.traceId, status: run.status, stop: run.stopReason, model_calls: run.modelCalls, tool_calls: run.toolCalls, tools: run.toolEvents.map(e => ({ round: e.round, name: e.name, why: redactForTrace(e.why), ms: e.ms, outcome: e.outcome })), serper_turn: { spent: turn.spent, refused: turn.refused, limit: i.serperTurnCredits } }))
    return run
  }, i.onFinish)
}

