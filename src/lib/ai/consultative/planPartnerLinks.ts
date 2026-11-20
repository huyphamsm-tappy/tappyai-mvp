// A trip plan's hotel stop and its coach or train stop carry the affiliate partner's own page (owner 20/11: Agoda for the stay, Vexere for the way there, with the price the same turn looked up).
// The links are the ones the tools of THIS turn returned and the platform already validated (the Agoda offer's page of a hotel the lookup named, the Vexere route page); nothing is composed here,
// and a stop is matched to a hotel by its name only (never "the cheapest one"). Pure.

import { vi as VI, en as EN } from '@/lib/i18n/presentation'

export interface StayOfferLink { name: string; url: string; /** the price per night in VND when the offer was fresh */ perNight?: number }
export interface TransportLink { name: string; url: string }
export interface PartnerContext { stays: readonly StayOfferLink[]; transport: readonly TransportLink[]; lang?: string }

export const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const https = (u: unknown): u is string => typeof u === 'string' && /^https:\/\//i.test(u) && u.length <= 1500

const STAY_WORD = /\b(khach san|resort|homestay|hotel|villa|hostel|nha nghi|bungalow|retreat)\b/
const TRAIN_WORD = /\b(tau hoa|tau|train|duong sat)\b/
const COACH_WORD = /\b(xe khach|xe giuong nam|giuong nam|limousine|bus|coach|nha xe)\b/

export const sameName = (a: string, b: string): boolean => {
  const x = fold(a), y = fold(b)
  if (!x || !y) return false
  if (x === y) return true
  const short = x.length <= y.length ? x : y, long = x.length <= y.length ? y : x
  return short.length >= 6 && long.includes(short)
}

const money = (n: number, lang: string): string => Math.round(n).toLocaleString(lang === 'en' ? 'en-US' : 'vi-VN') + (lang === 'en' ? ' VND' : String.fromCharCode(0x111))

/** "1.250.000d/dem" for a looked-up nightly price (the same words the hotel stop uses). */
export function stayPerNightLabel(perNight: number, lang: string): string {
  const l = lang === 'en' ? 'en' : 'vi'
  return ((l === 'en' ? EN : VI)['plan.stayPerNight'] ?? '{price}').replace('{price}', money(perNight, l))
}

interface PlanItemLike { name?: unknown; category?: unknown; description?: unknown; price?: unknown; booking_link?: unknown }

/** The plan JSON (the TAPPY_PLAN body) with the partner's page on its hotel and coach/train stops. Anything that does not parse is returned as it came. */
export function withPartnerLinks(planJson: string, ctx: PartnerContext): string {
  let plan: { days?: Array<{ items?: PlanItemLike[] }> }
  try { plan = JSON.parse(planJson) } catch { return planJson }
  if (!plan || !Array.isArray(plan.days)) return planJson
  const lang = ctx.lang === 'en' ? 'en' : 'vi'
  const dict = lang === 'en' ? EN : VI
  let changed = false
  for (const day of plan.days) for (const it of day.items ?? []) {
    if (typeof it?.name !== 'string' || (it.booking_link !== undefined && it.booking_link !== null && it.booking_link !== '')) continue
    const f = fold(`${it.name} ${typeof it.description === 'string' ? it.description : ''}`)
    const cat = typeof it.category === 'string' ? it.category.toLowerCase() : ''
    if (cat === 'hotel' || STAY_WORD.test(fold(it.name))) {
      const stay = ctx.stays.find(s => https(s.url) && sameName(s.name, it.name as string))
      if (stay) {
        it.booking_link = stay.url
        if (!it.price && stay.perNight) it.price = (dict['plan.stayPerNight'] ?? '{price}').replace('{price}', money(stay.perNight, lang))
        changed = true
      }
      continue
    }
    if (cat === 'transport') {
      const wantsTrain = TRAIN_WORD.test(f) && !COACH_WORD.test(f)
      const wantsCoach = COACH_WORD.test(f)
      if (!wantsTrain && !wantsCoach) continue
      const links = ctx.transport.filter(l => https(l.url))
      const pick = wantsTrain ? links.find(l => /(tau|train)/.test(fold(l.name))) : links.find(l => !/(tau|train)/.test(fold(l.name)))
      if (pick) { it.booking_link = pick.url; changed = true }
    }
  }
  return changed ? JSON.stringify(plan) : planJson
}
