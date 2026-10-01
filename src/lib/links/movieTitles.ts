import { normalizeVN } from '@/lib/ai/intent'
import { detectMovieRecommendationIntent } from '@/lib/ai/intent'
import { CINEMA_NOW_SHOWING_PAGES } from '@/lib/ccp/adapters/nowShowing'

// ── «Có phim gì hay?» asks for FILMS, not for cinemas ───────────────────────────────────────────────────────────────
//
// Owner UAT 2026-10-01 (ca b): "Tối nay có phim gì hay" → a list of cinemas; "Tui hỏi phim mà có hỏi rạp đâu" → an apology and
// the same cinema cards. There is NO verified source of what is showing (PL-MOVIES), so no title may be named. The honest
// reply is built by code: say so, and link the cinemas' OWN now-showing pages. Never an invented film, never a showtime.

const FILM_WORD = /\bphim\b/
// «phim gì/nào … hay/đang chiếu/mới/hot», «có phim gì», «gợi ý phim»
const FILM_TITLES = /\bphim\s+(?:gi|nao)\b.{0,24}\b(?:hay|dang chieu|moi|hot|dang hot|dang xem|nen xem|dang duoc)\b|\bco\s+phim\s+(?:gi|nao)\b|\bphim\s+(?:gi|nao)\s+(?:hay|nen xem)\b|\bgoi y\s+(?:vai\s+)?(?:bo\s+)?phim\b/
// Asks WHERE / WHEN / how much: a venue question, keep the place search.
const VENUE_ASK = /\b(?:rap\s+(?:nao|gan|nao gan)|o dau|suat chieu|lich chieu|gia ve|dat ve|mua ve|gan toi|gan day)\b/
// The user correcting a venue answer: «tui hỏi phim mà có hỏi rạp đâu», «không phải rạp»
const CORRECTION = /\b(?:hoi|noi|muon|can|tim)\s+phim\b.{0,20}\b(?:ma|chu)\b|\bkhong phai\s+rap\b|\bco\s+hoi\s+rap\s+dau\b|\bphim\s+ma\b/

export function wantsFilmTitles(text: string): boolean {
  const t = normalizeVN((text || '').toLowerCase())
  if (!FILM_WORD.test(t)) return false
  if (CORRECTION.test(t)) return true
  if (VENUE_ASK.test(t)) return false
  return FILM_TITLES.test(t) || detectMovieRecommendationIntent(text)
}

/** The cinemas' own «now showing» pages — owned by the CCP (merchant URL grammars live in src/lib/ccp). */
export const NOW_SHOWING_LINKS = CINEMA_NOW_SHOWING_PAGES

export function movieTitlesReply(lang: string): string {
  const links = NOW_SHOWING_LINKS.map(l => `- [${l.name}](${l.url})`).join('\n')
  return lang === 'en'
    ? `I don't have a verified list of what's showing right now, so I won't guess film titles. The cinema chains' own websites (CGV, Galaxy, Lotte, BHD, Beta) list current films and showtimes — here is CGV's:\n\n${links}\n\nPick a film and tell me — I can find a cinema near you.\n\n[FOLLOWUPS]Find a cinema near me[/FOLLOWUPS]`
    : `Mình chưa có danh sách phim đang chiếu đã kiểm chứng, nên không đoán tên phim cho bạn. Trang web của các cụm rạp (CGV, Galaxy, Lotte, BHD, Beta) đều có phim đang chiếu và lịch chiếu — đây là trang của CGV:\n\n${links}\n\nBạn chọn được phim rồi thì nói mình, mình tìm rạp gần bạn nhé.\n\n[FOLLOWUPS]Tìm rạp gần mình[/FOLLOWUPS]`
}
