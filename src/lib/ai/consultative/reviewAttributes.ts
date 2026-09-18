// ── CONSULTATIVE V1 — atmosphere / audience attributes, evidence-only ────────
//
// "yên tĩnh", "view đẹp", "hợp gia đình", "sang trọng", "đông", "phục vụ chậm"
// are the words a consultation turns on, and today nothing extracts them from
// the text the turn already fetched (Serper snippets, review titles, TikTok /
// YouTube titles — `entityTexts`). This does, on that text only: zero new
// calls. Each attribute keeps the snippet that supports it, so the "why" can
// quote evidence instead of adjectives.
//
// Two consumers: the shortlist evidence the model reads (attributes it MAY
// assert), and the atmosphere-claim guard below (a claim about a named venue
// with no supporting attribute is removed). The wish the USER typed is never an
// input here — only fetched text is. See consultative-v1-design.md §4.

import { normalizeVN } from '../intent'
import { sentenceSpans, protectedSpans } from '../moneyGuard'
import type { Hard, Mood } from './situationFrame'

export type VenueAttribute =
  | 'quiet' | 'lively' | 'view' | 'family' | 'date' | 'fancy' | 'cheap' | 'crowded' | 'slow_service'
  | 'late_open' | 'parking' | 'outdoor' | 'vegetarian' | 'kids'

export interface AttributeEvidence {
  attribute: VenueAttribute
  /** The fetched snippet (trimmed) that supports it. */
  snippet: string
}

const fold = (s: string) => normalizeVN(s.toLowerCase()).replace(/\s+/g, ' ').trim()

// Negation within a few words flips the sense: "không yên tĩnh" is not quiet.
// "không gian" (space) is the noun, not a negation: "không gian yên tĩnh" IS quiet.
const NEG = '(?:khong(?! gian)|ko|chang|not|no|never|isn\'t|wasn\'t)\\s+(?:\\w+\\s+){0,2}'

const LEXICON: Array<[VenueAttribute, RegExp]> = [
  ['quiet', /\b(yen tinh|tinh lang|it on|khong on|quiet|peaceful|calm|nhe nhang|thanh binh)\b/],
  ['lively', /\b(soi dong|nhon nhip|nao nhiet|dong vui|lively|vibrant|bustling|energetic|nhac (?:song|lon)|dj)\b/],
  ['view', /\b(view (?:dep|xin|song|bien|thanh pho|cao)|dep view|co view|ngam (?:canh|hoang hon|thanh pho)|rooftop|san thuong|nhin ra|scenic|skyline|nice view|great view|panoramic)\b/],
  ['family', /\b(gia dinh|family[- ]friendly|hop gia dinh|ca nha|for families|family)\b/],
  ['date', /\b(hen ho|lang man|romantic|date night|couple|cap doi|dating|candle)\b/],
  ['fancy', /\b(sang trong|cao cap|fine dining|upscale|luxury|luxurious|elegant|dang cap|5 sao|michelin)\b/],
  ['cheap', /\b(binh dan|gia re|re|hop tui tien|cheap|affordable|budget[- ]friendly|inexpensive|gia tot|gia sinh vien)\b/],
  // "đông" only as crowd, never the "đồng" of a price: "50.000 đồng" folds to "dong" too.
  ['crowded', /\b((?:rat|kha|hoi|qua|thuong|luon|rất) dong|dong (?:khach|nguoi|lam|vao|nghet)|cho lau|xep hang|doi lau|crowded|packed|long (?:wait|queue|line)|busy)\b/],
  ['slow_service', /\b(phuc vu cham|cham (?:qua|lam|kinh)|lau (?:co|ra) mon|slow service|slow|thai do (?:kem|te)|rude|bad service|phuc vu (?:kem|te))\b/],
  ['late_open', /\b(mo khuya|mo muon|mo 24|24h|24\/7|open late|late night|ban khuya|mo den (?:1|2|3)h sang)\b/],
  ['parking', /\b(cho dau xe|bai xe|giu xe|do xe|parking|dau xe (?:thoai mai|rong|de))\b/],
  ['outdoor', /\b(ngoai troi|san vuon|outdoor|open air|patio|terrace|khong gian mo|san thuong|rooftop)\b/],
  ['vegetarian', /\b(chay|vegetarian|vegan|thuan chay|mon chay)\b/],
  ['kids', /\b(tre em|con nit|kids?|children|khu vui choi|kid[- ]friendly|choi cho be|cac be|em be)\b/],
]

function negated(f: string, m: RegExpMatchArray): boolean {
  const before = f.slice(Math.max(0, (m.index ?? 0) - 24), m.index ?? 0)
  return new RegExp(NEG + '$').test(before)
}

/**
 * Attributes per venue from the fetched text about that venue. One evidence
 * snippet per attribute (the first). Names are matched as given — the caller
 * keys by the same name it keys `entityTexts` with.
 */
export function extractAttributes(entityTexts: ReadonlyMap<string, readonly string[]>): Map<string, AttributeEvidence[]> {
  const out = new Map<string, AttributeEvidence[]>()
  for (const [name, texts] of entityTexts) {
    const found: AttributeEvidence[] = []
    const have = new Set<VenueAttribute>()
    for (const t of texts) {
      if (!t) continue
      const f = fold(t)
      for (const [attr, re] of LEXICON) {
        if (have.has(attr)) continue
        const m = f.match(re)
        if (!m || negated(f, m)) continue
        have.add(attr)
        found.push({ attribute: attr, snippet: t.trim().slice(0, 140) })
      }
    }
    if (found.length > 0) out.set(name, found)
  }
  return out
}

