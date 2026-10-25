// ── CONSULT_TRACE_DIAGNOSTICS (Wave 2C, default OFF) · structured trace of one consultative turn ───────────────────────────────────────────────────────────────────────────────
//
// WHY. The 30-turn run could not say WHERE a turn went wrong: the log has no turn id, no attribution label, no tool RESULT, and "tool called" does not say whether the tool really ran,
// was blocked by a guard, failed, came back empty or returned rows. This module adds one log line type, `tappyai_trace`, one JSON object per line, joined by a `traceId`.
//
// WHAT IT NEVER DOES. It does not change a decision, a tool's arguments or result, a prompt, a stream frame or a default. With the flag OFF (everything but the exact value "1" outside
// a production runtime, consultFlags.ts) `createTurnTrace` returns null and every helper here returns exactly its input: nothing is wrapped, nothing is logged. With the flag ON the
// wrappers pass the very same arguments through and return the very same value (a promise is re-chained so its outcome can be read, which is the only difference, and it exists only
// when ON). Log failures are swallowed: a trace can never break a turn.
//
// WHAT IT LOGS (and what it never logs). Names, counts, states and a SHORT preview of the first rows of a tool result (a name, a host+path without query or fragment, a rating, a review
// count, a price: nothing else). Never a response body, a snippet, an address, a header, a cookie, a token or a key: every string is scrubbed of key/token/e-mail/phone shapes and cut.
//
// TRACE ID. The benchmark names the turn (E1…E25, X1-1…X2) in the request header `x-tappy-trace-id`; this module reads that header only when the flag is ON and only if it is a short
// plain identifier. Without it (any other caller) an id is generated for the request: production never has a benchmark id and none is assumed.
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomBytes } from 'node:crypto'
import { consultTraceDiagnosticsOn } from '@/lib/config/consultFlags'

export const TRACE_EVENT_TYPE = 'tappyai_trace'
export const TRACE_ID_HEADER = 'x-tappy-trace-id'
/** The six states of a tool call (one per `tool` event). A normal call is requested → executed → results|empty|error; a guarded one is requested → blocked. */
export type ToolState = 'requested' | 'executed' | 'blocked' | 'error' | 'empty' | 'results'

const MAX_STRING = 160
const MAX_PREVIEW_ROWS = 3
const TRACE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/

/** Removes key / token / e-mail / phone shapes from a string and cuts it. Pure. */
export function scrubText(s: string, max = MAX_STRING): string {
  const cleaned = s
    .replace(/\bsk-[A-Za-z0-9_-]{6,}/g, '[redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [redacted]')
    .replace(/\b(api[_-]?key|token|secret|password|authorization)\s*[=:]\s*\S+/gi, '$1=[redacted]')
    .replace(/:\/\/[^/\s:@]+:[^/\s@]+@/g, '://[redacted]@')
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '[email]')
    .replace(/(?<![\d])(?:\+?84|0)[\s.-]?\d{2,3}[\s.-]?\d{3}[\s.-]?\d{3,4}(?![\d])/g, '[phone]')
    .replace(/[A-Za-z0-9_]{32,}/g, '[redacted]')
    .replace(/[A-Za-z0-9+/=]{40,}/g, '[redacted]')
  return cleaned.length > max ? cleaned.slice(0, max - 1) + '…' : cleaned
}

