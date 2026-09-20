// ── CONSULTATIVE V1 — the concrete first step for a place request ───────────
//
// Measured 2026-09-18 (F7 "ăn gì ngon giờ", T5 "đi chơi ở đâu", both with GPS): three separate
// prompt rules said "assume and search now, never ask", and the reply was still one line —
// "Mình giả sử … phải không?" / "Bạn thích loại gì?" — with no tool call. Abstract rules do not
// move the model on these turns; a concrete instruction with the exact call does. The route
// cannot force a tool (architecture lock: toolChoice stays 'auto'), so the V1 block carries the
// call the model must make first, with arguments derived here from the frames — deterministic,
// no model involved in deciding it.
//
// Measured again with a LARGE legacy memory (gate-largemem2): the same "ask instead of search"
// appeared on SPECIFIED first turns too ("Karaoke cho 10 người…", "rạp phim nào gần q1", "Sinh
// nhật sếp, tiếp khách 8 người…"), run to run. So every V1 first-turn place decision without a
// pending clarification carries the directive: exact arguments when the request is vague, a
// suggested query the model may sharpen when it is specified. Never on a movie-recommendation
// turn (its place tool is dropped on purpose) and never when the frame asks for a location.

import type { DecisionFrame } from './decisionFrame'
import type { SituationFrame } from './situationFrame'
import type { NeedProfile } from './needProfile'
import { normalizeVN, namedCinemaQuery } from '../intent'
import { CLARIFY_JOIN } from './actionability'

export type SearchNowType = 'restaurant' | 'cafe' | 'spa' | 'bar' | 'attraction' | 'cinema' | 'hotel' | 'product'
export interface SearchNow {
  query: string
  type: SearchNowType
  /** true → the arguments are the call (vague request); false → a suggestion the model may sharpen. */
  exact: boolean
}

const MEAL_QUERY: Record<NonNullable<DecisionFrame['occasion']['meal']>, string> = {
  breakfast: 'quán ăn sáng ngon', lunch: 'quán ăn trưa ngon', dinner: 'quán ăn tối ngon', late: 'quán ăn khuya',
}
const HARD_QUERY: Partial<Record<SituationFrame['hard'][number], string>> = {
  private_room: 'phòng riêng', kids: 'có khu trẻ em', parking: 'có chỗ đậu xe', quiet: 'yên tĩnh', outdoor: 'ngoài trời',
  vegetarian: 'chay', late_open: 'mở khuya', view: 'có view', live_music: 'nhạc sống',
}

export const VAGUE_MAX_CHARS = 30

type Domain = 'food' | 'spa' | 'entertainment' | 'travel' | 'hotel' | null

function domainOf(frame: DecisionFrame, need: NeedProfile | null, situation: SituationFrame, text: string): Domain {
  const t = normalizeVN(text.toLowerCase())
  if (need?.domain === 'hotel' || /\b(resort|khach san|homestay|hotel)\b/.test(t)) return 'hotel'
  if (frame.domains.includes('food')) return 'food'
  if (frame.domains.includes('spa')) return 'spa'
  if (frame.domains.includes('entertainment')) return 'entertainment'
  if (frame.domains.includes('travel')) return 'travel'
  // The classifiers missed the domain (measured F8 "sinh nhật sếp, tiếp khách…", T4 "gia đình 4
  // người đi đâu"): the user's verb decides first — "đi đâu / đi chơi / làm gì" with no food word
  // is an outing — then the occasion: a meal-shaped occasion is food, a hangout is entertainment.
  if (/\b(di dau|di choi|choi gi|lam gi|choi o dau)\b/.test(t) && !/\b(an|com|nha hang|quan|bua|tiec)\b/.test(t)) return 'entertainment'
  switch (situation.occasion) {
    case 'date': case 'birthday': case 'business': case 'family_meal': case 'quick_bite': case 'celebration': return 'food'
    case 'hangout': return 'entertainment'
    default: return null
  }
}

