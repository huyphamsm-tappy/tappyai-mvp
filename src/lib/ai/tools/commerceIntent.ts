import { PROVIDER_REGISTRY } from '@/lib/ccp/registry'

// ── Commerce intent → capability (owner correction, 13 Sep 2026) ────────────
//
// The user's words decide WHICH capability a turn asks for; the domain alone
// does not. On a Food & Drink turn, "giao tận nhà" is food_delivery (GrabFood /
// ShopeeFood, legacy order links), "đặt bàn cho 2 người lúc 19h" is
// table_reservation (PasGo), and "tìm nhà hàng Nhật" is restaurant_discovery —
// three different requests that must never collapse into one another.
//
// Deterministic and conservative: a phrase has to be unambiguous to move the
// capability away from discovery, and a reservation configuration is produced
// Owner decision 14 Sep 2026: table_reservation is detected so the seam can
// decline it honestly (no provider, no link) — it is NOT an active capability.
// Nothing here is a merchant URL or a product decision — it is the routing key
// the seam hands to CCP.

export type FoodCapability = 'food_delivery' | 'table_reservation' | 'restaurant_discovery'
export type EntertainmentCapability = 'cinema_ticket' | 'activity_booking' | 'event_ticket'

/**
 * The conversation window the seam reads (Phase 8, P1-2). Tappy often answers a
 * commerce request with a clarifying question; the user's reply ("Nhà hàng Nhật
 * ở Quận 1") carries neither the intent words nor the party/time of the first
 * message. Intent and configuration are therefore read from the last few USER
 * turns, most recent first: the newest message that carries a signal wins, so a
 * later "giao tận nhà" overrides an earlier "đặt bàn", and party/time stated
 * two turns ago still count.
 */
export const INTENT_WINDOW_TURNS = 3
export type UserTurns = string | readonly string[] | undefined
function turns(input: UserTurns): string[] {
  const list = Array.isArray(input) ? [...input] : typeof input === 'string' ? [input] : []
  return list.map(t => (t ?? '').normalize('NFC')).filter(t => t.trim()).slice(-INTENT_WINDOW_TURNS)
}

// `\b` is ASCII-only in JS even with the u flag, so it never matches next to đ / ặ / ỗ; word
// edges are written with Unicode letter/number classes instead.
const EDGE_L = '(?<![\\p{L}\\p{N}])'
const EDGE_R = '(?![\\p{L}\\p{N}])'
const phrase = (alternatives: string[]) => new RegExp(`${EDGE_L}(?:${alternatives.join('|')})${EDGE_R}`, 'iu')

const DELIVERY = phrase([
  'giao\\s*(?:tận|tan)\\s*(?:nhà|nha|nơi|noi)', 'giao\\s*(?:hàng|hang)', 'giao\\s*(?:đến|den|tới|toi|về|ve)', 'ship',
  'đặt\\s*món', 'dat\\s*mon', 'gọi\\s*món', 'goi\\s*mon', 'order', 'delivery', 'delivered?',
  'mang\\s*(?:về|ve)', 'take\\s*-?away',
])
const RESERVATION = phrase([
  'đặt\\s*bàn', 'dat\\s*ban', 'đặt\\s*chỗ', 'dat\\s*cho', 'giữ\\s*bàn', 'giu\\s*ban', 'giữ\\s*chỗ', 'giu\\s*cho',
  'book(?:ing)?\\s+(?:a\\s+)?table', 'reserv(?:e|ation)', 'đặt\\s*trước\\s*bàn', 'dat\\s*truoc\\s*ban',
])
// Concerts, shows, festivals — Ticketbox's catalogue (Completion Pass, 14 Sep 2026). Checked before
// CINEMA so "show" never falls into the film branch; "phim" alone still means cinema.
const EVENT = phrase([
  'concert', 'live\\s*show', 'liveshow', 'sự\\s*kiện', 'su\\s*kien', 'lễ\\s*hội', 'le\\s*hoi', 'đêm\\s*nhạc', 'dem\\s*nhac',
  'ca\\s*nhạc', 'ca\\s*nhac', 'fan\\s*meeting', 'festival', 'hội\\s*chợ', 'hoi\\s*cho', 'vé\\s*show', 've\\s*show', 'nhạc\\s*hội', 'nhac\\s*hoi',
  'kịch', 'kich\\s*noi', 'stand\\s*-?up', 'workshop', 'triển\\s*lãm', 'trien\\s*lam',
])
const CINEMA = phrase([
  'vé\\s*xem\\s*phim', 've\\s*xem\\s*phim', 'xem\\s*phim', 'rạp', 'rap\\s*phim', 'cgv', 'lotte\\s*cinema', 'galaxy\\s*cinema',
  'cinema', 'movie', 'suất\\s*chiếu', 'suat\\s*chieu', 'phim',
])

/** Food & Drink: which capability the conversation asks for — newest signal wins. */
export function foodCapabilityOf(input: UserTurns): FoodCapability {
  for (const t of turns(input).reverse()) {
    const reservation = RESERVATION.test(t)
    const delivery = DELIVERY.test(t)
    // A reservation phrase wins over a generic "đặt" within one message — "đặt bàn" is never a delivery.
    if (reservation) return 'table_reservation'
    if (delivery) return 'food_delivery'
  }
  return 'restaurant_discovery'
}

