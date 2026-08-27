import { extractBudget, type Budget } from '../budget'
import { normalizeVN } from '../intent'

// ── The structured need (Phase 2 §3) ────────────────────────────────────────
//
// Derived per turn by folding the whole `messages[]` array. There is deliberately
// NO table, NO migration and NO persistence:
//
//   * all three clients already send the full history, so the input is free;
//   * refinement IS "fold the history" — state continuity comes for free too;
//   * anonymous chat is a real product path and has no user row to write to;
//   * a need profile is TASK-scoped ("this laptop decision"), while UserMemory /
//     user_preferences are IDENTITY-scoped. Storing one in the other would give
//     it the wrong lifetime.
//
// Extraction is deterministic and lexicon-driven — no model call. That is not a
// preference: `promptBuilder.ts` and `intent.ts` are held model-free by the
// architecture lock, and the route is held to exactly one AI.stream() call.
//
// Precision is favoured over recall throughout, the same policy
// detectDecisionStage states: a MISSED signal degrades to exactly today's
// behaviour, whereas a FALSE signal actively misleads the ranker.

export interface Priority {
  /** Canonical attribute key the ranker scores against. */
  key: string
  /** Higher wins. Comparatives are directional, so the loser is damped, not dropped. */
  weight: number
  source: 'stated' | 'comparative' | 'preference'
}

export interface NeedProfile {
  domain: 'places' | 'hotel' | 'shopping' | 'transport' | null
  /** The thing being chosen ("laptop", "khach san"). Drives reset detection. */
  subject: string | null
  /** The SHIPPED Budget shape, with shipped semantics — `around` still widens ±20%. */
  budget: Budget | null
  /** The amount the user actually said. Language-independent; what continuity is asserted on. */
  budgetStated: number | null
  location: { text: string | null; gps: { lat: number; lng: number } | null }
  useCases: string[]
  priorities: Priority[]
  /** Hard requirements — a candidate that CONTRADICTS one is eliminated. */
  mustHave: string[]
  /** Hard exclusions — dietary restrictions land here, per prompt rule R20. */
  avoid: string[]
  turnsObserved: number
  /** Provenance: which user turn last set each field. */
  changedAtTurn: Record<string, number>
}

export interface StoredPreferences {
  cuisine_likes?: string[] | null
  dietary_restrictions?: string | null
  budget_level?: string | null
}

export interface DeriveOptions {
  storedPreferences?: StoredPreferences | null
  gps?: { lat: number; lng: number } | null
}

/** Weight for something the user said outright this conversation. */
const W_STATED = 1
/** The winning side of an explicit comparative ("battery > GPU"). */
const W_COMPARATIVE_WIN = 2
/** The losing side. Damped, never removed: the user still mentioned it. */
const W_COMPARATIVE_LOSE = 0.5
/** A durable stored preference. Strictly below anything said this conversation. */
const W_PREFERENCE = 0.25

// ── Lexicons ────────────────────────────────────────────────────────────────
// All matched against normalizeVN() output: lowercase, diacritics stripped.
// "Đà Nẵng" → "da nang", "Pin quan trọng hơn GPU" → "pin quan trong hon gpu".

/** Subject nouns that NAME the thing being chosen, and the domain each implies. */
const SUBJECTS: ReadonlyArray<[RegExp, string, NeedProfile['domain']]> = [
  [/\b(macbook|laptop|may tinh xach tay|notebook)\b/, 'laptop', 'shopping'],
  [/\b(dien thoai|smartphone|iphone|galaxy|phone)\b/, 'phone', 'shopping'],
  [/\b(tai nghe|headphone|headphones|earbuds|airpods)\b/, 'headphones', 'shopping'],
  [/\b(may anh|camera body|dslr|mirrorless)\b/, 'camera', 'shopping'],
  [/\b(tivi|tv|television)\b/, 'tv', 'shopping'],
  [/\b(khach san|hotel|resort|homestay|nha nghi)\b/, 'hotel', 'hotel'],
  [/\b(nha hang|quan an|restaurant|quan nhau)\b/, 'restaurant', 'places'],
  [/\b(cafe|ca phe|coffee)\b/, 'cafe', 'places'],
  [/\bspa\b|\bmassage\b/, 'spa', 'places'],
  [/\b(rap phim|rap chieu|cinema|karaoke|\bbar\b|\bgym\b)\b/, 'entertainment', 'places'],
  [/\b(xe khach|tau hoa|tau lua|ve xe|\btaxi\b)\b/, 'transport', 'transport'],
]

