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
import { fetchPublicPage, type PageFetchResult } from '@/lib/security/safePageFetch'
import { createRobotsGate, ROBOTS_MAX_BYTES, type RobotsGate } from '@/lib/security/robotsTxt'

/** Model steps of a lean research turn (the plain lean turn has 3): with the last two kept for writing, four tool rounds are possible. */
export const RESEARCH_STEPS = 6
/** Pages one research turn may open. */
export const RESEARCH_MAX_READS = 4

export const READ_PAGE_TOOL = 'read_page'

/**
 * One GENERAL line, added only with CONSULT_RESEARCH_LOOP on. It says when a page is worth opening, to check each stated constraint against what was actually read, and to say plainly what could not be read.
 * No keyword, no example sentence.
 */
export const RESEARCH_RULE = `NGHIEN CUU: khi mau trich chua du de tra loi (gia, gio mo cua, dieu kien, so sanh giua cac phuong an) thi mo trang bang read_page (chi link da co trong ket qua tim kiem/dia diem hoac nguoi dung gui), co the tim them roi doc tiep; doi chieu tung rang buoc nguoi dung da neu: da xac minh (kem nguon + ngay lay) hay chua xac minh (noi ro vi sao). Trang khong mo duoc/bi chan thi noi khong doc duoc trang do. Du thong tin thi tra loi, khong doc thua.`

/** The process-wide robots.txt gate (a cache per host). Tests inject their own. */
let sharedRobots: RobotsGate | null = null
export function sharedRobotsGate(): RobotsGate {
  return (sharedRobots ??= createRobotsGate({ fetchPage: (u, s) => fetchPublicPage(u, { signal: s, maxBytes: ROBOTS_MAX_BYTES }) }))
}
export function __resetSharedRobots(): void { sharedRobots = null }

type Fetcher = (url: string, signal?: AbortSignal) => Promise<PageFetchResult>

/** Wraps a page fetcher so a page the site's robots.txt forbids (or whose robots.txt cannot be reached) is not opened. The failure is typed like any other page failure. */
export function robotsAwareFetch(inner: Fetcher, gate: RobotsGate): Fetcher {
  return async (url, signal) => {
    const g = await gate.check(url, signal)
    if (!g.allowed) return { ok: false, url, reason: (g.reason === 'disallowed_by_rules' ? 'robots_disallowed' : g.reason === 'robots_unreachable' ? 'robots_unreachable' : 'bad_url') as never, redirects: 0, ms: 0 }
    return inner(url, signal)
  }
}

export interface LeanResearch {
  /** The `read_page` tool for the model. */
  tool: ReturnType<typeof readPageTool>
  /** Wraps a tool set so every URL a tool result carries becomes a URL the reader may open. Pure with respect to the results (they are returned unchanged). */
  collectUrls<T>(tools: T): T
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
  const addUrls = (urls: readonly string[]): void => { for (const u of urls) if (allowed.size < 400) allowed.add(normUrl(u)) }
  for (const t of o.userTexts) addUrls(urlsInText(t))
  const trace = {
    add: (ev: string, data: Record<string, unknown>) => { try { o.emit?.(ev, data) } catch { /* observation only */ } },
    counters: { budgetRefusals: 0 },
  } as unknown as AgentRunTrace
  const inner: Fetcher = o.fetchPage ?? ((u, s) => fetchPublicPage(u, { signal: s }))
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
    allowedCount: () => allowed.size,
  }
}
