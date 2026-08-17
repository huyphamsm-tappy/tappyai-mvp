import { normalizeVN } from '../intent'
import type { NeedProfile } from './needProfile'
import type { RankedResult } from './rank'
import type { Pick } from './pick'
import type { CandidateAttrs } from './candidate'

// ── Consultative reply instrumentation (Phase 2 §8: PC / TO / WHY) ──────────
//
// Reads a FINISHED reply against the evidence that produced it. This is an
// acceptance instrument, not a prompt rule and not a guard: it changes no output,
// it only measures.
//
// It exists because the corpora could only ever report `hasTradeoff` as "a
// contrast word appeared somewhere" — which counts "every option has pros and
// cons" as a trade-off. The contract requires trade-offs that are
// candidate-specific, user-specific AND grounded, so those three are measured
// separately and a reply must earn each one.
//
// Deliberately bounded: exact candidate-name matching, small marker lexicons, and
// evidence lookup. No general NLP.

export interface ReplyAnalysis {
  candidatesMentioned: string[]
  prosCons: {
    /** Coverage of the two best-covered candidates is within 40% of each other. */
    balanced: boolean
    /** At least two candidates are discussed by name with a grounded attribute. */
    candidateSpecific: boolean
    perCandidate: Record<string, number>
  }
  tradeoff: {
    present: boolean
    candidateSpecific: boolean
    userSpecific: boolean
    grounded: boolean
  }
  pick: {
    present: boolean
    name: string | null
    /** False when the model chose something other than what the ranker decided. */
    matchesBackendPick: boolean
  }
  why: {
    present: boolean
    referencesAttribute: boolean
    referencesRequirement: boolean
  }
  /** "<candidate>:<attribute>" for each attribute asserted with no evidence. */
  ungroundedClaims: string[]
}

/** Contrast markers, both languages. */
const CONTRAST = /\bnhung\b|tuy nhien|doi lai|bu lai|danh doi|nguoc lai|\bbut\b|however|whereas|\bwhile\b|trade-?off|on the other hand/

/** Causal markers. */
const CAUSAL = /\bvi\b|boi vi|\bdo\b|\bnen\b|because|\bsince\b|that is why|which is why|so that/

/**
 * A calibrated lean — how a pick is actually phrased.
 *
 * The prompt asks for "nghiêng về", but live replies overwhelmingly write
 * "là lựa chọn tốt nhất" / "looks like the best fit". Measuring only the
 * prompt's own wording reported a real Pick as absent.
 */
const LEAN = /nghieng ve|minh chon|tappy chon|minh goi y|goi y nhat|hop nhat|phu hop nhat|lua chon tot nhat|tot nhat cho ban|i'?d go with|i recommend|my pick|tappy'?s pick|i'?d pick|would choose|best (fit|choice|option|pick)/

/** Words that make a two-candidate sentence a COMPARISON rather than a list. */
const COMPARATIVE_JOIN = /\bhon\b|\bthan\b|\bvs\.?\b|\bversus\b|so voi|compared to|\bwhereas\b/

/** Blanket praise that names no attribute. Explicitly NOT pros/cons. */
const BLANKET = /rat tuyet voi|ai cung thich|cung rat on|deu co uu va nhuoc|cung duoc|rat ngon|deu tot/

/** How an attribute is named in prose, for grounding checks. */
const ATTR_MENTION: ReadonlyArray<[RegExp, keyof CandidateAttrs]> = [
  [/\bwifi\b|\bwi-fi\b/, 'wifi'],
  [/ngoai troi|\boutdoor\b|san vuon/, 'outdoorSeating'],
  [/\bchay\b|\bvegetarian\b|\bvegan\b/, 'vegetarian'],
  [/danh gia|\brated\b|\brating\b|\breviews?\b|luot/, 'rating'],
  [/\bkm\b|cach (ban|day|toi)|\baway\b|khoang cach|\bdistance\b/, 'distanceKm'],
  // `gia` is genuinely ambiguous once diacritics are stripped: "giá" is price,
  // but "đánh giá" is a RATING and "gia đình" is family. Without the guards, every
  // rating mention in a Vietnamese reply read as an unsupported price claim.
  [/\bvnd\b|\bdong\b|(?<!danh\s)\bgia\b(?!\s*dinh)|\bprice\b|\bcosts?\b/, 'priceVnd'],
  [/\bsao\b|\bstar\b/, 'stars'],
  // Weight and battery — the two attributes the live failure asserted without
  // evidence. `/shopping` supplies neither, so any claim about them is caught
  // unless a richer provider populated the field.
  [/\bnhe\b|nang \d|trong luong|lightweight|\blight\b|\bweight\b|\bkg\b/, 'weightKg'],
  [/\bpin\b|\bbattery\b|thoi luong pin/, 'batteryHours'],
]

