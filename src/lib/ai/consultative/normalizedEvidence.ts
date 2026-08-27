import { normalizeVN } from '../intent'
import { parseProductSpecs, parseVndPrice } from '../productSpecs'

// ── Universal Plan — Phase 2: RAW PROVIDER RESULT → CLEAN EVIDENCE ───────────
//
// A generic, provider-agnostic normaliser. It takes ONE raw provider row and
// returns a typed evidence record in which every field is either a value the
// row actually carried or the explicit UNKNOWN marker — never an inferred one.
//
// This is the layer BENEATH the decision layer, so it depends only on the
// `productSpecs` peer utility, never on `decisionEvidence` (ADR-024) or the
// ranker. It groups NOTHING (that is Phase 3): it normalises one row, records
// what its identity IS versus where/how it is sold, and computes an
// `identityKey` for a later grouping step to use — but does not act on it.
//
// ============================================================================
// THE SEVEN RULES (owner-approved, Phase 2)
// ============================================================================
//  1. Never invent a missing field → UNKNOWN.
//  2. Never infer condition/provenance from seller/domain/price → title only.
//  3. Never infer product identity from seller/domain → title/structured only.
//  4. Preserve the raw row for traceability → `raw`.
//  5. Keep entity identity separate from the seller/offer → `identity` vs `offer`.
//  6. A different configuration stays different → it lands in a different key.
//  7. Unknown identity stays ungroupable → `identityCertain` is false.

/** The marker the rest of the stack already uses for "nobody said". */
export const UNKNOWN = 'KHONG CO DU LIEU'
export type Unknown = typeof UNKNOWN
export type Known<T> = T | Unknown

export interface NormalizedEvidence {
  /** Schema version — a normalised record may outlive the code that wrote it. */
  v: 1
  /** WHAT the thing is. Read from the title and structured fields only. */
  identity: {
    name: string
    model: Known<string>       // "M1", "M1 Pro", "M4", "M5 Pro" — chip, at full precision
    ramGb: Known<number>
    storageGb: Known<number>
    size: Known<string>        // "14 inch"
    condition: Known<string>   // the seller's exact title term: "Chính hãng", "Cũ", "Like new"
  }
  /** WHERE / HOW it is sold. Never a source of identity or condition. */
  offer: {
    url: Known<string>
    seller: Known<string>
    price: Known<number>
    currency: Known<string>
  }
  signals: {
    rating: Known<number>
    reviewCount: Known<number>
  }
  /** The data origin (e.g. "Google Shopping (Serper)"), when the caller states it. */
  providerSource: Known<string>
  /**
   * A deterministic key over the IDENTITY attributes, for a later grouping step.
   * Two rows that state the same identity share a key; a different configuration
   * (M1 vs M1 Pro, 16GB vs 32GB) produces a different key. UNKNOWN fields appear
   * as "?" so silence never masquerades as agreement.
   */
  identityKey: string
  /**
   * True only when enough identity is KNOWN to group safely (a chip plus at
   * least one capacity). When false, the row must stay ungrouped — silence is
   * not identity.
   */
  identityCertain: boolean
  /** The untouched provider row, kept for traceability. */
  raw: Record<string, unknown>
}

const VN_LETTER = 'a-zà-ỹ'

/** The chip a title STATES, at full precision. "m1 pro" is never "m1". */
export function modelFromTitle(title: string): Known<string> {
  const t = normalizeVN(title.toLowerCase())
  // Longest first: "m1 pro max" must beat "m1 pro", which must beat "m1".
  const m = t.match(/\bm(\d)\s*(pro max|max|pro|ultra)\b/) || t.match(/\bm(\d)\b/)
  if (!m) return UNKNOWN
  const suffix = m[2] ? ' ' + m[2].replace(/\b\w/g, c => c.toUpperCase()) : ''
  return `M${m[1]}${suffix}`
}