/** Weaker domain hints — set the domain but never the subject, and never reset. */
const DOMAIN_HINTS: ReadonlyArray<[RegExp, NeedProfile['domain']]> = [
  [/\ban gi\b|\bdo an\b|\ban ngon\b|\bmon an\b/, 'places'],
  // 🚨 DISH NAMES — measured gap, 2026-08-27. `SUBJECTS` covers the venue nouns
  // ("quan an", "nha hang", "cafe") but NOT the dish, and the most common
  // Vietnamese food query names the DISH, not the venue: "tìm quán hủ tiếu Phú
  // Nhuận", "quán phở ngon Hà Nội", "bún bò Huế quận 1". All of those resolved
  // to `domain: null`, and null domain silently disabled two things that matter:
  //
  //   1. `isDecisionDomain` (route.ts) — which gates `buildRankingInstructionBlock()`,
  //      the block that tells the model "the system already picked, you only
  //      explain". Without it the model receives `_tappy_ranking` data with no
  //      instruction for what it means, and does what an unguided model does:
  //      lists the options. This is the "AI trả lời như liệt kê" report.
  //   2. `taskSwitched()` — which guards `if (before.domain === null) return false`,
  //      so a food → hotel switch was structurally undetectable.
  //
  // Precision over recall, per this file's stated policy: only multi-syllable
  // dish names that cannot collide with another domain. A false positive here
  // sets `places`, and every listed term is a place-seeking query anyway, so
  // the failure mode is benign. Single ambiguous syllables ("lau" = lẩu/lau
  // nhà, "che" = chè/che giấu, "oc" = ốc) are deliberately EXCLUDED.
  // `pho` is included bare despite the "phở"/"phố" homograph after normalization.
  // It is safe on both counts: SUBJECTS is matched FIRST (so "mua điện thoại ở
  // phố Huế" resolves to shopping before this line is reached), and DOMAIN_HINTS
  // only fires when no domain is set at all. A genuine "phố cổ Hà Nội" false
  // positive resolves to `places`, which is the correct domain for it anyway.
  [/\b(hu tieu|pho|bun bo|bun cha|bun rieu|bun dau|bun thit nuong|com tam|com ga|com nieu|banh mi|banh xeo|banh cuon|banh canh|mi quang|hai san|chao long|goi cuon|ga ran|tra sua|nem nuong|bo kho|ca kho|thit nuong|lau nuong|do nuong)\b/, 'places'],
]

/**
 * Attribute lexicon: how a user names a rankable property, in either language.
 *
 * The third element splits the lexicon in two, and the split is load-bearing:
 *
 *   QUALIFIER (true)  — an EVALUATIVE phrase. Mentioning it IS the request:
 *     "quán cafe đánh giá cao", "quán yên tĩnh", "gần biển", "giá rẻ".
 *     Applied to the subject, these are requirements, so a bare mention sets a
 *     stated priority.
 *
 *   SPEC (false)      — a neutral NOUN. Mentioning it is not a request:
 *     naming "GPU" while asking for a laptop does not mean the user prioritises
 *     it, and reading it as one would rank against a preference they never
 *     expressed. These become priorities only through an explicit comparative
 *     ("pin quan trọng hơn GPU") or an explicit statement ("ưu tiên GPU").
 *
 * Treating both classes as SPEC left the commonest Vietnamese phrasing carrying
 * no signal at all — "quán cafe yên tĩnh ở Quận 1" produced an empty profile.
 */
