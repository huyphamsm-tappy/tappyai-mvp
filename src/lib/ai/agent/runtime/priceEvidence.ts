// ── Phase 8 WS2 — the price evidence contract: what a researched price IS, deterministically (TAPPY_AGENT=2, web) ──────────────
//
// Realtime price research uses the public web (web_search → read_page), no merchant API. A price found on a page becomes ONE evidence
// item (evidence.ts) that also carries this record, so Luna — and the trace — know exactly what kind of number it is:
//
//   entity / variant      what the price is for; the variant is NORMALISED from the page's own words (chip, memory / storage sizes,
//                         screen size, generation), so "16GB" and "24GB" are never one price;
//   amount / amount_max   the figure(s), with the currency;
//   price_type            REGULAR · SALE · STARTING_FROM · RANGE · USED · NEW · BUNDLE · UNKNOWN — "từ 20 triệu" is STARTING_FROM, never
//                         "20 triệu"; "tối đa / up to 20 triệu" is RANGE with only a maximum, never "20 triệu";
//   source_url / title / source_type / reliability   where it was read and what kind of source that is (metadata, never a score);
//   retrieved_at / published_at / age_days            WHEN: the read time always, the page's own date when it declares one;
//   evidence_status / confidence                      the ledger's FACT / INFERENCE / UNKNOWN / CONFLICT and its confidence.
//
// Code owns only this bookkeeping: parsing, normalising and comparing like with like (two prices of DIFFERENT variants, conditions or
// price types are not a conflict; a figure inside a stated range is not a conflict; a figure below a "from" price is). Which price to
// trust, whether to search again, how to present a range or a discrepancy — Luna decides. Pure, no I/O.

import { extractMoneyClaims } from '@/lib/ai/moneyGuard'
import type { EvidenceType } from './evidence'
import type { Reliability, SourceClass } from './sourceType'

export type PriceType = 'REGULAR' | 'SALE' | 'STARTING_FROM' | 'RANGE' | 'USED' | 'NEW' | 'BUNDLE' | 'UNKNOWN'

