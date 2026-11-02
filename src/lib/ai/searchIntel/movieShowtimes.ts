// ── Search Intelligence — a SPECIFIC film: metadata, showing status, sources (no invented showtimes) ───────────────────────
//
// Source audit (2026-10-04, real Serper answers, recorded in docs/audit/FINAL-HARDENING-V1.md §Sources):
//   · film pages on Moveek / CGV / MoMo carry in their search snippets: genre, runtime, age rating, release date, audience score;
//   · the dated now-showing list (Moveek /dang-chieu) says whether the film is showing today;
//   · NO current source returns showtimes PER CINEMA and DATE, nor ticket prices (the /mua-ve snippet shows times with no cinema and no
//     date — not attributable, so never used). Those fields are returned as `null` with an explicit "not verified" note.
// One web search for the film (+ the now-showing search, shared and cached with get_now_showing). Links are the providers' own
// structured result links on allow-listed hosts — a page to check, never evidence of a showtime.

import { FILM_LISTING_HOSTS } from '@/lib/ccp/adapters/nowShowing'
import { resolveCommerce, projectCommerceLinkRow, capabilityForIntent, type CommerceRequest } from '@/lib/ccp'
import type { RouteHandoffFacts } from '@/lib/ai/tools/commerce'
import { extractFilmEvidence, filmQueries, asOfLabel } from './filmSearch'

export interface MovieFacts {
  title: string
  genre: string | null
  runtimeMin: number | null
  ageRating: string | null
  releaseDate: string | null
  audienceScore: number | null
  director: string | null
  cast: string | null
  synopsis: string | null
  showingToday: boolean | null
  showtimes: null
  ticketPrice: null
  sources: Array<{ host: string; url: string }>
  asOf: string
}

const hostOf = (u: string): string => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' } }
/** The cinema chains' own film pages count too (first-party: Cinestar, the National Cinema Center). */
const FILM_FACT_HOSTS: ReadonlyArray<string> = [...FILM_LISTING_HOSTS, 'cinestar.com.vn', 'chieuphimquocgia.com.vn']
const trusted = (h: string) => FILM_FACT_HOSTS.some(t => h === t || h.endsWith(`.${t}`))
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
/** A film page (not a list, review index, video or social post). */
const FILM_PAGE = /moveek\.com\/phim\/|cgv\.vn\/(?:default|en)\/[a-z0-9-]+\.html$|momo\.vn\/cinema\/[a-z0-9-]+|galaxycine\.vn\/dat-ve\/[a-z0-9-]+|cinestar\.com\.vn\/movie\/[a-z0-9-]+|chieuphimquocgia\.com\.vn\/movies\/\d+/i
/** Page chrome a snippet can be made of — never a synopsis. */
const CHROME = /hotline|giờ làm việc|chăm sóc khách hàng|đăng nhập|trailer\s*·|đặt vé|mua vé|lịch chiếu|review phim/i
/** A provider limitation line that is about a cinema ticket (the registry's Galaxy entry carries a food line — pre-existing, not shown). */
const CINEMA_LIMITATION = /phim|rạp|suất|vé|ghế|đăng nhập/i

export function movieQuery(title: string): string {
  return `${title.trim().slice(0, 80)} lịch chiếu`
}

/** Facts from the snippets of trusted film pages whose title words appear in the page. Pure. */
export function extractMovieFacts(title: string, result: unknown, nowShowingTitles: readonly string[] | null, now: Date): MovieFacts {
  const rows = (result && typeof result === 'object' && Array.isArray((result as { results?: unknown }).results)) ? (result as { results: Array<Record<string, unknown>> }).results : []
  const want = fold(title)
  const pages = rows
    .map(r => ({ url: String(r.link ?? ''), snippet: String(r.snippet ?? ''), title: String(r.title ?? '') }))
    .filter(r => trusted(hostOf(r.url)) && FILM_PAGE.test(r.url) && (fold(r.title + ' ' + r.snippet).includes(want) || fold(r.url).includes(want.replace(/ /g, ' '))))
  const text = pages.map(p => p.snippet).join(' ; ')
  const titles = pages.map(p => p.title).join(' ; ')
  const pick = (re: RegExp) => re.exec(text)?.[1]?.trim() ?? null
  const runtime = pick(/(\d{2,3})\s*phút/i)
  const score = pick(/Hài lòng\s*(\d{1,3})\s*%/i)
  const showing = nowShowingTitles ? nowShowingTitles.some(t => fold(t) === want || fold(t).includes(want) || want.includes(fold(t))) : null
  return {
    title,
    genre: pick(/Thể loại\s*:\s*([^;.]+)/i) ?? pick(/Genre\s*:\s*([^;.]+)/i),
    runtimeMin: runtime ? Number(runtime) : null,
    ageRating: pick(/Giới hạn tuổi\.?\s*(T\d{2}|P|K)\b/i) ?? pick(/\b(T1[368])\b/) ?? (/\((T1[368]|P|K)\)/.exec(titles)?.[1] ?? null),
    releaseDate: pick(/Khởi chiếu\s*:?\s*(\d{2}\/\d{2}\/\d{4})/i) ?? (pick(/khởi chiếu\s*(\d{2}\.\d{2}\.\d{4})/i)?.replace(/\./g, '/') ?? null),
    audienceScore: score ? Number(score) : null,
    director: pick(/Đạo diễn\s*:\s*([^;.]+)/i),
    cast: pick(/Diễn viên\s*:\s*([^;]+?)(?:\.{2,}|…|\.\s|;|$)/i)?.replace(/[,\s]+$/, '') ?? null,
    synopsis: synopsisOf(pages.map(p => p.snippet)),
    showingToday: showing,
    showtimes: null,
    ticketPrice: null,
    sources: [...new Map(pages.map(p => [p.url, { host: hostOf(p.url), url: p.url }])).values()].slice(0, 3),
    asOf: asOfLabel(now),
  }
}