const ATTRIBUTES: ReadonlyArray<[RegExp, string, boolean]> = [
  [/\bpin\b|\bbattery\b|thoi luong pin/, 'battery', false],
  [/\bgpu\b|card do hoa|do hoa roi|\bgraphics\b|\bvga\b/, 'gpu', false],
  [/\bnhe\b|gon nhe|\bportable\b|portability|lightweight|de mang|di dong/, 'portability', true],
  [/hieu nang|\bperformance\b|\bcpu\b|manh me|\bspeed\b|xu ly nhanh/, 'performance', false],
  [/gia re|\bre\b|\bcheap\b|affordable|tiet kiem|dang tien|value for money/, 'price', true],
  [/\bcamera\b|chup anh|chup hinh/, 'camera', false],
  // "dung lượng pin" is BATTERY capacity, not disk. Without the guard the same
  // phrase set a storage priority the user never expressed.
  [/dung luong(?! pin)|\bstorage\b|\bssd\b|bo nho/, 'storage', false],
  [/man hinh|\bscreen\b|\bdisplay\b|\boled\b/, 'screen', false],
  [/danh gia cao|nhieu review|duoc danh gia (tot|cao)|highly rated|well reviewed|\brating\b/, 'rating', true],
  [/\bgan\b|\bnear\b|\bclose to\b|gan day|gan toi|khoang cach|\bdistance\b/, 'distance', true],
  // Transport pickup speed. Phrases are deliberately specific ("toi nhanh", not
  // bare "nhanh") so a laptop "xu ly nhanh" query still resolves to performance.
  [/toi nhanh|den nhanh|don nhanh|doi lau|cho lau|it phai cho|\bpickup\b|shortest wait|fastest pickup|arrives? soonest/, 'eta', true],
  [/yen tinh|\bquiet\b|khong on/, 'quiet', true],
  [/gan bien|\bbeach\b|view bien|beachfront/, 'beach', true],
  [/trung tam|\bcentral\b|\bdowntown\b|city cent(er|re)/, 'central', true],
  [/\bwifi\b|\bwi-fi\b/, 'wifi', true],
  [/ngoai troi|\boutdoor\b|san vuon/, 'outdoor', true],
]

/**
 * The bare NOUN for each attribute.
 *
 * ATTRIBUTES lists how a user REQUESTS a property, so for evaluative keys it
 * holds the evaluative phrase — price is `gia re|cheap|affordable`, and the
 * plain noun "giá" appears nowhere. That is correct for a bare mention (naming
 * "giá" is not a request) but leaves "giá cũng quan trọng" unreadable, because
 * there the marker supplies the request and the noun only has to be identified.
 *
 * Used ONLY where an explicit priority marker is already present.
 *
 * `gia` needs the same guard it needs everywhere in this codebase: "đánh giá"
 * normalizes to "danh gia", so an unguarded \bgia\b reads every rating remark
 * as a statement about price.
 */
const ATTRIBUTE_NOUNS: ReadonlyArray<[RegExp, string]> = [
  [/(?<!danh\s)\bgia\b(?!\s*dinh)|\bprice\b|\bcost\b|chi phi/, 'price'],
  [/\bpin\b|\bbattery\b/, 'battery'],
  [/trong luong|\bweight\b/, 'portability'],
  [/khoang cach|\bdistance\b|\blocation\b/, 'distance'],
  [/danh gia|\brating\b|\breviews?\b/, 'rating'],
  [/man hinh|\bscreen\b|\bdisplay\b/, 'screen'],
  [/hieu nang|\bperformance\b/, 'performance'],
  [/\bcamera\b/, 'camera'],
  [/dung luong(?! pin)|\bstorage\b/, 'storage'],
  [/\bgpu\b|card do hoa/, 'gpu'],
]

