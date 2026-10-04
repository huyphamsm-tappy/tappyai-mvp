// ── Search Intelligence — information task #1: "phim gì đang chiếu" ────────────────────────────────────────────────────────────────
//
// ADR: docs/audit/AIHAY-REVERSE-ENGINEERING-AND-SEARCH-INTELLIGENCE-ADR.md.
//
// Before: a film question was answered by a code-written reply ("chưa có danh sách phim đã kiểm chứng") that linked five cinema sites; NO search ran, because the
// project had no "verified source" of what is showing. A single web search of the question returns the now-showing lists of Moveek and the chains themselves in
// the result snippets, so the data was one query away — it was never asked for (traced 2026-10-04, see the ADR §Case 1).
//
// Shape: QUERY REWRITE (a fixed, dated query — never the user's words) → ONE web search (a second only when the first yields too few titles: search budget 2) →
// EVIDENCE EXTRACTION (titles only, from trusted film sources, de-duplicated, truncated snippet tails dropped, provenance kept) → the model SYNTHESISES from that
// evidence and from nothing else. No showtime, rating or price is extracted or claimed here.

import { FILM_LISTING_HOSTS } from '@/lib/ccp/adapters/nowShowing'

export interface FilmSource { host: string; url: string }
export interface FilmEvidence {
  /** Titles seen on a now-showing page of a trusted source, first-seen order, de-duplicated. */
  titles: string[]
  sources: FilmSource[]
  /** Dated "as of" label for the answer, GMT+7. */
  asOf: string
}

