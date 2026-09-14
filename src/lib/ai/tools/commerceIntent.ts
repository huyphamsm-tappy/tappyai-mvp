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
export type EntertainmentCapability = 'cinema_ticket' | 'activity_booking'

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

/** Entertainment: a film/cinema sentence in the window asks for cinema_ticket; anything else is an activity. */
export function entertainmentCapabilityOf(input: UserTurns): EntertainmentCapability {
  return turns(input).some(t => CINEMA.test(t)) ? 'cinema_ticket' : 'activity_booking'
}
