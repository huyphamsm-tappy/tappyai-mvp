import { normalizeVN } from '../intent'

// ── Claim-scope detectors ────────────────────────────────────────────────────
//
// A short list of narrow checks, and deliberately narrow. They exist so the rules
// added to the shopping rulebook can be tested against REPLY TEXT — including the verbatim
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

// ── Condition / provenance is bound to ONE listing ──────────────────────────
//
// Production 2026-08-23 shipped "Giá rẻ nhất trong các lựa chọn chính hãng"
// over rows whose titles state no condition at all: the pick ("Macbook Pro M1
// 14,2inch, Apple M1 | 32GB | 512GB", Zin100.vn) and the runner-up said nothing
// about condition, and the ONLY row that said "Chính Hãng" was a different, far
// more expensive machine.
//
// The equivalence check above cannot see this — it answers whether two titles
// state the same CONFIGURATION, and `claimsConfigEquivalence` correctly returned
// false because no equivalence was claimed. Configuration and condition are
// separate evidence dimensions; matching specs establish nothing about provenance.

/**
 * The condition/provenance vocabulary this rule protects, one entry per term.
 *
 * "moi"/"new" are deliberately ABSENT. "model mới", "mới ra mắt" are ordinary
 * product language, and protecting them would reject sentences that claim no
 * condition at all.
 */
const CONDITION_TERMS: { key: string; re: RegExp }[] = [
  { key: 'chinh hang', re: /\bchinh hang\b/ },
  { key: 'likenew', re: /\b(likenew|like new)\b/ },
  { key: 'cu', re: /\bcu\b(?!\s+the\b)/ },
  { key: 'sealed', re: /\b(sealed|nguyen seal)\b/ },
  { key: 'refurb', re: /\brefurb(ished)?\b/ },
]

/**
 * The sentence speaks for the whole retrieved set rather than for one listing.
 *
 * This is the shape the shipped defect took: "các lựa chọn chính hãng" attributes
 * a condition to every option at once, on the strength of one row that stated it.
 */
const COLLECTIVE = /\b(ca hai|ca 2|ca ba|ca 3|deu|tat ca|cac lua chon|cac tin dang|cac may|nhung lua chon|both|all (of )?(the )?(options|listings)|every (option|listing))\b/

/** The sentence DECLINES to claim a condition — the behaviour the rule asks for. */
const NOT_ASSERTED = /\b(khong ghi|khong noi|khong neu|khong ro|khong de cap|khong xac nhan|khong chac|chua ghi|chua noi|chua ro|chua chac|not stated|does not say|unclear)\b/

/** What the evidence for one row actually is: its title, and the shop it came from. */
export type ListingEvidence = { title: string; seller?: string | null }

/** The shop as a reply would name it — "Zin100.vn" is written "Zin100" as often as not. */
function sellerStem(seller: string): string | null {
  const stem = normalizeVN(seller.toLowerCase()).replace(/\.(vn|com|net|org|shop)\b.*$/, '').trim()
  return stem.length >= 4 ? stem : null
}

/**
 * True when a sentence asserts a condition/provenance attribute that the listing
 * it is about does not state.
 *
 * "The listing it is about" is resolved from the sentence itself, in the only
 * three ways a sentence offers:
 *
 *   · it names a shop → that row must state the term;
 *   · it speaks collectively ("cả hai đều...", "các lựa chọn...") → EVERY row must;
 *   · it names neither → at least one row must, or nothing supports the word.
 *
 * Silence in a title is never evidence of a condition, and a term stated by one
 * row is never evidence for another. Judged per sentence, like the superlative
 * check above, so a correct attribution cannot launder a wrong one beside it.
 */
export function unsupportedConditionClaim(
  text: string | null | undefined,
  listings: ListingEvidence[],
): boolean {
  if (!text || listings.length === 0) return false
  const rows = listings.map(l => ({
    title: normalizeVN(l.title.toLowerCase()),
    seller: l.seller ? sellerStem(l.seller) : null,
  }))
  const claims = sentences(normalizeVN(text.toLowerCase()))
  for (const s of claims) {
    if (NOT_ASSERTED.test(s)) continue
    for (const term of CONDITION_TERMS) {
      if (!term.re.test(s)) continue
      const named = rows.filter(r => r.seller !== null && s.includes(r.seller))
      const subjects = named.length > 0 ? named : COLLECTIVE.test(s) ? rows : null
      if (subjects === null) {
        if (!rows.some(r => term.re.test(r.title))) return true
        continue
      }
      if (subjects.some(r => !term.re.test(r.title))) return true
    }
  }
  return false
}
