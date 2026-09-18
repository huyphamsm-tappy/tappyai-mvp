// ── CONSULTATIVE V1 — the shape of the consultation ─────────────────────────
//
// Target: pick + why · one alternative + trade-off · one heads-up · at most one
// question — 3–5 sentences, six at the very most, and NO re-listing of what the
// card already shows. Nothing measured that shape before; this does, at the
// last point before the bytes leave, on prose only (machine blocks untouched).
//
// The rules, in order:
//   1. A sentence whose only content is a card value for a card venue (rating +
//      count, address, hours, phone) is a LISTING and is dropped when the
//      surface renders cards. A reason that USES a value ("4.7⭐ từ 961 đánh giá
//      là bằng chứng đủ mạnh") is kept — value ALONE is a listing.
//   2. At most one "alternative" sentence (ngoài ra / nếu muốn / otherwise).
//   3. Hard cap of `maxSentences` (6): the least informative sentences go first
//      — no venue, no number, no situation word — and the pick sentence (first
//      prose sentence naming a venue) is never cut.
//
// Questions are already capped at one by `clarificationGuard`, which runs just
// before this. See consultative-v1-design.md §6.

import { normalizeVN } from '../intent'
import { sentenceSpans, protectedSpans } from '../moneyGuard'

export interface CardVenue {
  name: string
  rating?: number | null
  reviewCount?: number | null
  address?: string | null
  hours?: string | null
  phone?: string | null
}

export interface ProseShapeOptions {
  /** True when the client renders the decision card — listings are then duplicates. */
  rendersCard: boolean
  venues: readonly CardVenue[]
  maxSentences?: number
}

export interface ProseShapeStats {
  sentences_in: number
  sentences_out: number
  listing_removed: number
  alternatives_removed: number
  capped: number
  /** Rule 4: "bạn muốn ăn gì / loại nào?" asked although the reply already picked. */
  subject_questions_removed?: number
}

const fold = (s: string) => normalizeVN(s.toLowerCase()).replace(/\s+/g, ' ').trim()

