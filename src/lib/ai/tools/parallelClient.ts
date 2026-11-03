// ── CONSULT_PARALLEL (30/10/2026): the one door to Parallel (api.parallel.ai) — Search and Extract (LOCALHOST ONLY) ─────────────────────────
//
// Owner 30/10: "kết hợp Parallel vào và chạy lại". Two uses, both behind CONSULT_PARALLEL (consultFlags.ts; always OFF in production):
//   · Extract — the consult page reader's fallback (readPage.ts `extractFallback`): a page the reader could not read (blocked, timed out,
//     JavaScript-rendered, thin) is read once more by Parallel. Measured 30/10 on 20 Vietnamese URLs: Extract read 17/20, the reader 13/20;
//     Parallel won on hotel pages that need JavaScript, tied on large stores, both lost on Shopee / Agoda / SJC.
//   · Search — web_search's fallback when Serper gives no rows (an exhausted Serper account answered HTTP 400 "credits" all of 30/10).
//     Parallel Search against Serper on Vietnamese questions is NOT measured yet.
//
// Request (docs.parallel.ai, OpenAPI read 30/10/2026): POST /v1/search {objective, search_queries[], mode} -> results[].{url, title,
// publish_date, excerpts[]}; POST /v1/extract {urls[], objective, advanced_settings.full_content.max_chars_per_result} -> results[].{url,
// title, full_content, excerpts[]}, errors[].{url, error_type}. Auth: the `x-api-key` header (the only scheme the spec defines). Only host
// api.parallel.ai; a redirect is never followed; 8 s cap (measured: a dead page held Parallel 18-60 s).
// PRICE (docs pricing page, read 30/10/2026): search mode "fast" 1 USD / 1000 requests, extract 1 USD / 1000 URLs. Each request books its
// price BEFORE it is sent: at most 1 search + 3 extracts per turn and a process-wide 5 USD per UTC day.
// SAFETY: Parallel text is untrusted data — every title / excerpt / page line goes through the Serper cleaner (serperUntrusted.ts: URLs out of
// free text, an instruction-marked sentence dropped). The key is read from the environment, passed as a parameter, never logged, never returned.
// PRIVACY - A STOP GATE FOR PRODUCTION: this sends the model's query and the page URL to a new processor (Parallel); the privacy page lists only
// OpenAI. Turning it on in production is the Owner's product and legal decision (privacy page + AI-data consent).

import { cleanUntrustedText } from './serperUntrusted'

export const PARALLEL_SEARCH_URL = 'https://api.parallel.ai/v1/search'
export const PARALLEL_EXTRACT_URL = 'https://api.parallel.ai/v1/extract'
export const PARALLEL_TIMEOUT_MS = 8_000
export const PARALLEL_EXTRACT_MAX_CHARS = 20_000
/** Characters of excerpts kept per search row (Serper snippets are ~200; Parallel excerpts are whole passages). */
export const PARALLEL_SNIPPET_MAX_CHARS = 2_000
export const PARALLEL_DAILY_USD_CAP = 5
/** Parallel prices read 30/10/2026 (docs pricing page). */
export const PARALLEL_PRICE = { searchFastUsd: 1 / 1000, extractPerUrlUsd: 1 / 1000, readOn: '2026-10-30' } as const

export type ParallelFetch = (url: string, init: { method: string; headers: Record<string, string>; body: string; redirect: 'manual'; signal: AbortSignal }) => Promise<{ status: number; json(): Promise<unknown> }>

export interface ParallelRow { title: string; link: string; snippet: string; date?: string }
export type ParallelSearchOutcome = { ok: true; rows: ParallelRow[] } | { ok: false; rows: []; reason: string }
export type ParallelExtractOutcome = { ok: true; title: string; text: string } | { ok: false; reason: string }

interface CallOpts { apiKey: string; fetchImpl?: ParallelFetch; timeoutMs?: number; signal?: AbortSignal }

/** One POST to Parallel. Never throws: { status, json } or a failure reason (no key, no text in the reason). */
async function post(url: string, body: unknown, o: CallOpts): Promise<{ ok: true; json: unknown } | { ok: false; reason: string }> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), o.timeoutMs ?? PARALLEL_TIMEOUT_MS)
  const onOuter = () => ctl.abort()
  o.signal?.addEventListener('abort', onOuter)
  try {
    const f = o.fetchImpl ?? (fetch as unknown as ParallelFetch)
    const res = await f(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': o.apiKey }, body: JSON.stringify(body), redirect: 'manual', signal: ctl.signal })
    if (res.status !== 200) return { ok: false, reason: `http_${res.status}` }
    return { ok: true, json: await res.json() }
  } catch (e) {
    return { ok: false, reason: ctl.signal.aborted ? (o.signal?.aborted ? 'aborted' : 'timeout') : (e instanceof Error ? e.name : 'error') }
  } finally {
    clearTimeout(timer)
    o.signal?.removeEventListener('abort', onOuter)
  }
}

