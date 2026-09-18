// ── CONSULTATIVE V1 — follow-up reference resolution ───────────────────────
//
// "quán này / chỗ đó / quán đầu tiên / quán số 2 / 3 quán này / cả 3 / quán X"
// point at venues the PREVIOUS reply named. Today the model resolves them from
// the prior prose on its own; this resolves them deterministically so the
// route can (a) tell the model exactly which venues are meant and (b) run ONE
// real search by name when the turn asks for a fact the carried text lacks.
//
// The only durable record of a place turn is the assistant's text (the card
// rides an annotation frame and the `[TAPPY_PLACES]` marker is flag-gated off),
// so prior venues are read from the names the prose bolded, in the order they
// were mentioned — which is the order the user saw them.
//
// Deterministic, diacritic-folded, no calls. See consultative-v1-design.md §3.

import { normalizeVN } from '../intent'

export interface PriorVenue {
  /** 1-based position in the prior reply, the way the user counted them. */
  index: number
  name: string
}

export interface Reference {
  kind: 'this' | 'ordinal' | 'count' | 'all' | 'name'
  venues: PriorVenue[]
}

export type FactAsked =
  | 'hours' | 'price' | 'phone' | 'address' | 'open_now' | 'parking' | 'booking' | 'menu' | 'distance'
  | 'crowd' | 'vibe'

const fold = (s: string) => normalizeVN(s.toLowerCase()).replace(/\s+/g, ' ').trim()

/**
 * Venue names the prior reply bolded — `**Tên quán**` — in order of first
 * mention. Headings, machine blocks and bolded non-names ("**Lưu ý:**") are
 * skipped by shape: a name has no trailing colon and is 2–60 characters.
 */
export function priorVenuesIn(assistantText: string): PriorVenue[] {
  if (!assistantText) return []
  const seen = new Set<string>()
  const out: PriorVenue[] = []
  // Machine blocks carry names too; keep to the prose the user read.
  const prose = assistantText.replace(/\[(?:TAPPY_PLACES|TAPPY_SHOPPING|TAPPY_PLAN|CTA_BUTTONS|FOLLOWUPS)\][\s\S]*$/m, '')
  for (const m of prose.matchAll(/\*\*([^*\n]{2,60}?)\*\*/g)) {
    const raw = m[1].replace(/^[#\d.\s)-]+/, '').replace(/[:：]\s*$/, '').trim()
    if (!raw || /[:：]$/.test(m[1].trim())) continue
    if (/^(luu y|goi y|ket luan|tom lai|note|tip|why|ly do|xem them|gia|dia chi|gio mo|mo cua)\b/.test(fold(raw))) continue
    const key = fold(raw)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ index: out.length + 1, name: raw })
  }
  return out
}

const ORDINALS: Array<[RegExp, number]> = [
  [/\b(?:quan|cho|tiem|nha hang|cai|option|place|khach san|spa)?\s*(?:dau tien|thu nhat|so 1|1st|first|so mot)\b/, 1],
  [/\b(?:thu hai|so 2|2nd|second|thu 2)\b/, 2],
  [/\b(?:thu ba|so 3|3rd|third|thu 3)\b/, 3],
  [/\b(?:thu tu|so 4|4th|fourth|thu 4)\b/, 4],
  [/\b(?:thu nam|so 5|5th|fifth|thu 5)\b/, 5],
  [/\b(?:cuoi cung|cuoi|last one|the last)\b/, -1],
]

/**
 * Resolve the references in a user turn against the prior venues. Never a new
 * search: an unresolvable reference resolves to nothing.
 */