/** Entertainment: an event sentence asks for event_ticket, a film/cinema sentence for cinema_ticket; anything else is an activity. Newest signal wins. */
export function entertainmentCapabilityOf(input: UserTurns): EntertainmentCapability {
  for (const t of turns(input).reverse()) {
    if (EVENT.test(t)) return 'event_ticket'
    if (CINEMA.test(t)) return 'cinema_ticket'
  }
  return 'activity_booking'
}

// ── Film title (cinema foundation, Completion Pass) ─────────────────────────
// A CGV film page can be discovered only when the user NAMED a film. The title
// is the text after "phim" up to a place / time word or the end of the sentence;
// generic continuations ("phim gì hay", "phim mới", "phim hôm nay") are not a
// title. Conservative on purpose: no title → no film discovery → no CGV link,
// and the cinema venues from the places tool stand on their own.
const FILM_AFTER = /(?:xem\s+)?phim\s+["“]?([^"”?!.,;\n]{2,80})/iu
const FILM_STOP = /(?:^|\s+)(?:ở|o|tại|tai|gần|gan|hôm\s*nay|hom\s*nay|tối\s*nay|toi\s*nay|ngày\s*mai|ngay\s*mai|cuối\s*tuần|cuoi\s*tuan|lúc|luc|suất|suat|rạp|rap|cho\s|với|voi|nhé|nhe|đi\b|di\b)[\s\S]*$/iu
const FILM_GENERIC = /^(?:gì|gi|nào|nao|hay|mới|moi|hot|đang\s*chiếu|dang\s*chieu|chiếu\s*rạp|hành\s*động|kinh\s*dị|tình\s*cảm|hoạt\s*hình|hài|việt|hàn|mỹ|nhật|trung|nước\s*ngoài)(?![\p{L}\p{N}])/iu

/** The film the user named in the window (newest first), or null when none was named. */
export function filmTitleOf(input: UserTurns): string | null {
  for (const t of turns(input).reverse()) {
    const m = t.match(FILM_AFTER)
    if (!m) continue
    const title = m[1].replace(FILM_STOP, '').replace(/\s+/g, ' ').trim().replace(/[”"]$/, '')
    if (title.length < 2 || FILM_GENERIC.test(title)) continue
    return title
  }
  return null
}

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
const FILM_NOISE = new Set(['phim', 'movie', 'film', 'cgv', 'ban', 'cua', 'va', 'the', 'of', 'a', 'an', 'and'])

/** Does a discovered film page title name the film the user asked for? (≥ 60% of the film's tokens, order-free.) */
export function filmTitleMatches(film: string, pageTitle: string | undefined): boolean {
  if (!pageTitle) return false
  const want = fold(film).split(/[^a-z0-9]+/).filter(w => w.length > 1 && !FILM_NOISE.has(w))
  if (want.length === 0) return false
  const have = new Set(fold(pageTitle).split(/[^a-z0-9]+/))
  const hit = want.filter(w => have.has(w)).length
  return hit / want.length >= 0.6
}

// ── Requested merchant (Final local live UAT, 14 Sep 2026) ──────────────────
// "Mua iPhone trên Shopee", "Tìm khách sạn … trên Agoda", "Tìm vé Vietjet …":
// when the user NAMES a registry merchant, that merchant is the request — the
// seam narrows the CCP request to it (`merchantAllowList`) and spends discovery
// only on it. Measured in the UAT: "Mua iPhone trên TikTok Shop" came back with
// Shopee buttons and no TikTok Shop link at all. Names are registry data; the
// aliases below are the spellings users type, longest first so "ShopeeFood" is
// never read as "Shopee" and "TikTok Shop" never as bare "TikTok" (a review
// site). Nothing here is a URL.
const MERCHANT_ALIASES: Record<string, readonly string[]> = {
  shopeefood: ['shopeefood', 'shopee food'],
  shopee: ['shopee'],
  tiktokshop: ['tiktok shop', 'tiktokshop', 'tik tok shop', 'shop tiktok'],
  lazada: ['lazada'],
  dmx: ['điện máy xanh', 'dien may xanh', 'dienmayxanh', 'dmx'],
  cellphones: ['cellphones', 'cellphone s', 'cellphones.com.vn'],
  grabfood: ['grabfood', 'grab food'],
  tripcom: ['trip.com', 'tripcom', 'trip com'],
  booking: ['booking.com', 'booking'],
  agoda: ['agoda'],
  traveloka: ['traveloka'],
  vexere: ['vexere', 'vé xe rẻ'],
  vietnamairlines: ['vietnam airlines', 'vietnamairlines', 'vna'],
  vietjet: ['vietjet', 'vietjet air', 'vietjetair'],
  klook: ['klook'],
  cgv: ['cgv'],
  ticketbox: ['ticketbox', 'ticket box'],
}
const MERCHANT_PATTERNS: ReadonlyArray<{ providerId: string; re: RegExp }> = Object.entries(MERCHANT_ALIASES)
  .filter(([id]) => PROVIDER_REGISTRY.some(p => p.providerId === id))
  .flatMap(([id, names]) => names.map(n => ({ providerId: id, n })))
  .sort((a, b) => b.n.length - a.n.length)
  .map(({ providerId, n }) => ({ providerId, re: new RegExp(`${EDGE_L}${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*')}${EDGE_R}`, 'iu') }))

/** The registry provider the user named in the window (newest turn wins), or null. */
export function requestedProviderOf(input: UserTurns): string | null {
  for (const t of turns(input).reverse()) {
    const hit = MERCHANT_PATTERNS.find(m => m.re.test(t))
    if (hit) return hit.providerId
  }
  return null
}