/** The screen size a title STATES, in inches (13–17). "14,2inch" → "14 inch". */
export function sizeFromTitle(title: string): Known<string> {
  const m = normalizeVN(title.toLowerCase()).match(/\b(1[3-7])(?:[.,]\d)?\s*(?:inch|"|”|inches)\b/)
  return m ? `${m[1]} inch` : UNKNOWN
}

/**
 * The condition / provenance a title STATES, as the seller's own term.
 *
 * Broader than `productSpecs`' used/new split because provenance ("Chính hãng",
 * "Đại lý chính thức") is a title-stated fact a reply may repeat. The VN letter
 * class bounds "cũ" the same way `productSpecs` does — `\b` is ASCII-only and
 * fails on "…/14GPU cũ".
 */
const CONDITION_TERMS: { re: RegExp; label: string }[] = [
  { re: new RegExp(`dai ly chinh thuc`), label: 'Đại lý chính thức' },
  { re: new RegExp(`bao hanh chinh hang`), label: 'Bảo hành chính hãng' },
  { re: new RegExp(`chinh hang`), label: 'Chính hãng' },
  { re: new RegExp(`chinh thuc`), label: 'Chính thức' },
  { re: new RegExp(`likenew|like new|like-new`), label: 'Like new' },
  { re: new RegExp(`refurbished|refurb`), label: 'Refurbished' },
  { re: new RegExp(`sealed|nguyen seal`), label: 'Sealed' },
  { re: new RegExp(`hang\\s*9\\d\\s*%|\\b9\\d\\s*%`), label: '99%' },
  { re: new RegExp(`(?<![${VN_LETTER}])c[uũ](?![${VN_LETTER}])`), label: 'Cũ' },
]

export function conditionFromTitle(title: string): Known<string> {
  const t = normalizeVN(title.toLowerCase())
  for (const c of CONDITION_TERMS) if (c.re.test(t)) return c.label
  return UNKNOWN
}

const num = (v: unknown): Known<number> => (typeof v === 'number' && Number.isFinite(v) ? v : UNKNOWN)
const text = (v: unknown): Known<string> => (typeof v === 'string' && v.trim() ? v.trim() : UNKNOWN)

function identityKeyOf(id: NormalizedEvidence['identity']): string {
  const p = (v: Known<string | number>) => (v === UNKNOWN ? '?' : normalizeVN(String(v).toLowerCase()).replace(/\s+/g, ''))
  return [p(id.model), p(id.ramGb), p(id.storageGb), p(id.condition), p(id.size)].join('|')
}

/**
 * Normalise ONE raw shopping provider row.
 *
 * `raw.ram_gb` / `raw.storage_gb` are the values `productSpecs` already read from
 * the title upstream; when absent, they are re-parsed here so the normaliser is
 * self-contained. Nothing is read from `raw.source` (the seller) except the
 * seller field itself — identity and condition come from the title only.
 */
export function normalizeShoppingRow(
  raw: Record<string, unknown>,
  providerSource?: string,
): NormalizedEvidence {
  const title = text(raw.title) === UNKNOWN ? '' : String(raw.title).trim()
  const specs = parseProductSpecs(title)

  const ramGb = num(raw.ram_gb) !== UNKNOWN ? num(raw.ram_gb)
    : typeof specs.ram_gb === 'number' ? specs.ram_gb : UNKNOWN
  const storageGb = num(raw.storage_gb) !== UNKNOWN ? num(raw.storage_gb)
    : typeof specs.storage_gb === 'number' ? specs.storage_gb : UNKNOWN

  const priceNum = parseVndPrice(raw.price_vnd ?? raw.price)
  const price: Known<number> = priceNum !== null ? priceNum : UNKNOWN

  const identity = {
    name: title,
    model: modelFromTitle(title),
    ramGb,
    storageGb,
    size: sizeFromTitle(title),
    condition: conditionFromTitle(title),
  }

  return {
    v: 1,
    identity,
    offer: {
      url: text(raw.link),
      seller: text(raw.source),
      price,
      currency: price === UNKNOWN ? UNKNOWN : 'VND',
    },
    signals: {
      rating: num(raw.rating),
      reviewCount: num(raw.rating_count) !== UNKNOWN ? num(raw.rating_count) : num(raw.reviewCount),
    },
    providerSource: providerSource ? providerSource : UNKNOWN,
    identityKey: identityKeyOf(identity),
    // Safe to group only when the chip is known AND at least one capacity is —
    // a chip alone (M1 vs M1 Pro) is not enough to say two rows are the same.
    identityCertain: identity.model !== UNKNOWN && (ramGb !== UNKNOWN || storageGb !== UNKNOWN),
    raw,
  }
}
