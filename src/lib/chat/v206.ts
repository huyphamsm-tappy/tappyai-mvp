// Workspace v206 (build flag NEXT_PUBLIC_WORKSPACE_V206=1): the PURE parts of the design mockup's presentation that can be built from data the app really has.
//   - the itinerary timeline model  : time chips, day tabs, the tips that belong beside a stop, the budget rows (from TripPlanCard's own plan)
//   - the tips drawer               : the answer's OWN tips (a plan's local_tips, the callouts / quotes the answer wrote); nothing is invented or classified
//   - the entity drawer             : a place card's / plan stop's REAL fields (name, address, rating, hours, phone, price band, links); no "verified" claim
//   - the conversation header       : badges from the conversation's own metadata
// Off (the default): nothing here is called and the chat looks exactly as before. NO model call, NO network.

import { parseDoc, titleKey } from '@/lib/answerDoc/parse'
import { isSafeHttpsUrl } from '@/lib/security/urlGuard'

export const WORKSPACE_V206 = process.env.NEXT_PUBLIC_WORKSPACE_V206 === '1'

// ---------------------------------------------------------------------------------------------------------------------
// itinerary
// ---------------------------------------------------------------------------------------------------------------------

export interface V206PlanItem {
  time?: string
  emoji?: string
  category?: string
  name: string
  description?: string
  price?: string
  address?: string
  maps_link?: string
  booking_link?: string
  place_id?: string
  photo_url?: string
}
export interface V206PlanDay { label: string; items: V206PlanItem[] }
export interface V206Plan {
  type?: string
  title: string
  people?: number
  budget_total?: string
  days: V206PlanDay[]
  cost_breakdown?: Record<string, string>
  local_tips?: Array<{ text: string; basis?: string; place?: string }>
}

/** The time chip of a stop: "9:5" is not a time; "09:30" / "9h30" / "9:30" become "09:30"; any other non-empty text (e.g. "Sáng") is kept as the plan wrote it. Empty → null. */
export function timeChip(raw: string | undefined | null): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const m = /^(\d{1,2})\s*(?::|h|giờ)\s*(\d{2})?$/i.exec(s)
  if (m) {
    const h = Number(m[1]); const min = m[2] === undefined ? 0 : Number(m[2])
    if (h <= 23 && min <= 59) return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
  }
  return s.slice(0, 24)
}

/** "Ngày 2: Puppy Farm" → the part before the colon is the tab ("Ngày 2"), the rest is its theme (shown under the day's heading). A label with no colon is only a tab. */
export function splitDayLabel(label: string): { tab: string; theme: string } {
  const s = String(label ?? '').trim()
  const at = s.search(/\s*[:–—-]\s+/)
  if (at <= 0 || at > 24) return { tab: s, theme: '' }
  const tab = s.slice(0, at).trim()
  const theme = s.slice(at).replace(/^\s*[:–—-]\s+/, '').trim()
  return { tab, theme }
}

export interface PlanTip { id: string; text: string; title?: string; place?: string; source: 'plan' | 'answer'; general?: boolean }

/** A plan's own local tips (already guarded by the server). */
export function planTips(plan: Pick<V206Plan, 'local_tips'>): PlanTip[] {
  const out: PlanTip[] = []
  for (const [i, tip] of (plan.local_tips ?? []).entries()) {
    const text = typeof tip?.text === 'string' ? tip.text.trim() : ''
    if (!text) continue
    out.push({ id: `plan-${i}`, text, ...(tip.place ? { place: tip.place } : {}), source: 'plan', ...(tip.basis === 'general' ? { general: true } : {}) })
  }
  return out
}

/** A tip names a place of the plan when one of the two names contains the other (accents, case and punctuation ignored). */
export function tipBelongsTo(tip: PlanTip, itemName: string): boolean {
  if (!tip.place) return false
  const a = titleKey(tip.place); const b = titleKey(itemName)
  if (!a || !b) return false
  return a === b || (a.length >= 4 && b.includes(a)) || (b.length >= 4 && a.includes(b))
}

