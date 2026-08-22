/**
 * Facts read OUT of a shopping listing — never inferred into one.
 *
 * WHY THIS EXISTS. Serper's shopping endpoint returns title, seller, price,
 * link, image and sometimes a rating. It returns no structured RAM, storage or
 * condition: those appear only inside the listing title, e.g.
 *
 *   "Macbook Pro 14 inch M1 Pro 32GB / 512GB 【USED】"   29.900.000 ₫   Mac24h
 *
 * So a spec is evidence only when the seller wrote it. Everything here reads
 * the title and records `spec_source` — the exact text the values came from —
 * so a later claim can be traced to it. A title that says only "MacBook Pro M1
 * Pro" yields NOTHING: RAM stays unknown rather than being filled in from
 * Apple's known configurations. The absent field is the honest answer, and the
 * three-valued check in candidateRanking already handles UNKNOWN separately
 * from SATISFIED.
 */

/** "11.990.000 ₫" / "29,900,000₫" / "₫11.990.000" -> 11990000. */
export function parseVndPrice(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw !== 'string') return null
  const digits = raw.replace(/[^\d]/g, '')
  if (!digits) return null
  const n = parseInt(digits, 10)
  // A Vietnamese product price below 1000 is a formatting accident, not a price.
  return Number.isFinite(n) && n >= 1000 ? n : null
}

/**
 * "32GB / 512GB" and "32GB/256GB" — the pair form sellers use, where the first
 * figure is memory and the second is storage. Split by size rather than
 * position would misread "16GB/16GB"; split by position alone would misread a
 * lone "512GB". Both figures must be present for this to fire.
 */
const PAIR_RE = /\b(\d{1,3})\s*gb?\s*(?:[/|,]\s*|\s+)(\d{3,4})\s*(gb?|tb)\b/i
const RAM_LABELLED_RE = /\b(?:ram|memory)\s*[:\-]?\s*(\d{1,3})\s*gb\b|\b(\d{1,3})\s*gb\s*(?:ram|memory)\b/i
const STORAGE_LABELLED_RE = /\b(?:ssd|storage|o cung|ổ cứng|rom)\s*[:\-]?\s*(\d{3,4})\s*gb\b|\b(\d{3,4})\s*gb\s*(?:ssd|storage|o cung|ổ cứng)\b|\b(\d)\s*tb\b/i

/**
 * Explicit second-hand wording. "Chính hãng" means genuine, NOT new.
 *
 * The Vietnamese words are bounded with an explicit letter class instead of
 * `\b`: JavaScript's word boundary is ASCII-only, so `\bcũ\b` fails on the very
 * listing it was written for — "…/14GPU cũ" — because `ũ` is not an ASCII word
 * character and the trailing boundary never matches. Measured live: a listing
 * ending in "cũ" came back with condition UNKNOWN. A bare /cũ/ is not an option
 * either, since it also matches "cũng".
 */
const VN_LETTER = 'a-zà-ỹ'
const USED_RE = new RegExp(
  `【?\\s*used\\s*】?|(?<![${VN_LETTER}])c[ũu](?![${VN_LETTER}])|second\\s?hand|like\\s?new|likenew|refurb|đã qua sử dụng|hàng\\s*9\\d\\s*%|\\b9\\d\\s*%`,
  'i',
)
/** Only unambiguous new-condition wording; "chính hãng" is deliberately absent. */
const NEW_RE = /\b(brand\s?new|new\s?100%|nguyên\s?seal|chưa\s?active|fullbox\s?new)\b/i

export interface ParsedProductSpecs {
  ram_gb?: number
  storage_gb?: number
  condition?: 'used' | 'new'
  /** The seller's exact wording — "Like New", "cũ", "Hàng 95%". Never a number we derived. */
  condition_label?: string
  /** The exact text every value above was read from. Provenance, not decoration. */
  spec_source?: string
}

/**
 * Read whatever the seller actually stated in `title`.
 *
 * Returns only the fields present in the text. `spec_source` appears whenever
 * at least one field was found, so no value can exist without the string that
 * produced it.
 */
export function parseProductSpecs(title: unknown): ParsedProductSpecs {
  if (typeof title !== 'string' || !title.trim()) return {}
  const out: ParsedProductSpecs = {}

  const pair = PAIR_RE.exec(title)
  if (pair) {
    const ram = parseInt(pair[1], 10)
    const store = pair[3].toLowerCase() === 'tb' ? parseInt(pair[2], 10) * 1024 : parseInt(pair[2], 10)
    if (ram >= 4 && ram <= 256) out.ram_gb = ram
    if (store >= 128) out.storage_gb = store
  }

  if (out.ram_gb === undefined) {
    const m = RAM_LABELLED_RE.exec(title)
    const gb = m ? parseInt(m[1] ?? m[2], 10) : NaN
    if (Number.isFinite(gb) && gb >= 4 && gb <= 256) out.ram_gb = gb
  }

  if (out.storage_gb === undefined) {
    const m = STORAGE_LABELLED_RE.exec(title)
    if (m) {
      const gb = m[3] ? parseInt(m[3], 10) * 1024 : parseInt(m[1] ?? m[2], 10)
      if (Number.isFinite(gb) && gb >= 128) out.storage_gb = gb
    }
  }

  // The seller's own wording is kept alongside the normalised value. "Like New"
  // is a label, not a number: a reply may repeat "Like New", but turning it
  // into "98%" invents a measurement nobody published. Measured: a reply
  // compared "hàng 95% vs 98%" with neither figure in any candidate. A
  // percentage may only be quoted when the seller wrote one, in which case it
  // is already inside this label.
  const used = USED_RE.exec(title)
  const isNew = used ? null : NEW_RE.exec(title)
  if (used) {
    out.condition = 'used'
    out.condition_label = used[0].trim()
  } else if (isNew) {
    out.condition = 'new'
    out.condition_label = isNew[0].trim()
  }

  if (Object.keys(out).length > 0) out.spec_source = title.trim()
  return out
}