/** Use cases — what the thing is FOR. */
const USE_CASES: ReadonlyArray<[RegExp, string]> = [
  [/\bcode\b|\bcoding\b|lap trinh|\bdev\b|programming|\bdeveloper\b/, 'coding'],
  [/\bai\b|machine learning|\bml\b|deep learning|lam ai/, 'ai'],
  [/\bgame\b|\bgaming\b|choi game/, 'gaming'],
  [/\bhoc\b|\bstudy\b|hoc bai|\bschool\b/, 'study'],
  [/lam viec|\bwork\b|cong viec|van phong|\boffice\b/, 'work'],
  [/du lich|\btravel\b|di choi|\btrip\b/, 'travel'],
  [/cong tac|business trip/, 'business'],
  [/gia dinh|\bfamily\b|\bkids\b|tre em/, 'family'],
  [/hen ho|\bdate\b|\bromantic\b|lang man/, 'date'],
]

/** Cuisines, so a food preference is a rankable attribute rather than free text. */
const CUISINES: ReadonlyArray<[RegExp, string]> = [
  [/\bnhat\b|japanese|\bsushi\b|\bramen\b/, 'japanese'],
  [/\bhan\b|korean|\bbbq han\b/, 'korean'],
  [/\bviet\b|vietnamese/, 'vietnamese'],
  [/\bthai\b/, 'thai'],
  [/\by\b|italian|\bpizza\b|\bpasta\b/, 'italian'],
  [/\btrung\b|chinese|\bdim sum\b/, 'chinese'],
  [/\ban do\b|indian/, 'indian'],
]

/** Places the product actually serves. A closed lexicon, not a capitalisation
 *  heuristic — "in Da Nang instead" would otherwise capture "Da Nang instead". */
const PLACES = [
  'da nang', 'ha noi', 'hanoi', 'ho chi minh', 'sai gon', 'saigon', 'tphcm', 'phu quoc',
  'nha trang', 'hoi an', 'da lat', 'vung tau', 'ha long', 'sapa', 'sa pa', 'ninh binh',
  'hue', 'can tho', 'mui ne', 'quy nhon', 'phan thiet', 'con dao', 'hai phong',
]

/** "I travel frequently" — a habit, not a destination. Implies portability. */
const TRAVEL_HABIT =
  /travel (a lot|frequently|often)|often travel|hay di cong tac|di cong tac nhieu|thuong xuyen di|hay di lai|di lai nhieu/

/** Vegetarian/vegan, from either the message or a stored restriction. */
const VEGETARIAN = /\bchay\b|\bvegetarian\b|\bvegan\b|\bthuan chay\b/

// ── Bilingual budget ────────────────────────────────────────────────────────
//
// The shipped extractBudget is Vietnamese-only: its units are k|tr|trieu|ngan|
// nghin and its markers are tu/den, duoi/khong qua/toi da, tam/khoang/xap xi.
// "around 30M VND" and "increase my budget to 35M" both return null from it, so
// an English budget request has never reached the budget block or
// applyBudgetFilter at all.
//
// extractBudget is NOT modified — it is shipped, tested, and read by route.ts and
// by the get_hotel_prices tool description. This is a fallback layer: the
// Vietnamese path always wins, and English is only consulted when it declines.

const EN_NUM = '(\\d+(?:[.,]\\d+)?)'
const EN_UNIT = '\\s*(m|mil|million|k|tr|trieu)\\b'

function parseEnAmount(numStr: string, unit: string): number | null {
  const n = parseFloat(numStr.replace(/,/g, '.'))
  if (isNaN(n) || n <= 0) return null
  const u = unit.toLowerCase()
  if (u === 'k') return n * 1000
  return n * 1_000_000 // m | mil | million | tr | trieu
}

/** A ceiling: "under 30M", "up to 30M", "increase my budget to 35M", "max 30M". */
const EN_UNDER = new RegExp(
  `(?:under|below|less than|up to|at most|max(?:imum)?|budget (?:of|to)|` +
  `(?:increase|raise|bump|push)[^.!?]{0,20}?\\bto)\\s*~?\\s*${EN_NUM}${EN_UNIT}`, 'i')

