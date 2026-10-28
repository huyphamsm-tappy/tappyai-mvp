// ── Wave 3 · W1 · search -> read the page -> compare, inside the lean consult turn (CONSULT_RESEARCH_LOOP) ───────────────────────────────────────
//
// Measured (compare2, run 3): the lean consult path gave the model three steps (one tool round once the synthesis step is reserved) and snippets only; it could not open a page or search again. This module
// gives it the reader the agent runtime already has - nothing is rewritten: `createPageReader` (safePageFetch: https / http 80+443, no credentials, DNS pinned and checked for every address, <= 4 redirects each re-checked,
// text only, size and time caps), `extractPage`, `EvidenceLedger`, and the rule "only a URL that appeared in this turn's tool results, in the user's message or as a place's website; no crawling".
// What is added here: robots.txt (cached per host, RFC 9309, see security/robotsTxt.ts), a per-turn budget of pages, and the link between the lean tool set and the reader.
//
// Everything a page says is DATA (pageExtract strips instructions; the tool result says so). Nothing here calls a model or the network by itself: the model chooses to call `read_page`.

import { createPageReader, readPageTool, urlsIn, urlsInText } from '@/lib/ai/agent/runtime/readPage'
import { EvidenceLedger, normUrl } from '@/lib/ai/agent/runtime/evidence'
import type { AgentRunTrace } from '@/lib/ai/agent/runtime/trace'
import { fetchPublicPage, type PageFailure, type PageFetchOptions, type PageFetchResult } from '@/lib/security/safePageFetch'
import { createRobotsGate, ROBOTS_MAX_BYTES, type RobotsGate } from '@/lib/security/robotsTxt'

/** Model steps of a lean research turn (the plain lean turn has 3): with the last two kept for writing, four tool rounds are possible. */
export const RESEARCH_STEPS = 6
/** Pages one research turn may open. */
export const RESEARCH_MAX_READS = 4

export const READ_PAGE_TOOL = 'read_page'
/** What the trace says instead of a host name the user typed (Wave 3-FIX R3-09). */
export const USER_URL_LABEL = 'user_url'

/**
 * One GENERAL line, added only with CONSULT_RESEARCH_LOOP on. It says when a page is worth opening, to check each stated constraint against what was actually read, and to say plainly what could not be read.
 * No keyword, no example sentence.
 */
export const RESEARCH_RULE = `NGHIEN CUU: khi mau trich chua du de tra loi (gia, gio mo cua, dieu kien, so sanh giua cac phuong an) thi mo trang bang read_page (chi link da co trong ket qua tim kiem/dia diem hoac nguoi dung gui), co the tim them roi doc tiep; doi chieu tung rang buoc nguoi dung da neu: da xac minh (kem nguon + ngay lay) hay chua xac minh (noi ro vi sao). Trang khong mo duoc/bi chan thi noi khong doc duoc trang do. Du thong tin thi tra loi, khong doc thua.`

/** The process-wide robots.txt gate (a cache per host). Tests inject their own. */
let sharedRobots: RobotsGate | null = null
export function sharedRobotsGate(): RobotsGate {
  // Wave 3-FIX (R3-05): any Content-Type (the rules count whatever the file is labelled), a compressed answer decoded under the same byte cap
  return (sharedRobots ??= createRobotsGate({ fetchPage: (u, s) => fetchPublicPage(u, { signal: s, maxBytes: ROBOTS_MAX_BYTES, anyContentType: true, decodeCompressed: true }) }))
}
export function __resetSharedRobots(): void { sharedRobots = null }

/** `hopGate` (Wave 3-FIX R3-05): the fetcher must ask it before it opens EVERY hop - the URL and each redirect target - and stop with the reason it returns. */
type Fetcher = (url: string, signal?: AbortSignal, hopGate?: NonNullable<PageFetchOptions['hopGate']>) => Promise<PageFetchResult>

const robotsFailure = (reason: string): PageFailure => (reason === 'disallowed_by_rules' ? 'robots_disallowed' : reason === 'robots_unreachable' ? 'robots_unreachable' : 'invalid_url')

/**
 * Wraps a page fetcher so a page the site's robots.txt forbids (or whose robots.txt cannot be reached) is not opened - the first URL AND, through `hopGate`, every redirect target: the host a redirect
 * leads to is judged by its own robots.txt. The failure is typed like any other page failure.
 */
export function robotsAwareFetch(inner: Fetcher, gate: RobotsGate): Fetcher {
  const hopGate: NonNullable<PageFetchOptions['hopGate']> = async (u, s) => {
    const g = await gate.check(u.toString(), s)
    return g.allowed ? null : robotsFailure(g.reason)
  }
  return async (url, signal) => {
    const g = await gate.check(url, signal)
    if (!g.allowed) return { ok: false, url, reason: robotsFailure(g.reason), redirects: 0, ms: 0 }
    return inner(url, signal, hopGate)
  }
}

export interface LeanResearch {
  /** The `read_page` tool for the model. */
  tool: ReturnType<typeof readPageTool>
  /** Wraps a tool set so every URL a tool result carries becomes a URL the reader may open. Pure with respect to the results (they are returned unchanged). */
  collectUrls<T>(tools: T): T
  /** Wave 4 · C3: the same for a result the CODE already obtained (a pre-search): its URLs become URLs the reader may open. Nothing is fetched; an odd shape adds nothing. */
  collectFrom(result: unknown): void
  /** The URLs the reader may open right now (for tests and the trace). */
  allowedCount(): number
}

