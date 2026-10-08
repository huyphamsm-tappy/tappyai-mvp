// ── Phase 8 agent runtime — the per-run trace ──────────────────────────────────────────────────────────────────────────────
//
// One AgentRunTrace per turn. It records, in order, every model round, tool call, tool result, timeout, retry, budget decision,
// guard action and the final output — enough to reconstruct the run. At the end of the response stream it is emitted ONCE:
//
//   · console line `tappyai_agent_run_trace` — the full structured trace (operational detail: tool names, redacted search queries,
//     input hashes, guard stages with removed-character counts). No secrets (cutSecrets), no raw tool results, no model reasoning.
//   · Cloud Logging event `tappyai_agent_run` (observability/events.ts AgentRunEvent) — counters and closed vocabularies only,
//     through the allow-listed sink.
//
// The trace never changes what the user gets: every hook is observation only and swallows its own errors.

import { createHash, randomUUID } from 'node:crypto'
import { recordEvent } from '@/lib/observability'
import { cutSecrets } from '../guards'

export type TraceKind = 'model_round' | 'tool_call' | 'tool_result' | 'timeout' | 'retry' | 'budget' | 'guard' | 'ask' | 'error' | 'final'
export interface TraceEvent { seq: number; t: number; kind: TraceKind; [k: string]: unknown }

export type OutputType = 'text' | 'ask' | 'cards' | 'plan'

const sha = (s: string, n = 16) => createHash('sha256').update(s).digest('hex').slice(0, n)

const stable = (v: unknown): string => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  return `{${Object.keys(v as Record<string, unknown>).sort().map(k => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`
}

/** Hash of a tool's (guarded) arguments — joins identical calls across runs without logging the arguments themselves. */
export const toolInputHash = (name: string, args: unknown): string => sha(`${name}|${stable(args)}`)

/** The search query a tool was given, redacted of secret / contact shapes and capped (null when the tool has none). */
export function traceQuery(args: Record<string, unknown> | undefined): string | null {
  const q = args?.query ?? args?.q ?? args?.movieTitle ?? args?.destination ?? args?.location
  return typeof q === 'string' && q.trim() ? cutSecrets(q).text.slice(0, 100) : null
}

const ROW_KEYS = ['results', 'places', 'hotels', 'products', 'shopping_results', 'articles', 'titles', 'events', 'booking_links', 'film_links']
/** How many rows a tool result carried (the largest row list), for the trace. */
export function resultCount(result: unknown): number {
  if (!result || typeof result !== 'object') return 0
  let n = 0
  const r = result as Record<string, unknown>
  for (const k of ROW_KEYS) if (Array.isArray(r[k])) n = Math.max(n, (r[k] as unknown[]).length)
  for (const k of ['hotels', 'attractions', 'food']) { const sub = r[k]; if (sub && typeof sub === 'object' && !Array.isArray(sub)) n += resultCount(sub) }
  return n
}

export interface TraceInit {
  chatSessionId?: string | null
  messageCount: number
  provider: string
  serperLimit: number
  deadlineMs: number
  flag: string
  now?: () => number
}

export class AgentRunTrace {
  readonly traceId = randomUUID()
  readonly messageId = randomUUID()
  readonly conversationId: string | null
  /** M2 (persistent task state) fills this; null until then. */
  taskId: string | null = null
  readonly started: number
  private readonly now: () => number
  readonly events: TraceEvent[] = []
  model: string | null = null
  readonly provider: string
  readonly serperLimit: number
  readonly deadlineMs: number
  readonly flag: string
  readonly messageCount: number
  counters = { modelRounds: 0, toolCalls: 0, timeouts: 0, retries: 0, budgetRefusals: 0, errors: 0, guardChanges: 0, guardCharsRemoved: 0, promptTokens: 0, completionTokens: 0, usd: 0, serperCredits: 0 }
  status = 'running'
  stopReason = 'running'
  private emitted = false

  constructor(i: TraceInit) {
    this.now = i.now ?? Date.now
    this.started = this.now()
    this.conversationId = i.chatSessionId ? sha(`conv|${i.chatSessionId}`, 24) : null
    this.provider = i.provider
    this.serperLimit = i.serperLimit
    this.deadlineMs = i.deadlineMs
    this.flag = i.flag
    this.messageCount = i.messageCount
  }

  add(kind: TraceKind, data: Record<string, unknown> = {}): void {
    try { this.events.push({ seq: this.events.length + 1, t: this.now() - this.started, kind, ...data }) } catch { /* trace only */ }
  }