/** Which situation words a venue attribute answers. */
const HARD_TO_ATTR: Partial<Record<Hard, VenueAttribute>> = {
  quiet: 'quiet', parking: 'parking', kids: 'kids', vegetarian: 'vegetarian', outdoor: 'outdoor', late_open: 'late_open', view: 'view',
}
const MOOD_TO_ATTR: Record<Mood, VenueAttribute> = {
  chill: 'quiet', lively: 'lively', romantic: 'date', fancy: 'fancy', cheap_good: 'cheap',
}

/**
 * Hard constraints the user stated for which NO candidate carries supporting
 * evidence — reported as an evidence gap, never silently dropped.
 */
export function hardConstraintGaps(hard: readonly Hard[], attrs: ReadonlyMap<string, AttributeEvidence[]>): Hard[] {
  const gaps: Hard[] = []
  for (const h of hard) {
    const want = HARD_TO_ATTR[h]
    if (!want) continue
    let supported = false
    for (const list of attrs.values()) if (list.some(a => a.attribute === want)) { supported = true; break }
    if (!supported) gaps.push(h)
  }
  return gaps
}

/** The attribute that answers the situation's mood, if any. */
export function moodAttribute(mood: Mood | null): VenueAttribute | null {
  return mood ? MOOD_TO_ATTR[mood] : null
}

const ATTR_VI: Record<VenueAttribute, string> = {
  quiet: 'yên tĩnh', lively: 'sôi động', view: 'có view', family: 'hợp gia đình', date: 'hợp hẹn hò', fancy: 'sang trọng',
  cheap: 'giá mềm', crowded: 'thường đông', slow_service: 'phục vụ chậm', late_open: 'mở khuya', parking: 'có chỗ đậu xe',
  outdoor: 'ngoài trời', vegetarian: 'có món chay', kids: 'hợp trẻ em',
}

/** One line per venue for the shortlist evidence: `yên tĩnh ("…snippet…"); có view ("…")`. */
export function attributeSummary(list: readonly AttributeEvidence[]): string[] {
  return list.map(a => `${ATTR_VI[a.attribute]} ("${a.snippet.slice(0, 80)}")`)
}

// ── The atmosphere-claim guard ──────────────────────────────────────────────
//
// A sentence that names a venue AND asserts an atmosphere / audience attribute
// the venue's evidence does not carry is removed — unless it is the first prose
// sentence (the pick sentence; the decision-first rule owns it, and cutting it
// would leave a reply with no decision). That case is counted, not cut.

const CLAIM_WORDS: Array<[VenueAttribute, RegExp]> = LEXICON.filter(([a]) =>
  a === 'quiet' || a === 'lively' || a === 'view' || a === 'family' || a === 'date' || a === 'fancy' || a === 'kids' || a === 'outdoor' || a === 'late_open' || a === 'parking')

export interface AtmosphereGuardResult {
  text: string
  removed: number
  /** Unsupported claims found in the pick sentence and left in place. */
  unsupportedInPick: number
}

export function guardAtmosphereClaims(
  text: string,
  ctx: { attrs: ReadonlyMap<string, AttributeEvidence[]>; names: readonly string[] },
): AtmosphereGuardResult {
  if (!text || ctx.names.length === 0) return { text, removed: 0, unsupportedInPick: 0 }
  const prot = protectedSpans(text)
  const spans = sentenceSpans(text)
  const isMachine = (a: number, b: number) => prot.some(([pa, pb]) => pa === a && pb === b)
  const foldedNames = ctx.names.map(n => [n, fold(n)] as const).filter(([, f]) => f.length >= 3)
  const doomed = new Set<number>()
  let unsupportedInPick = 0
  let firstProse = -1
  /** The venue the previous prose sentence named — "Quán có sân vườn yên tĩnh" is about it. */
  let lastNamed: ReadonlyArray<readonly [string, string]> = []
  spans.forEach(([a, b], i) => {
    if (isMachine(a, b)) return
    const s = text.slice(a, b)
    if (!s.trim()) return
    if (firstProse < 0) firstProse = i
    const f = fold(s)
    let named = foldedNames.filter(([, fn]) => f.includes(fn))
    // Anaphora: a nameless sentence that opens with "quán / chỗ / nhà hàng (này|đó) / nó / it /
    // the place" continues the previous sentence's venue (measured F8: "Quán có phòng riêng, …
    // sân vườn yên tĩnh" right after the named pick).
    if (named.length === 0 && lastNamed.length > 0 && /^\s*(?:quan|cho|nha hang|tiem|khach san|spa|no|day|it|this place|the place|they)\b(?:\s+(?:nay|do|kia|ay))?\b/.test(f)) {
      named = [...lastNamed]
    }
    if (named.length > 0) lastNamed = named
    if (named.length === 0) return
    // A wish attributed to the user is not a venue claim: "bạn muốn yên tĩnh".
    if (/\b(ban (?:muon|can|thich|noi)|you (?:want|asked|said|need))\b/.test(f)) return
    for (const [attr, re] of CLAIM_WORDS) {
      const m = f.match(re)
      if (!m || negated(f, m)) continue
      const supported = named.some(([n]) => (ctx.attrs.get(n) ?? []).some(e => e.attribute === attr))
      if (supported) continue
      if (i === firstProse) { unsupportedInPick++; continue }
      doomed.add(i)
      break
    }
  })
  if (doomed.size === 0) return { text, removed: 0, unsupportedInPick }
  const out = spans.filter((_, i) => !doomed.has(i)).map(([a, b]) => text.slice(a, b)).join('')
  return {
    text: out.replace(/[ \t]+\n/g, '\n').replace(/(^|\n)[ \t]+/g, '$1').replace(/\n{3,}/g, '\n\n').trim(),
    removed: doomed.size,
    unsupportedInPick,
  }
}
