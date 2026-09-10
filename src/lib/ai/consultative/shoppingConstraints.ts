import { normalizeVN } from '../intent'
import { parseProductSpecs } from '../productSpecs'
import type { Budget } from '../budget'
import type { Candidate } from './candidate'

// ── Shopping: what the user actually ASKED FOR, enforced before ranking ─────
//
// 🚨 RANKING IS NOT A FILTER, AND USING IT AS ONE PUT JUNK IN THE TOP THREE.
// Measured on localhost, every one of these reached the recommendation card:
//
//   "Rẻ hơn thì có lựa chọn nào?"  → MÀN HÌNH LAPTOP 13.3IN (399k), a laptop
//                                    SCREEN, and a bare chassis, ranked above
//                                    two real laptops on price alone
//   "Laptop khoảng 20 triệu"       → three laptops at 1.5M / 1.97M / 2.19M
//   "Laptop … dưới 20 triệu"       → a 21.99M laptop
//   "iPhone …"                     → a Samsung Galaxy Note, and an iPhone
//                                    INSTALLATION SERVICE
//
// A high provider score is not relevance. The ranker orders candidates by how
// well they fit a need; it has no concept of "this is not the thing you asked
// for", so a cheap accessory scores brilliantly on the price term and lands at
// #1. The fix is order, not weights: VALIDATE, THEN RANK.
//
// ── WHAT THIS FILE WILL AND WILL NOT DO ─────────────────────────────────────
//
// It enforces only what the user SAID, from evidence the provider actually
// returned. It never infers a preference, never scores, never reorders, and
// never invents a field. Four rules, each traceable to a measured failure:
//
//   1. ACCESSORY / PART / SERVICE — the title's HEAD names a thing that is not
//      the thing (a screen, a mouse, a bag, an installation service). Head-based
//      on purpose: Vietnamese listings lead with the product noun, so "MÀN HÌNH
//      LAPTOP…" is caught while "Laptop … 15.6\" FHD màn hình cảm ứng" is not.
//   2. BRAND — the user named one and the title does not carry it.
//   3. BUDGET — the stated bound, without the 10% courtesy that let a 21.99M
//      laptop answer "dưới 20 triệu".
//   4. SPECS — the title STATES a different RAM/storage than the one requested.
//
// Silence is never a rejection. A listing that states no RAM is not rejected by
// a RAM constraint, and a listing with no price is not rejected by a budget —
// it stays an honestly unverified option (the card already renders "chưa rõ
// giá"), because the alternative is to claim it satisfies a bound nobody
// measured. That is the same missing-data policy the rest of the stack follows.

/** The explicit constraints one shopping conversation carries. */
export interface ShoppingConstraints {
  /** 'laptop' | 'phone' | 'headphones' | 'tablet' | 'watch' | 'tv' | 'camera' | null */
  productType: string | null
  /** A brand the user named outright: 'apple', 'samsung', 'dell', … */
  brand: string | null
  budget: Budget | null
  ramGb: number | null
  storageGb: number | null
  /** The user asked FOR an accessory/service, so rule 1 must stand down. */
  wantsAccessory: boolean
}

export type RejectionReason = 'accessory' | 'service' | 'brand' | 'budget' | 'ram' | 'storage'

export interface Rejection {
  candidate: Candidate
  reason: RejectionReason
  /** The evidence that decided it — for tests and for logs, never for the user. */
  detail: string
}

const norm = (s: string) => normalizeVN((s || '').toLowerCase())

// ── Lexicons ────────────────────────────────────────────────────────────────
// Matched against normalizeVN output: lowercase, diacritics stripped.

/**
 * Product families the user can ask for, and the words that name them.
 *
 * Only families where a mismatch is unambiguous. Deliberately absent: anything
 * that would need judgement about whether two nouns mean the same thing.
 */
const PRODUCT_TYPES: ReadonlyArray<[string, RegExp]> = [
  ['laptop', /\b(laptop|macbook|notebook|ultrabook|may tinh xach tay)\b/],
  ['phone', /\b(iphone|dien thoai|smartphone|galaxy|redmi)\b/],
  ['headphones', /\b(tai nghe|headphone|headset|earbuds|airpods)\b/],
  ['tablet', /\b(ipad|may tinh bang|tablet)\b/],
  ['watch', /\b(dong ho thong minh|smartwatch|apple watch)\b/],
  ['tv', /\b(tivi|smart tv|android tv)\b/],
  ['camera', /\b(may anh|camera|ong kinh)\b/],
]