  modelRound(d: { round: number; final: boolean; ms: number; decision: string; toolCalls: number; promptTokens?: number; completionTokens?: number; usd?: number; fellBack?: boolean; primaryAborted?: boolean; fallbackReason?: string; modelId?: string; finishReason?: string }): void {
    this.counters.modelRounds++
    this.counters.promptTokens += d.promptTokens ?? 0
    this.counters.completionTokens += d.completionTokens ?? 0
    this.counters.usd += d.usd ?? 0
    if (d.modelId) this.model = d.modelId
    this.add('model_round', { round: d.round, final: d.final, ms: d.ms, decision: d.decision, tool_calls: d.toolCalls, tokens_in: d.promptTokens ?? 0, tokens_out: d.completionTokens ?? 0, usd: round7(d.usd ?? 0), finish: d.finishReason ?? null })
    if (d.fellBack) { this.counters.retries++; this.add('retry', { round: d.round, scope: 'model', primary_aborted: d.primaryAborted === true, reason: (d.fallbackReason ?? '').slice(0, 80) }) }
  }

  guard(stage: string, before: string, after: string): void {
    try {
      this.counters.guardChanges++
      const removed = Math.max(0, before.length - after.length)
      this.counters.guardCharsRemoved += removed
      this.add('guard', { stage, chars_before: before.length, chars_after: after.length, removed, added: Math.max(0, after.length - before.length) })
    } catch { /* trace only */ }
  }

  /**
   * Emits the trace once, at the end of the response stream. `delivered` = the reply text the client received (`0:` frames),
   * `cards` = the number of place cards the server annotated (tappy.places.v1).
   */
  finish(o: { delivered: string; cards: number }): void {
    if (this.emitted) return
    this.emitted = true
    try {
      const outputType: OutputType = /\[TAPPY_PLAN\][\s\S]*\[\/TAPPY_PLAN\]/.test(o.delivered) ? 'plan' : this.status === 'asked' ? 'ask' : (o.cards > 0 || /\[TAPPY_SHOPPING\]/.test(o.delivered)) ? 'cards' : 'text'
      const elapsedMs = this.now() - this.started
      this.add('final', { output_type: outputType, chars: o.delivered.length, cards: o.cards, status: this.status, stop: this.stopReason })
      console.log(JSON.stringify({
        type: 'tappyai_agent_run_trace',
        trace_id: this.traceId, conversation_id: this.conversationId, task_id: this.taskId, message_id: this.messageId, message_count: this.messageCount,
        flag: this.flag, provider: this.provider, model: this.model, model_role: 'agent',
        status: this.status, stop_reason: this.stopReason, final_output_type: outputType,
        limits: { serper: this.serperLimit, deadline_ms: this.deadlineMs },
        totals: { ...this.counters, usd: round7(this.counters.usd), elapsed_ms: elapsedMs },
        events: this.events,
      }))
      recordEvent({
        type: 'tappyai_agent_run', traceId: this.traceId, ...(this.conversationId ? { sessionHash: this.conversationId } : {}),
        agentStatus: this.status, stopReason: this.stopReason, outputType, providerId: this.provider, modelRole: 'agent',
        modelRounds: this.counters.modelRounds, toolCalls: this.counters.toolCalls, serperCredits: this.counters.serperCredits, serperLimit: this.serperLimit,
        timeouts: this.counters.timeouts, retries: this.counters.retries, budgetRefusals: this.counters.budgetRefusals, errors: this.counters.errors,
        guardChanges: this.counters.guardChanges, promptTokens: this.counters.promptTokens, completionTokens: this.counters.completionTokens,
        costMicroUsd: Math.round(this.counters.usd * 1e6), elapsedMs,
      })
    } catch { /* trace only */ }
  }
}

const round7 = (n: number) => Math.round(n * 1e7) / 1e7

/**
 * Pass-through stream that ends the trace when the response ends: it reads the `0:` text and the `8:` place-card annotation as they go
 * by (unchanged) and calls `trace.finish` in flush. null trace → a plain pass-through.
 */
export function traceTailStream(trace: AgentRunTrace | null): TransformStream<Uint8Array, Uint8Array> {
  if (!trace) return new TransformStream<Uint8Array, Uint8Array>()
  const dec = new TextDecoder()
  let buf = ''
  let text = ''
  let cards = 0
  const read = (line: string) => {
    if (line.startsWith('0:')) { try { text += String(JSON.parse(line.slice(2))) } catch { /* not text */ } return }
    if (line.startsWith('8:')) {
      try {
        const arr = JSON.parse(line.slice(2)) as Array<{ kind?: string; items?: unknown[] }>
        for (const a of Array.isArray(arr) ? arr : [arr]) if (a?.kind === 'tappy.places.v1' && Array.isArray(a.items)) cards = Math.max(cards, a.items.length)
      } catch { /* not an annotation */ }
    }
  }
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, c) {
      c.enqueue(chunk)
      try {
        buf += dec.decode(chunk, { stream: true })
        let i: number
        while ((i = buf.indexOf('\n')) >= 0) { read(buf.slice(0, i)); buf = buf.slice(i + 1) }
      } catch { /* trace only */ }
    },
    flush() {
      try { if (buf) read(buf) } catch { /* trace only */ }
      trace.finish({ delivered: text, cards })
    },
  })
}