/** host + path only (no scheme, credentials, query string or fragment: tracking parameters never reach the log). Pure. */
export function safeUrl(raw: unknown, max = 120): string | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null
  try { const u = new URL(raw.trim()); return scrubText(`${u.hostname}${u.pathname === '/' ? '' : u.pathname}`, max) } catch { return scrubText(raw.split(/[?#]/)[0], max) }
}

const ROW_LISTS = ['results', 'rows', 'items', 'products', 'entities', 'places', 'offers', 'hits', 'data'] as const
const asRecord = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null)
const rowListOf = (result: unknown): unknown[] | null => {
  if (Array.isArray(result)) return result
  const r = asRecord(result)
  if (r) for (const k of ROW_LISTS) if (Array.isArray(r[k])) return r[k] as unknown[]
  return null
}

export interface ToolResultSummary {
  /** `blocked` only for the shared "no more searches" answer (error search_budget_used). */
  outcome: 'results' | 'empty' | 'error' | 'blocked'
  rows: number | null
  provider: string
  errorKind: string | null
  /** completed: a provider answered (rows or none); failed: the provider/tool failed; not_attempted: the tool answered without looking anything up; unknown. */
  lookup: 'completed' | 'failed' | 'not_attempted' | 'unknown'
  hasNote: boolean
  preview: Array<Record<string, unknown>>
}

const NOT_ATTEMPTED_ERRORS = new Set(['no_current_location', 'search_budget_used'])

/** Pure. Reads the SHAPE of a tool result and keeps a small, scrubbed preview. It never keeps a body, a snippet or an address. */
export function summarizeToolResult(result: unknown): ToolResultSummary {
  const r = asRecord(result)
  const list = rowListOf(result)
  const rows = list ? list.length : null
  const src = r && typeof r.source === 'string' ? r.source : ''
  const provider = /serper/i.test(src) ? 'serper' : /duckduckgo/i.test(src) ? 'duckduckgo' : /osm|openstreetmap|overpass|nominatim/i.test(src) ? 'osm' : src ? scrubText(src.toLowerCase(), 30) : (r && typeof r.provider === 'string' ? scrubText(r.provider.toLowerCase(), 30) : 'none')
  const hasNote = !!r && typeof r.note === 'string' && r.note.trim() !== ''
  const errorKind = r && typeof r.error === 'string' && r.error.trim() !== '' ? scrubText(r.error, 60) : (r && r.provider_status === 'error' ? 'provider_status_error' : null)
  const preview: Array<Record<string, unknown>> = []
  for (const row of (list ?? []).slice(0, MAX_PREVIEW_ROWS)) {
    const o = asRecord(row)
    if (!o) continue
    const name = typeof o.name === 'string' ? o.name : typeof o.title === 'string' ? o.title : null
    const entry: Record<string, unknown> = {}
    if (name) entry.name = scrubText(name, 80)
    const link = safeUrl(o.link ?? o.url ?? o.website_uri ?? o.maps_link)
    if (link) entry.url = link
    if (typeof o.rating === 'number') entry.rating = o.rating
    const reviews = o.reviewCount ?? o.user_ratings_total ?? o.ratingCount ?? o.reviews
    if (typeof reviews === 'number') entry.reviews = reviews
    if (typeof o.price === 'string' || typeof o.price === 'number') entry.price = scrubText(String(o.price), 30)
    if (Object.keys(entry).length) preview.push(entry)
  }
  if (errorKind === 'search_budget_used') return { outcome: 'blocked', rows, provider, errorKind, lookup: 'not_attempted', hasNote, preview }
  if (errorKind) return { outcome: 'error', rows, provider, errorKind, lookup: NOT_ATTEMPTED_ERRORS.has(errorKind) ? 'not_attempted' : 'failed', hasNote, preview }
  if (result === null || result === undefined) return { outcome: 'empty', rows: null, provider, errorKind: 'no_result', lookup: 'unknown', hasNote, preview }
  if (rows === 0) return { outcome: 'empty', rows, provider, errorKind: null, lookup: 'completed', hasNote, preview }
  if (rows !== null) return { outcome: 'results', rows, provider, errorKind: null, lookup: 'completed', hasNote, preview }
  // an object with no row list (weather, price, a plan): results when it holds more than a note and a search link, otherwise empty
  const keys = r ? Object.keys(r).filter(k => !['note', 'search_url', 'retrieved_at'].includes(k)) : []
  return keys.length ? { outcome: 'results', rows: null, provider, errorKind: null, lookup: 'completed', hasNote, preview } : { outcome: 'empty', rows: null, provider, errorKind: null, lookup: 'unknown', hasNote, preview }
}

/** The few argument fields worth seeing (a query, a place, a route), scrubbed and cut; other argument names are listed without values. */
export function summarizeToolArgs(args: unknown): Record<string, unknown> {
  const a = asRecord(args)
  if (!a) return {}
  const out: Record<string, unknown> = {}
  for (const k of ['query', 'location', 'type', 'origin', 'destination', 'checkIn', 'checkOut', 'departDate']) if (typeof a[k] === 'string') out[k] = scrubText(a[k] as string)
  const other = Object.keys(a).filter(k => !(k in out))
  if (other.length) out.otherArgs = other.slice(0, 8)
  return out
}

export interface ToolCounters { requested: number; executed: number; blocked: number; error: number; empty: number; results: number }

export interface TurnTrace {
  readonly traceId: string
  /** `generated` = no benchmark id was given for this request. */
  readonly idSource: 'header' | 'generated'
  readonly counters: ToolCounters
  emit(ev: string, fields?: Record<string, unknown>): void
  nextCall(): number
}

type HeaderLike = { get(name: string): string | null } | undefined | null
type Env = Record<string, string | undefined>

/** null when the flag is OFF (or a production runtime): the caller then does nothing at all. */
export function createTurnTrace(headers: HeaderLike, env: Env = process.env, now: () => number = Date.now, log: (line: string) => void = line => console.log(line)): TurnTrace | null {
  if (!consultTraceDiagnosticsOn(env)) return null
  let given: string | null = null
  try { given = headers?.get(TRACE_ID_HEADER) ?? null } catch { given = null }
  // a plain identifier that does not LOOK like a key / token (scrubText would change it): the id ends up in every log line
  const fromHeader = typeof given === 'string' && TRACE_ID_RE.test(given.trim()) && scrubText(given.trim(), 41) === given.trim() ? given.trim() : null
  const traceId = fromHeader ?? `t-${randomBytes(4).toString('hex')}`
  const t0 = now()
  let seq = 0
  let calls = 0
  const counters: ToolCounters = { requested: 0, executed: 0, blocked: 0, error: 0, empty: 0, results: 0 }
  const clean = (_k: string, v: unknown): unknown => (typeof v === 'string' ? scrubText(v, 200) : v)
  return {
    traceId, idSource: fromHeader ? 'header' : 'generated', counters,
    emit(ev, fields = {}) {
      try { log(JSON.stringify({ type: TRACE_EVENT_TYPE, ev, traceId, seq: ++seq, ms: now() - t0, ...fields }, clean)) } catch { /* a trace must never change what the user gets */ }
    },
    nextCall: () => ++calls,
  }
}

interface CallScope { call: number; tool: string; executed: boolean; trace: TurnTrace }
const callStore = new AsyncLocalStorage<CallScope>()
type ExecFn = (...a: unknown[]) => unknown
const readCounter = (f?: () => number): number | null => { try { const n = f ? f() : null; return typeof n === 'number' && Number.isFinite(n) ? n : null } catch { return null } }
const isThenable = (v: unknown): v is PromiseLike<unknown> => v !== null && typeof v === 'object' && typeof (v as { then?: unknown }).then === 'function'

function emitOutcome(trace: TurnTrace, call: number, tool: string, by: string, sum: ToolResultSummary, ms: number, serperRequests: number | null = null): void {
  const state: ToolState = sum.outcome
  trace.counters[state]++
  trace.emit('tool', {
    state, call, tool, by, rows: sum.rows, provider: sum.provider, lookup: sum.lookup, errorKind: sum.errorKind, hasNote: sum.hasNote, preview: sum.preview, toolMs: ms,
    // Serper requests SENT while the call ran (a process-wide counter: concurrent turns could add to it). 0 next to state "results" means the answer came without a Serper request (a cache).
    ...(serperRequests !== null ? { serperRequests } : {}),
    ...(state === 'blocked' ? { reason: 'search_budget_used', reachedProvider: false } : {}),
  })
}

/**
 * OUTERMOST layer (the tool set the model's stream receives). A model request is `requested`; if the call never reaches the tool body (a guard answered it) it is `blocked` here.
 * `search_budget_used` is the shared answer of the final-synthesis / plan-budget guards and of the web ticket: it is never counted as a request that reached a provider.
 */
export function traceToolsOuter<T>(set: T, trace: TurnTrace | null): T {
  if (!trace || !set) return set
  return Object.fromEntries(Object.entries(set as Record<string, { execute?: ExecFn }>).map(([name, t]) => [name, !t?.execute ? t : {
    ...t,
    execute: (args: unknown, ctx: unknown) => {
      const scope: CallScope = { call: trace.nextCall(), tool: name, executed: false, trace }
      trace.counters.requested++
      trace.emit('tool', { state: 'requested', call: scope.call, tool: name, by: 'model', args: summarizeToolArgs(args) })
      const done = (v: unknown): unknown => {
        if (!scope.executed) {
          const sum = summarizeToolResult(v)
          if (sum.outcome === 'blocked') emitOutcome(trace, scope.call, name, 'guard', sum, 0)
          else { trace.counters.error++; trace.emit('tool', { state: 'error', call: scope.call, tool: name, by: 'model', errorKind: 'not_executed', reachedProvider: false, lookup: 'not_attempted' }) }
        }
        return v
      }
      const failed = (e: unknown): never => {
        if (!scope.executed) { trace.counters.error++; trace.emit('tool', { state: 'error', call: scope.call, tool: name, by: 'model', errorKind: 'threw_before_execute', lookup: 'not_attempted' }) }
        throw e
      }
      return callStore.run(scope, () => {
        let r: unknown
        try { r = (t.execute as ExecFn)(args, ctx) } catch (e) { return failed(e) }
        return isThenable(r) ? Promise.resolve(r).then(done, failed) : done(r)
      })
    },
  }])) as T
}

/**
 * INNERMOST layer, assigned in place like the other wrappers (so the code's own pre-search, which calls these same objects, is seen too). It proves the tool body RAN (`executed`) and
 * reads its result. Called from inside a model request it joins that request's call number; called by code (the pre-search) it opens its own `requested` event with by:"code".
 */
export function traceToolsInner<T>(tools: T, trace: TurnTrace | null, serperSent?: () => number): T {
  if (!trace || !tools) return tools
  for (const [name, t] of Object.entries(tools as Record<string, { execute?: ExecFn }>)) {
    const orig = t?.execute
    if (typeof orig !== 'function') continue
    t.execute = function (this: unknown, ...a: unknown[]): unknown {
      const scope = callStore.getStore()
      const by = scope ? 'model' : 'code'
      const call = scope?.call ?? trace.nextCall()
      if (scope) scope.executed = true
      else { trace.counters.requested++; trace.emit('tool', { state: 'requested', call, tool: name, by, args: summarizeToolArgs(a[0]) }) }
      trace.counters.executed++
      trace.emit('tool', { state: 'executed', call, tool: name, by })
      const t0 = Date.now()
      const sent0 = readCounter(serperSent)
      const ok = (v: unknown): unknown => { const s1 = readCounter(serperSent); emitOutcome(trace, call, name, by, summarizeToolResult(v), Date.now() - t0, sent0 !== null && s1 !== null ? s1 - sent0 : null); return v }
      const bad = (e: unknown): never => {
        trace.counters.error++
        trace.emit('tool', { state: 'error', call, tool: name, by, errorKind: 'threw', lookup: 'failed', toolMs: Date.now() - t0 })
        throw e
      }
      let r: unknown
      try { r = orig.apply(this, a) } catch (e) { return bad(e) }
      return isThenable(r) ? Promise.resolve(r).then(ok, bad) : ok(r)
    }
  }
  return tools
}
