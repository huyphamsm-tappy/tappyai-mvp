// ── PLAN ITEMS ARE RETRIEVED PLACES, WITH RETRIEVED LINKS (UAT 2026-09-28) ─────────────────────
//
// The [TAPPY_PLAN] block is written by the model. Three defects the owner hit, all measured:
//   D. "lập cho kế hoạch ăn chơi tối nay đi, 2 người 5 triệu" → stop 2 was "Quán bar/lounge Quận 1":
//      no such venue, no link — a placeholder the model invented when its search came back thin.
//   E. a trip plan item read "**4.7⭐" — markdown inside a JSON string, which both clients render
//      as plain text, literal asterisks included.
//   +  `booking_link` was whatever URL the model had at hand: a Booking.com SEARCH page, a
//      restaurant's homepage, dinhdoclap.gov.vn — labelled "Đặt ngay" on the card.
//
// So, deterministically, on the parsed JSON (never string surgery on it):
//   · a VENUE item must be a place a tool returned this turn (place_id, then name). An item that is
//     not is replaced by an unused retrieved place of the same kind, or dropped when there is none;
//   · `booking_link` is the matched place's own booking / order / ticket action from the one action
//     authority (`buildActions`: Commerce Links, the venue's booking pages, deep merchant pages) —
//     or nothing. A model-written URL never survives;
//   · markdown is stripped from every text field.
// Non-venue items (moving between stops, rest, free time) are kept as they are, minus any link.

import { buildActions, type ActionSource } from '@/lib/recommendation/actions'
import { isOpenNow } from './tools/serperPlaces'
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'

/** The one line a plan says about hours and fees that were left out of its stops (01/11: once per plan, a tip). */
export const CHECK_HOURS_AND_FEES = 'Giờ mở cửa và giá vé cần kiểm tra lại trước khi đi.'

/**
 * 01/11: a description without the clauses that carry a figure (hours, a fee, a time). The sentences and comma clauses with no digit stay
 * as written; a sentence that had a figure keeps its figure-free clauses (first letter raised). Empty when nothing is left. Pure.
 */
export function withoutFigureClauses(text: string): string {
  const kept: string[] = []
  for (const s of text.trim().split(/(?<=[.!?;])\s+/)) {
    if (!/\d/.test(s)) { kept.push(s); continue }
    const clauses = s.replace(/[.!?;]+$/, '').split(/,\s+/).filter(c => c.trim() && !/\d/.test(c))
    if (!clauses.length) continue
    const joined = clauses.join(', ')
    kept.push(`${joined.charAt(0).toUpperCase()}${joined.slice(1)}${/[.!?;]$/.test(s) ? s.slice(-1) : ''}`)
  }
  return kept.join(' ').trim()
}

// ── c40 T6 (UAT @ 2bd5c59, 2026-09-28): a stop scheduled while the venue is closed ────────────
//
// "Hội An có gì hay, đi 1 ngày" put "MẸT Hội An" at 08:00 as breakfast; its own row says
// 10:00–22:30 (and the item's description even says "mở từ 10:00"). A plan TIME is a claim that
// the stop can be done then. So, for a venue item matched to a retrieved row whose hours are
// known (a clock range — `opening_hours` is the provider's hours for the day of the search, the
// only hours a row carries), a time outside those hours gets the smallest honest change:
//   · moved to the row's opening time, when that keeps the day's times strictly ascending;
//   · otherwise the time is CLEARED — the stop stays, no clock is stated. Nothing is invented:
//     the only time ever written is one the row states. Reordering the day was rejected: it moves
//     other stops and contradicts the model's own framing ("bữa sáng … bắt đầu ngày").
// A row that is closed all day, open 24h, or unparseable is left alone ("cannot tell" never
// becomes a correction).

const TIME_START = /^\s*(\d{1,2})\s*[:h]\s*(\d{2})?/
function minutesOf(t: unknown): number | null {
  if (typeof t !== 'string') return null
  const m = t.match(TIME_START)
  if (!m) return null
  const h = Number(m[1]); const min = m[2] ? Number(m[2]) : 0
  return h < 24 && min < 60 ? h * 60 + min : null
}
/** The opening times a row's hours state ("10:00–22:30", "06:00–11:00, 17:00–21:00"), as minutes. */
function openingsOf(hours: string): number[] {
  return [...hours.matchAll(/(\d{1,2})[:h](\d{2})\s*[–—\-−]\s*\d{1,2}[:h]\d{2}/g)].map(m => Number(m[1]) * 60 + Number(m[2]))
}
const clock = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

const OPEN = '[TAPPY_PLAN]'
const CLOSE = '[/TAPPY_PLAN]'

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

