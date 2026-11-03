// ── Carried evidence for follow-ups about the cards on screen ("quán số 2 sao?", "quán đó ở đâu?") ─────────────────────────
//
// Phase 7 closeout 2A. A follow-up that runs no tool is judged by placeClaimGuard against CARRIED evidence. That evidence used to be
// only the numbers the previous REPLY TEXT happened to state (referenceResolver.carriedFacts), so a card the prose never described
// (card #2) had no evidence at all: the agent answered from the card facts it was given and the guard removed the whole sentence
// (measured UAT 04/10: an empty reply). The verified rows of the cards on screen are the real evidence; this module turns them into
// field-level facts, in display order, with when they were verified.
//
// Contract (pure, no I/O):
//   · entity resolution: card position i ↔ the stored row whose name matches card i (exact fold first, then containment);
//   · a field is carried only when the provider row has it — an entity name authorizes nothing by itself;
//   · freshness: opening HOURS (a schedule) are carried; "open now" is a moment and is carried only while ≤ 30 min old;
//   · the rows came from this conversation's own last place search (chat-session state), never from another user or session.

import type { CarriedFacts } from '@/lib/ai/consultative/referenceResolver'

/** The guard's carried entry (the prose-carried shape may lack phone/address). */
export type CarriedLike = Pick<CarriedFacts, 'name' | 'rating' | 'reviewCount' | 'distanceKm'> & Partial<Pick<CarriedFacts, 'hours' | 'phone' | 'address'>>

export const OPEN_NOW_FRESH_MS = 30 * 60_000

export interface CardFact {
  position: number
  name: string
  rating?: number
  reviews?: number
  price?: string
  km?: number
  address?: string
  phone?: string
  hours?: string
  openNow?: boolean
  verifiedAt?: string
}

const fold = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim()
const str = (v: unknown): string | undefined => typeof v === 'string' && v.trim() ? v.trim() : undefined
const num = (v: unknown): number | undefined => typeof v === 'number' && Number.isFinite(v) ? v : undefined

/** The stored row for one card name: exact (folded) name first, then containment either way. */
export function rowForCard(card: string, rows: readonly Record<string, unknown>[]): Record<string, unknown> | undefined {
  const c = fold(card)
  if (!c) return undefined
  return rows.find(r => typeof r.name === 'string' && fold(r.name) === c)
    ?? rows.find(r => typeof r.name === 'string' && fold(r.name).length > 0 && (fold(r.name).includes(c) || c.includes(fold(r.name))))
}

/**
 * Field-level facts of the cards on screen, in display order, plus the same facts in the guard's carried shape.
 * `verifiedAt` = when the rows were retrieved (chat-session state); unknown → "open now" is not carried.
 */
export function cardEvidence(cards: readonly string[], rows: readonly Record<string, unknown>[], opts: { now: Date; verifiedAt?: string | null }): { facts: CardFact[]; carried: CarriedFacts[] } {
  const at = opts.verifiedAt ? Date.parse(opts.verifiedAt) : NaN
  const openNowFresh = Number.isFinite(at) && opts.now.getTime() - at >= 0 && opts.now.getTime() - at <= OPEN_NOW_FRESH_MS
  const facts: CardFact[] = []
  cards.forEach((card, i) => {
    const r = rowForCard(card, rows)
    if (!r || typeof r.name !== 'string') return
    const f: CardFact = { position: i + 1, name: r.name }
    const rating = num(r.rating_value); if (rating !== undefined) f.rating = rating
    const reviews = num(r.rating_count); if (reviews !== undefined) f.reviews = reviews
    const price = str(r.price_range_text); if (price) f.price = price
    const km = num(r.distance_km); if (km !== undefined) f.km = km
    const address = str(r.address); if (address) f.address = address
    const phone = str(r.phone); if (phone) f.phone = phone
    const hours = str(r.opening_hours); if (hours) f.hours = hours
    if (openNowFresh && typeof r.open_now === 'boolean') f.openNow = r.open_now
    if (opts.verifiedAt) f.verifiedAt = opts.verifiedAt
    facts.push(f)
  })
  const carried: CarriedFacts[] = facts.map(f => ({
    name: f.name, rating: f.rating ?? null, reviewCount: f.reviews ?? null, distanceKm: f.km ?? null,
    hours: f.hours ?? null, phone: f.phone ?? null, address: f.address ?? null,
  }))
  return { facts, carried }
}

/** Prose-carried facts + row-carried facts, one entry per venue; a row's field wins over the prose's (rows are the source). */
export function mergeCarried(fromProse: readonly CarriedLike[], fromRows: readonly CarriedFacts[]): CarriedLike[] {
  const byName = new Map<string, CarriedLike>()
  for (const c of fromProse) byName.set(fold(c.name), { ...c })
  for (const c of fromRows) {
    const k = fold(c.name)
    const p = byName.get(k)
    byName.set(k, p ? {
      name: c.name,
      rating: c.rating ?? p.rating, reviewCount: c.reviewCount ?? p.reviewCount, distanceKm: c.distanceKm ?? p.distanceKm,
      hours: c.hours ?? p.hours ?? null, phone: c.phone ?? p.phone ?? null, address: c.address ?? p.address ?? null,
    } : { ...c })
  }
  return [...byName.values()]
}