export interface PriceEvidence {
  entity: string
  variant: string | null
  amount: number | null
  amount_max: number | null
  currency: string | null
  price_type: PriceType
  condition: 'new' | 'used' | null
  source_url: string
  source_title: string
  source_type: SourceClass
  reliability: Reliability
  retrieved_at: string
  published_at: string | null
  /** Days between the page's own date and the read (null = the page declares no date). */
  age_days: number | null
  evidence_status: EvidenceType
  confidence: Reliability
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()

/** The parsed figure(s) and type of one price statement (a sentence, or a structured offer's "price currency"). Pure. */
export function parsePriceStatement(text: string): Pick<PriceEvidence, 'amount' | 'amount_max' | 'currency' | 'price_type' | 'condition'> {
  const f = fold(text)
  const claims = extractMoneyClaims(text)
  // "cũ" is matched on the original text: folded, it would also match "cụ thể".
  const used = /(?<![\p{L}])cũ(?![\p{L}])/iu.test(text) || /(?:^|[^a-z0-9])(da qua su dung|qua su dung|like new|used|second[- ]?hand|refurbished|tan trang|(?:9[0-9]) ?%)(?![a-z0-9])/.test(f)
  const fresh = /(?:^|[^a-z0-9])(moi 100 ?%|hang moi|may moi|nguyen seal|brand new|fullbox|new seal|new)(?![a-z0-9])/.test(f)
  const condition: PriceEvidence['condition'] = used ? 'used' : fresh ? 'new' : null
  const structured = claims.length === 0 ? /^\s*(\d+(?:[.,]\d+)?)\s*([A-Z]{3})?\s*$/.exec(text) : null
  if (!claims.length && !structured) return { amount: null, amount_max: null, currency: null, price_type: 'UNKNOWN', condition }
  const c = claims[0]
  const lo = c ? c.lo : Number(structured![1].replace(',', '.'))
  const hi = c ? c.hi : lo
  const currency = c ? c.currency : (structured![2] ?? null)
  // The qualifier just before the figure decides its type: "từ / chỉ từ / giá từ / from / starting at" → a floor; "tối đa / đến / up to /
  // dưới" (with no lower figure) → a ceiling.
  const lead = c ? fold(text.slice(Math.max(0, c.start - 28), c.start)) : ''
  if (/\b(combo|tron bo|bundle|kem (?:qua|phu kien)|tang kem|tron goi)\b/.test(f)) return { amount: lo, amount_max: hi !== lo ? hi : null, currency, price_type: 'BUNDLE', condition }
  if (/(?:^|\s)(chi tu|gia tu|tu|from|starting(?: at| from)?|khoi diem)\s*$/.test(lead)) return { amount: lo, amount_max: null, currency, price_type: 'STARTING_FROM', condition }
  if (/(?:^|\s)(toi da|den|up to|duoi|khong qua|max(?:imum)?)\s*$/.test(lead) && lo === hi) return { amount: null, amount_max: hi, currency, price_type: 'RANGE', condition }
  if (hi !== lo) return { amount: lo, amount_max: hi, currency, price_type: 'RANGE', condition }
  if (/\b(giam con|khuyen mai|uu dai|sale|flash sale|giam gia|chi con|gia soc|discount)\b/.test(f)) return { amount: lo, amount_max: null, currency, price_type: 'SALE', condition }
  if (condition === 'used') return { amount: lo, amount_max: null, currency, price_type: 'USED', condition }
  if (condition === 'new') return { amount: lo, amount_max: null, currency, price_type: 'NEW', condition }
  return { amount: lo, amount_max: null, currency, price_type: 'REGULAR', condition }
}

/**
 * The normalised variant a text names: chip (M4, M4 Pro, A18), memory / storage sizes, screen size, generation — sorted, joined by "|".
 * null when the text names none. "MacBook Pro M4 16GB 512GB" → "512gb|16gb|m4"; the order of words never matters.
 */
export function normaliseVariant(text: string): string | null {
  const f = fold(text).replace(/(\d)\s+(gb|tb)\b/g, '$1$2')
  const out = new Set<string>()
  for (const m of f.matchAll(/\b(m[1-9](?:\s?(?:pro|max|ultra))?|a1[0-9](?:\s?(?:pro|bionic))?|snapdragon\s?\d+(?:\s?gen\s?\d)?)\b/g)) out.add(m[1].replace(/\s+/g, ' '))
  for (const m of f.matchAll(/\b(\d{1,4})(gb|tb)\b/g)) out.add(`${m[1]}${m[2]}`)
  for (const m of f.matchAll(/\b(\d{1,2}(?:[.,]\d)?)\s?(?:inch|in\b|")/g)) out.add(`${m[1].replace(',', '.')}in`)
  for (const m of f.matchAll(/\b(?:gen|the he|thế hệ)\s?(\d)\b|\b(\d)(?:st|nd|rd|th) gen(?:eration)?\b/g)) out.add(`gen${m[1] ?? m[2]}`)
  return out.size ? [...out].sort().join('|') : null
}

/** Days between a page's own date and the read time; null when the page declares no (parseable) date. */
export function ageDays(publishedAt: string | null, retrievedAt: string): number | null {
  if (!publishedAt) return null
  const p = Date.parse(publishedAt), r = Date.parse(retrievedAt)
  if (!Number.isFinite(p) || !Number.isFinite(r)) return null
  return Math.max(0, Math.floor((r - p) / 86_400_000))
}

const POINT: ReadonlySet<PriceType> = new Set(['REGULAR', 'SALE', 'USED', 'NEW'])
const apart = (x: number, y: number) => Math.abs(x - y) > Math.max(1, 0.1 * Math.max(Math.abs(x), Math.abs(y)))

/**
 * Do two researched prices DISAGREE about the same thing? Like with like only:
 *   · different known variants, different conditions, a bundle vs a single item, a sale vs a list price → not a conflict (different
 *     things; both kept for Luna);
 *   · two point prices of the same type more than 10 % apart → conflict;
 *   · a point inside the other's range / at or above its "from" floor / at or below its "up to" ceiling → not a conflict; outside → conflict.
 */
export function pricesDisagree(a: PriceEvidence, b: PriceEvidence): boolean {
  if (a.currency && b.currency && a.currency !== b.currency) return false
  if (a.variant && b.variant && a.variant !== b.variant) return false
  if (a.condition && b.condition && a.condition !== b.condition) return false
  if ((a.price_type === 'BUNDLE') !== (b.price_type === 'BUNDLE')) return false
  if (a.price_type === 'UNKNOWN' || b.price_type === 'UNKNOWN') return false
  if (POINT.has(a.price_type) && POINT.has(b.price_type)) {
    if (a.price_type !== b.price_type && (a.price_type === 'SALE' || b.price_type === 'SALE')) return false
    return a.amount !== null && b.amount !== null && apart(a.amount, b.amount)
  }
  const span = (p: PriceEvidence): [number, number] => [p.amount ?? 0, p.price_type === 'STARTING_FROM' ? Infinity : (p.amount_max ?? p.amount ?? Infinity)]
  const [alo, ahi] = span(a), [blo, bhi] = span(b)
  // Two spans disagree only when they cannot both be true (no overlap at all, beyond rounding).
  return ahi < blo * 0.95 || bhi < alo * 0.95
}

/** The compact form Luna reads (no URL: the link is the source's, cited as [S#]). */
export function priceView(p: PriceEvidence): Record<string, unknown> {
  return {
    ...(p.variant ? { variant: p.variant } : {}),
    ...(p.amount !== null ? { amount: p.amount } : {}),
    ...(p.amount_max !== null ? { amount_max: p.amount_max } : {}),
    ...(p.currency ? { currency: p.currency } : {}),
    price_type: p.price_type,
    ...(p.condition ? { condition: p.condition } : {}),
    retrieved_at: p.retrieved_at,
    ...(p.age_days !== null ? { page_age_days: p.age_days } : {}),
  }
}
