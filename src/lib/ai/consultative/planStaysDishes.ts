// "Where to stay" and "what to eat" of a trip plan (owner 20/11: ChatGPT shows hotel cards and dish cards, Gemini a dish table and a per-night stay table; Tappy's plan had neither as its own section).
// The model names 2-3 stays and up to six dishes in present_plan; THIS module decides what is shown, from the evidence of the same turn, so nothing here is the model's word for a fact:
//   - a stay is kept only when the lookup returned that hotel (an Agoda offer) or a searched place; its nightly price and its Agoda page come from the offer, never from the model;
//   - a dish keeps its venue, address and price only when the venue is a place the turn searched; otherwise it stays as a dish with the model's short note and nothing that looks like a fact.
// Pure; the plan JSON is the TAPPY_PLAN body.
import { fold, sameName, stayPerNightLabel, type StayOfferLink } from '@/lib/ai/consultative/planPartnerLinks'

export interface PlaceRef { name: string; address?: string }
export interface StaysDishesContext { stays: readonly StayOfferLink[]; places: readonly PlaceRef[]; lang?: string }

const MAX_STAYS = 3
const MAX_DISHES = 6
const MARKER = /\[\/?(?:TAPPY_|CTA_|FOLLOWUPS)/i
const LINK = /https?:\/\/|www\./i

/** Short single-line text; empty when it carries a link or a protocol marker (those are never the model's to write here). */
const text = (v: unknown, max: number): string => {
  if (typeof v !== 'string') return ''
  const t = v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  return !t || MARKER.test(t) || LINK.test(t) ? '' : t.slice(0, max)
}
const https = (u: unknown): u is string => typeof u === 'string' && /^https:\/\//i.test(u) && u.length <= 1500

function pickStays(raw: unknown, ctx: StaysDishesContext, lang: string): Array<Record<string, string>> {
  const out: Array<Record<string, string>> = []
  const seen = new Set<string>()
  for (const r of Array.isArray(raw) ? raw : []) {
    if (out.length >= MAX_STAYS) break
    const name = text((r as { name?: unknown })?.name, 80)
    if (!name || seen.has(fold(name))) continue
    const offer = ctx.stays.find(s => https(s.url) && sameName(s.name, name))
    const place = ctx.places.find(p => p.name && sameName(p.name, name))
    // a hotel nobody looked up is not recommended: a made-up name with a made-up price is the worst answer to "where do I sleep"
    if (!offer && !place) continue
    seen.add(fold(name))
    const row: Record<string, string> = { name }
    const why = text((r as { why?: unknown }).why, 160)
    if (why) row.why = why
    if (offer?.perNight && offer.perNight > 0) row.price = stayPerNightLabel(offer.perNight, lang)
    if (place?.address) { const a = text(place.address, 120); if (a) row.address = a }
    if (offer) row.booking_link = offer.url
    out.push(row)
  }
  return out
}

function pickDishes(raw: unknown, ctx: StaysDishesContext): Array<Record<string, string>> {
  const out: Array<Record<string, string>> = []
  for (const r of Array.isArray(raw) ? raw : []) {
    if (out.length >= MAX_DISHES) break
    const d = r as { dish?: unknown; venue?: unknown; price?: unknown; note?: unknown }
    const dish = text(d?.dish, 60)
    if (!dish) continue
    const row: Record<string, string> = { dish }
    const venueName = text(d.venue, 80)
    const place = venueName ? ctx.places.find(p => p.name && sameName(p.name, venueName)) : undefined
    if (place) {
      row.venue = venueName
      const a = text(place.address, 120); if (a) row.address = a
      const price = text(d.price, 40); if (price && /\d/.test(price)) row.price = price
    }
    const note = text(d.note, 120); if (note) row.note = note
    out.push(row)
  }
  return out
}

/** The plan JSON with `stays` and `dishes` reduced to what the evidence allows. Anything that does not parse, or a plan with neither field, is returned as it came. */
export function withStaysAndDishes(planJson: string, ctx: StaysDishesContext): string {
  let plan: Record<string, unknown>
  try { plan = JSON.parse(planJson) } catch { return planJson }
  if (!plan || typeof plan !== 'object' || (!('stays' in plan) && !('dishes' in plan))) return planJson
  const lang = ctx.lang === 'en' ? 'en' : 'vi'
  const stays = pickStays(plan.stays, ctx, lang)
  const dishes = pickDishes(plan.dishes, ctx)
  delete plan.stays
  delete plan.dishes
  if (stays.length) plan.stays = stays
  if (dishes.length) plan.dishes = dishes
  return JSON.stringify(plan)
}