const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : [])

/** One Parallel search for the model's own query. Rows shaped like a Serper organic row (title, link, snippet, date). */
export async function parallelSearch(query: string, o: CallOpts): Promise<ParallelSearchOutcome> {
  const r = await post(PARALLEL_SEARCH_URL, { objective: query, search_queries: [query], mode: 'fast' }, o)
  if (!r.ok) return { ok: false, rows: [], reason: r.reason }
  const results = (r.json && typeof r.json === 'object' && Array.isArray((r.json as { results?: unknown }).results) ? (r.json as { results: unknown[] }).results : []) as Array<Record<string, unknown>>
  const rows: ParallelRow[] = []
  for (const x of results) {
    const link = typeof x?.url === 'string' && /^https:\/\//.test(x.url) ? x.url : null
    if (!link) continue
    const snippet = strings(x.excerpts).map(e => cleanUntrustedText('snippet', e)).filter(Boolean).join(' … ').slice(0, PARALLEL_SNIPPET_MAX_CHARS)
    const date = typeof x.publish_date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(x.publish_date) ? x.publish_date.slice(0, 10) : undefined
    rows.push({ title: cleanUntrustedText('title', typeof x.title === 'string' ? x.title : ''), link, snippet, ...(date ? { date } : {}) })
  }
  return { ok: true, rows }
}

/** The text of a page, line by line through the untrusted-text cleaner (line breaks kept: the reader's extractor uses them). */
const cleanLines = (t: string): string => t.split('\n').map(l => (l.trim() ? cleanUntrustedText('snippet', l) : '')).join('\n').replace(/\n{3,}/g, '\n\n').trim()

/** Parallel reads one https page. The full content (bounded) when it has one, else its excerpts. */
export async function parallelExtract(url: string, objective: string, o: CallOpts): Promise<ParallelExtractOutcome> {
  if (!/^https:\/\//.test(url)) return { ok: false, reason: 'not_https' }
  const r = await post(PARALLEL_EXTRACT_URL, { urls: [url], ...(objective.trim() ? { objective: objective.trim() } : {}), advanced_settings: { full_content: { max_chars_per_result: PARALLEL_EXTRACT_MAX_CHARS } } }, o)
  if (!r.ok) return { ok: false, reason: r.reason }
  const j = (r.json && typeof r.json === 'object' ? r.json : {}) as { results?: unknown; errors?: unknown }
  const row = (Array.isArray(j.results) ? j.results : [])[0] as Record<string, unknown> | undefined
  if (!row) {
    const err = (Array.isArray(j.errors) ? j.errors : [])[0] as Record<string, unknown> | undefined
    return { ok: false, reason: typeof err?.error_type === 'string' ? err.error_type.replace(/[^a-z0-9_]/gi, '').slice(0, 40) || 'error' : 'no_result' }
  }
  const full = typeof row.full_content === 'string' ? row.full_content : ''
  const text = cleanLines(full.trim() ? full : strings(row.excerpts).join('\n\n'))
  if (!text) return { ok: false, reason: 'empty' }
  return { ok: true, title: cleanUntrustedText('title', typeof row.title === 'string' ? row.title : ''), text }
}

// ── spend: per turn and per UTC day (process-wide, in memory; localhost only) ──
let daySpend = { day: '', usd: 0 }
export function __resetParallelDailySpend(): void { daySpend = { day: '', usd: 0 } }
export function parallelDailySpendUsd(): number { return daySpend.usd }

export interface ParallelTurnBudget { take(kind: 'search' | 'extract'): boolean }

/** At most `searches` searches and `extracts` extracts in one turn; each take books its price against the daily cap BEFORE the request. */
export function createParallelTurnBudget(o: { searches?: number; extracts?: number; dailyCapUsd?: number; now?: () => number } = {}): ParallelTurnBudget {
  const left = { search: o.searches ?? 1, extract: o.extracts ?? 3 }
  const cap = o.dailyCapUsd ?? PARALLEL_DAILY_USD_CAP
  const now = o.now ?? Date.now
  return {
    take(kind) {
      if (left[kind] <= 0) return false
      const day = new Date(now()).toISOString().slice(0, 10)
      if (daySpend.day !== day) daySpend = { day, usd: 0 }
      const price = kind === 'search' ? PARALLEL_PRICE.searchFastUsd : PARALLEL_PRICE.extractPerUrlUsd
      if (daySpend.usd + price > cap + 1e-9) return false
      daySpend.usd += price
      left[kind]--
      return true
    },
  }
}