/** The tips of a plan that sit beside stop (day, item): only the ones that name that stop. Each tip is placed once (first matching stop). */
export function tipsByStop(plan: V206Plan, tips: readonly PlanTip[]): Map<string, PlanTip[]> {
  const out = new Map<string, PlanTip[]>()
  const used = new Set<string>()
  plan.days.forEach((d, di) => d.items.forEach((it, ii) => {
    for (const tip of tips) {
      if (used.has(tip.id) || !tipBelongsTo(tip, it.name)) continue
      used.add(tip.id)
      const k = `${di}:${ii}`
      out.set(k, [...(out.get(k) ?? []), tip])
    }
  }))
  return out
}

export interface BudgetRow { label: string; value: string }
/** The plan's cost breakdown as it is (labels and amounts are the plan's own strings; nothing is summed or converted). */
export function budgetRows(plan: Pick<V206Plan, 'cost_breakdown'>): BudgetRow[] {
  return Object.entries(plan.cost_breakdown ?? {})
    .map(([label, value]) => ({ label: String(label).trim(), value: String(value ?? '').trim() }))
    .filter(r => r.label && r.value)
}

export interface TripFacts { days: number; stops: number; people: number | null; budget: string | null }
/** The header chips of the trip: only what the plan itself carries (no destination, dates or pace are inferred). */
export function tripFacts(plan: V206Plan): TripFacts {
  return {
    days: plan.days.length,
    stops: plan.days.reduce((n, d) => n + d.items.length, 0),
    people: plan.people && plan.people > 1 ? plan.people : null,
    budget: plan.budget_total?.trim() || null,
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// tips of an ordinary answer: its own callouts
// ---------------------------------------------------------------------------------------------------------------------

const LEAD_LABEL = /^\s*(?:[^\p{L}\p{N}*]{0,4})?\*\*([^*]{2,80}?)\*\*\s*[:：]?\s*/u

/** The quote blocks of an answer (">" lines) as tips: a leading bold label ("**Mẹo chống say xe:**") is the title, the rest the text. A quote with no text yields nothing. Pure. */
export function calloutTips(text: string): PlanTip[] {
  const out: PlanTip[] = []
  for (const b of parseDoc(String(text ?? ''))) {
    if (b.t !== 'quote') continue
    const raw = b.text.replace(/\s+/g, ' ').trim()
    if (!raw) continue
    const m = LEAD_LABEL.exec(raw)
    const title = m ? m[1].replace(/[:：]\s*$/, '').trim() : undefined
    const body = (m ? raw.slice(m[0].length) : raw).replace(/\*\*/g, '').trim()
    if (!body && !title) continue
    out.push({ id: `callout-${out.length}`, text: body || (title ?? ''), ...(body && title ? { title } : {}), source: 'answer' })
  }
  return out
}

/** The tips of a drawer search: case, accents and punctuation ignored; an empty query keeps all. */
export function filterTips(tips: readonly PlanTip[], query: string): PlanTip[] {
  const q = titleKey(query)
  if (!q) return [...tips]
  return tips.filter(t => titleKey(`${t.title ?? ''} ${t.place ?? ''} ${t.text}`).includes(q))
}

// ---------------------------------------------------------------------------------------------------------------------
// entity profile (a real place)
// ---------------------------------------------------------------------------------------------------------------------

export interface EntityFact { label: string; value: string }
export interface EntityLink { kind: 'maps' | 'booking' | 'phone'; href: string; label: string }
export interface EntityProfile {
  key: string
  title: string
  subtitle?: string
  image?: string
  facts: EntityFact[]
  links: EntityLink[]
  note?: string
}

/** What a place card of the answer (LivePlace) carries; typed structurally so this file does not import the card. */
export interface PlaceFields {
  id?: string
  name: string
  image?: string
  address?: string
  rating?: number
  ratingCount?: number
  stars?: number
  openingHours?: string
  openNow?: boolean
  phone?: string
  priceRangeText?: string
  priceSignal?: string
  categories?: string[]
  distanceKm?: number
}

export interface EntityLabels {
  status: string; address: string; rating: string; reviews: (n: number) => string; stars: string; hours: string; openNow: string; closedNow: string; phone: string
  price: string; time: string; category: string; distance: string; maps: string; booking: string; call: string; description: string
}

const safeHttps = (u: string | undefined): string | undefined => (u && isSafeHttpsUrl(u) ? u : undefined)
const digitsOf = (p: string): string => p.replace(/[^\d+]/g, '')

/** The profile of a place from its REAL fields (the card's, the plan stop's, or both). A field that is absent is not shown, none is invented. */
export function buildEntityProfile(place: PlaceFields | null, stop: V206PlanItem | null, L: EntityLabels): EntityProfile | null {
  const title = (place?.name || stop?.name || '').trim()
  if (!title) return null
  const facts: EntityFact[] = []
  const add = (label: string, value: string | undefined | null) => { const v = String(value ?? '').trim(); if (v) facts.push({ label, value: v }) }
  if (stop?.time) add(L.time, timeChip(stop.time) ?? '')
  const stopAddress = stop?.address && stop.address !== 'Xem bản đồ' ? stop.address : ''
  add(L.address, place?.address || stopAddress)
  if (typeof place?.rating === 'number' && place.rating > 0) add(L.rating, `${place.rating.toFixed(1)}${typeof place.ratingCount === 'number' && place.ratingCount > 0 ? ` (${L.reviews(place.ratingCount)})` : ''}`)
  if (typeof place?.stars === 'number' && place.stars > 0) add(L.stars, '★'.repeat(Math.min(5, Math.round(place.stars))))
  add(L.hours, place?.openingHours)
  if (place?.openNow === true) add(L.status, L.openNow)
  else if (place?.openNow === false) add(L.status, L.closedNow)
  add(L.price, place?.priceRangeText || stop?.price || place?.priceSignal)
  if (place?.categories?.length) add(L.category, place.categories.slice(0, 3).join(', '))
  if (typeof place?.distanceKm === 'number' && place.distanceKm >= 0) add(L.distance, `${place.distanceKm.toFixed(1)} km`)
  const links: EntityLink[] = []
  const maps = safeHttps(stop?.maps_link)
  if (maps) links.push({ kind: 'maps', href: maps, label: L.maps })
  const booking = safeHttps(stop?.booking_link)
  if (booking) links.push({ kind: 'booking', href: booking, label: L.booking })
  const tel = place?.phone ? digitsOf(place.phone) : ''
  if (tel.length >= 6) links.push({ kind: 'phone', href: `tel:${tel}`, label: `${L.call} ${place?.phone?.trim()}` })
  const image = safeHttps(place?.image) ?? safeHttps(stop?.photo_url)
  const note = stop?.description?.trim() || undefined
  const subtitle = (place?.categories?.[0] || stop?.category || '').toString().trim() || undefined
  // nothing real to show beyond the name: no profile (the control is hidden, not faked)
  if (!facts.length && !links.length && !image && !note) return null
  return { key: titleKey(title) || title, title, ...(subtitle ? { subtitle } : {}), ...(image ? { image } : {}), facts, links, ...(note ? { note } : {}) }
}

/** The place card of the turn that a name belongs to (id match first, then the same name or one containing the other, min 4 letters). */
export function matchPlace<P extends { id?: string; name: string }>(places: readonly P[] | null | undefined, name: string, placeId?: string): P | null {
  if (!places?.length) return null
  if (placeId) { const byId = places.find(p => p.id && p.id === placeId); if (byId) return byId }
  const k = titleKey(name)
  if (!k) return null
  const exact = places.find(p => titleKey(p.name) === k)
  if (exact) return exact
  return places.find(p => { const pk = titleKey(p.name); return pk.length >= 4 && k.length >= 4 && (pk.includes(k) || k.includes(pk)) }) ?? null
}

// ---------------------------------------------------------------------------------------------------------------------
// conversation header
// ---------------------------------------------------------------------------------------------------------------------

export type HeaderBadge = 'pinned' | 'archived' | 'project'
/** The badges the conversation's own metadata supports (nothing like "Evidence verified" exists without that data). */
export function headerBadges(conv: { is_pinned?: boolean | null; is_archived?: boolean | null; project_id?: string | null } | null | undefined): HeaderBadge[] {
  if (!conv) return []
  const out: HeaderBadge[] = []
  if (conv.is_archived === true) out.push('archived')
  else if (conv.is_pinned === true) out.push('pinned')
  if (conv.project_id) out.push('project')
  return out
}