/** The plot line a film page's snippet carries (first non-chrome snippet, ≤ 240 chars). */
function synopsisOf(snippets: string[]): string | null {
  for (const raw of snippets) {
    const sn = raw.replace(/^.*?NỘI DUNG PHIM\.?\s*/i, '').replace(/\s*(?:\.{3}|…)\s*$/, '').trim()
    if (sn.length < 40 || CHROME.test(sn) || /^(Diễn viên|Thể loại|Đạo diễn|Phim mới)/i.test(sn)) continue
    return sn.slice(0, 240)
  }
  return null
}

/**
 * The film pages as SYSTEM links, through the commerce seam (provider registry + allow-list) — the same projection web_search uses for
 * `film_links`. A hit the registry does not own is dropped; nothing is composed. No extra search: the hits come from the film search.
 */
export function filmPageLinks(title: string, result: unknown, now: Date, resolve: typeof resolveCommerce = resolveCommerce): { film_links?: Array<{ name: string; platform: string; url: string }>; _tappy_commerce?: RouteHandoffFacts[] } {
  const rows = (result && typeof result === 'object' && Array.isArray((result as { results?: unknown }).results)) ? (result as { results: Array<Record<string, unknown>> }).results : []
  const want = fold(title)
  const out: Array<ReturnType<typeof projectCommerceLinkRow>> = []
  for (const r of rows) {
    if (out.length >= 3) break
    const url = String(r.link ?? '')
    if (!FILM_PAGE.test(url) || !trusted(hostOf(url)) || !fold(`${String(r.title ?? '')} ${url.replace(/-/g, ' ')}`).includes(want)) continue
    try {
      const request: CommerceRequest = { domain: 'entertainment', intentType: 'buy_ticket', capability: capabilityForIntent('buy_ticket'), subject: title.slice(0, 200), context: { allowTracking: true } }
      const res = resolve(request, { hints: [{ url, title }], now, enabled: true })
      if (!('links' in res)) continue
      const detail = res.links.find(l => l.kind !== 'SEARCH_HANDOFF')
      if (!detail || out.some(x => x.destinationUrl === detail.directUrl)) continue
      out.push(projectCommerceLinkRow(detail, res.requestId, 'buy_ticket', [], { primary: true }))
    } catch { /* not a registry page: dropped */ }
  }
  if (out.length === 0) return {}
  return {
    film_links: out.map(l => ({ name: title, platform: l.merchantName, url: l.url })),
    _tappy_commerce: out.map((l): RouteHandoffFacts => ({ merchantName: l.merchantName, providerId: l.providerId, kind: l.kind, depth: l.depth, guestDepth: l.guestDepth, authRequiredAt: l.authRequiredAt, linkId: l.linkId, requestId: l.requestId, assumedParams: l.assumedParams, limitations: l.limitations.filter(x => CINEMA_LIMITATION.test(x)) })),
  }
}

/** What the model reads: the facts, and exactly which fields are not verified. */
export function movieFactsPayload(f: MovieFacts): Record<string, unknown> {
  return {
    // The dated now-showing list named this film today: the same evidence channel get_now_showing uses, so "đang chiếu" about it passes
    // placeClaimGuard (seats and clock times still never do). Only this film — never the whole list.
    ...(f.showingToday === true ? { _tappy_films: { titles: [f.title] } } : {}),
    _tappy_movie: f,
    _tappy_movie_note: `Thông tin phim từ ${f.sources.map(s => s.host).join(', ') || 'chưa có nguồn khớp'} (cập nhật ${f.asOf}). Chỉ nói các trường có giá trị. Suất chiếu theo rạp/ngày và giá vé: CHƯA XÁC MINH — nguồn hiện có không công bố; nói rõ điều đó, KHÔNG đoán giờ chiếu hay giá, và chỉ người dùng mở trang phim (nút bên dưới) để xem suất. Rạp gần người dùng: dùng search_places (loại cinema) nếu họ hỏi.${f.showingToday === false ? ' Phim KHÔNG có trong danh sách đang chiếu hôm nay.' : ''}`,
  }
}

export { filmQueries, extractFilmEvidence }