export function resolveReferences(text: string, prior: readonly PriorVenue[]): Reference[] {
  if (!text || prior.length === 0) return []
  const f = ' ' + fold(text) + ' '
  const refs: Reference[] = []

  // Names first — "Quán X thì sao" is the most specific reference.
  const named = prior.filter(v => {
    const n = fold(v.name)
    const wholeWord = n.length >= 3 && f.includes(' ' + n + ' ')
    const multiWord = n.split(' ').length >= 2 && f.includes(n)
    return wholeWord || multiWord
  })
  if (named.length > 0) refs.push({ kind: 'name', venues: named })

  // "cả 3 / tất cả / cả hai / all of them"
  if (/\b(ca (?:\d|hai|ba|bon)|tat ca|het|all (?:of them|three|two)|both)\b/.test(f)) {
    refs.push({ kind: 'all', venues: [...prior] })
  }
  // "3 quán này / 2 chỗ đó / these 3"
  const count = f.match(/\b(\d)\s*(?:quan|cho|tiem|nha hang|cai|khach san|spa|places?|options?)\s*(?:nay|do|kia|tren|vua roi|ban (?:vua )?(?:goi y|noi)|these|those|above)\b/)
    ?? f.match(/\b(?:these|those)\s+(\d)\b/)
  if (count) {
    const n = Number(count[1])
    refs.push({ kind: 'count', venues: prior.slice(0, n) })
  }
  // Ordinals
  for (const [re, idx] of ORDINALS) {
    if (!re.test(f)) continue
    const v = idx === -1 ? prior[prior.length - 1] : prior[idx - 1]
    if (v) refs.push({ kind: 'ordinal', venues: [v] })
  }
  // "quán này / chỗ đó / cái này / this place / that one" — the pick (first named) unless
  // something more specific already resolved.
  if (refs.length === 0 && /\b(?:quan|cho|tiem|nha hang|cai|khach san|spa|place|one|option)\s*(?:nay|do|kia|day|this|that)\b|\b(?:this|that)\s+(?:place|one|restaurant|spot|cafe|hotel)\b|\bo do\b|\bo day\b/.test(f)) {
    refs.push({ kind: 'this', venues: [prior[0]] })
  }
  return refs
}

const FACTS: Array<[FactAsked, RegExp]> = [
  ['open_now', /\b(con mo|dang mo|mo chua|mo khong|co mo|open now|still open|is it open|dong cua chua)\b/],
  ['hours', /\b(gio mo|may gio|gio dong|mo cua luc|mo den|mo toi|opening hours|what time|hours|close at|open until|mo luc)\b/],
  // "giá" but not "gia đình / giá trị / giả sử".
  ['price', /\bgia(?! dinh| tri| su| ve\b)\b|\b(bao nhieu tien|bao nhieu|nhieu tien|dat khong|re khong|price|how much|cost|expensive)\b/],
  ['phone', /\b(so dien thoai|sdt|so phone|hotline|dien thoai|phone|number|goi dien|call)\b/],
  ['address', /\b(dia chi|o dau|duong nao|address|where is|location|toa do)\b/],
  ['parking', /\b(dau xe|do xe|giu xe|bai xe|parking)\b/],
  ['booking', /\b(dat ban|dat cho|dat truoc|book|reserve|reservation|can dat)\b/],
  ['menu', /\b(menu|thuc don|co mon gi|mon gi|dac san|best dish|what to order)\b/],
  ['distance', /\b(xa khong|bao xa|cach (?:day|do|xa|bao|toi|minh)|far|how far|distance|gan khong)\b/],
  // Attribute questions: the answer is evidence or "no data", never a guess.
  ['crowd', /\b(dong khong|co dong|dong ko|dong lam khong|xep hang|cho lau khong|crowded|busy|wait long)\b/],
  ['vibe', /\b(yen tinh khong|on khong|co view|view (?:dep|ok) khong|khong gian (?:the nao|sao|ra sao)|lang man khong|sang khong|hop (?:gia dinh|tre em|hen ho|date) khong|atmosphere|vibe)\b/],
]

/** The fact(s) this turn asks about the referenced venue(s). */
export function factsAsked(text: string): FactAsked[] {
  const f = ' ' + fold(text) + ' '
  const out: FactAsked[] = []
  for (const [fact, re] of FACTS) if (re.test(f)) out.push(fact)
  return out
}

/** Every venue any reference resolved to, deduped, in prior order. */
export function referencedVenues(refs: readonly Reference[]): PriorVenue[] {
  const seen = new Set<number>()
  const out: PriorVenue[] = []
  for (const r of refs) for (const v of r.venues) if (!seen.has(v.index)) { seen.add(v.index); out.push(v) }
  return out.sort((a, b) => a.index - b.index)
}

/**
 * Whether the carried text already states the asked fact for the venue — a
 * crude but honest check on the prior prose, which is all a follow-up carries.
 * Unknown ⇒ false ⇒ the route may search by name once.
 */