type Kind = 'food' | 'cafe' | 'nightlife' | 'entertainment' | 'hotel' | 'attraction' | 'spa' | 'shopping'

/** The item categories that name a VENUE (anything else — transport, rest, free time — is not one). */
const CATEGORY_KIND: Record<string, Kind> = {
  food: 'food', restaurant: 'food', meal: 'food', dining: 'food', breakfast: 'food', lunch: 'food', dinner: 'food',
  cafe: 'cafe', coffee: 'cafe', drink: 'nightlife', drinks: 'nightlife', bar: 'nightlife', nightlife: 'nightlife', pub: 'nightlife',
  entertainment: 'entertainment', activity: 'entertainment', karaoke: 'entertainment', cinema: 'entertainment',
  hotel: 'hotel', stay: 'hotel', lodging: 'hotel', accommodation: 'hotel',
  attraction: 'attraction', sightseeing: 'attraction', culture: 'attraction', museum: 'attraction',
  spa: 'spa', wellness: 'spa', massage: 'spa', shopping: 'shopping',
}

/** What a retrieved place IS, from its own words (provider categories + name). */
const KIND_WORDS: Array<[Kind, RegExp]> = [
  ['hotel', /\b(khach san|hotel|resort|homestay|villa|hostel|nha nghi|motel|apartment)\b/],
  ['nightlife', /\b(bar|pub|lounge|beer|bia|rooftop|club|speakeasy|cocktail|wine)\b/],
  ['cafe', /\b(ca phe|cafe|coffee|tra sua|tea)\b/],
  ['spa', /\b(spa|massage|goi dau|nail)\b/],
  ['entertainment', /\b(karaoke|rap|cinema|cgv|bowling|game|bida|billiard|kich|show|escape|trampoline)\b/],
  ['attraction', /\b(bao tang|museum|chua|pagoda|cong vien|park|dinh|nha tho|cathedral|pho di bo|cho|market|landmark|thac|bien|beach|dao|island|nui|mountain|lang|den|tuong dai|khu du lich|vuon)\b/],
  ['shopping', /\b(trung tam thuong mai|mall|plaza|aeon|vincom|shop)\b/],
  ['food', /\b(nha hang|quan|restaurant|com|pho|bun|banh|lau|nuong|hai san|an|bistro|kitchen|eatery|dimsum|sushi|bbq)\b/],
]
/** Kinds that may stand in for one another when the exact one is missing. */
const COMPATIBLE: Record<Kind, Kind[]> = {
  food: ['food'], cafe: ['cafe', 'food'], nightlife: ['nightlife', 'entertainment'], entertainment: ['entertainment', 'nightlife'],
  hotel: ['hotel'], attraction: ['attraction'], spa: ['spa'], shopping: ['shopping', 'attraction'],
}
const ACTION_DOMAIN: Record<Kind, string> = { food: 'food', cafe: 'food', nightlife: 'entertainment', entertainment: 'entertainment', hotel: 'travel', attraction: 'place', spa: 'spa', shopping: 'place' }
const BOOKING_KINDS = new Set(['booking', 'reservation', 'order', 'delivery', 'ticket'])

export interface PlanPlace extends ActionSource {
  name?: string
  place_types?: unknown
  photo_url?: string
  photo_urls?: string[]
  /** The provider's hours for the day of the search (c40 T6). */
  opening_hours?: unknown
  /** Row fields some providers carry (OSM `diet:*`, `cuisine`); read only by `hasVegetarianBasis`. */
  cuisine?: unknown
  vegetarian?: unknown
  vegan?: unknown
}

// ── CONSULTATIVE_IN_AGENT: a vegetarian request keeps a restaurant only on DATA that says it is vegetarian ───────────────────────────────
//
// Round 22 live (chat 313d2cfb…): "Lẩu Chay Hương Xuân" was kept for a vegetarian plan; its row says `place_types: ["Quán ăn nhỏ"]` — only the NAME says "Chay".
// A name is a first hint, never the proof. The venue stays a venue only when its own row carries a vegetarian category (`place_types`: "Nhà hàng cho người ăn chay",
// "Vegetarian restaurant", …), a `vegetarian` / `vegan` flag or a vegetarian `cuisine`. A source page confirming it is NOT accepted here (no page text + URL
// is carried to this guard): such a venue becomes the plain "Ăn … gần chỗ ở" slot.

