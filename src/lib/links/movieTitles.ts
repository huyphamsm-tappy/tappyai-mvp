import { normalizeVN } from '@/lib/ai/intent'
import { detectMovieRecommendationIntent } from '@/lib/ai/intent'

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

/** The cinemas' own «now showing» pages (opened and answered 200 on 2026-10-01). Plain links, no tracking. */
export const NOW_SHOWING_LINKS: ReadonlyArray<{ name: string; url: string }> = [
  { name: 'CGV', url: 'https://www.cgv.vn/default/movies/now-showing.html' },
  { name: 'Galaxy Cinema', url: 'https://www.galaxycine.vn/phim-dang-chieu/' },
  { name: 'Lotte Cinema', url: 'https://www.lottecinemavn.com/LCHS/Contents/Movie/Movie-List.aspx' },
  { name: 'BHD Star', url: 'https://www.bhdstar.vn/phim/' },
  { name: 'Beta Cinemas', url: 'https://www.betacinemas.vn/phim.htm' },
]

export function movieTitlesReply(lang: string): string {
  const links = NOW_SHOWING_LINKS.map(l => `- [${l.name}](${l.url})`).join('\n')
  return lang === 'en'
    ? `I don't have a verified list of what's showing right now, so I won't guess film titles. The cinemas' own pages list current films and showtimes:\n\n${links}\n\nPick a film and tell me — I can find a cinema near you.\n\n[FOLLOWUPS]Find a cinema near me[/FOLLOWUPS]`
    : `Mình chưa có danh sách phim đang chiếu đã kiểm chứng, nên không đoán tên phim cho bạn. Trang chính thức của các cụm rạp có phim đang chiếu và lịch chiếu:\n\n${links}\n\nBạn chọn được phim rồi thì nói mình, mình tìm rạp gần bạn nhé.\n\n[FOLLOWUPS]Tìm rạp gần mình[/FOLLOWUPS]`
}
