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
// only from values that are actually in the text (a missing date defaults to
// today and is DECLARED as assumed). Nothing here is a merchant URL or a
// product decision — it is the routing key the seam hands to CCP.

export type FoodCapability = 'food_delivery' | 'table_reservation' | 'restaurant_discovery'
export type EntertainmentCapability = 'cinema_ticket' | 'activity_booking'

export interface ReservationSpec {
  adults: number
  /** HH:MM, 24 h. */
  time: string
  /** YYYY-MM-DD in Asia/Ho_Chi_Minh. */
  date: string
  /** Fields not stated by the user and filled with a declared default. */
  assumed: string[]
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

/** Food & Drink: which capability the sentence asks for. */
export function foodCapabilityOf(text: string | undefined): FoodCapability {
  const t = (text ?? '').normalize('NFC')
  if (!t.trim()) return 'restaurant_discovery'
  const reservation = RESERVATION.test(t)
  const delivery = DELIVERY.test(t)
  // A reservation phrase wins over a generic "đặt" — "đặt bàn" is never a delivery.
  if (reservation) return 'table_reservation'
  if (delivery) return 'food_delivery'
  return 'restaurant_discovery'
}

/** Entertainment: a film/cinema sentence asks for cinema_ticket; anything else is an activity. */
export function entertainmentCapabilityOf(text: string | undefined): EntertainmentCapability {
  return CINEMA.test((text ?? '').normalize('NFC')) ? 'cinema_ticket' : 'activity_booking'
}

const VN_OFFSET_MS = 7 * 3_600_000
function vnDate(d: Date): string {
  return new Date(d.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10)
}
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Party size, time and date from the sentence — or null when the sentence does
 * not state both a party size and an unambiguous time. Never guesses a value:
 * "7h" with no period marker is ambiguous and yields null; "19h", "19:00",
 * "7h tối", "7pm" are accepted.
 */
export function parseReservationSpec(text: string | undefined, now: Date = new Date()): ReservationSpec | null {
  const t = (text ?? '').normalize('NFC').toLowerCase()
  if (!t.trim()) return null

  const party = t.match(/(\d{1,2})\s*(người|nguoi|khách|khach|people|persons?|pax|guests?)(?![\p{L}])/u)
    ?? t.match(/(?<![\p{L}])(?:cho|for)\s+(\d{1,2})(?!\d)(?!\s*(?:h|giờ|gio|:|am|pm))/u)
  const adults = party ? Number(party[1]) : null
  if (!adults || adults < 1 || adults > 20) return null

  const tm = t.match(/(?<!\d)(\d{1,2})\s*(?:(h|giờ|gio|:)\s*(\d{2})?|(am|pm))\s*(sáng|sang|trưa|trua|chiều|chieu|tối|toi|đêm|dem|am|pm)?/u)
  if (!tm) return null
  let hour = Number(tm[1])
  const minute = tm[3] ? Number(tm[3]) : 0
  const marker = (tm[5] ?? tm[4] ?? '').normalize('NFC')
  if (hour > 23 || minute > 59) return null
  const evening = /^(tối|toi|đêm|dem|chiều|chieu|pm)$/u.test(marker)
  const morning = /^(sáng|sang|am)$/u.test(marker)
  const noon = /^(trưa|trua)$/u.test(marker)
  if (evening && hour < 12) hour += 12
  if (noon && hour < 11) hour += 12
  if (!marker && hour < 10) return null // "7h" alone: ambiguous, do not guess
  if (morning && hour >= 12) return null
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`

  const today = vnDate(now)
  const assumed: string[] = []
  let date: string
  const explicit = t.match(/(?<!\d)(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?(?!\d)/)
  if (explicit) {
    const dd = Number(explicit[1]), mm = Number(explicit[2])
    const yyyy = explicit[3] ? Number(explicit[3]) : Number(today.slice(0, 4))
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null
    date = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
    // ISO parsing rolls "31/02" over into March; a calendar date has to round-trip exactly.
    const check = new Date(`${date}T00:00:00Z`)
    if (Number.isNaN(check.getTime()) || check.getUTCMonth() + 1 !== mm || check.getUTCDate() !== dd) return null
  } else if (/(?<![\p{L}])(?:ngày\s*mai|ngay\s*mai|tomorrow)(?![\p{L}])/u.test(t)) {
    date = addDays(today, 1)
  } else if (/(?<![\p{L}])(?:hôm\s*nay|hom\s*nay|tối\s*nay|toi\s*nay|trưa\s*nay|trua\s*nay|chiều\s*nay|chieu\s*nay|tonight|today)(?![\p{L}])/u.test(t)) {
    date = today
  } else {
    date = today
    assumed.push('date')
  }
  return { adults, time, date, assumed }
}