/** A midpoint: "around 30M", "about 30M", "~30M", "roughly 30M". */
const EN_AROUND = new RegExp(`(?:around|about|approximately|roughly|circa|~)\\s*~?\\s*${EN_NUM}${EN_UNIT}`, 'i')

/** A range: "30M to 35M", "30-35M". */
// The first unit is optional ("30-35M"), so it is wrapped — a bare `${EN_UNIT}?`
// would put the `?` on the trailing \b, which is not a repeatable token.
const EN_RANGE = new RegExp(`${EN_NUM}(?:${EN_UNIT})?\\s*(?:to|-|–)\\s*${EN_NUM}${EN_UNIT}`, 'i')

/** VI ceiling forms extractBudget does not cover ("nâng ngân sách lên 35 triệu"). */
const VI_RAISE_TO = new RegExp(
  `(?:nang|tang|len|day)[^.!?]{0,20}?(?:len|thanh|toi)\\s*${EN_NUM}\\s*(trieu|tr|k)\\b`, 'i')

/** Returns the shipped Budget shape plus the amount the user literally stated. */
export function extractBudgetBilingual(text: string): { budget: Budget; stated: number } | null {
  const vi = extractBudget(text)
  if (vi) {
    // The stated amount is the midpoint for `around` (the ±20% is our tolerance,
    // not the user's words) and the ceiling otherwise.
    const stated = vi.type === 'around' ? Math.round((vi.min + vi.max) / 2) : vi.max
    return { budget: vi, stated }
  }

  const t = normalizeVN(text.toLowerCase())

  let m = t.match(VI_RAISE_TO)
  if (m) {
    const max = parseEnAmount(m[1], m[2] === 'k' ? 'k' : 'trieu')
    if (max !== null) return { budget: { min: 0, max, type: 'under' }, stated: max }
  }

  m = t.match(EN_RANGE)
  if (m) {
    const max = parseEnAmount(m[3], m[4])
    // A bare first number inherits the second's unit: "30-35M" means 30M-35M.
    const min = parseEnAmount(m[1], m[2] || m[4])
    if (min !== null && max !== null && max >= min) {
      return { budget: { min, max, type: 'range' }, stated: max }
    }
  }

  m = t.match(EN_UNDER)
  if (m) {
    const max = parseEnAmount(m[1], m[2])
    if (max !== null) return { budget: { min: 0, max, type: 'under' }, stated: max }
  }

  m = t.match(EN_AROUND)
  if (m) {
    const base = parseEnAmount(m[1], m[2])
    if (base !== null) {
      // Same ±20% the shipped `around` branch applies, so VI and EN agree.
      return {
        budget: { min: Math.round(base * 0.8), max: Math.round(base * 1.2), type: 'around' },
        stated: base,
      }
    }
  }

  return null
}

// ── The fold ────────────────────────────────────────────────────────────────

function emptyProfile(gps: { lat: number; lng: number } | null): NeedProfile {
  return {
    domain: null,
    subject: null,
    budget: null,
    budgetStated: null,
    location: { text: null, gps },
    useCases: [],
    priorities: [],
    mustHave: [],
    avoid: [],
    turnsObserved: 0,
    changedAtTurn: {},
  }
}

function setPriority(p: NeedProfile, key: string, weight: number, source: Priority['source']): void {
  const existing = p.priorities.find(x => x.key === key)
  if (!existing) {
    p.priorities.push({ key, weight, source })
    return
  }
  // A stored preference can never overwrite something said this conversation.
  if (source === 'preference' && existing.source !== 'preference') return
  existing.weight = weight
  existing.source = source
}

/** "battery is more important than GPU" / "pin quan trọng hơn GPU" — directional. */
const COMPARATIVE = /(.{1,40}?)\s*(?:is more important than|matters more than|over|quan trong hon|hon han|hon la|\bhon\b)\s*(.{1,40})/