/** Brands a user names outright. `alias` lets "iphone"/"macbook" imply Apple. */
const BRANDS: ReadonlyArray<[string, RegExp, RegExp]> = [
  // [canonical, what the USER said, what a TITLE must carry]
  ['apple', /\b(apple|iphone|macbook|ipad|airpods|imac)\b/, /\b(apple|iphone|macbook|ipad|airpods|imac)\b/],
  ['samsung', /\b(samsung|galaxy)\b/, /\b(samsung|galaxy)\b/],
  ['sony', /\bsony\b/, /\bsony\b/],
  ['dell', /\bdell\b/, /\bdell\b/],
  ['asus', /\b(asus|rog|vivobook|zenbook)\b/, /\b(asus|rog|vivobook|zenbook)\b/],
  ['lenovo', /\b(lenovo|thinkpad|thinkbook|ideapad)\b/, /\b(lenovo|thinkpad|thinkbook|ideapad)\b/],
  ['hp', /\bhp\b/, /\bhp\b/],
  ['acer', /\b(acer|aspire|nitro|predator)\b/, /\b(acer|aspire|nitro|predator)\b/],
  ['msi', /\bmsi\b/, /\bmsi\b/],
  ['xiaomi', /\b(xiaomi|redmi|poco)\b/, /\b(xiaomi|redmi|poco)\b/],
  ['oppo', /\boppo\b/, /\boppo\b/],
  ['bose', /\bbose\b/, /\bbose\b/],
  ['jbl', /\bjbl\b/, /\bjbl\b/],
  ['marshall', /\bmarshall\b/, /\bmarshall\b/],
]

/**
 * Head nouns that name a PART or ACCESSORY rather than the device.
 *
 * Each one was a measured contaminant or is the same class as one. They only
 * ever apply to the FIRST few tokens of a title — see `headOf`.
 */
const ACCESSORY_HEAD = new RegExp(
  '^(?:' + [
    'man hinh', 'man ', 'ban phim', 'chuot', 'tui', 'balo', 'cap dung', 'bao da',
    'op lung', 'op ', 'sac', 'cap sac', 'cap ', 'adapter', 'day sac', 'de tan nhiet',
    'gia do', 'ke ', 'quat tan nhiet', 'mieng dan', 'dan man hinh', 'cuong luc',
    'than may', 'vo may', 'vo ', 'pin laptop', 'pin ', 'o cung', 'ram laptop', 'ram ',
    'dock', 'hub', 'usb', 'the nho', 'mieng lot', 'lot chuot', 'dem tai', 'day deo',
    'nut tai', 'hop dung', 'gia treo', 'chan de', 'tan nhiet', 'phim ',
  ].join('|') + ')',
)

/**
 * Accessory names UNAMBIGUOUS enough to catch anywhere in the head window.
 *
 * 🚨 THE SHORT ONES CANNOT BE SCANNED, AND THAT IS THE WHOLE DISTINCTION. "op"
 * lives inside "laptop"; "ram" is written early in perfectly good laptop titles
 * ("Laptop Dell … RAM 16GB"); "vo" inside "vivobook". Those stay anchored at the
 * head, where they can only be the product noun. The multi-word names below name
 * one thing and nothing else, so a seller prefix cannot hide them.
 */
const ACCESSORY_ANYWHERE = new RegExp(
  '(?:' + [
    'man hinh', 'ban phim', 'chuot', 'tui xach', 'balo', 'cap dung', 'bao da',
    'op lung', 'cap sac', 'day sac', 'de tan nhiet', 'gia do', 'quat tan nhiet',
    'mieng dan', 'dan man hinh', 'cuong luc', 'than may', 'vo may', 'pin laptop',
    'o cung', 'ram laptop', 'the nho', 'mieng lot', 'lot chuot', 'dem tai',
    'day deo', 'nut tai', 'hop dung', 'gia treo', 'chan de', 'tan nhiet',
  ].join('|') + ')',
)

/** Head nouns that name a SERVICE rather than a product. */
const SERVICE_HEAD = new RegExp(
  '^(?:' + [
    'dich vu', 'sua chua', 'sua ', 'thay man', 'thay pin', 'cai dat', 've sinh',
    'nang cap', 'thu mua', 'combo dich vu', 'goi bao hanh', 'ho tro ky thuat',
  ].join('|') + ')',
)