/** Attribute key → the label used in `ungroundedClaims`. */
const ATTR_LABEL: Record<string, string> = {
  outdoorSeating: 'outdoor',
  priceVnd: 'price',
  distanceKm: 'distance',
  weightKg: 'weight',
  batteryHours: 'battery',
}

/**
 * Phrasing that frames an attribute as the USER'S REQUIREMENT rather than a
 * claim about the product.
 *
 * "Vì bạn ưu tiên máy nhẹ, mình nghiêng về X" restates what the user asked for
 * and asserts nothing about X. "X rất nhẹ" does. Without this distinction the
 * grounding check would punish a reply for correctly quoting the user back —
 * and the product rule is precisely that a requirement is not evidence.
 */
const REQUIREMENT_FRAMING =
  /\bban (uu tien|can|muon|thich|yeu cau)|vi ban\b|theo yeu cau|ban dang tim|\byou (want|need|prefer|asked|care)\b|since you\b|because you\b|your (requirement|priority|preference)/

/** Which need-profile facts count as "the user said this". */
function requirementTerms(need: NeedProfile): RegExp[] {
  const out: RegExp[] = []
  for (const p of need.priorities) {
    if (p.key === 'distance') out.push(/\bgan\b|\bclose\b|\bnear(by)?\b|khoang cach/)
    else if (p.key === 'rating') out.push(/danh gia|\brated\b|\brating\b/)
    else if (p.key === 'price') out.push(/\bre\b|gia re|\bcheap\b|\bbudget\b|tiet kiem|affordable/)
    else if (p.key === 'wifi') out.push(/\bwifi\b/)
    else if (p.key === 'quiet') out.push(/yen tinh|\bquiet\b/)
    else if (p.key === 'beach') out.push(/\bbien\b|\bbeach\b/)
    else if (p.key === 'central') out.push(/trung tam|\bcentral\b/)
    else if (p.key === 'portability') out.push(/\bnhe\b|\bportable\b|mang di|\btravel\b/)
    else if (p.key === 'battery') out.push(/\bpin\b|\bbattery\b/)
    else if (p.key === 'gpu') out.push(/\bgpu\b|do hoa|\bgraphics\b/)
    else if (p.key.startsWith('cuisine:')) out.push(new RegExp(`\\b${p.key.slice(8)}\\b`))
  }
  for (const u of need.useCases) {
    if (u === 'work') out.push(/lam viec\b|\bwork\b|cong viec/)
    else if (u === 'study') out.push(/\bhoc\b|\bstudy\b/)
    else if (u === 'coding') out.push(/\bcode\b|lap trinh|\bcoding\b/)
    else if (u === 'ai') out.push(/\bai\b|machine learning/)
    else if (u === 'family') out.push(/gia dinh|\bfamily\b/)
    else if (u === 'date') out.push(/hen ho|\bdate\b/)
    else if (u === 'gaming') out.push(/\bgame\b|gaming/)
  }
  if (need.budget) out.push(/ngan sach|\bbudget\b|tam gia|trong tam/)
  return out
}

/**
 * Strip everything that is not prose the user reads.
 *
 * Structured blocks, markdown link targets and bare URLs all contain words and
 * digits that would otherwise read as claims — a Maps URL literally containing
 * "wifi+outdoor" would score as an invented amenity. The money guard already
 * carries this same requirement; both exist for the same reason.
 */
function proseOnly(text: string): string {
  return String(text ?? '')
    .replace(/\[CTA_BUTTONS\][\s\S]*?(\[\/CTA_BUTTONS\]|$)/gi, ' ')
    .replace(/\[TAPPY_PLAN\][\s\S]*?(\[\/TAPPY_PLAN\]|$)/gi, ' ')
    .replace(/\[FOLLOWUPS\][^\n]*?(\[\/FOLLOWUPS\]|\n|$)/gi, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, ' ')   // markdown links: drop text AND target
    .replace(/https?:\/\/\S+/g, ' ')
}

/** Sentence split that never cuts inside a decimal — the C3-B.10.2 lesson. */
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?…])\s+|\n+/).map(s => s.trim()).filter(Boolean)
}

function candidateHasEvidenceFor(attrs: CandidateAttrs, key: string): boolean {
  const v = (attrs as Record<string, unknown>)[key]
  return v !== undefined && v !== false
}