function applyComparative(p: NeedProfile, t: string, turn: number): boolean {
  const m = t.match(COMPARATIVE)
  if (!m) return false
  const winner = attributeIn(m[1])
  const loser = attributeIn(m[2])
  // Both sides must resolve to known attributes. A bare "hon" ("rẻ hơn") is a
  // refinement comparative, not a priority ordering, and must not fabricate one.
  if (!winner || !loser || winner === loser) return false
  setPriority(p, winner, W_COMPARATIVE_WIN, 'comparative')
  setPriority(p, loser, W_COMPARATIVE_LOSE, 'comparative')
  p.changedAtTurn.priorities = turn
  return true
}

function attributeIn(fragment: string): string | null {
  for (const [re, key] of ATTRIBUTES) if (re.test(fragment)) return key
  return null
}

/**
 * The attribute NEAREST the end of the fragment.
 *
 * `attributeIn` returns whichever attribute sits earliest in the lexicon, which
 * is right for "ưu tiên X" (the fragment starts at the marker) and wrong for the
 * postfix form: in "…máy nhẹ và pin trâu, giá cũng quan trọng" the priority
 * being stated is the one adjacent to the marker — price — not the first key
 * the lexicon happens to list.
 */
function attributeNearestEnd(fragment: string): string | null {
  let best: string | null = null
  let bestAt = -1
  for (const [re, key] of [...ATTRIBUTE_NOUNS, ...ATTRIBUTES]) {
    const m = fragment.match(new RegExp(re.source, 'g'))
    if (!m) continue
    const at = fragment.lastIndexOf(m[m.length - 1])
    if (at > bestAt) { bestAt = at; best = key }
  }
  return best
}

/**
 * An evaluative modifier. Attached to a SPEC noun it turns a neutral mention
 * into a request — "pin tốt" asks for good battery exactly the way "quán yên
 * tĩnh" asks for quiet. The bare noun on its own still asks for nothing.
 */
const QUALITY = /\b(tot|trau|lau|ben|khoe|manh|dep|lon|cao|xin|muot|good|great|long|strong|excellent|solid|nice|big|sharp|decent|reliable)\b/

/** A spec noun and a quality word within one short span of each other. */
function qualifiedSpec(t: string, attrRe: RegExp): boolean {
  const A = attrRe.source
  const Q = QUALITY.source
  return new RegExp(`(?:${A})[^.,;!?]{0,12}?(?:${Q})`).test(t)
    || new RegExp(`(?:${Q})[^.,;!?]{0,12}?(?:${A})`).test(t)
}

/** English comparatives that are one word and name their attribute implicitly. */
const ONE_SIDED_EN: ReadonlyArray<[RegExp, string]> = [
  [/\bcheaper\b|more affordable/, 'price'],
  [/\bcloser\b|\bnearer\b/, 'distance'],
  [/better rated|better reviews|higher rated/, 'rating'],
  [/\blighter\b/, 'portability'],
  [/\bquieter\b/, 'quiet'],
  [/more central/, 'central'],
]

/**
 * A ONE-SIDED comparative — "gần hơn", "rẻ hơn", "closer", "cheaper".
 *
 * The user names an attribute and asks for more of it without naming what it
 * beats. That is still a priority statement, and it is the most common way a
 * refinement turn is phrased in Vietnamese, so dropping it would leave the
 * commonest refinement carrying no signal at all.
 */
function applyOneSidedComparative(p: NeedProfile, t: string, turn: number): boolean {
  for (const [re, key] of ONE_SIDED_EN) {
    if (re.test(t)) { setPriority(p, key, W_COMPARATIVE_WIN, 'comparative'); p.changedAtTurn.priorities = turn; return true }
  }
  // Vietnamese: "<attribute> hơn". Only the text BEFORE "hơn" is considered, so
  // "gần hơn" resolves distance while "hơn nữa" resolves nothing.
  const idx = t.search(/\bhon\b/)
  if (idx > 0) {
    const key = attributeIn(t.slice(0, idx))
    if (key) { setPriority(p, key, W_COMPARATIVE_WIN, 'comparative'); p.changedAtTurn.priorities = turn; return true }
  }
  return false
}