/**
 * Titles that name no particular product.
 *
 * Measured on a "cheaper laptops?" follow-up: "laptop cũ và mới nhiều sự lựa
 * chọn.", "máy tính cũ nhiều sự lựa chọn." — shop catch-alls with a nominal
 * price and no model — and "Laptop của bé - Công chúa xinh đẹp", a children's
 * TOY. None can be recommended, because none names a thing to recommend.
 *
 * Generic marketing phrasing, not product names: nothing here mentions a brand.
 */
const CATCH_ALL = new RegExp([
  'nhieu su lua chon', 'nhieu mau ma', 'du loai', 'cac loai', 'gia tot nhat',
  'lien he de biet', 'hang co san', 'do choi', 'cua be', 'cho be yeu', 'tre em',
  'link tong hop', 'tong hop cac', 'cac hang', 'nhieu hang',
].join('|'))

/**
 * Device families that CONFLICT with what was asked for.
 *
 * Only conflicts, never a positive requirement: demanding the word "laptop" in
 * the title would reject "Surface Book 2" and "MacBook Air", which are laptops
 * that do not say so. Measured contaminant: "Apple Mac mini" — a desktop — in a
 * laptop shortlist.
 */
const CONFLICTING_FAMILY: Record<string, RegExp> = {
  laptop: new RegExp(['mac mini', 'imac', 'may tinh de ban', 'may tinh ban', 'may bo', 'pc gaming', 'case may tinh', 'may tinh cu'].join('|')),
  phone: new RegExp(['may tinh bang', 'smartwatch', 'dong ho'].join('|')),
  headphones: new RegExp(['loa bluetooth', 'loa keo', 'micro thu am'].join('|')),
}

/** The user is asking FOR an accessory or a service — rule 1 must not fire. */
const WANTS_ACCESSORY = new RegExp(
  [
    'tui', 'balo', 'cap dung', 'op lung', 'ban phim', 'chuot', 'sac', 'cap ',
    'man hinh roi', 'o cung', 'ram roi', 'phu kien', 'dich vu', 'sua chua',
    'cai dat', 'thay pin', 'thay man', 'de tan nhiet', 'gia do', 'dock', 'hub',
  ].join('|'),
)

/**
 * The head of a title: enough tokens to name the thing, not enough to reach its
 * specification list.
 *
 * "MÀN HÌNH LAPTOP 13.3IN HD 40PIN DÀY" → "man hinh laptop 13 3in" — caught.
 * "Laptop Dell 15 DC15250 … 15.6\" FHD Touch" → "laptop dell 15 dc15250 i5" — kept,
 * even though the full title goes on to mention a screen.
 *
 * 🚨 FIVE TOKENS, SCANNED — NOT ANCHORED AT THE FIRST. A seller prefix defeated an
 * anchor: "TGMT - Bàn phím cơ không dây E-DRA…" is a KEYBOARD whose title opens
 * with a shop name, and it reached a laptop recommendation. The window is what
 * keeps this safe either way — a spec list further along the title is not a head.
 */
function headOf(title: string): string {
  return norm(title).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 5).join(' ')
}

/**
 * The RAM / storage a USER asked for, read from a sentence.
 *
 * `parseProductSpecs` is for LISTING TITLES and expects their shape ("i5/8GB/512GB",
 * "SSD 512GB"). A person writes "16GB RAM 512GB", where the capacity carries no
 * label at all, and the title parser correctly declines to guess — so the
 * requested storage was silently lost.
 *
 * A request is not a listing, so it gets its own reader rather than a looser
 * title parser that would change how every product is grouped. The rule is the
 * one people actually follow when writing it: a figure at or below 64GB is
 * memory, anything from 128GB up is capacity, and TB is always capacity.
 */
export function requestedSpecs(text: string): { ramGb: number | null; storageGb: number | null } {
  const t = norm(text)
  let ramGb: number | null = null
  let storageGb: number | null = null
  for (const m of t.matchAll(/(\b(\d{1,4})\s*gb\b)/g)) {
    const n = parseInt(m[1], 10)
    if (!Number.isFinite(n)) continue
    if (n <= 64 && ramGb === null) ramGb = n
    else if (n >= 128 && storageGb === null) storageGb = n
  }
  const tb = t.match(/(\b(\d)\s*tb\b)/)
  if (tb && storageGb === null) storageGb = parseInt(tb[1], 10) * 1024
  return { ramGb, storageGb }
}

/** "Cheaper than that" — tightens the ceiling without inventing a new one. */
const CHEAPER = /\b(re hon|gia re hon|rer|cheaper|less expensive|rẻ hơn)\b/