const TRANSPORT_REQUEST = /(?:^|\s)(?:xe khach|ve xe|ve may bay|may bay|chuyen bay|tau hoa|tau lua|ve tau|xe buyt|xe bus|xe limousine|coach|bus ticket|flight|train ticket)(?:\s|$)/
const SHOP_REQUEST = /\b(mua|qua|gift|present|shopping|san pham|dat mua)\b/
// A1 (2026-09-20, measured on the web: "quán cà phê yên tĩnh ở Quận 3 để làm việc"): a café or a
// bar is a FOOD-domain request whose call is not a restaurant search — the model's own step made
// it `cafe yên tĩnh Quận 3 / cafe`. With the pre-search running the directive, the directive must
// name the venue kind, or every café turn would fetch restaurants and pay a second step to fix it.
const CAFE_RE = /\b(ca phe|cafe|coffee|tra sua|tiem tra|quan tra)\b/
const BAR_RE = /\b(bar|pub|beer club|bia thu cong|quan bia|quan nhau|rooftop)\b/
// Phase D (2026-09-20): the ENTERTAINMENT venue kinds. Each names its own call — a cinema is a
// `cinema` search, the others are `attraction` searches with the kind as the query — so a karaoke
// / water park / aquarium turn fetches venues of that kind (a card), not "địa điểm vui chơi".
const CINEMA_RE = /\b(rap phim|rap chieu|rap (?:cgv|lotte|galaxy|bhd|cinestar|mega)|cgv|lotte cinema|galaxy cinema|bhd star|cinestar|chieu phim|cinema|xem phim)\b/
const KARAOKE_RE = /\bkaraoke\b/
const WATER_PARK_RE = /\b(cong vien nuoc|water ?park)\b/
const AQUARIUM_RE = /\b(thuy cung|aquarium)\b/
const PLAY_RE = /\b(khu vui choi|bowling|bida|billiards?|escape room|truot bang|ice rink)\b/
export function deriveSearchNow(input: {
  text: string
  situation: SituationFrame | null
  frame: DecisionFrame
  need?: NeedProfile | null
  forcedTool: string | null
  isFirstReply: boolean
  movieRecommend: boolean
  /** Item 1: the previous assistant turn was the clarify — the answer turn must call now, exactly. */
  afterClarify?: boolean
  /** Every user turn of the consultation, joined — the venue kind may have been stated turns ago. */
  consultationText?: string
}): SearchNow | null {
  const { situation, frame } = input
  if (!situation || !input.isFirstReply || input.movieRecommend) return null
  if (frame.clarify) return null
  // Shopping after a clarify (measured GATE A S5b: "nước hoa" → the model asked about the scent
  // instead of searching; and with no subject the occasion "sinh nhật" would have routed the call to
  // RESTAURANTS): the product the user just named IS the call — the need profile's subject when it
  // read one, else the answer text itself.
  if (input.afterClarify) {
    const [request, ...rest] = input.text.split(CLARIFY_JOIN)
    const answer = rest.join(CLARIFY_JOIN).trim()
    const shopping = (frame.domains.includes('shopping') && !frame.placeDecision) || input.need?.domain === 'shopping' || SHOP_REQUEST.test(normalizeVN(request.toLowerCase()))
    if (shopping) return answer || input.need?.subject ? { query: input.need?.subject ?? answer, type: 'product', exact: true } : null
  }
  if (frame.domains.includes('shopping') && !frame.placeDecision) return null
  // A purchase / gift request with no place domain is never a place call: "quà sinh nhật cho bạn
  // gái" carries the occasion "birthday", which the occasion fallback below would read as FOOD.
  if (SHOP_REQUEST.test(normalizeVN(input.text.toLowerCase())) && !frame.placeDecision && !frame.domains.some(d => d === 'food' || d === 'spa' || d === 'entertainment' || d === 'travel')) return null
  // C1 (2026-09-20, measured live run 16): "xe khách Sài Gòn đi Đà Lạt tối mai" was pre-searched
  // as RESTAURANTS ("tối" read as a meal) and the reply ended with a vegetarian restaurant and its
  // photos under the coach fares. A transport / flight request has its own tools and never a
  // place directive.
  if (input.need?.domain === 'transport') return null
  if (TRANSPORT_REQUEST.test(normalizeVN(input.text.toLowerCase()))) return null
  // Phase D: a NAMED venue is its own place — "rạp CGV Vincom Đồng Khởi" needs neither a district nor
  // GPS to be searched (exact: the call is that venue, and the reply is about it).
  const namedCinema = namedCinemaQuery(normalizeVN(input.text.toLowerCase()))
  if (namedCinema) return { query: namedCinema, type: 'cinema', exact: true }
  if (!situation.place.text && !situation.place.nearMe) return null
  const domain = domainOf(frame, input.need ?? null, situation, input.text)
  if (!domain) return null
  // A hotel turn has its own tool: rule 7 (assume next weekend) — measured T8 twice: the model
  // still asked for the dates. The directive names the call; the prompt fills the assumed dates.
  if (domain === 'hotel') return { query: situation.place.text ?? '', type: 'hotel', exact: false }
  const decision = frame.placeDecision || input.forcedTool === 'search_places'
    || situation.who !== null || situation.occasion !== null || situation.hard.length > 0 || situation.budget !== null
  if (!decision) return null

  // After a clarify the request was vague by construction: the arguments are the call (measured GATE A
  // T5b: with a suggested query the model still asked "bạn muốn chơi gì?").
  const vague = !!input.afterClarify || (situation.assumptions.length > 0 && situation.confidence < 0.5 && input.text.trim().length <= VAGUE_MAX_CHARS)
  const hard = situation.hard.map(h => HARD_QUERY[h]).filter((x): x is string => !!x)
  const withHard = (q: string) => [q, ...hard].join(' ')
  // Phase D (measured live run 25): a family venue kind is already for children — "công viên nước có khu
  // trẻ em" pulled hot-spring play areas ahead of the water parks. The kids constraint names no query
  // word for these kinds; the other hard constraints (parking, late_open…) still do.
  const withHardFamily = (q: string) => [q, ...situation.hard.filter(h => h !== 'kids').map(h => HARD_QUERY[h]).filter((x): x is string => !!x)].join(' ')
  // A café reads as food, a bar as food or entertainment — the kind names the call either way.
  if (domain === 'food' || domain === 'entertainment') {
    const kindText = normalizeVN((input.consultationText ?? input.text).toLowerCase())
    if (CAFE_RE.test(kindText)) return { query: withHard('quán cà phê'), type: 'cafe', exact: vague }
    if (BAR_RE.test(kindText)) return { query: withHard('quán bar'), type: 'bar', exact: vague }
    if (CINEMA_RE.test(kindText)) return { query: withHard('rạp chiếu phim'), type: 'cinema', exact: vague }
    if (KARAOKE_RE.test(kindText)) return { query: withHard('quán karaoke'), type: 'attraction', exact: vague }
    if (WATER_PARK_RE.test(kindText)) return { query: withHardFamily('công viên nước'), type: 'attraction', exact: vague }
    if (AQUARIUM_RE.test(kindText)) return { query: withHardFamily('thủy cung'), type: 'attraction', exact: vague }
    if (PLAY_RE.test(kindText)) return { query: withHardFamily('khu vui chơi giải trí'), type: 'attraction', exact: vague }
  }
  if (domain === 'food') {
    const base = frame.occasion.meal ? MEAL_QUERY[frame.occasion.meal] : situation.time === 'tonight' ? 'quán ăn tối ngon' : 'quán ăn ngon'
    const occasion = situation.occasion === 'business' || situation.occasion === 'birthday' || situation.occasion === 'celebration' ? 'nhà hàng ' : ''
    return { query: withHard(occasion ? `${occasion}${base.replace(/^quán ăn /, '')}` : base), type: 'restaurant', exact: vague }
  }
  if (domain === 'spa') return { query: withHard('spa massage'), type: 'spa', exact: vague }
  if (domain === 'entertainment') return { query: withHard('địa điểm vui chơi giải trí'), type: 'attraction', exact: vague }
  return { query: withHard('điểm tham quan'), type: 'attraction', exact: vague }
}
