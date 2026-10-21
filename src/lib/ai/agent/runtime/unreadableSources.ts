// ── CONSULTATIVE_IN_AGENT — a page that could not be read still deserves its source button ─────────────────────────────────────────
//
// The agent searches the web and opens the best results. When every page it tried was blocked / empty / too slow, the honest answer is
// "I could not verify this" — but the user is left with nothing to tap. The search RESULT itself (url + host + title) was returned by the
// search tool this turn, so it is a link the system may show: this module picks up to two of them, ONLY when the reply itself says it could
// not verify, and hands them to the existing citation step (which renders "Nguồn: host · host" from the URL the tool returned — never from
// the model). Nothing is fetched here and no URL is invented; a reply that does not admit non-verification gets no source line from this path.

import { classifySource, hostOf, sourceClassOf } from './sourceType'
import { actionTypeFor, type SourceLink } from './evidence'

const DISCLOSES = /(?<!\p{L})(?:chưa|không)\s+(?:\S+\s+){0,3}?(?:xác minh|xác nhận|kiểm chứng|đọc được|mở được|kiểm tra được)|(?:could not|couldn't|cannot|can't|unable to)\s+(?:\S+\s+){0,2}?(?:verify|confirm|read|open)/iu

interface Row { link?: unknown; title?: unknown }

/**
 * CONSULTATIVE_IN_AGENT step note, second case (live 2026-10-11, petrol, run 2): the page that WAS read is a topic list (vnexpress "chủ đề giá
 * xăng dầu": article titles, no figure). A price / rate question whose pages state no money figure at all, with read_page not yet tried: open ONE
 * dated article from a different host before answering. Same cost rules as above (a read is not a Serper credit).
 */
export function noFigureReadNote(s: { priceIntent: boolean; pagesRead: number; pagesWithMoney: number; readPageCalls: number }, lang: string): string | null {
  if (!s.priceIntent || s.pagesRead < 1 || s.pagesWithMoney > 0 || s.readPageCalls > 0) return null
  return lang === 'en'
    ? '\n\nThe page(s) you read state no figure (they look like topic lists). Open ONE dated article page that states the figure with read_page, from a host you have not read, before answering; if none states it, say the figure is not verified.'
    : '\n\nCác trang đã đọc không nêu con số nào (có vẻ là trang danh sách chủ đề). Mở thêm MỘT trang bài viết có ngày và nêu con số bằng read_page, từ host chưa đọc, rồi mới trả lời; nếu không trang nào nêu thì nói số đó chưa xác minh.'
}

/** A question about a price / rate / amount (folded, no diacritics). */
export const PRICE_INTENT = /(?:^| )(?:gia|ty gia|bao nhieu tien|chi phi|price|rate|cost|how much)(?: |$)/

/**
 * CONSULTATIVE_IN_AGENT step note: a web search ran, NO page could be read (timeout / network error / blocked) and read_page has not been tried:
 * ask for ONE more official page before answering. A page read is a plain HTTPS fetch — no Serper credit, same page budget and deadline. Live
 * 2026-10-11 (petrol): the two pages web_search opened both failed (one timed out at 7.4 s, one network error), the model answered on the spot,
 * and the reply could only say "chưa xác minh". null in every other situation.
 */
export function noPageReadNote(s: { webSearchOk: number; readPageCalls: number; pagesRead: number }, lang: string): string | null {
  if (s.webSearchOk < 1 || s.readPageCalls > 0 || s.pagesRead > 0) return null
  return lang === 'en'
    ? '\n\nNo page could be read yet. For a figure that changes daily (a price, a rate, the news), open ONE more official page with read_page before answering: a different host from the ones that failed, preferably a dated article rather than a topic list. If it cannot be read either, say the figure is not verified.'
    : '\n\nChưa đọc được trang nào. Với số liệu đổi hằng ngày (giá, tỉ giá, tin tức), mở thêm MỘT trang chính thống khác bằng read_page trước khi trả lời: host khác với host đã lỗi, ưu tiên trang bài viết có ngày hơn trang danh sách chủ đề. Nếu vẫn không đọc được thì nói số đó chưa xác minh.'
}

/** Up to `max` source links from this turn's web_search results, for a reply that admits it could not verify. [] otherwise. */
export function unreadableSourceLinks(results: readonly unknown[], reply: string, max = 2, force = false): SourceLink[] {
  // `force`: the links are returned whatever the model wrote — they are only HELD (collector.unverifiedSources) and shown by the settle step when
  // a guard cut every figure and the one "chưa xác minh" sentence was added there (streamEnrichment.ts, unverifiedFigure.ts).
  if (!force && (!DISCLOSES.test(reply) || /\[S\d/.test(reply))) return []
  const out: SourceLink[] = []
  const seenHosts = new Set<string>()
  for (const r of results) {
    if (!r || typeof r !== 'object') continue
    const rows = (r as { results?: unknown }).results
    if (!Array.isArray(rows)) continue
    const failed = new Set(((r as { pages?: unknown }).pages as Array<{ url?: unknown; error?: unknown }> | undefined ?? []).filter(p => p?.error === 'page_unreadable' && typeof p.url === 'string').map(p => String(p.url)))
    // Pages that were tried and failed first (those are the sources the answer wanted), then the best-ranked results.
    const ordered = [...(rows as Row[]).filter(x => typeof x?.link === 'string' && failed.has(x.link as string)), ...(rows as Row[]).filter(x => typeof x?.link === 'string' && !failed.has(x.link as string))]
    for (const row of ordered) {
      const url = String(row.link)
      if (!/^https:\/\//i.test(url)) continue
      const host = hostOf(url)
      if (!host || seenHosts.has(host)) continue
      seenHosts.add(host)
      const cls = sourceClassOf(classifySource(url), url)
      out.push({ id: `S${out.length + 1}`, url, label: host, title: typeof row.title === 'string' ? row.title.slice(0, 120) : host, source_type: cls, action_type: actionTypeFor(cls), host })
      if (out.length >= max) return out
    }
  }
  return out
}
