import { detectPlanningIntent, normalizeVN } from '@/lib/ai/intent'

// ── WHO IS ALLOWED TO CLAIM THE TURN'S ONE RECOMMENDATION CARD ───────────────
//
// 🚨 THE DEFECT THIS EXISTS TO CLOSE, measured on localhost 2026-09-10.
//
// The user asked "máy bay đi, bay từ sài gòn". The reply talked about flights,
// said in as many words "Mình chưa tìm thấy địa điểm nào đủ dữ liệu để giới
// thiệu cho yêu cầu này" — and rendered EIGHT HOTEL CARDS underneath it.
//
// Nothing hallucinated, and no fallback anywhere: the trip planning block makes
// `get_hotel_prices` a MANDATORY tool, so a hotel search ran alongside the place
// search. The place search came back empty, so `setPlacesRecommendations([])`
// was refused for being empty — which left the slot OPEN for the next producer.
// The hotel search then filled it, because the setter's only rule was:
//
//     "First non-empty set wins."
//
// That rule was written for a trip plan running SEVERAL PLACE SEARCHES, and its
// comment says so. It never contemplated a producer from a DIFFERENT SUBJECT
// filling a slot that a same-subject producer had just declined. An empty result
// is an ANSWER — "there are none" — not a vacancy to be filled by whatever else
// happened to run in the same turn.
//
// 🔑 SO ADMISSION IS DECIDED BY WHAT THE USER ASKED, NOT BY WHO FINISHES FIRST.
//
// 🔑 AND IT FAILS OPEN. `askedSubjects` returns an EMPTY set for any turn whose
// wording it does not recognise, and an empty set admits everything — exactly
// today's behaviour. This guard can only ever refuse a producer on a turn where
// the user named subjects and the producer is not one of them. A vocabulary gap
// therefore costs nothing; it never silently empties a legitimate card.

/**
 * What a tool PRODUCES. Read from the tool name and the result's own
 * `_tappy_place_domain`, never guessed from row shape.
 */
export type ProducerSubject =
  | 'food' | 'spa' | 'entertainment' | 'shopping' | 'attraction' | 'stay' | 'place'

/** What the USER asked about. A superset of `ProducerSubject` — flights and weather have no card. */
export type AskedSubject = ProducerSubject | 'flight' | 'transport' | 'weather'

/**
 * The subjects a turn actually asks about.
 *
 * Deliberately vocabulary-driven and precision-favouring: a phrase must name a
 * subject outright to count. Recall gaps fail open (see the header); false
 * positives would refuse a legitimate card, which is the strictly worse
 * direction.
 */