/**
 * Fold the conversation into a structured need.
 *
 * Reads USER turns only, in order. Later turns override earlier ones for the same
 * key; non-conflicting facts accumulate. A turn that names a subject in a
 * DIFFERENT domain resets the profile — that is a new decision, not a refinement,
 * and inheriting the old constraints would be an invisible defect.
 */
export function deriveNeedProfile(
  messages: Array<{ role: string; content: unknown }>,
  opts: DeriveOptions = {},
): NeedProfile {
  const gps = opts.gps ?? null
  let p = emptyProfile(gps)

  const userTurns = (Array.isArray(messages) ? messages : [])
    .filter(m => m && m.role === 'user')
    .map(m => (typeof m.content === 'string'
      ? m.content
      : Array.isArray(m.content)
        ? (m.content as Array<{ type?: string; text?: string }>)
            .map(c => (c?.type === 'text' ? c.text || '' : '')).join(' ')
        : ''))

  for (const [idx, raw] of userTurns.entries()) {
    const turn = idx + 1
    const t = normalizeVN(String(raw ?? '').toLowerCase())
    if (!t) { p.turnsObserved = turn; continue }

    // ── Subject and reset ───────────────────────────────────────────────────
    let matchedSubject: string | null = null
    let matchedDomain: NeedProfile['domain'] = null
    for (const [re, subject, domain] of SUBJECTS) {
      if (re.test(t)) { matchedSubject = subject; matchedDomain = domain; break }
    }

    if (matchedDomain && p.domain && matchedDomain !== p.domain) {
      // A genuine task switch. Everything task-scoped goes; GPS is not
      // task-scoped, so it survives.
      p = emptyProfile(gps)
    }
    if (matchedSubject) {
      p.subject = matchedSubject
      p.domain = matchedDomain
      p.changedAtTurn.subject = turn
    } else if (!p.domain) {
      for (const [re, domain] of DOMAIN_HINTS) if (re.test(t)) { p.domain = domain; break }
    }

    // ── Budget ─────────────────────────────────────────────────────────────
    const b = extractBudgetBilingual(raw as string)
    if (b) {
      p.budget = b.budget
      p.budgetStated = b.stated
      p.changedAtTurn.budget = turn
    }

    // ── Location ───────────────────────────────────────────────────────────
    for (const place of PLACES) {
      if (t.includes(place)) { p.location.text = place; p.changedAtTurn.location = turn; break }
    }
    const district = t.match(/\bquan\s+(\d{1,2})\b/)
    if (district && !p.location.text) {
      p.location.text = `quan ${district[1]}`
      p.changedAtTurn.location = turn
    }

    // ── Use cases ──────────────────────────────────────────────────────────
    // A travel HABIT ("I travel frequently", "mình hay đi công tác") describes
    // the USER, not what the product is for: it means "carry it around", which
    // is already captured as the portability priority below. Reading it as a use
    // case made the two languages disagree for no semantic reason — EN produced
    // `travel`, VI produced `business` — while both meant the same thing. A
    // genuine travel use case ("du lịch Đà Nẵng 3 ngày") carries no habit marker
    // and is still picked up.
    const isTravelHabit = TRAVEL_HABIT.test(t)
    for (const [re, key] of USE_CASES) {
      if (isTravelHabit && (key === 'travel' || key === 'business')) continue
      if (re.test(t) && !p.useCases.includes(key)) {
        p.useCases.push(key)
        p.changedAtTurn.useCases = turn
      }
    }

    // ── Priorities ─────────────────────────────────────────────────────────
    // A comparative wins outright: it states an ORDERING, which a bare mention
    // of the same two attributes would otherwise flatten to equal weight.
    if (!applyComparative(p, t, turn) && !applyOneSidedComparative(p, t, turn)) {
      if (isTravelHabit) {
        setPriority(p, 'portability', W_STATED, 'stated')
        p.changedAtTurn.priorities = turn
      }
      // "uu tien X" / "care most about X" / "X is most important" — an explicit
      // priority statement. A bare mention is NOT one: naming "GPU" while asking
      // for a laptop does not mean the user prioritises it.
      const explicit = t.match(
        /(?:uu tien|quan tam nhat|quan trong nhat|care most about|most important|matters most|prioriti[sz]e|focus on)\s*(?:is|la)?\s*(.{1,40})/)
      if (explicit) {
        const key = attributeIn(explicit[1])
        if (key) { setPriority(p, key, W_COMPARATIVE_WIN, 'stated'); p.changedAtTurn.priorities = turn }
      }
      // The POSTFIX form of the same statement: "giá cũng quan trọng",
      // "price matters too", "price is important to me". As common as the
      // prefix form in both languages, and it reaches ranking — `price` is a
      // scored term, so failing to read it left the order unchanged by
      // something the user said plainly.
      const postfix = t.match(
        /(.{1,40})\s*(?:cung |rat |kha |really |also )?(?:la |is |are )?(?:rat )?(?:quan trong|matters?|important)\b/)
      if (postfix) {
        const key = attributeNearestEnd(postfix[1])
        if (key) { setPriority(p, key, W_COMPARATIVE_WIN, 'stated'); p.changedAtTurn.priorities = turn }
      }
      // Evaluative qualifiers are requests in themselves — see the note on
      // ATTRIBUTES. Applied AFTER the explicit form so "ưu tiên gần" keeps the
      // stronger weight rather than being flattened back to a bare mention.
      for (const [re, key, isQualifier] of ATTRIBUTES) {
        // A SPEC noun joins them when an evaluative modifier is attached to it.
        if (!isQualifier && !qualifiedSpec(t, re)) continue
        if (!re.test(t)) continue
        if (p.priorities.some(x => x.key === key && x.source !== 'preference')) continue
        setPriority(p, key, W_STATED, 'stated')
        p.changedAtTurn.priorities = turn
      }
      for (const [re, cuisine] of CUISINES) {
        if (re.test(t) && /\bdo\b|\bmon\b|\bquan\b|\bfood\b|\bcuisine\b|\ban\b/.test(t)) {
          setPriority(p, `cuisine:${cuisine}`, W_STATED, 'stated')
          p.changedAtTurn.priorities = turn
        }
      }
    }

    // ── Hard constraints ───────────────────────────────────────────────────
    const must = t.match(/(?:phai co|can co|bat buoc co|must have|needs to have|with)\s+(.{1,30})/)
    if (must) {
      const key = attributeIn(must[1])
      if (key && !p.mustHave.includes(key)) { p.mustHave.push(key); p.changedAtTurn.mustHave = turn }
    }
    if (VEGETARIAN.test(t) && !p.avoid.includes('non-vegetarian')) {
      p.avoid.push('non-vegetarian')
      p.changedAtTurn.avoid = turn
    }

    p.turnsObserved = turn
  }

  // ── Durable preferences: a LOW-WEIGHT prior, applied last and never on top ──
  const prefs = opts.storedPreferences
  if (prefs) {
    if (prefs.dietary_restrictions && VEGETARIAN.test(normalizeVN(prefs.dietary_restrictions.toLowerCase()))) {
      // A dietary restriction is a HARD constraint (prompt rule R20 already
      // ranks it above every other suggestion), not a soft preference.
      if (!p.avoid.includes('non-vegetarian')) p.avoid.push('non-vegetarian')
    }
    for (const like of prefs.cuisine_likes || []) {
      const norm = normalizeVN(String(like).toLowerCase())
      for (const [re, cuisine] of CUISINES) {
        if (re.test(norm)) setPriority(p, `cuisine:${cuisine}`, W_PREFERENCE, 'preference')
      }
    }
  }

  return p
}