export function analyzeConsultativeReply(
  reply: string,
  ctx: { ranked: RankedResult; need: NeedProfile; pick: Pick | null },
): ReplyAnalysis {
  const prose = proseOnly(reply)
  const sents = sentences(prose)
  const norm = (s: string) => normalizeVN(s.toLowerCase())
  const wholeNorm = norm(prose)

  const entries = ctx.ranked.ranked
  const nameOf = (n: string) => norm(n)

  /**
   * Words that identify nothing on their own.
   *
   * Marketplace titles are long ("Laptop Asus Vivobook 16 A1607QA - MB067W (X1 26
   * 100, 16GB/512GB)") and a model writes the short form. Matching the full title
   * verbatim found NOTHING on real replies, which silently zeroed every verdict.
   * So a candidate is matched on its DISTINCTIVE tokens instead — with generic
   * ones excluded, otherwise "laptop" alone would match every product.
   */
  const GENERIC = new Set(['laptop', 'may', 'tinh', 'xach', 'tay', 'quan', 'nha', 'hang',
    'new', 'like', 'gen', 'pro', 'plus', 'inch', 'ram', 'ssd', 'the', 'and', 'for'])

  const distinctiveTokens = (name: string): string[] =>
    norm(name).split(/[^a-z0-9]+/).filter(t => t.length >= 3 && !GENERIC.has(t) && !/^\d+$/.test(t))

  /**
   * A candidate is mentioned when ≥2 of its distinctive tokens appear.
   *
   * Fewer than two distinctive tokens falls back to EXACT full-name matching.
   * A one-token rule is far too loose for short Vietnamese names: "Quán Gần"
   * reduces to the single token `gan`, which the unrelated phrase "chỗ gần"
   * already contains — so a reply naming only "Quán Xa" was reported as naming
   * both. Token tolerance is for long marketplace titles; short names keep the
   * stricter rule.
   */
  const mentions = (haystack: string, name: string): boolean => {
    const toks = distinctiveTokens(name)
    if (toks.length < 2) return haystack.includes(nameOf(name))
    return toks.filter(t => haystack.includes(t)).length >= 2
  }

  // ── Which candidates are actually discussed, and how much ────────────────
  const perCandidate: Record<string, number> = {}
  const mentionedIn = new Map<string, string[]>() // candidate name → sentences
  for (const e of entries) {
    const key = nameOf(e.candidate.name)
    const hits = sents.filter(s => mentions(norm(s), e.candidate.name))
    if (hits.length > 0) {
      perCandidate[e.candidate.name] = hits.length
      mentionedIn.set(e.candidate.name, hits)
    }
  }
  const candidatesMentioned = Object.keys(perCandidate)

  /**
   * Remove every candidate NAME from a normalized sentence before looking for
   * attributes or requirements in it.
   *
   * Without this, a venue called "Quán Gần" ("Near Cafe") satisfies the
   * `distance` requirement purely by being named — so a reply that never
   * connected anything to the user still scored user-specific. The same trap
   * catches attribute grounding: a "Quán Sao" would read as a star rating.
   */
  const stripNames = (ns: string) => {
    let out = ns
    for (const n of candidatesMentioned) out = out.split(nameOf(n)).join(' ')
    return out
  }

  // ── PC-01 symmetry ───────────────────────────────────────────────────────
  const counts = Object.values(perCandidate).sort((a, b) => b - a)
  const balanced = counts.length >= 2 && counts[1] / counts[0] >= 0.4

  // ── PC-02 grounding: an attribute asserted about a candidate that has none ─
  const ungroundedClaims: string[] = []
  for (const [name, hits] of mentionedIn) {
    const entry = entries.find(e => e.candidate.name === name)!
    for (const s of hits) {
      const ns = norm(s)
      // Only attribute a claim when this sentence names exactly ONE candidate;
      // a comparison sentence naming both cannot be assigned to either.
      const named = candidatesMentioned.filter(n => mentions(ns, n))
      if (named.length === 0) continue
      // A sentence framed as the user's requirement asserts nothing about the
      // product, so it cannot produce an unsupported product claim.
      if (REQUIREMENT_FRAMING.test(ns)) continue
      if (!named.includes(name)) continue
      // Two candidates in one sentence mean different things depending on how
      // they are joined:
      //   COMPARATIVE — "A nhẹ hơn B"      → asserts the attribute of BOTH
      //   LIST        — "A (⭐5), hoặc B"  → the attribute belongs to A only
      // Attributing across a LIST produced false positives on real prose, so a
      // multi-candidate sentence is only attributed when it actually compares.
      if (named.length > 1 && !COMPARATIVE_JOIN.test(ns)) continue
      const body = stripNames(ns)
      for (const [re, attr] of ATTR_MENTION) {
        if (!re.test(body)) continue
        // `stars` is a HOTEL class. In Vietnamese "5 sao" is also the ordinary
        // way to say a rating, so outside hotels it must not be read as a
        // separate unsupported attribute.
        if (attr === 'stars' && entry.candidate.domain !== 'hotel') continue
        if (candidateHasEvidenceFor(entry.candidate.attrs, attr as string)) continue
        const label = `${name}:${ATTR_LABEL[attr as string] ?? attr}`
        if (!ungroundedClaims.includes(label)) ungroundedClaims.push(label)
      }
    }
  }

  // ── PC-03 candidate-specific: two candidates each discussed with a real
  //    attribute, and not merely blanket-praised ────────────────────────────
  let specific = 0
  for (const [name, hits] of mentionedIn) {
    const entry = entries.find(e => e.candidate.name === name)!
    const hasAttr = hits.some(s => {
      const ns = norm(s)
      if (BLANKET.test(ns)) return false
      return ATTR_MENTION.some(([re, attr]) =>
        re.test(stripNames(ns)) && candidateHasEvidenceFor(entry.candidate.attrs, attr as string))
    })
    if (hasAttr) specific++
  }
  const candidateSpecific = specific >= 2

  const reqTerms = requirementTerms(ctx.need)
  const mentionsRequirement = (s: string) => reqTerms.some(re => re.test(stripNames(s)))

  // ── TO-01 trade-off ──────────────────────────────────────────────────────
  const contrastSents = sents.filter(s => CONTRAST.test(norm(s)))
  const tradeoff = {
    present: contrastSents.length > 0,
    candidateSpecific: false,
    userSpecific: false,
    grounded: false,
  }
  for (const s of contrastSents) {
    const ns = norm(s)
    const named = candidatesMentioned.filter(n => mentions(ns, n))
    if (named.length >= 1) tradeoff.candidateSpecific = true
    if (named.length >= 1 && mentionsRequirement(ns)) tradeoff.userSpecific = true
    for (const n of named) {
      const entry = entries.find(e => e.candidate.name === n)!
      if (ATTR_MENTION.some(([re, attr]) => re.test(stripNames(ns)) && candidateHasEvidenceFor(entry.candidate.attrs, attr as string))) {
        tradeoff.grounded = true
      }
    }
  }

  // ── Pick, and whether the model kept the backend's decision ──────────────
  const leanSents = sents.filter(s => LEAN.test(norm(s)))
  let pickName: string | null = null
  for (const s of leanSents) {
    const ns = norm(s)
    const named = candidatesMentioned.filter(n => mentions(ns, n))
    if (named.length >= 1) { pickName = named[0]; break }
  }
  const pick = {
    present: pickName !== null,
    name: pickName,
    matchesBackendPick: pickName !== null && ctx.pick !== null && pickName === ctx.pick.candidate.name,
  }

  // ── WHY-01 ───────────────────────────────────────────────────────────────
  const causalSents = sents.filter(s => CAUSAL.test(norm(s)))
  /**
   * A causal clause counts when the candidate is named in that sentence OR in
   * the one immediately before it.
   *
   * A real explanation routinely spans two sentences — "Mình nghiêng về X."
   * then "Vì ngân sách của bạn…" — and demanding the name inside the causal
   * sentence reported a valid Why as absent. The window is exactly ONE sentence,
   * so a causal clause elsewhere in the reply still does not count.
   */
  const namedInOrBefore = (idx: number): string[] => {
    const here = sents[idx] ? candidatesMentioned.filter(n => mentions(norm(sents[idx]), n)) : []
    if (here.length > 0) return here
    const prev = idx > 0 && sents[idx - 1] ? sents[idx - 1] : ''
    return prev ? candidatesMentioned.filter(n => mentions(norm(prev), n)) : []
  }

  const causalIdx = sents
    .map((s, i) => (CAUSAL.test(norm(s)) ? i : -1))
    .filter(i => i >= 0)

  const why = {
    present: causalIdx.some(i => namedInOrBefore(i).length > 0),
    referencesAttribute: false,
    referencesRequirement: false,
  }
  for (const i of causalIdx) {
    const s = sents[i]
    const ns = norm(s)
    for (const n of namedInOrBefore(i)) {
      const entry = entries.find(e => e.candidate.name === n)!
      if (ATTR_MENTION.some(([re, attr]) => re.test(stripNames(ns)) && candidateHasEvidenceFor(entry.candidate.attrs, attr as string))) {
        why.referencesAttribute = true
      }
      if (mentionsRequirement(ns)) why.referencesRequirement = true
    }
  }

  void wholeNorm
  return {
    candidatesMentioned,
    prosCons: { balanced, candidateSpecific, perCandidate },
    tradeoff,
    pick,
    why,
    ungroundedClaims,
  }
}