// ── Deriving the constraints ────────────────────────────────────────────────

interface Msg { role: string; content: unknown }

const textOf = (m: Msg): string =>
  typeof m.content === 'string' ? m.content
    : Array.isArray(m.content) ? m.content.map(c => (c as { text?: string })?.text ?? '').join(' ')
      : ''

/**
 * Fold the conversation's explicit shopping constraints.
 *
 * 🚨 DERIVED FROM THE WHOLE HISTORY, WHICH IS THE POINT. "Rẻ hơn thì có lựa chọn
 * nào?" names no product, so a constraint read from that turn alone knows
 * nothing — and the follow-up returned laptop screens and a mouse. The subject
 * of the conversation is still "laptop"; only the budget moved.
 *
 * Latest statement wins per field, so changing your mind works; silence keeps
 * what was already said, so a follow-up inherits it.
 */
export function deriveShoppingConstraints(
  messages: readonly Msg[],
  budget: Budget | null,
): ShoppingConstraints {
  const userTexts = messages.filter(m => m.role === 'user').map(textOf).filter(t => t.trim().length > 0)
  const k: ShoppingConstraints = {
    productType: null, brand: null, budget, ramGb: null, storageGb: null, wantsAccessory: false,
  }

  for (const raw of userTexts) {
    const t = norm(raw)
    for (const [type, re] of PRODUCT_TYPES) if (re.test(t)) { k.productType = type; break }
    for (const [brand, said] of BRANDS) if (said.test(t)) { k.brand = brand; break }
    const asked = requestedSpecs(raw)
    if (asked.ramGb !== null) k.ramGb = asked.ramGb
    if (asked.storageGb !== null) k.storageGb = asked.storageGb
  }

  // Only the CURRENT turn decides whether an accessory is what is wanted: asking
  // for a laptop after asking for a laptop bag is a new question.
  const latest = norm(userTexts[userTexts.length - 1] ?? '')
  k.wantsAccessory = WANTS_ACCESSORY.test(latest)

  /**
   * "Rẻ hơn" keeps the ceiling and drops the floor.
   *
   * The previous turn's "khoảng 20 triệu" is a BAND (16–24M). Carrying it whole
   * into a request for something cheaper would reject exactly what was asked
   * for; dropping it entirely would let a 399k laptop screen back in. The honest
   * reading is "still this kind of thing, but under what we were looking at".
   */
  if (CHEAPER.test(latest) && budget === null) {
    const prior = k.budget
    if (prior) k.budget = { min: 0, max: prior.max, type: 'under' }
  } else if (CHEAPER.test(latest) && budget) {
    k.budget = { min: 0, max: budget.max, type: 'under' }
  }

  return k
}

/**
 * Carry a prior turn's budget into a follow-up that states none.
 *
 * `extractBudget` reads ONE message, so "Rẻ hơn thì có lựa chọn nào?" has no
 * budget of its own and the ceiling vanished. This walks back through the user's
 * turns for the last one that stated a bound.
 */
export function budgetFromHistory(messages: readonly Msg[], extract: (t: string) => Budget | null): Budget | null {
  const userTexts = messages.filter(m => m.role === 'user').map(textOf)
  for (let i = userTexts.length - 1; i >= 0; i--) {
    const b = extract(userTexts[i])
    if (b) return b
  }
  return null
}

// ── Validating one candidate ────────────────────────────────────────────────

/**
 * The bound a budget actually states, with no courtesy margin.
 *
 * 🚨 THE 10% TOLERANCE ANSWERED "dưới 20 triệu" WITH 21.99M. A ceiling the user
 * said out loud is a ceiling. `around` keeps BOTH ends of the ±20% band the
 * extractor already computed — dropping its floor is what let three laptops at
 * 1.5M, 1.97M and 2.19M answer "khoảng 20 triệu".
 */