export function priorTextStates(priorText: string, venue: PriorVenue, fact: FactAsked): boolean {
  const seg = venueSegment(priorText, venue)
  if (seg === null) return false
  switch (fact) {
    case 'hours': case 'open_now': return /\b\d{1,2}[:h]\d{0,2}\s*[-–]\s*\d{1,2}[:h]\d{0,2}\b|\b(mo cua|gio mo|open)\b.*\d/.test(seg)
    case 'price': return /\d\s*(?:k|nghin|tr|trieu|d|vnd|₫)\b|₫|\bdong\b/.test(seg)
    case 'phone': return /(?:\+84|0)\d[\d .]{7,}\d/.test(seg)
    case 'address': return /\b(duong|street|quan|q\.?\s?\d|phuong|district)\b/.test(seg)
    case 'distance': return /\b\d+(?:[.,]\d+)?\s*(?:km|m|phut|min)\b/.test(seg)
    default: return false
  }
}

export interface CarriedFacts {
  name: string
  rating: number | null
  reviewCount: number | null
  distanceKm: number | null
}

/** The venue's own paragraph in the prior prose (after its bolded name, up to the next name / blank line). */
function venueSegment(priorText: string, venue: PriorVenue): string | null {
  const f = fold(priorText)
  const n = fold(venue.name)
  const at = f.indexOf(n)
  if (at < 0) return null
  const rest = f.slice(at + n.length).replace(/^\*\*/, '')
  const stop = rest.search(/\n\s*\n|\*\*/)
  return rest.slice(0, stop > 0 ? stop : Math.min(rest.length, 600))
}

/**
 * The numbers the PREVIOUS reply stated about each venue — rating, review count,
 * distance — as the user read them. On a follow-up that runs no tool this is the
 * only evidence the turn has; the place-claim guard otherwise reads an empty row
 * set and cuts the very numbers the user is asking about (measured 2026-09-18,
 * F6: 4 of 11 sentences removed, the reply reduced to a fragment). REVIEW-level,
 * only for venues the prior reply named.
 */
export function carriedFacts(priorText: string, venues: readonly PriorVenue[]): CarriedFacts[] {
  const out: CarriedFacts[] = []
  for (const v of venues) {
    const seg = venueSegment(priorText, v)
    if (seg === null) continue
    const rating = seg.match(/\b([1-5](?:[.,]\d)?)\s*(?:⭐|sao\b|stars?\b|\/5)/)
    const count = seg.match(/\b(\d{1,3}(?:[.,]\d{3})*|\d+)\s*(?:danh gia|reviews?|luot danh gia|ratings?)\b/)
    const dist = seg.match(/\b(\d+(?:[.,]\d+)?)\s*km\b/)
    const num = (m: RegExpMatchArray | null, thousands: boolean) => {
      if (!m) return null
      const raw = thousands ? m[1].replace(/[.,]/g, '') : m[1].replace(',', '.')
      const n = Number(raw)
      return Number.isFinite(n) ? n : null
    }
    out.push({ name: v.name, rating: num(rating, false), reviewCount: num(count, true), distanceKm: num(dist, false) })
  }
  return out
}

/** The prompt line that tells the model exactly which venues the user means. */
export function renderReferencedBlock(venues: readonly PriorVenue[], refetched: { name: string; found: boolean }[]): string {
  if (venues.length === 0) return ''
  const lines = [`REFERENCED (user đang nói về): ${venues.map(v => `#${v.index} ${v.name}`).join('; ')}`]
  for (const r of refetched) {
    lines.push(r.found
      ? `- Hệ thống ĐÃ tìm lại "${r.name}" theo tên: dùng đúng số liệu trong kết quả tool bên dưới.`
      : `- Hệ thống đã tìm lại "${r.name}" theo tên nhưng KHÔNG có kết quả: nói rõ "mình không tìm thấy", KHÔNG nói "mình đã kiểm tra thấy…".`)
  }
  return `\n\n===== THAM CHIEU (V1) =====\n${lines.join('\n')}\nChỉ trả lời về đúng các quán này; không tự tìm quán mới trừ khi user yêu cầu.\n=====================================`
}
