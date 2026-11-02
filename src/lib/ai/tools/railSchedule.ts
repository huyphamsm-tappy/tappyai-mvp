import { fetchPublicPage, type PageFetchResult } from '@/lib/security/safePageFetch'
import { robotsAwareFetch, sharedRobotsGate } from '@/lib/ai/consultative/researchLoop'
import { getCache, setCache } from './common'

// ── The trains of a rail route, read from the Vexere route page (29 Oct 2026) ──────────────────────────────────────────────────────────
//
// Owner 29/10: "quan trọng là lấy được giá". The dated train list (dat-ve-tau.vi) renders in the browser only — measured: no train in its HTML.
// The ROUTE page the transport tool already discovered (/vn/ve-tau-hoa/tu-<a>-di-<b>.<id>.<id>.vi) states each train in its HTML: departure,
// arrival, stations, train code and the lowest fare of its cheapest class (DSVN data shown by Vexere), e.g.
//   "06:00 Ga Sài Gòn 13:43 Ga Nha Trang SE8 315.000đ"
// That table is the page's own day, not necessarily the user's: it is offered as a REFERENCE schedule and fare, with the dated link for the
// day. Read through the same fetch rules as the research reader (public hosts only, robots.txt honoured, size and time capped). No row, no field.

export interface RailRow {
  train: string
  depart: string
  arrive: string
  from_station: string
  to_station: string
  /** The lowest fare the page states for this train (its cheapest class), VND. */
  price_from_vnd: number
}

const MAX_ROWS = 12
const ROW_RE = /(\d{2}:\d{2})\s+(Ga [^\d:]{2,40}?)\s+(\d{2}:\d{2})\s+(Ga [^\d:]{2,40}?)\s+((?:SE|SNT|SPT|SQN|TN|NA|HD|SP|LC|QB|DH|SH)\d{1,3})\s+(\d{1,3}(?:\.\d{3})+)\s?đ/g

/** The page's text without scripts, styles or tags. Pure. */
function visibleText(html: string): string {
  return html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')
}

/** Each train the route page states, once (first occurrence), in page order. Pure. */
export function parseRailRows(html: string): RailRow[] {
  const out: RailRow[] = []
  const seen = new Set<string>()
  for (const m of visibleText(html).matchAll(ROW_RE)) {
    const price = Number(m[6].replace(/\./g, ''))
    const key = `${m[5]}|${m[1]}|${m[4].trim()}`
    if (!Number.isFinite(price) || price < 10_000 || seen.has(key)) continue
    seen.add(key)
    out.push({ train: m[5], depart: m[1], arrive: m[3], from_station: m[2].trim(), to_station: m[4].trim(), price_from_vnd: price })
    if (out.length >= MAX_ROWS) break
  }
  return out
}

type Fetch = (url: string) => Promise<PageFetchResult>
const RAIL_PAGE = /^https:\/\/(?:www\.)?vexere\.com\/vn\/ve-tau-hoa\/tu-[a-z0-9-]+-di-[a-z0-9-]+\.\d{1,6}\.\d{1,6}\.vi$/

const defaultFetch: Fetch = (() => {
  const gated = robotsAwareFetch((url, signal, hopGate) => fetchPublicPage(url, { signal, hopGate, maxBytes: 2_500_000, decodeCompressed: true, totalTimeoutMs: 8_000 }), sharedRobotsGate())
  return (url: string) => gated(url)
})()

/** A route's timetable changes rarely; its fares are a reference anyway. One read per route page per 6 h (process cache, no store). */
const SCHEDULE_TTL_MS = 6 * 60 * 60 * 1000
const cacheKey = (url: string) => `rail_schedule:${url}`

/** The trains of one rail route page, or null (not a rail route page, unreadable, or no train stated). Never throws. */
export async function fetchRailSchedule(pageUrl: string, deps: { fetch?: Fetch } = {}): Promise<{ page_url: string; rows: RailRow[] } | null> {
  if (!RAIL_PAGE.test(pageUrl)) return null
  const cached = getCache(cacheKey(pageUrl)) as { page_url: string; rows: RailRow[] } | null | undefined
  if (cached && Array.isArray(cached.rows)) return cached
  try {
    const r = await (deps.fetch ?? defaultFetch)(pageUrl)
    if (!r.ok) return null
    const rows = parseRailRows(r.body)
    if (rows.length === 0) return null
    const out = { page_url: pageUrl, rows }
    setCache(cacheKey(pageUrl), out, SCHEDULE_TTL_MS)
    return out
  } catch {
    return null
  }
}