function budgetBounds(b: Budget): { min: number; max: number } {
  // "dưới X" is a ceiling and nothing else.
  if (b.type === 'under') return { min: 0, max: b.max }
  // "từ X đến Y" states both ends deliberately; 10% of slack at the bottom
  // matches what the shipped row filter already allowed for a range.
  if (b.type === 'range') return { min: Math.round(b.min * 0.9), max: b.max }
  /**
   * "khoảng 20 triệu" is GENEROUS DOWNWARD, and it has to be.
   *
   * The extractor turns it into a ±20% band, and enforcing that floor rejected a
   * genuine 11.79M iPhone for "iPhone khoảng 20 triệu" — a cheaper option is
   * usually welcome, so a symmetric band over-filters. What is NOT welcome is a
   * different class of product entirely: "khoảng 20 triệu" measurably returned
   * laptops at 1.5M, 1.97M and 2.19M, which are not cheap laptops but parts,
   * bundles and decade-old machines.
   *
   * So the ceiling stays where the user put it and the floor drops to half the
   * band's bottom — 40% of the stated amount. 11.79M survives "around 20M";
   * 2.19M does not.
   */
  return { min: Math.round(b.min / 2), max: b.max }
}

/** Why this candidate cannot be shown, or null when it can. */
export function rejectCandidate(c: Candidate, k: ShoppingConstraints): Rejection | null {
  const title = c.name || ''
  const head = headOf(title)
  const full = norm(title)

  if (!k.wantsAccessory) {
    if (SERVICE_HEAD.test(head)) return { candidate: c, reason: 'service', detail: head }
    if (ACCESSORY_HEAD.test(head) || ACCESSORY_ANYWHERE.test(head)) return { candidate: c, reason: 'accessory', detail: head }
  }

  // A listing that names no particular product, and a toy that borrows the word.
  if (CATCH_ALL.test(full)) return { candidate: c, reason: 'accessory', detail: 'catch-all listing' }

  // A different DEVICE FAMILY: a desktop is not a laptop, however good the price.
  if (k.productType) {
    const conflict = CONFLICTING_FAMILY[k.productType]
    if (conflict && conflict.test(head)) return { candidate: c, reason: 'accessory', detail: 'other device family' }
  }

  if (k.brand) {
    const entry = BRANDS.find(([name]) => name === k.brand)
    if (entry && !entry[2].test(full)) return { candidate: c, reason: 'brand', detail: k.brand }
  }

  if (k.budget && typeof c.attrs.priceVnd === 'number') {
    const { min, max } = budgetBounds(k.budget)
    const p = c.attrs.priceVnd
    if (p > max) return { candidate: c, reason: 'budget', detail: `${p} > ${max}` }
    if (min > 0 && p < min) return { candidate: c, reason: 'budget', detail: `${p} < ${min}` }
  }

  // A spec the LISTING STATES and that contradicts the request. Silence is not a
  // contradiction: a title that names no RAM is left alone.
  const specs = parseProductSpecs(title)
  if (k.ramGb !== null && typeof specs.ram_gb === 'number' && specs.ram_gb !== k.ramGb) {
    return { candidate: c, reason: 'ram', detail: `${specs.ram_gb} != ${k.ramGb}` }
  }
  if (k.storageGb !== null && typeof specs.storage_gb === 'number' && specs.storage_gb !== k.storageGb) {
    return { candidate: c, reason: 'storage', detail: `${specs.storage_gb} != ${k.storageGb}` }
  }

  return null
}

export interface ValidationResult {
  kept: Candidate[]
  rejected: Rejection[]
}

/**
 * Split the provider's candidates into what the user asked for and what they did not.
 *
 * Order is preserved and nothing is scored: this decides membership, the ranker
 * decides order. When every candidate fails, `kept` is empty — deliberately.
 * Forcing one through to have something to show is the failure this prevents.
 */
export function validateShoppingCandidates(
  candidates: readonly Candidate[],
  k: ShoppingConstraints,
): ValidationResult {
  const kept: Candidate[] = []
  const rejected: Rejection[] = []
  for (const c of candidates) {
    const r = rejectCandidate(c, k)
    if (r) rejected.push(r)
    else kept.push(c)
  }
  return { kept, rejected }
}

/** A compact, model-facing summary of what could not be satisfied. Never user-facing text. */
export function unmetConstraintPayload(k: ShoppingConstraints, rejected: readonly Rejection[]): Record<string, unknown> {
  const by: Record<string, number> = {}
  for (const r of rejected) by[r.reason] = (by[r.reason] ?? 0) + 1
  return {
    ...(k.budget ? { budget: { max: k.budget.max, type: k.budget.type } } : {}),
    ...(k.productType ? { product_type: k.productType } : {}),
    ...(k.brand ? { brand: k.brand } : {}),
    ...(k.ramGb !== null ? { ram_gb: k.ramGb } : {}),
    ...(k.storageGb !== null ? { storage_gb: k.storageGb } : {}),
    excluded_by: by,
  }
}