/** Does the user's thread ask for vegetarian food? Matches "ăn chay", "đồ/món/quán/nhà hàng chay", "thuần chay", vegetarian/vegan/veggie — never "chạy" (to run). */
export function wantsVegetarian(userTexts: readonly string[]): boolean {
  return userTexts.some(t => typeof t === 'string' && /(?<![\p{L}])(?:ăn chay|đồ chay|món chay|quán chay|nhà hàng chay|thuần chay|an chay|do chay|mon chay|quan chay|nha hang chay|thuan chay|vegetarian|vegan|veggie)(?![\p{L}])/iu.test(t))
}

/** The row's own data says vegetarian (category, flag or cuisine). The venue's NAME alone does not count. */
export function hasVegetarianBasis(p: PlanPlace): boolean {
  if (p.vegetarian === true || p.vegan === true) return true
  const types = (Array.isArray(p.place_types) ? p.place_types.filter((t): t is string => typeof t === 'string') : []).map(fold).join(' | ')
  if (/(?:^|[ |])(?:nha hang cho nguoi an chay|nguoi an chay|nha hang chay|quan chay|com chay|an chay|vegetarian|vegan|thuan chay)(?:$|[ |])/.test(types)) return true
  return typeof p.cuisine === 'string' && /vegetarian|vegan|chay/.test(fold(p.cuisine))
}

function kindsOf(p: PlanPlace): Set<Kind> {
  const words = fold([p.name ?? '', ...(Array.isArray(p.place_types) ? p.place_types.filter((t): t is string => typeof t === 'string') : [])].join(' '))
  const out = new Set<Kind>()
  for (const [k, re] of KIND_WORDS) if (re.test(words)) out.add(k)
  return out
}

