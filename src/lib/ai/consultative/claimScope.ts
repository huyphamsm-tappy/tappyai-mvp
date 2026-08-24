import { normalizeVN } from '../intent'

// ── Claim-scope detectors ────────────────────────────────────────────────────
//
// Two narrow checks, and deliberately only two. They exist so the rules added to
// the shopping rulebook can be tested against REPLY TEXT — including the verbatim
// sentence production actually produced — rather than by asserting that a string
// appears in a prompt. A test that greps the prompt proves the rule was written;
// these prove the failure it targets is recognisable.
//
// 🚨 NOT a language-analysis framework and must not grow into one. Each function
// answers exactly one question that a shipped rule forbids. Anything broader
// belongs nowhere, or in `replyAnalysis`, which already exists.
//
// Everything is matched against `normalizeVN()` output — lowercase, diacritics
// stripped — the convention the rest of the consultative layer uses, so an
// accented reply and an unaccented one behave identically.

/** Sentence-ish split. Bullets and newlines end a claim as surely as a full stop. */
function sentences(text: string): string[] {
  return text.split(/[.!?\n•]+/).map(s => s.trim()).filter(Boolean)
}

/** A superlative about price or quality. */
const SUPERLATIVE = /\b(re nhat|thap nhat|gia tot nhat|tot nhat|re hon ca|cheapest|lowest price|best price)\b/

/**
 * A claim about the WHOLE market rather than the retrieved rows.
 *
 * "hien nay" ("right now") counts: with no other qualifier it asserts a
 * present-tense market fact, which is exactly what "rẻ nhất hiện nay" claimed.
 */
const MARKET = /\b(tren thi truong|thi truong|tren toan quoc|hien nay|khong dau (re|tot) hon|on the market|in the market|anywhere|nationwide)\b/

/**
 * The claim is limited to what was retrieved.
 *
 * Requires an explicit container — the options, the list, the results, the
 * listings found — because that is the only thing the evidence covers.
 */
const SCOPED = /\b(trong (cac |nhung |so |danh sach|ket qua|tin dang|lua chon)|trong \d+ ket qua|minh tim duoc|toi tim duoc|tim duoc o tren|danh sach hien co|hien co|tren day|o tren|among (the|these)|of the (options|results|listings)|in (the|this) list|i found)\b/

/**
 * True when a superlative is stated without limiting it to the retrieved set.
 *
 * Judged per sentence, not per reply: a reply that scopes one claim correctly
 * must not be allowed to launder an unscoped claim two lines later.
 *
 * A sentence is a violation when it carries a superlative AND either names the
 * market outright, or names no scope at all. A bare heading like "Giá tốt nhất"
 * is the second case — it reads as a market fact precisely because it qualifies
 * nothing.
 */
export function hasUnscopedSuperlative(text: string | null | undefined): boolean {
  if (!text) return false
  for (const s of sentences(normalizeVN(text.toLowerCase()))) {
    if (!SUPERLATIVE.test(s)) continue
    if (MARKET.test(s)) return true
    if (!SCOPED.test(s)) return true
  }
  return false
}

/** The reply asserts two listings are the same configuration. */
const EQUIVALENCE = /\b(cau hinh (hoan toan )?(giong nhau|nhu nhau|y het)|(giong|y het) nhau ve cau hinh|cung cau hinh|cung mot cau hinh|y het nhau|identical (config|configuration|specs?)|same (config|configuration|specs?))\b/

export function claimsConfigEquivalence(text: string | null | undefined): boolean {
  if (!text) return false
  return EQUIVALENCE.test(normalizeVN(text.toLowerCase()))
}

/** The chip named by a listing title, at full precision. `m1 pro` is not `m1`. */
function chip(title: string): string | null {
  // Longest first: "m1 pro" must win over "m1".
  const m = title.match(/\bm(\d)\s*(pro max|max|pro|ultra)\b/) || title.match(/\bm(\d)\b/)
  if (!m) return null
  return m[2] ? `m${m[1]} ${m[2]}` : `m${m[1]}`
}

/** Every capacity the title states, e.g. 32gb + 512gb. */
function capacities(title: string): string[] {
  return [...title.matchAll(/\b(\d+)\s*(gb|tb)\b/g)].map(m => `${m[1]}${m[2]}`).sort()
}

/** Condition, when the title actually says one. */
function condition(title: string): string | null {
  if (/\b(likenew|like new|cu|used|refurb)/.test(title)) return 'used'
  if (/\b(chinh hang|moi|new|sealed|nguyen seal)\b/.test(title)) return 'new'
  return null
}

/**
 * True only when both titles STATE the same chip, the same capacities and the
 * same condition.
 *
 * Silence is never agreement: a title that names no condition cannot be said to
 * match one that does, and a missing chip means the titles simply do not
 * establish equivalence. This is a check on what the EVIDENCE says — it does not
 * group, merge, or assign identity to anything.
 */
export function titlesSupportConfigEquivalence(a: string, b: string): boolean {
  const [x, y] = [normalizeVN(a.toLowerCase()), normalizeVN(b.toLowerCase())]
  const [cx, cy] = [chip(x), chip(y)]
  if (!cx || !cy || cx !== cy) return false
  const [kx, ky] = [capacities(x), capacities(y)]
  if (kx.length === 0 || kx.join(',') !== ky.join(',')) return false
  const [dx, dy] = [condition(x), condition(y)]
  if (!dx || !dy || dx !== dy) return false
  return true
}
