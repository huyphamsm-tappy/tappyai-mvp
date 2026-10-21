// TAPPY_ANSWER_V4 — the web lookups run on OpenAI's hosted web search (owner 19/10 night: "đổi bộ máy tra cứu").
//
// Why: the lookup autopsy (consult-v3/c2/v4/C2-LOOKUP-ROOTCAUSE-20261019.md) traced every lost lookup to the in-house chain — Serper's 10 results
// that never held the right page, a page reader that kept ~1 % of a page, an output cap that cut tables to 12 rows, a "news" tool that matched
// one shared word in 90 RSS items. The parity reference, which won every lookup question with the SAME model, used the hosted web_search tool.
// So on V4 the `web_search` and `get_news` tools keep their names and arguments (the model's contract does not change) but are served by ONE
// hosted-search call: it searches, reads the pages (JavaScript pages too), and returns a compact factual brief with url citations.
//
// The brief stays inside Tappy's own machinery:
//   · every cited URL becomes a ledger source S1, S2… (its citing sentences are the source's extract), so citation chips, the evidence store, the
//     No-Fabrication Gate and the link egress all see it exactly as a page Tappy read; the URLs are allowed for read_page;
//   · the result is a tool result — fenced and cleaned by the tool-output guard like any other;
//   · spend: the adapter's in-process cap and call log; at most MAX_CALLS hosted searches per turn, MAX_SEARCHES search calls inside each.
// Off the flag, or without the Responses adapter, or with TAPPY_V4_HOSTED_SEARCH=0: the former tools, unchanged.

import { AI } from '@/lib/ai/llm'
import { hostedWebSearch, responsesEnabled, type HostedSearchResult } from '@/lib/ai/llm/providers/openai'
import { EvidenceLedger, candidateClaims } from '@/lib/ai/agent/runtime/evidence'
import type { PageDoc } from '@/lib/ai/agent/runtime/pageExtract'
import type { ClaimKind } from '@/lib/ai/agent/runtime/sourceType'
import type { AgentRunTrace } from '@/lib/ai/agent/runtime/trace'

/** Hosted searches one turn may run (each one returns a whole brief). */
export const MAX_CALLS = 2
/** Search calls the hosted tool may make inside one hosted search (acceptance 19/10: 3 at effort low gave thinner briefs than the reference). */
export const MAX_SEARCHES = 4
/** Reasoning effort of the hosted search — the parity reference's own setting. */
export const SEARCH_EFFORT = 'medium' as const
/**
 * Time budget of one hosted search as a runtime tool (the runtime's default is 15 s per tool). Measured on UAT 19/10: 7–22 s per hosted search;
 * at 15 s the 16.3 s / 21.8 s searches of a turn were both cut and their findings lost. The turn deadline and final reserve still bound it.
 */
export const HOSTED_TOOL_TIMEOUT_MS = 40_000

export function hostedSearchOn(env: Record<string, string | undefined> = process.env, configured: () => boolean = () => AI.isConfigured()): boolean {
  // credentials are the adapter's business (architecture rule no-vendor-api-keys): the AI layer says whether the active provider is configured
  return (env.TAPPY_V4_HOSTED_SEARCH ?? '1').trim() !== '0' && responsesEnabled(env) && configured()
}

const INSTRUCTIONS = `You research the web for another assistant that will answer a user. Find current, concrete facts that answer what the user needs: exact figures, times, dates, prices, names, addresses, steps, requirements, conditions — each with its date or period when the source gives one. Prefer official and primary sources (government, operators, companies) and reputable outlets; for news, the latest dated events.
Where the user is: decided by the USER'S MESSAGE, never by the suggested queries. If the message names or clearly implies a place or country, search there; otherwise the user is in Vietnam — search for Vietnam (Vietnamese banks, prices in VND, Vietnamese procedures and operators), even when the message is in another language and even when the suggested queries assume another country.
Write a compact factual brief in the reply language given in the input (else the language of the user's message) — never in the language of the sources or of the user's country: short bullet points, each fact followed by its citation. No advice, no greeting, no filler. If something could not be found, say so in one line.`

export interface HostedResearchInput {
  ledger: EvidenceLedger
  /** Allows a URL for read_page (it appeared in this research). */
  allow: (url: string) => void
  lang: string
  userText: string
  trace: AgentRunTrace
  country?: string
  now?: () => Date
  /** Test seam: the hosted call. */
  search?: (o: Parameters<typeof hostedWebSearch>[0]) => Promise<HostedSearchResult>
  /** Spend of each hosted search (the turn's counters). */
  onSpend?: (usd: number) => void
  /**
   * The reply language the model understanding read from the user's message (BCP-47; any language), once it has settled. Acceptance 19/10: an
   * English question about loans got a Vietnamese brief (Vietnamese sources) and a Vietnamese answer — the brief is written in this language.
   * May be async (the runtime waits briefly for an understanding still running).
   */
  replyLanguage?: () => string | null | Promise<string | null>
}