const ALT_RE = /\b(ngoai ra|neu (?:ban )?(?:muon|thich|can)|phuong an (?:2|hai|khac|thay the)|lua chon (?:2|hai|khac|thay the)|thay vao do|alternatively|otherwise|if you(?:'d)? (?:prefer|want|rather)|another option|as an alternative|hoac neu)\b/
const REASON_RE = /\b(vi|boi vi|nen|la bang chung|du manh|dang tin|chung to|cho thay|because|since|which means|so it|that's why|hop|phu hop|dung y|thich hop)\b/
/**
 * A question about the SUBJECT the reply has already chosen for ("bạn muốn ăn gì?", "thích loại
 * nào?", "hay loại nào khác?"). Measured 2026-09-18 with a large legacy memory (F8, T4): the model
 * picked a venue with evidence AND asked "bạn muốn ăn gì? (sushi, bò né, hải sản…)" — the list
 * being the remembered preferences. V1 rules 4/5: at most one question, never this one once a
 * pick exists. Folded text.
 */
const SUBJECT_Q_RE = /\b(?:muon|thich|can|dinh|uu tien) (?:an|mua|choi|di|xem|dung|thu|lam|tim) (?:gi|loai|kieu|mon|hoat dong|the loai)\b|\b(?:loai|kieu|mon|hoat dong|the loai) (?:nao|gi)\b|\bhay (?:loai|thu|cai|mon|hoat dong) (?:nao |gi )?khac\b|\bthich (?:hoat dong|loai|mon|kieu) (?:nao|gi)\b|\bwhat (?:kind|type) of\b|\bwhich (?:kind|type|cuisine)\b/
const SITUATION_RE = /\b(toi nay|trua|sang|khuya|cuoi tuan|2 nguoi|hai nguoi|gia dinh|hen ho|date|sinh nhat|tiep khach|nhom|ban be|yen tinh|soi dong|view|lang man|sang trong|re|ngan sach|budget|tonight|family|couple|group|quiet|lively|romantic|cheap)\b/

function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

/**
 * True when the sentence is a card value and nothing else: the venue name, a
 * rating/count, an address, hours or a phone — with only glue words around it.
 */
function isListing(sentence: string, venues: readonly CardVenue[]): boolean {
  const f = fold(sentence)
  // A labelled card field with a value and no reason — "Địa chỉ: 290/28 Nam Kỳ Khởi Nghĩa,
  // Quận 3." — is a listing however the provider formatted the value (measured F3: the model
  // shortened the row's address, so value matching alone missed it).
  if (/^\s*(?:dia chi|address|gio mo(?: cua)?|mo cua|hours|opening hours|sdt|so dien thoai|dien thoai|phone|hotline)\s*[:：]/.test(f) && /\d/.test(f) && !REASON_RE.test(f)) return true
  // The venue is identified by its name OR by one of its own card values — a
  // bare "Địa chỉ: 585 Huỳnh Tấn Phát" line names nobody and is still a listing.
  const v = venues.find(x => x.name && f.includes(fold(x.name)))
    ?? venues.find(x => (x.address && f.includes(fold(x.address))) || (x.hours && f.includes(fold(x.hours)))
      || (x.phone && f.replace(/\s+/g, '').includes(fold(x.phone).replace(/\s+/g, '')))
      || (x.rating != null && x.reviewCount != null && f.includes(String(x.rating)) && f.includes(String(x.reviewCount))))
  if (!v) return false
  if (REASON_RE.test(f)) return false
  // Strip the name, the values, glue and punctuation; what remains decides.
  let rest = f.replace(fold(v.name), ' ')
  if (v.rating != null) rest = rest.replace(new RegExp(`${escapeRe(String(v.rating).replace('.', '[.,]'))}\\s*(?:⭐|sao|stars?|/5|diem)?`, 'g'), ' ')
  if (v.reviewCount != null) rest = rest.replace(new RegExp(`(?:tu|from|voi|with)?\\s*${escapeRe(String(v.reviewCount))}(?:\\.\\d{3})?\\s*(?:danh gia|reviews?|luot|ratings?)?`, 'g'), ' ')
  if (v.address) rest = rest.replace(fold(v.address), ' ')
  if (v.hours) rest = rest.replace(fold(v.hours), ' ')
  if (v.phone) rest = rest.replace(fold(v.phone).replace(/\s+/g, ''), ' ').replace(fold(v.phone), ' ')
  // Generic value shapes the row may format differently.
  rest = rest
    .replace(/\d{1,2}[:h]\d{0,2}\s*[-–]\s*\d{1,2}[:h]\d{0,2}/g, ' ')
    .replace(/(?:\+84|0)\d[\d .]{7,}\d/g, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:⭐|sao|stars?|\/5)\b/g, ' ')
    .replace(/\b\d{2,3}(?:\.\d{3})?\s*(?:danh gia|reviews?)\b/g, ' ')
    .replace(/[*_`#:;,.()\-–—|]+/g, ' ')
  const glue = new Set(['dia chi', 'address', 'gio mo', 'mo cua', 'hours', 'open', 'sdt', 'so dien thoai', 'phone', 'danh gia', 'rating', 'rated', 'o', 'tai', 'at', 'la', 'is', 'co', 'has', 'va', 'and', 'quan', 'nha hang', 'tiem', 'the', 'this', 'place', 'nay', 'mo', 'tu', 'den', 'from', 'to', 'voi', 'with', 'diem', 'points'])
  const words = rest.split(/\s+/).filter(Boolean)
  // Remove multi-word glue first, then single words.
  let joined = ' ' + words.join(' ') + ' '
  for (const g of [...glue].filter(g => g.includes(' '))) joined = joined.split(' ' + g + ' ').join(' ')
  const remaining = joined.split(/\s+/).filter(w => w && !glue.has(w) && !/^\d+$/.test(w))
  return remaining.length <= 1
}

export function guardProseShape(text: string, opts: ProseShapeOptions): { text: string; stats: ProseShapeStats } {
  const maxSentences = opts.maxSentences ?? 6
  const prot = protectedSpans(text)
  const spans = sentenceSpans(text)
  const isMachine = (a: number, b: number) => prot.some(([pa, pb]) => pa === a && pb === b)
  const prose = spans.map(([a, b], i) => ({ i, a, b, s: text.slice(a, b) })).filter(x => !isMachine(x.a, x.b) && x.s.trim())
  const stats: ProseShapeStats = { sentences_in: prose.length, sentences_out: prose.length, listing_removed: 0, alternatives_removed: 0, capped: 0 }
  if (prose.length === 0) return { text, stats }

  const doomed = new Set<number>()
  const foldedNames = opts.venues.map(v => fold(v.name)).filter(n => n.length >= 3)
  const namesVenue = (s: string) => foldedNames.some(n => fold(s).includes(n))
  const pickIdx = prose.find(x => namesVenue(x.s))?.i ?? prose[0].i

  // 1. Listings — and a line that is nothing but a markdown link ("[website của quán](…)"):
  //    the card carries the links, and the layout rule keeps them out of the prose.
  if (opts.rendersCard) {
    for (const x of prose) {
      if (x.i === pickIdx) continue
      const linkOnly = /^\s*\[[^\]]+\]\([^)]+\)[\s.!,;:]*$/.test(x.s)
      if (linkOnly || isListing(x.s, opts.venues)) { doomed.add(x.i); stats.listing_removed++ }
    }
  }
  // 2. One alternative.
  let alts = 0
  for (const x of prose) {
    if (doomed.has(x.i) || x.i === pickIdx) continue
    if (ALT_RE.test(fold(x.s))) { alts++; if (alts > 1) { doomed.add(x.i); stats.alternatives_removed++ } }
  }
  // 4. A subject question after a pick (rule 5) — only when a real pick sentence exists.
  if (namesVenue(prose.find(x => x.i === pickIdx)?.s ?? '')) {
    for (let k = 0; k < prose.length; k++) {
      const x = prose[k]
      if (doomed.has(x.i) || x.i === pickIdx) continue
      if (/\?/.test(x.s) && SUBJECT_Q_RE.test(fold(x.s))) {
        doomed.add(x.i); stats.subject_questions_removed = (stats.subject_questions_removed ?? 0) + 1
        // The lead-in that introduced it ("Để gợi ý chính xác, mình cần biết:") is a promise the
        // reply no longer keeps (measured F8 after the rule: the colon line stayed above the pick).
        const prev = prose[k - 1]
        if (prev && !doomed.has(prev.i) && prev.i !== pickIdx && /(?:can biet|cho minh biet|cho minh hoi)[^:]*:\s*$/.test(fold(prev.s))) doomed.add(prev.i)
      }
    }
  }
  // 3. Cap: drop the least informative first, never the pick.
  const alive = () => prose.filter(x => !doomed.has(x.i))
  const score = (s: string) => {
    const f = fold(s)
    return (namesVenue(s) ? 2 : 0) + (/\d/.test(f) ? 1 : 0) + (SITUATION_RE.test(f) ? 1 : 0) + (/\?/.test(s) ? 1 : 0)
  }
  while (alive().length > maxSentences) {
    const candidates = alive().filter(x => x.i !== pickIdx)
    if (candidates.length === 0) break
    // Lowest score; ties → the later sentence goes (the reply keeps its opening).
    let worst = candidates[0]
    for (const c of candidates) if (score(c.s) <= score(worst.s)) worst = c
    doomed.add(worst.i)
    stats.capped++
  }

  stats.sentences_out = alive().length
  if (doomed.size === 0) return { text, stats }
  const out = spans.filter((_, i) => !doomed.has(i)).map(([a, b]) => text.slice(a, b)).join('')
  return {
    text: out.replace(/[ \t]+\n/g, '\n').replace(/(^|\n)[ \t]+/g, '$1').replace(/\n{3,}/g, '\n\n').trim(),
    stats,
  }
}
