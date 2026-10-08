// ── Phase 8 WS2 final — do two TEXT claims contradict each other? (deterministic, like with like) ─────────────────────────────────
//
// The M3 ledger compared non-price claims by their first number, or — with no number — called any two sentences that did not contain
// each other a CONFLICT (a false-positive generator: two different wordings of the same fact disagreed). Real contradictions in text
// are specific, so they are detected by KIND, after normalising equivalent forms:
//
//   hours / schedules   clock times parsed ("22h", "22:00", "10 giờ tối", "10:00–22:00"): opening (earliest) or closing / departure
//                       (latest) differing by ≥ 30 min → conflict ("open until 22:00" vs "until 23:00");
//   availability        polarity (in stock ↔ out of stock, open ↔ closed, rooms left ↔ fully booked) → opposite = conflict;
//   policy / warranty   durations normalised to days ("1 năm" = "12 tháng"), or the same policy term with opposite negation
//                       ("có hoàn tiền" vs "không hoàn tiền") → conflict;
//   specs / health / finance / other numbers   the same unit class and the first figures > 10 % apart (the M3 numeric rule).
//
// Never a conflict: a HEDGED claim ("usually", "around", "may", "thường", "khoảng", "có thể", "hình như"), a subjective claim (kind
// `experience`: taste, crowd, vibe), or two texts with nothing comparable. Code only flags; Luna decides what to do with a conflict
// (research again, explain, present both, or say it is unknown).

import { valuesDisagree } from './evidence'
import type { ClaimKind } from './sourceType'

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()

// Vietnamese hedges are matched WITH their diacritics (folded, "máy" would read as English "may" and "thương hiệu" as "thường");
// English ones on the lower-cased text.
const HEDGE_VI = /(?<!\p{L})(thường|khoảng|tầm|có thể|có lẽ|hình như|dự kiến|ước tính|chừng)(?!\p{L})/u
const HEDGE_EN = /\b(usually|typically|around|about|approximately|roughly|may|might|probably|often|likely|expected)\b/

/** Is the claim hedged (an approximation / possibility, not a firm statement)? */
export function hedged(text: string): boolean { const t = text.normalize('NFC').toLowerCase(); return HEDGE_VI.test(t) || HEDGE_EN.test(t) }

/** Clock times in a text, as minutes after midnight ("22h", "22:30", "10 giờ tối", "9pm"). */
export function clockTimes(text: string): number[] {
  const f = fold(text)
  const out: number[] = []
  for (const m of f.matchAll(/(?<![\d.,])(\d{1,2})\s*(?::|gio|h|g)\s*([0-5]\d)?(?!\d)\s*(sang|trua|chieu|toi|dem|am|pm)?/g)) {
    let h = Number(m[1]); const mm = Number(m[2] ?? 0)
    if (h > 24) continue
    const part = m[3]
    if ((part === 'chieu' || part === 'toi' || part === 'pm') && h < 12) h += 12
    if (part === 'dem' && h >= 6 && h < 12) h += 12
    out.push(h * 60 + mm)
  }
  return out
}

type Polarity = 'positive' | 'negative' | null
/** Availability polarity: in stock / open / rooms left (+) vs out of stock / closed / fully booked (−). */
export function availabilityPolarity(text: string): Polarity {
  const f = fold(text)
  if (/(het hang|tam het|ngung kinh doanh|out of stock|outofstock|sold out|het phong|het cho|kin cho|fully booked|da dong cua|dang dong cua|dong cua vinh vien|closed|permanently closed|ngung hoat dong)/.test(f)) return 'negative'
  if (/(con hang|instock|in stock|co san|con phong|con cho|available|dang mo cua|dang mo|open now|mo cua hom nay)/.test(f)) return 'positive'
  return null
}

/** Durations normalised to days ("1 năm" = 365, "12 tháng" = 360 → compared within 10 %). */
export function durationsDays(text: string): number[] {
  const f = fold(text)
  const out: number[] = []
  for (const m of f.matchAll(/(\d{1,3})\s*(nam|years?|thang|months?|tuan|weeks?|ngay|days?)(?![a-z])/g)) {
    const n = Number(m[1]); const u = m[2]
    out.push(/^(nam|year)/.test(u) ? n * 365 : /^(thang|month)/.test(u) ? n * 30 : /^(tuan|week)/.test(u) ? n * 7 : n)
  }
  return out
}

const POLICY_TERMS = ['hoan tien', 'doi tra', 'huy mien phi', 'mien phi huy', 'refund', 'free cancellation', 'bao hanh', 'warranty', 'tra gop', 'installment', 'giao hang mien phi', 'free shipping', 'an sang', 'breakfast']
const NEG = /(khong|chua|no|not|without|ko)\s+(?:\S+\s+){0,2}$/

/** For each policy term present: is it negated ("không hoàn tiền") or affirmed ("có hoàn tiền")? */
function policyStances(text: string): Map<string, boolean> {
  const f = fold(text)
  const out = new Map<string, boolean>()
  for (const t of POLICY_TERMS) {
    const i = f.indexOf(t)
    if (i < 0) continue
    out.set(t, !NEG.test(f.slice(Math.max(0, i - 24), i)))
  }
  return out
}

export interface TextClaim { value: string; quote?: string }
const textOf = (c: TextClaim) => [c.quote, c.value].filter(Boolean).join(' ')

/** Do two claims of the same kind materially contradict each other? */
export function claimsDisagree(kind: ClaimKind, a: TextClaim, b: TextClaim): boolean {
  const ta = textOf(a), tb = textOf(b)
  if (!ta.trim() || !tb.trim()) return false
  if (kind === 'experience') return false
  if (hedged(ta) || hedged(tb)) return false
  // Availability first: the polarity is the claim.
  const pa = availabilityPolarity(ta), pb = availabilityPolarity(tb)
  if ((kind === 'availability' || (pa && pb)) && pa && pb) return pa !== pb
  if (kind === 'hours' || (clockTimes(ta).length && clockTimes(tb).length && kind !== 'spec')) {
    const xa = clockTimes(ta), xb = clockTimes(tb)
    if (xa.length && xb.length) {
      const open = Math.abs(Math.min(...xa) - Math.min(...xb)) >= 30 && xa.length > 1 && xb.length > 1
      const close = Math.abs(Math.max(...xa) - Math.max(...xb)) >= 30
      return open || close
    }
    if (kind === 'hours') return false
  }
  if (kind === 'policy' || kind === 'other' || kind === 'spec') {
    const da = durationsDays(ta), db = durationsDays(tb)
    if (da.length && db.length && /bao hanh|warranty|doi tra|hoan tien|refund|return/.test(fold(ta + ' ' + tb))) return Math.abs(da[0] - db[0]) > Math.max(1, 0.1 * Math.max(da[0], db[0]))
    const sa = policyStances(ta), sb = policyStances(tb)
    for (const [t, v] of sa) if (sb.has(t) && sb.get(t) !== v) return true
  }
  // Numbers: same unit class, first figures > 10 % apart (never text against text).
  if (/\d/.test(a.value) && /\d/.test(b.value)) return valuesDisagree(a.value, b.value)
  return false
}
