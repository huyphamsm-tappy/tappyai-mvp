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
  return actions.find(a => BOOKING_KINDS.has(a.kind) && (a.urlKind === 'direct' || !!a.commerce))?.url ?? null
}

type Item = Record<string, unknown>

export interface PlanItemGuardResult { text: string; matched: number; replaced: number; dropped: number; linksSet: number; linksRemoved: number }

export function guardPlanItems(fullText: string, places: readonly PlanPlace[]): PlanItemGuardResult {
  const none = { text: fullText, matched: 0, replaced: 0, dropped: 0, linksSet: 0, linksRemoved: 0 }
  const start = fullText.indexOf(OPEN)
  const end = fullText.indexOf(CLOSE)
  if (start === -1 || end === -1 || end < start) return none
  let plan: { days?: Array<{ items?: Item[] }> } & Record<string, unknown>
  try { plan = JSON.parse(fullText.slice(start + OPEN.length, end).trim()) } catch { return none }
  if (!plan || !Array.isArray(plan.days)) return none

  const pool = places.filter(p => typeof p?.name === 'string' && p.name.trim())
  const byPlaceId = new Map(pool.filter(p => typeof p.place_id === 'string' && p.place_id).map(p => [p.place_id as string, p]))
  const used = new Set<PlanPlace>()
  const findByName = (name: string): PlanPlace | undefined => {
    const key = fold(name)
    if (!key) return undefined
    return pool.find(p => fold(p.name!) === key)
      ?? pool.find(p => { const n = fold(p.name!); return n.length >= 6 && key.length >= 6 && (n.includes(key) || key.includes(n)) })
  }
  const res = { matched: 0, replaced: 0, dropped: 0, linksSet: 0, linksRemoved: 0 }

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
      let place = (typeof item.place_id === 'string' && byPlaceId.get(item.place_id)) || findByName(String(item.name ?? ''))
      if (place) {
        res.matched++
      } else {
        // An invented venue ("Quán bar/lounge Quận 1"): an unused retrieved place of the same kind, or nothing.
        place = pool.find(p => !used.has(p) && [...kindsOf(p)].some(k => COMPATIBLE[kind].includes(k)))
        if (!place) { res.dropped++; continue }
        res.replaced++
        item.name = place.name
        item.description = ''
        item.price = typeof item.price === 'string' && /chưa có giá|miễn phí|free/i.test(item.price) ? item.price : ''
        for (const f of ['address', 'maps_link', 'place_id', 'photo_url']) delete item[f]
      }
      used.add(place)
      if (place.address && !item.address) item.address = place.address
      if (place.maps_link) item.maps_link = place.maps_link
      if (place.place_id) item.place_id = place.place_id
      const photo = place.photo_urls?.[0] ?? place.photo_url
      if (photo && !item.photo_url) item.photo_url = photo
      delete item.booking_links
      const url = bookingUrlFor(place, kind)
      if (url) { if (item.booking_link !== url) res.linksSet++; item.booking_link = url }
      else if (hadLink) { delete item.booking_link; res.linksRemoved++ }
      kept.push(item)
    }
    day.items = kept
  }
  if (!res.matched && !res.replaced && !res.dropped && !res.linksSet && !res.linksRemoved) {
    // Markdown may still have been stripped — re-serialise only when something visible changed.
    const again = JSON.stringify(plan)
    if (again === JSON.stringify(JSON.parse(fullText.slice(start + OPEN.length, end).trim()))) return none
  }
  return { text: fullText.slice(0, start) + OPEN + '\n' + JSON.stringify(plan) + '\n' + fullText.slice(end), ...res }
}