export function askedSubjects(text: string): Set<AskedSubject> {
  const t = normalizeVN(String(text ?? '').toLowerCase())
  const out = new Set<AskedSubject>()
  if (!t.trim()) return out

  /**
   * 🚨 A TRIP PLAN ASKS FOR THE WHOLE COMPOSITE, AND MUST KEEP DOING SO.
   *
   * `buildPlanningBlock('trip')` mandates get_hotel_prices + search_places
   * (restaurant) + search_places (attraction). A user who asked for a plan HAS
   * asked about lodging and food, so refusing those producers would break the
   * feature to fix a different bug. The screenshot's turn was not this case: it
   * named a flight and nothing else, and the PLAN was the model's own idea.
   */
  const plan = detectPlanningIntent(text)
  if (plan === 'trip') { out.add('stay'); out.add('food'); out.add('attraction'); out.add('flight'); out.add('transport') }
  if (plan === 'evening') { out.add('food'); out.add('spa'); out.add('entertainment') }

  // Vietnamese is written here WITHOUT diacritics on purpose: `normalizeVN` has
  // already folded them off `t`, so "bún bò" arrives as "bun bo".
  if (/ve may bay|chuyen bay|\bmay bay\b|\bbay tu\b|\bbay den\b|hang khong|vietjet|bamboo airways|vietnam airlines|\bflight\b|airfare/.test(t)) out.add('flight')
  if (/khach san|\bhotel\b|resort|homestay|nha nghi|dat phong|gia phong|\bmotel\b|villa|phong nghi/.test(t)) out.add('stay')
  // 🚨 "quận" and "quán" both fold to "quan": "ở Quận 1" is a district, not an eatery. Measured
  // 2026-09-18 (CONSULTATIVE-40 E1): "Tối nay đi chơi gì với hội bạn 5 người ở Quận 1" read as a
  // FOOD turn, the entertainment producer was refused, and the reply fell back to inline media
  // with no card on web and Android alike. Only the bare word not followed by a number counts.
  if (/quan an|nha hang|\bquan\b(?!\s*\d)|\ban uong\b|do an|mon an|bun |pho |com |banh |\bcafe\b|ca phe|\bfood\b|restaurant|\bnhau\b|lau |buffet/.test(t)) out.add('food')
  if (/\bspa\b|massage|lam dep|duong da|cham soc da|\bnail\b|\bgoi dau\b|tham my/.test(t)) out.add('spa')
  if (/\brap\b|rap phim|rap chieu|cinema|\bcgv\b|lotte cinema|\bbhd\b|xem phim|karaoke|\bbar\b|\bpub\b|club dem|suat chieu|lich chieu/.test(t)) out.add('entertainment')
  // "đi chơi / vui chơi / giải trí" is a generic outing: entertainment or an attraction, never a
  // refusal of either.
  if (/\bdi choi\b|vui choi|giai tri|\bchoi gi\b|hang ?out/.test(t)) { out.add('entertainment'); out.add('attraction') }
  if (/trung tam thuong mai|trung tam mua sam|\bmall\b|sieu thi|mua sam|shopping|cua hang|\bshop\b/.test(t)) out.add('shopping')
  if (/diem tham quan|tham quan|danh lam|thang canh|diem den|check in|\bmuseum\b|bao tang|cong vien|\bchua\b|\bbien\b|\bnui\b/.test(t)) out.add('attraction')
  if (/xe khach|tau hoa|tau lua|duong sat|\bve xe\b|\bve tau\b|\btaxi\b|\bgrab\b|xe cong nghe/.test(t)) out.add('transport')
  if (/thoi tiet|\bweather\b|\bmua\b khong|nhiet do/.test(t)) out.add('weather')

  return out
}

/** Tool name (plus the result's own stated place domain) → what it produces. */
export function producerSubject(toolName: string, statedPlaceDomain?: unknown): ProducerSubject | null {
  if (toolName === 'get_hotel_prices') return 'stay'
  if (toolName === 'search_products') return 'shopping'
  if (toolName === 'search_places') {
    const d = typeof statedPlaceDomain === 'string' ? statedPlaceDomain : ''
    if (d === 'food' || d === 'spa' || d === 'entertainment' || d === 'shopping') return d
    // `place` is the classifier's "none of the enrichment classes" answer. It is
    // carried through as itself rather than defaulted to food — see the
    // `ENTITY_DOMAIN_DEFAULT` note in fromToolResult.ts for what that default
    // silently did to a cinema.
    return 'place'
  }
  // Flights, weather and transport produce no entity card at all. Returning null
  // is what keeps `get_flight_prices` from ever owning the slot — it has no
  // entities, only booking links.
  return null
}

/**
 * May this producer claim the turn's recommendation slot?
 *
 * @param text  the user's message for this turn
 * @param producer  what the tool produced, from `producerSubject`
 */
export function admitsProducer(text: string, producer: ProducerSubject | null): boolean {
  if (!producer) return false
  const asked = askedSubjects(text)
  // Fail open: an unrecognised turn behaves exactly as it did before this guard.
  if (asked.size === 0) return true
  if (asked.has(producer)) return true
  /**
   * A generic place search is admitted whenever the turn asked about ANY
   * place-shaped subject. `place` means "we could not narrow the category", and
   * treating that as a mismatch would refuse real venues on a real venue
   * question — the fail-open principle applied one level down.
   *
   * `stay` is excluded deliberately and is the whole point of this function: a
   * hotel producer must be asked for by name, never admitted as a generic place.
   */
  if (producer === 'place') {
    return ['food', 'spa', 'entertainment', 'shopping', 'attraction'].some(s => asked.has(s as AskedSubject))
  }
  return false
}