export function createLeanResearch(o: {
  lang: string
  userTexts: readonly string[]
  maxReads?: number
  /** Where reader events go (the consult trace); optional. */
  emit?: (ev: string, data: Record<string, unknown>) => void
  /** Test seams. */
  fetchPage?: Fetcher
  robots?: RobotsGate
}): LeanResearch {
  const allowed = new Set<string>()
  // Wave 3-FIX (R3-09): a host the USER typed is the user's text - the consult trace must not carry it. Only a host that also came back in a tool result (search / places) is recorded by name.
  const userHosts = new Set<string>()
  const toolHosts = new Set<string>()
  const hostOf = (u: string): string => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' } }
  const addUrls = (urls: readonly string[], fromUser = false): void => {
    for (const u of urls) {
      if (allowed.size < 400) allowed.add(normUrl(u))
      const h = hostOf(u)
      if (h) (fromUser ? userHosts : toolHosts).add(h)
    }
  }
  for (const t of o.userTexts) addUrls(urlsInText(t), true)
  const scrub = (data: Record<string, unknown>): Record<string, unknown> => {
    const h = typeof data.host === 'string' ? data.host.toLowerCase().replace(/^www\./, '') : ''
    return h && userHosts.has(h) && !toolHosts.has(h) ? { ...data, host: USER_URL_LABEL } : data
  }
  const trace = {
    add: (ev: string, data: Record<string, unknown>) => { try { o.emit?.(ev, scrub(data)) } catch { /* observation only */ } },
    counters: { budgetRefusals: 0 },
  } as unknown as AgentRunTrace
  const inner: Fetcher = o.fetchPage ?? ((u, s, hopGate) => fetchPublicPage(u, { signal: s, ...(hopGate ? { hopGate } : {}) }))
  const reader = createPageReader({
    ledger: new EvidenceLedger(),
    allowed: (u: string) => allowed.has(normUrl(u)),
    trace,
    lang: o.lang,
    maxReads: o.maxReads ?? RESEARCH_MAX_READS,
    structured: true,
    fetchPage: robotsAwareFetch(inner, o.robots ?? sharedRobotsGate()),
  })
  return {
    tool: readPageTool(reader),
    collectUrls<T>(tools: T): T {
      if (!tools) return tools
      return Object.fromEntries(Object.entries(tools as Record<string, { execute?: (args: unknown, ctx: unknown) => unknown }>).map(([name, t]) => [name, !t?.execute || name === READ_PAGE_TOOL ? t : {
        ...t,
        execute: async (args: unknown, ctx: unknown) => {
          const result = await t.execute!(args, ctx)
          try { addUrls(urlsIn(result)) } catch { /* a result of an odd shape adds nothing */ }
          return result
        },
      }])) as T
    },
    collectFrom(result: unknown): void { try { addUrls(urlsIn(result)) } catch { /* a result of an odd shape adds nothing */ } },
    allowedCount: () => allowed.size,
  }
}

/** Wave 5 · W5-2: venue pages the code opens on a pre-searched pick (one read_page call; the reader caps a call at three too). */
export const PICK_PAGE_READ_MAX = 3

/**
 * Wave 5 · W5-2 (CONSULT_PICK_PAGE_READ). The code opens the websites of the venues the pre-search showed the model (presearchPlaceSites: only rows the model saw, only http(s)), at most
 * PICK_PAGE_READ_MAX, in ONE call of the turn's own `read_page` tool - so robots.txt, the safe fetch (DNS pinned, redirects re-checked, size and time caps) and the turn's page budget all apply, and a
 * read here counts against what the model may still read. The focus is general (what a visitor needs to decide), never the user's words. No model call, no search request.
 * `readPage` is the tool AS THE TURN CARRIES IT (route.ts `tools.read_page`, after every wrapper: the request-cap turn, the tool-call trace, the diagnostics trace) - the very object the model's own
 * read_page call runs, exactly as the pre-search calls `tools[name].execute`. Measured (W5-R2, 28/10): calling the reader's bare tool instead ran its requests outside any tool call, so the bench wall
 * (which admits a public page only inside a read_page call) blocked every venue robots.txt and no page was read. No such tool on the turn = no read.
 * Fail-open: no site, no tool, a throw, or no page read returns null, and the caller leaves the turn as it was.
 */
export async function readVenuePages(research: LeanResearch, readPage: { execute?: (args: never, ctx: never) => unknown } | undefined, sites: ReadonlyArray<{ name: string; website: string }>, lang: string): Promise<{ args: { urls: string[]; focus: string; kind: 'other' }; result: unknown } | null> {
  const urls = [...new Set(sites.map(s => s.website))].slice(0, PICK_PAGE_READ_MAX)
  if (urls.length === 0 || typeof readPage?.execute !== 'function') return null
  // a place's own website is a link the reader may open (the module rule); the pre-search's slimmed rows may not carry it
  research.collectFrom(urls.map(website => ({ website })))
  const args = { urls, focus: lang === 'en' ? 'prices, opening hours, booking' : 'giá, giờ mở cửa, đặt chỗ', kind: 'other' as const }
  try {
    const result = await (readPage.execute as (a: typeof args, ctx: { toolCallId: string; messages: unknown[] }) => unknown).call(readPage, args, { toolCallId: 'pick_page_read', messages: [] })
    const pages = (result as { pages?: unknown } | null)?.pages
    const read = Array.isArray(pages) && pages.some(p => !!p && typeof p === 'object' && !('error' in p))
    return read ? { args, result } : null
  } catch {
    return null
  }
}