const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' } }
const strs = (v: unknown): string[] => (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim().slice(0, 200))

/** One hosted researcher per turn; `execute(kind)` serves web_search ('web') or get_news ('news') with their usual arguments. */
export function createHostedResearch(i: HostedResearchInput) {
  let calls = 0
  const run = i.search ?? hostedWebSearch
  const L = i.lang === 'en'
  return {
    execute: (mode: 'web' | 'news') => async (args: Record<string, unknown>, ctx?: { abortSignal?: AbortSignal }): Promise<Record<string, unknown>> => {
      const queries = [...strs(args.queries), ...strs(args.query)].slice(0, 3)
      const focus = typeof args.focus === 'string' ? args.focus.slice(0, 300) : ''
      if (calls >= MAX_CALLS) {
        i.trace.add('budget', { decision: 'hosted_search_refused', reason: 'per_turn_limit', max: MAX_CALLS })
        return { tool_state: 'LIMIT', note: L ? 'No more web research this turn — answer from the findings you already have.' : 'Đã hết lượt tra web trong lượt này — trả lời từ những gì đã tìm được.' }
      }
      calls++
      const today = (i.now ?? (() => new Date()))().toISOString().slice(0, 10)
      const replyLang = await (async () => { try { const l = await i.replyLanguage?.(); return l && /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(l) ? l : null } catch { return null } })()
      const input = [
        `User's message: ${i.userText.slice(0, 800)}`,
        replyLang ? `Reply language (write the brief in it): ${replyLang}` : '',
        queries.length ? `Suggested queries (hints only): ${queries.join(' | ')}` : '',
        focus ? `Focus: ${focus}` : '',
        mode === 'news' ? 'This is a news request: report the latest relevant events with their dates.' : '',
        `Today: ${today}`,
      ].filter(Boolean).join('\n')
      const t0 = Date.now()
      let r: HostedSearchResult
      try {
        r = await run({ instructions: INSTRUCTIONS, input, country: i.country ?? 'VN', maxSearches: MAX_SEARCHES, effort: SEARCH_EFFORT, ...(ctx?.abortSignal ? { signal: ctx.abortSignal } : {}) })
      } catch (e) {
        i.trace.add('error', { scope: 'hosted_search', message: String(e instanceof Error ? e.message : e).slice(0, 120), ms: Date.now() - t0 })
        return { tool_state: 'ERROR', note: L ? 'The web search failed — say this could not be checked right now.' : 'Tra web không thành công — nói rõ phần này chưa kiểm tra được.' }
      }
      try { i.onSpend?.(r.usd) } catch { /* accounting only */ }
      // every cited URL → a ledger source (S#), its citing sentences = its extract; the brief's markers → [S#]
      const at = (i.now ?? (() => new Date()))().toISOString()
      const ids: string[] = []
      const sources = r.sources.map(s => {
        const doc: PageDoc = { url: s.url, canonicalUrl: s.url, host: hostOf(s.url), title: s.title, siteName: '', description: '', publishedAt: null, lang: null, headings: [], structured: [], passages: s.quotes, textChars: s.quotes.join(' ').length, status: 'ok', injectionDropped: 0 }
        const src = i.ledger.addSource(doc, at, i.lang)
        i.ledger.addClaims(src, candidateClaims(doc, focus || queries.join(' '), 'other' as ClaimKind), s.quotes.join('\n'), [])
        i.allow(s.url)
        ids.push(src.id)
        return { id: src.id, title: s.title || src.title, host: src.host, url: s.url }
      })
      const findings = r.text.replace(/\s*\{\{SRC:(\d+)\}\}/g, (_m, k: string) => (ids[Number(k)] ? ` [${ids[Number(k)]}]` : ''))
      i.trace.add('evidence', { decision: 'hosted_search', mode, searches: r.searches, sources: sources.length, ms: Date.now() - t0, usd: r.usd, incomplete: r.incomplete })
      return {
        tool_state: sources.length || findings ? 'SUCCESS' : 'EMPTY',
        engine: 'web_search',
        web_findings: findings.slice(0, 6_000),
        sources,
        note: L ? 'Facts found on the web, each with its source id. Cite [S#] after the sentences that use them; do not invent what is not here.' : 'Dữ kiện tìm được trên web, mỗi ý có mã nguồn. Dùng ý nào thì ghi [S#] sau câu đó; không bịa điều không có ở đây.',
      }
    },
  }
}