const MD = /\*\*|__|`|(^|\s)#{1,6}\s|\[([^\]]+)\]\([^)]*\)/g
export function stripMarkdown(s: string): string {
  return s.replace(MD, (m, pre, linkText) => (linkText ? linkText : pre ?? '')).replace(/(^|\s)\*(?=\S)|(?<=\S)\*(?=\s|$)/g, '$1').replace(/\s{2,}/g, ' ').trim()
}

/** The matched place's own way to book / order / get a ticket — from the one action authority, or null. */
function bookingUrlFor(p: PlanPlace, kind: Kind): string | null {
  const actions = buildActions(p, ACTION_DOMAIN[kind])
  // A search page ("Tìm trên GrabFood", the A1 fallback) is not this place's booking page — the plan
  // card labels `booking_link` "Đặt ngay", so only a real page of the place qualifies.
  return actions.find(a => BOOKING_KINDS.has(a.kind) && a.urlKind !== 'search' && (a.urlKind === 'direct' || !!a.commerce))?.url ?? null
}

type Item = Record<string, unknown>

export interface PlanItemGuardResult {
  text: string; matched: number; replaced: number; dropped: number; linksSet: number; linksRemoved: number
  /** c40 T6: stops moved to their row's opening time / stops whose out-of-hours time was cleared. */
  timesMoved: number; timesCleared: number
  /** Sights kept by name from the model's general knowledge (flag on only). */
  sightsKept?: number
  /** Meals left as a plain "near the stay" slot because no unused retrieved venue was left for them (flag on only). */
  mealSlots?: number
  /** Check-in / check-out stops with no hotel row to point at, kept as plain stops (flag on only). */
  genericStays?: number
  /** One brain: venues the tools did not return, kept under the model's own name, labelled, with no link / price / address. */
  unverifiedKept?: number
  /** Sights of the turn's own results added to a thin return day (flag on only). */
  returnDayFilled?: number
  /** Of those, restaurants of a vegetarian request whose row carries no vegetarian data (flag on only). */
  vegSlots?: number
  /** Retrieved places left out of the pool because their address does not name the plan's destination (flag on only; 0 otherwise). */
  outOfArea?: number
}

/** c40 T6 — see the header: a venue stop's time must fall inside its row's hours, or be moved / cleared. */
function fitTimesToHours(items: Item[], placeOf: Map<Item, PlanPlace>, res: { timesMoved: number; timesCleared: number }): void {
  items.forEach((item, i) => {
    const place = placeOf.get(item)
    const hours = typeof place?.opening_hours === 'string' ? place.opening_hours : ''
    const at = minutesOf(item.time)
    if (!hours || at === null) return
    // null = cannot tell (closed all day, unparseable) — left alone; true = open then.
    if (/đóng cửa|closed/i.test(hours) || isOpenNow(hours, { minutes: at }) !== false) return
    const openings = openingsOf(hours)
    if (openings.length === 0) return
    const target = openings.filter(o => o > at).sort((a, b) => a - b)[0] ?? Math.min(...openings)
    const neighbour = (from: number, step: number): number | null => {
      for (let j = from; j >= 0 && j < items.length; j += step) { const m = minutesOf(items[j].time); if (m !== null) return m }
      return null
    }
    const prev = neighbour(i - 1, -1)
    const next = neighbour(i + 1, 1)
    if ((prev === null || prev < target) && (next === null || target < next)) { item.time = clock(target); res.timesMoved++ }
    else { item.time = ''; res.timesCleared++ }
  })
}

// ── CONSULTATIVE_IN_AGENT: a plan card holds only places of the plan's destination ──────────────
//
// 🚨 Measured (UAT, 2026-10-10, "đi Cát Bà 3 ngày 2 đêm"): the card showed "BELGO LE NGO CAT" and "Ticos Coffee Bàu Cát" — Hồ Chí Minh
// venues the maps search returned for the words "Cát…". `guardPlanItems` only asked "was this place retrieved this turn?" (place_id, then
// name) — a retrieved place of another city passed. With a destination, the retrieved pool is cut to the places whose OWN address names
// that destination (folded, whole words); a place with no address cannot be checked, so it is left out rather than guessed. Nothing is
// fetched: only the address the row already carries is read. No destination (flag off, or none known) = the pool is untouched.

/** The destination as a folded phrase ("Đảo Cát Bà" → "cat ba"), or '' when there is nothing usable to compare. */
export function destinationKey(destination: string | null | undefined): string {
  if (typeof destination !== 'string') return ''
  const key = fold(destination).replace(/^(?:dao|quan dao|thanh pho|tp|thi xa|huyen|tinh)\s+/, '')
  return key.length >= 3 ? key : ''
}

/** True when the address names the destination as whole words. No address = cannot tell = false. */
export function addressInDestination(address: unknown, key: string): boolean {
  if (!key) return true
  if (typeof address !== 'string' || !address.trim()) return false
  return ` ${fold(address)} `.includes(` ${key} `)
}

/** A meal with no venue the tools can vouch for: a plain slot (category `rest`, nothing invented), named by its time of day. */
function mealSlot(item: Item, keepWords = false): Item | null {
  const at = minutesOf(item.time)
  const byTime = at === null ? 'Bữa ăn gần chỗ ở' : at < 10 * 60 + 30 ? 'Ăn sáng gần chỗ ở' : at < 15 * 60 ? 'Ăn trưa gần chỗ ở' : 'Ăn tối gần chỗ ở'
  const time = typeof item.time === 'string' ? item.time : ''
  if (keepWords) {
    // 01/11 (one brain): the stop keeps what the model wrote - its name and its words minus any figure - and none of the venue data. With neither, there is
    // nothing to show: dropped, never a generic line (owner UAT: the same "choose a place near your stay" filler twice in one plan).
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    const words = typeof item.description === 'string' ? withoutFigureClauses(item.description.trim()) : ''
    if (!name && !words) return null
    return { time, emoji: typeof item.emoji === 'string' && item.emoji ? item.emoji : '🍽️', category: 'rest', name: name || byTime, description: words }
  }
  return { time, emoji: '🍽️', category: 'rest', name: byTime, description: 'Chọn một quán gần chỗ ở khi tới nơi; hỏi trước món có hợp với bạn không.' }
}

const GENERIC_STAY = /nhận phòng|trả phòng|check-?in|check-?out|gửi hành lý|lấy hành lý/i
const HOTEL_WORD = /khách sạn|hotel|resort|homestay|villa|hostel|nhà nghỉ|motel/i

// ── CONSULTATIVE_IN_AGENT: a sight's description claims only what its own row supports ───────────────────────────────────────────────────
//
// Round 23 live: "Tháp Trầm Hương" (row: place_types "Điểm thu hút khách du lịch" + "Công viên", address "…, Quảng trường, Nha Trang", hours "Mở cửa cả ngày") was
// described as "Ghé khu quảng trường ven biển" — "ven biển" is in no field of the row. A scene / setting claim (seaside, river bank, plaza, park, walking street,
// mountain foot) that the row's name, address or categories do not carry is replaced by a neutral description built from the row (its categories, its hours).
const SCENE_CLAIMS: Array<[RegExp, RegExp]> = [
  [/\b(?:ven bien|bo bien|bai bien|view bien|ngam bien|sat bien)\b/, /\b(?:bien|beach|bai)\b/],
  [/\bquang truong\b/, /\b(?:quang truong|plaza|square)\b/],
  [/\bpho di bo\b/, /\b(?:pho di bo|walking)\b/],
  [/\b(?:ven song|bo song|view song)\b/, /\b(?:song|river)\b/],
  [/\bcong vien\b/, /\b(?:cong vien|park|vuon)\b/],
  [/\b(?:chan nui|tren nui|view nui)\b/, /\b(?:nui|mountain)\b/],
]
/** The description unchanged, or the neutral one when it makes a scene claim the row does not support. */
export function groundedSightDescription(description: unknown, place: PlanPlace): unknown {
  if (typeof description !== 'string' || !description.trim()) return description
  const said = fold(description)
  const types = (Array.isArray(place.place_types) ? place.place_types.filter((t): t is string => typeof t === 'string' && t.trim() !== '') : [])
  const rowText = fold([place.name ?? '', typeof place.address === 'string' ? place.address : '', ...types].join(' '))
  if (!SCENE_CLAIMS.some(([claim, support]) => claim.test(said) && !support.test(rowText))) return description
  return neutralSightDescription(place)
}

/** What the row itself says about a sight: its categories and its hours. No scene, no distance, no price. */
function neutralSightDescription(place: PlanPlace, prefix = ''): string {
  const types = (Array.isArray(place.place_types) ? place.place_types.filter((t): t is string => typeof t === 'string' && t.trim() !== '') : [])
  const hours = typeof place.opening_hours === 'string' ? place.opening_hours.trim() : ''
  return `${prefix}${types.length ? types.slice(0, 2).join(', ') : 'Điểm tham quan'}${hours ? `; theo dữ liệu tra cứu: ${hours}` : ''}.`
}

// ── CONSULTATIVE_IN_AGENT: a thin return day is topped up from the turn's own results ─────────────────────────────────────────────────────
//
// Round 25 live: day 3 had 4 stops (breakfast, one sight, check-out, the way home). The model wrote 4 (the guard dropped none) although the prompt asks for 1–2 more, and the
// turn's own results held attractions the plan had not used. With fewer than FULL_DAY stops, up to 2 retrieved SIGHTS of the destination that no other stop uses are added
// before the check-out / the way home: name, address, link and photo from the row, a description built from the row only. Not added: anything on an island or cable car
// (a boat trip does not fit a morning before check-out), an amusement park (a full-day venue), hotels, restaurants. Nothing is searched or invented; no candidate = no change.
const FULL_DAY = 5
const OFFSHORE = /\b(?:dao|hon|cap treo)\b/
const FULL_DAY_VENUE = /\b(?:cong vien giai tri|khu vui choi|vinwonders)\b/
function isInlandSight(p: PlanPlace): boolean {
  const types = fold((Array.isArray(p.place_types) ? p.place_types.filter((t): t is string => typeof t === 'string') : []).join(' | '))
  const kinds = kindsOf(p)
  if ([...kinds].some(k => k !== 'attraction')) return false
  if (!kinds.has('attraction') && !types.includes('diem thu hut khach du lich')) return false
  const where = fold(`${p.name ?? ''} ${typeof p.address === 'string' ? p.address : ''}`)
  return !OFFSHORE.test(where) && !FULL_DAY_VENUE.test(`${where} ${types}`)
}

/** `topUpReturnDay` false (one brain, owner UAT 02/11): a thin return day stays as the model wrote it - no searched place is added. */
export function guardPlanItems(fullText: string, places: readonly PlanPlace[], opts: { destination?: string | null; keepSights?: boolean; vegetarian?: boolean; knownSightsUnlabelled?: boolean; keepNamedVenues?: boolean; topUpReturnDay?: boolean } = {}): PlanItemGuardResult {
  const none = { text: fullText, matched: 0, replaced: 0, dropped: 0, linksSet: 0, linksRemoved: 0, timesMoved: 0, timesCleared: 0 }
  const start = fullText.indexOf(OPEN)
  const end = fullText.indexOf(CLOSE)
  if (start === -1 || end === -1 || end < start) return none
  let plan: { days?: Array<{ items?: Item[] }> } & Record<string, unknown>
  try { plan = JSON.parse(fullText.slice(start + OPEN.length, end).trim()) } catch { return none }
  if (!plan || !Array.isArray(plan.days)) return none

  const named = places.filter(p => typeof p?.name === 'string' && p.name.trim())
  // CONSULTATIVE_IN_AGENT (destination given only then): the pool is the retrieved places that belong to the plan's destination.
  const destKey = destinationKey(opts.destination)
  const pool = destKey ? named.filter(p => addressInDestination(p.address, destKey)) : named
  const outOfArea = named.length - pool.length
  const byPlaceId = new Map(pool.filter(p => typeof p.place_id === 'string' && p.place_id).map(p => [p.place_id as string, p]))
  const used = new Set<PlanPlace>()
  const findByName = (name: string): PlanPlace | undefined => {
    const key = fold(name)
    if (!key) return undefined
    return pool.find(p => fold(p.name!) === key)
      ?? pool.find(p => { const n = fold(p.name!); return n.length >= 6 && key.length >= 6 && (n.includes(key) || key.includes(n)) })
  }
  let figuresLeftOut = false // a stop's hours / fee were left out of its description (one-brain sights): the plan says once to check them
  const res: { matched: number; replaced: number; dropped: number; linksSet: number; linksRemoved: number; timesMoved: number; timesCleared: number; sightsKept?: number; mealSlots?: number; vegSlots?: number; genericStays?: number; returnDayFilled?: number; unverifiedKept?: number } = { matched: 0, replaced: 0, dropped: 0, linksSet: 0, linksRemoved: 0, timesMoved: 0, timesCleared: 0 }
  const placeOf = new Map<Item, PlanPlace>()
  let stayPlace: PlanPlace | null = null

  for (const day of plan.days) {
    if (!Array.isArray(day?.items)) continue
    const kept: Item[] = []
    for (const item of day.items) {
      if (!item || typeof item !== 'object') continue
      for (const f of ['name', 'description', 'price', 'address', 'tip', 'note']) {
        if (typeof item[f] === 'string') item[f] = stripMarkdown(item[f] as string)
      }
      const kind = CATEGORY_KIND[String(item.category ?? '').toLowerCase().trim()]
      const hadLink = typeof item.booking_link === 'string' && item.booking_link !== ''
      if (!kind) {
        // Not a venue: nothing to book here, and no model-written URL survives.
        if (hadLink) { delete item.booking_link; res.linksRemoved++ }
        delete item.booking_links
        kept.push(item)
        continue
      }
      // CONSULTATIVE_IN_AGENT: one trip, one hotel — a "trả phòng / check-out" hotel stop is the SAME hotel as the first stay (live 2026-10-11: check-in
      // at Dalat Palace on day 1, check-out at Colline Dalat on day 3).
      const checkout = opts.keepSights === true && kind === 'hotel' && /trả phòng|check-?out/i.test(`${item.name ?? ''} ${item.description ?? ''}`)
      let place: PlanPlace | undefined = (checkout && stayPlace) ? stayPlace : (typeof item.place_id === 'string' && byPlaceId.get(item.place_id)) || findByName(String(item.name ?? ''))
      if (checkout && stayPlace && typeof item.name === 'string') { item.name = stayPlace.name; for (const f of ['address', 'maps_link', 'place_id', 'photo_url']) delete item[f] }
      // A vegetarian request: a restaurant whose row carries no vegetarian data is not kept as a venue (see `hasVegetarianBasis`); it becomes the plain meal slot.
      if (place && opts.keepSights && opts.vegetarian && kind === 'food' && !hasVegetarianBasis(place)) {
        kept.push(mealSlot(item)!); res.mealSlots = (res.mealSlots ?? 0) + 1; res.vegSlots = (res.vegSlots ?? 0) + 1; continue
      }
      if (place && opts.keepSights && used.has(place) && kind !== 'hotel') {
        // CONSULTATIVE_IN_AGENT: the same venue twice in one plan (Quảng trường Lâm Viên afternoon AND evening) is one stop, not two. A MEAL slot is not
        // dropped (Round 21 trace: day 3 lost its breakfast and lunch because both restaurants were already used on days 1–2 and the day ended after
        // the check-out): it stays as a plain "meal near the stay" slot with no venue named.
        if (kind === 'food' || kind === 'cafe') {
          const slot = mealSlot(item, opts.keepNamedVenues === true)
          if (slot) { kept.push(slot); res.mealSlots = (res.mealSlots ?? 0) + 1 } else res.dropped++
          continue
        }
        res.dropped++; continue
      }
      if (!place && opts.keepSights && (kind === 'attraction' || kind === 'entertainment') && typeof item.name === 'string' && item.name.trim()) {
        // CONSULTATIVE_IN_AGENT: a well-known sight named from the model's own knowledge when the tools returned too few places. Kept by NAME only:
        // no price, link, place id or address survives, and a description carrying a figure (hours, price) is replaced by a plain note.
        item.price = typeof item.price === 'string' && /chưa có giá|miễn phí|free/i.test(item.price) ? item.price : ''
        for (const f of ['address', 'maps_link', 'place_id', 'photo_url', 'booking_link']) delete item[f]
        delete item.booking_links
        // N3 (30/10): on the one-brain route a famous sight is a stable fact ("Dạo biển Mỹ Khê" was tagged "chưa kiểm chứng"); only what can
        // change is flagged. Price, link, address and place id are dropped above on every route, and a figure in the description is still replaced.
        const unlabelled = opts.knownSightsUnlabelled === true
        // 01/11 (owner UAT, bland plan card): on the one-brain route only the clauses that carry a figure go; the words around them stay.
        // The "check the hours and fee" line is written ONCE for the whole plan (a tip, below), not on every stop it applies to.
        if (typeof item.description === 'string' && /\d/.test(item.description)) {
          if (unlabelled) figuresLeftOut = true
          item.description = unlabelled ? withoutFigureClauses(item.description) : 'Điểm nổi tiếng (gợi ý từ kiến thức chung); giờ mở cửa và giá cần kiểm tra lại.'
        }
        // Marked as what it is: a suggestion from general knowledge, not checked against the tools' data.
        if (unlabelled) { if (typeof item.description !== 'string') item.description = '' }
        else if (typeof item.description === 'string' && !/chưa kiểm chứng|kiến thức chung/i.test(item.description)) item.description = `${item.description.trim()} (gợi ý chưa kiểm chứng)`.trim()
        else if (typeof item.description !== 'string' || !item.description.trim()) item.description = 'Điểm nổi tiếng (gợi ý chưa kiểm chứng).'
        res.sightsKept = (res.sightsKept ?? 0) + 1
        kept.push(item)
        continue
      }
      if (place) {
        res.matched++
        if (opts.keepSights && (kind === 'attraction' || kind === 'entertainment')) item.description = groundedSightDescription(item.description, place)
      } else if (opts.keepNamedVenues === true && typeof item.name === 'string' && item.name.trim() && !(kind === 'hotel' && GENERIC_STAY.test(item.name) && !HOTEL_WORD.test(item.name))) {
        // Review 30/10 (one brain): a stop the tools did not return was renamed to ANOTHER retrieved place of its kind (a hotel became a different
        // hotel) or a meal became "Ăn trưa gần chỗ ở". It keeps the model's own name and words, labelled once; nothing that can be wrong or acted on
        // survives (no price, link, address, place id, photo) - so no booking button points at an unchecked place.
        item.price = typeof item.price === 'string' && /chưa có giá|miễn phí|free/i.test(item.price) ? item.price : ''
        for (const f of ['address', 'maps_link', 'place_id', 'photo_url', 'booking_link']) delete item[f]
        delete item.booking_links
        const d = typeof item.description === 'string' ? item.description.trim() : ''
        item.description = /chưa xác minh/i.test(d) ? d : d ? `${d} (chưa xác minh)` : '(chưa xác minh)'
        res.unverifiedKept = (res.unverifiedKept ?? 0) + 1
        kept.push(item)
        continue
      } else {
        // An invented venue ("Quán bar/lounge Quận 1"): an unused retrieved place of the same kind, or nothing.
        // CONSULTATIVE_IN_AGENT: a meal the model did not name (or named wrongly) is NEVER swapped for "the next unused restaurant of the pool" — the pool holds
        // whatever the search returned, vegetarian or not (live Round 22: a vegetarian plan showed "Hải Sản Hạnh Xuân", "Cơm Gà Hà", "Quán Bò Nướng Lạc Cảnh").
        // It stays a plain meal slot; a venue only appears when the model named it and the tools returned it.
        if (opts.keepSights && (kind === 'food' || kind === 'cafe')) {
          const slot = mealSlot(item, opts.keepNamedVenues === true)
          if (slot) { kept.push(slot); res.mealSlots = (res.mealSlots ?? 0) + 1 } else res.dropped++
          continue
        }
        place = pool.find(p => !used.has(p) && [...kindsOf(p)].some(k => COMPATIBLE[kind].includes(k)))
        if (!place && opts.keepSights && kind === 'hotel' && GENERIC_STAY.test(String(item.name ?? '')) && !HOTEL_WORD.test(String(item.name ?? ''))) {
          // CONSULTATIVE_IN_AGENT: "Gửi hành lý / nhận phòng", "Trả phòng" with no hotel row to point at is the stop itself, not an invented hotel: kept as a plain stop
          // (Round 24 trace: the check-in and the check-out vanished from the card, so day 3 lost its check-out).
          for (const f of ['address', 'maps_link', 'place_id', 'photo_url', 'booking_link', 'booking_links']) delete item[f]
          item.category = 'rest'; item.price = ''
          res.genericStays = (res.genericStays ?? 0) + 1
          kept.push(item)
          continue
        }
        if (!place) { res.dropped++; continue }
        res.replaced++
        item.name = place.name
        item.description = ''
        item.price = typeof item.price === 'string' && /chưa có giá|miễn phí|free/i.test(item.price) ? item.price : ''
        for (const f of ['address', 'maps_link', 'place_id', 'photo_url']) delete item[f]
      }
      used.add(place)
      if (opts.keepSights && kind === 'hotel' && !checkout && !stayPlace) stayPlace = place
      placeOf.set(item, place)
      if (place.address && !item.address) item.address = place.address
      if (place.maps_link) item.maps_link = place.maps_link
      if (place.place_id) item.place_id = place.place_id
      const photo = place.photo_urls?.[0] ?? place.photo_url
      // Gate 2 N2 (D-N2, proposal): a plan photo is written only as a safe https URL.
      if (photo && !item.photo_url && isSafeHttpsUrl(photo)) item.photo_url = photo
      delete item.booking_links
      const url = bookingUrlFor(place, kind)
      if (url) { if (item.booking_link !== url) res.linksSet++; item.booking_link = url }
      else if (hadLink) { delete item.booking_link; res.linksRemoved++ }
      kept.push(item)
    }
    // CONSULTATIVE_IN_AGENT: the return day of a multi-day plan with fewer than FULL_DAY stops (see isInlandSight).
    if (opts.keepSights && opts.topUpReturnDay !== false && plan.days.length >= 2 && day === plan.days[plan.days.length - 1] && kept.length < FULL_DAY) {
      let anchor = kept.findIndex((it, i) => i > 0 && (/^(?:hotel|transport)$/i.test(String(it.category ?? '')) || GENERIC_STAY.test(String(it.name ?? ''))))
      if (anchor > 0) {
        const taken = new Set(plan.days.flatMap(d => (d?.items ?? []).map(it => fold(String(it?.name ?? '')))).concat(kept.map(it => fold(String(it.name ?? '')))))
        const candidates = pool.filter(p => !used.has(p) && !taken.has(fold(p.name!)) && isInlandSight(p)).slice(0, Math.min(2, FULL_DAY - kept.length))
        const beforeCheckout = kept[anchor].category === 'transport' ? 'Trước khi về' : 'Trước khi trả phòng'
        for (const p of candidates) {
          const prev = minutesOf(kept[anchor - 1].time), next = minutesOf(kept[anchor].time)
          let time = beforeCheckout
          if (prev !== null && next !== null) {
            // Clock times on both sides: only a gap of 2 h or more takes another stop (never squeezed in, never a time the plan cannot hold).
            if (next - prev < 120) break
            time = clock(Math.round((prev + 60) / 30) * 30)
          }
          const item: Item = { time, emoji: '📍', category: 'attraction', name: p.name, description: neutralSightDescription(p, 'Gợi ý thêm từ kết quả tra cứu: '), price: '' }
          if (p.address) item.address = p.address
          if (p.maps_link) item.maps_link = p.maps_link
          if (p.place_id) item.place_id = p.place_id
          const photo = p.photo_urls?.[0] ?? p.photo_url
          // Gate 2 N2 (D-N2, proposal): same rule for a topped-up sight.
          if (photo && isSafeHttpsUrl(photo)) item.photo_url = photo
          const url = bookingUrlFor(p, 'attraction')
          if (url) { item.booking_link = url; res.linksSet++ }
          kept.splice(anchor, 0, item)
          placeOf.set(item, p)
          used.add(p)
          res.returnDayFilled = (res.returnDayFilled ?? 0) + 1
          anchor++ // the check-out / the way home moved one place down; the next stop goes right before it again
        }
      }
    }
    day.items = kept
    fitTimesToHours(kept, placeOf, res)
  }
  if (figuresLeftOut) {
    const p = plan as { local_tips?: Array<{ text?: unknown; basis?: unknown }> }
    const tips = Array.isArray(p.local_tips) ? p.local_tips : []
    if (!tips.some(t => t?.text === CHECK_HOURS_AND_FEES)) p.local_tips = [...tips, { text: CHECK_HOURS_AND_FEES, basis: 'general' }]
  }
  if (!res.matched && !res.replaced && !res.dropped && !res.sightsKept && !res.mealSlots && !res.genericStays && !res.returnDayFilled && !res.linksSet && !res.linksRemoved && !res.timesMoved && !res.timesCleared) {
    // Markdown may still have been stripped — re-serialise only when something visible changed.
    const again = JSON.stringify(plan)
    if (again === JSON.stringify(JSON.parse(fullText.slice(start + OPEN.length, end).trim()))) return none
  }
  return { text: fullText.slice(0, start) + OPEN + '\n' + JSON.stringify(plan) + '\n' + fullText.slice(end), ...res, ...(destKey ? { outOfArea } : {}) }
}