/** Sources whose own snippets list what is on now. Order = preference. */
const TRUSTED_FILM_HOSTS = FILM_LISTING_HOSTS
/** A listing of what is NOT showing yet / a past schedule is not "đang chiếu". */
const NOT_NOW = /sap-chieu|sap-khoi-chieu|coming-soon|phim-viet-nam|\/review|\/tin-tuc|\/news/i
/** Navigation / chrome words that sit between titles in a listing snippet. */
const CHROME = /^(?:lịch chiếu|lich chieu|mua vé|mua ve|rạp|rap|phim|đang chiếu|dang chieu|sắp chiếu|sap chieu|tin tức|review|trailer|giá vé|xem thêm|đăng nhập|trang chủ|tuần\s*#?\d+)\b/i

const GMT7 = 7 * 3600_000
export function asOfLabel(now: Date): string {
  const vn = new Date(now.getTime() + GMT7)
  const dow = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'][vn.getUTCDay()]
  return `${dow}, ${String(vn.getUTCDate()).padStart(2, '0')}/${String(vn.getUTCMonth() + 1).padStart(2, '0')}/${vn.getUTCFullYear()}`
}

/** The fixed, dated queries for a "what is on" question — at most 2, the second used only when the first yields too few titles. */
export function filmQueries(text: string, now: Date): [string, string] {
  const vn = new Date(now.getTime() + GMT7)
  const dm = `${String(vn.getUTCDate()).padStart(2, '0')}/${String(vn.getUTCMonth() + 1).padStart(2, '0')}`
  const folded = text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
  const sapChieu = /\bsap chieu\b|\bsap ra\b|\bsap khoi chieu\b/.test(folded)
  return sapChieu
    ? ['phim sắp chiếu tháng này moveek', `lịch khởi chiếu phim rạp ${dm}`]
    : ['phim đang chiếu hôm nay moveek', `phim chiếu rạp ${dm} lịch chiếu`]
}

const hostOf = (u: string): string => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' } }
const trustedRank = (host: string): number => TRUSTED_FILM_HOSTS.findIndex(h => host === h || host.endsWith('.' + h))

/** Pull film titles out of one listing snippet: "A · B · C · D ..." (also "A · 25/09 ; B · 02/10"). The last segment of a cut snippet is dropped. */
export function titlesFromSnippet(snippet: string): string[] {
  const cut = /(?:\.{3}|…)\s*$/.test(snippet.trim())
  const parts = snippet.split(/\s*[·;|]\s*/).map(p => p.trim())
  if (cut) parts.pop() // "Thần Sư Chung Quỳ: Linh ..." is not a title
  const out: string[] = []
  for (let p of parts) {
    p = p.replace(/\s+\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s*$/, '').replace(/^\d{1,2}\/\d{1,2}\s*/, '').trim() // trailing / leading release date
    if (p.length < 2 || p.length > 70) continue
    if (/^\d{1,2}\/\d{1,2}/.test(p) || CHROME.test(p)) continue
    if (/[.!?]$/.test(p) && p.split(' ').length > 8) continue // a sentence, not a title
    if (!/\p{L}/u.test(p)) continue
    out.push(p)
  }
  return out
}

/** Evidence from the `results` of a `web_search` tool result (`{results: [{title, link, snippet}]}`); [] titles when nothing trusted was found. */
export function extractFilmEvidence(result: unknown, now: Date): FilmEvidence {
  const rows = (result && typeof result === 'object' && Array.isArray((result as { results?: unknown }).results)) ? (result as { results: Array<Record<string, unknown>> }).results : []
  const listed = rows
    .map(r => ({ link: String(r.link ?? r.url ?? ''), snippet: String(r.snippet ?? ''), host: hostOf(String(r.link ?? r.url ?? '')) }))
    .filter(r => r.link && trustedRank(r.host) >= 0 && !NOT_NOW.test(r.link))
    .sort((a, b) => trustedRank(a.host) - trustedRank(b.host))
  const seen = new Set<string>()
  const titles: string[] = []
  const sources: FilmSource[] = []
  const key = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  for (const r of listed) {
    let used = false
    for (const t of titlesFromSnippet(r.snippet)) {
      const k = key(t)
      if (!k || seen.has(k)) continue
      seen.add(k); titles.push(t); used = true
    }
    if (used && !sources.some(s => s.url === r.link)) sources.push({ host: r.host, url: r.link })
  }
  return { titles: titles.slice(0, 14), sources: sources.slice(0, 3), asOf: asOfLabel(now) }
}

/** Enough titles to answer without a second search. */
export const FILM_ENOUGH = 5

/**
 * What the model receives next to the raw search rows: the evidence and the rules for using it. The reply may name ONLY these titles; it never states showtimes,
 * ticket prices, ratings or which cinema shows what (none of that was extracted).
 */
export function filmEvidencePayload(ev: FilmEvidence): Record<string, unknown> {
  return ev.titles.length
    ? {
      _tappy_films: { as_of: ev.asOf, titles: ev.titles, sources: ev.sources },
      _tappy_films_note: `Danh sach PHIM DANG CHIEU lay tu ${ev.sources.map(s => s.host).join(', ')} (cap nhat ${ev.asOf}). CHI duoc nhac ten phim co trong _tappy_films.titles. KHONG neu suat chieu, gia ve, diem danh gia, hay phim nao chieu o rap nao (chua co du lieu). Tra loi nhu mot nguoi biet viec, ngan: (1) vao thang: "Hôm nay (<thu, ngay>) rạp đang chiếu: " roi liet ke TAT CA ten trong titles (toi da 8, in dam), mot doan; (2) goi y 1-2 phim va noi ngan vi sao CHI khi biet chac tu ten/the loai da biet (phim cuc moi ma khong biet noi dung thi KHONG bia, chi noi "phim mới"); (3) mot cau hoi tinh chinh cu the ("Bạn thích hành động, hoạt hình hay phim Việt?" hoac "Muốn mình tìm rạp gần bạn không?"); (4) dong cuoi: "Nguồn: [host](url)". Khong mo bang "Mình hiểu", khong giai thich he thong, khong "theo kinh nghiem chung".`,
    }
    : {
      _tappy_films: { as_of: ev.asOf, titles: [], sources: [] },
      _tappy_films_note: 'Lan tim nay KHONG lay duoc danh sach phim tu nguon dang tin. Noi that dieu do trong mot cau, KHONG doan ten phim; chi cac trang phim dang chieu cua cum rap (CGV, Galaxy, Lotte, BHD, Beta, Moveek) de xem.',
    }
}
