import { normalizeVN } from '../intent'

// ── Deterministic Shopping specification guard ─────────────────────────────
//
// WHY THIS EXISTS, in one line: a prompt is an instruction, not a guarantee.
//
// The Shopping grounding block measurably reduced unsupported weight/battery
// claims and measurably failed to eliminate them — a later live run still
// asserted both. So the rule moves out of the prompt and into code that runs
// AFTER generation and BEFORE the user sees anything. Model compliance is no
// longer required; the invariant is enforced.
//
//     NO CANDIDATE EVIDENCE  →  NO ASSERTION OF THAT ATTRIBUTE
//
// Same shape as the money guard, which does exactly this for prices: pure
// function, no network, no model, every surviving character taken from the
// input (the one exception is a fixed evidence-limitation note, which states a
// fact about our data rather than about a product).
//
// The counterpart matters as much as the rule: a USER REQUIREMENT is not
// evidence. "Bạn ưu tiên máy nhẹ" must survive untouched — deleting it would
// make Tappy unable to acknowledge what the user asked for.

export interface SpecEvidence {
  name: string
  weightKg?: number
  batteryHours?: number
}

/** The attribute classes this guard governs. */
type SpecAttr = 'weight' | 'battery'

// The weight axis has TWO directions. Only "light" was covered, so a live reply
// asserting "Slightly heavier than ThinkPad but still portable" passed straight
// through — an unsupported weight claim wearing the opposite adjective.
//
// `nang` needs the same care `gia` needed in the analyzer: "hiệu năng"
// normalizes to "hieu nang", so a bare \bnang\b would read every performance
// remark as a weight claim.
const ATTR_PATTERNS: ReadonlyArray<[SpecAttr, RegExp]> = [
  // `\bkg\b` alone missed the no-space form. A digit followed by a letter is not
  // a word boundary, so PRODUCTION emitted "chỉ 0.98kg" — a two-decimal number
  // nothing in the evidence supports — while "0.98 kg" was caught.
  ['weight', /\bnhe\b|\bnhe hon\b|trong luong|\bkg\b|\d\s*kg\b|lightweight|\blighter\b|\blight\b|\bweighs?\b|\bweight\b|\bheavy\b|\bheavier\b|(?<!hieu\s)\bnang\b|\bmong\b|\bgon\b|\bportable\b|portability|\bslim\b/],
  ['battery', /\bpin\b|thoi luong pin|\bbattery\b|batteries/],
]

/**
 * Phrasing that DENIES having the information. The grounding contract asks the
 * model to say exactly this — "mình chưa có dữ liệu về trọng lượng" — and the
 * first live run showed the guard deleting the admission, which removed the
 * honest disclaimer and the grounded trade-off along with it.
 *
 * An absence statement asserts nothing about the product, so it is never a
 * claim, whatever attribute noun it happens to contain.
 */
const EVIDENCE_ABSENCE =
  /chua (co|xac nhan|ro|biet|tim)|khong (co|ro|biet) (du lieu|thong tin)?|chua co (du lieu|thong tin)|khong ro\b|can kiem tra|\bno (data|info|information)\b|\bnot (available|confirmed|listed|specified)\b|\bcould ?n[o']?t confirm\b|\bunknown\b|\bunverified\b|\bdo(es)? not (say|list|specify)\b/

/**
 * Phrasing that frames an attribute as the USER'S wish rather than a product
 * fact. A sentence carrying one of these asserts nothing about any candidate.
 */
const REQUIREMENT_FRAMING =
  /\bban (uu tien|can|muon|thich|yeu cau|thuong xuyen)|vi ban\b|theo yeu cau|ban dang tim|(yeu cau|nhu cau|tieu chi|mong muon|uu tien|ngan sach) cua ban|\byou (want|need|prefer|asked|care)\b|since you\b|because you\b|your (requirement|priority|preference|need|criteri)/

/** Words that make a two-candidate sentence a comparison rather than a list. */
const COMPARATIVE = /\bhon\b|\bthan\b|\bvs\.?\b|\bversus\b|so voi|compared to/

/**
 * Tokens that identify no product on their own.
 *
 * Marketplace titles embed the CATEGORY as well as the model — "… Laptop Văn
 * Phòng 16 inch …". A category is what the user asks for in ordinary speech, so
 * treating its words as identifying let the generic phrase "laptop văn phòng"
 * pick out one specific ThinkBook and redact a sentence about it.
 */
const GENERIC = new Set(['laptop', 'may', 'tinh', 'xach', 'tay', 'new', 'like', 'gen',
  'pro', 'plus', 'inch', 'ram', 'ssd', 'the', 'and', 'for', 'core', 'win',
  // category descriptors, not model names
  'van', 'phong', 'ban', 'gaming', 'sinh', 'vien', 'do', 'hoa', 'netbooks',
  'notebook', 'computer', 'desktop', 'office', 'student'])

const norm = (s: string) => normalizeVN(String(s ?? '').toLowerCase())

function distinctiveTokens(name: string): string[] {
  return norm(name).split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3 && !GENERIC.has(t) && !/^\d+$/.test(t))
}

/**
 * Is this candidate named here?
 *
 * Long marketplace titles are matched on ≥2 distinctive tokens, because a model
 * writes the short form. Names with fewer than two distinctive tokens fall back
 * to exact matching — a single short token produces false positives (the lone
 * token `gan` of "Quán Gần" appears inside the unrelated phrase "chỗ gần").
 */
/** A token long enough to name a product by itself: "thinkpad", "vivobook". */
const STRONG_TOKEN = 6

function names(haystack: string, candidateName: string): boolean {
  const toks = distinctiveTokens(candidateName)
  // A name made ENTIRELY of generic words ("Máy") identifies nothing — matching
  // it would let the ordinary noun in "Máy này rất nhẹ" redact a real sentence.
  if (toks.length === 0) return false
  const hits = toks.filter(t => haystack.includes(t))
  if (hits.length >= 2) return true
  // ONE token is enough when it is long enough to be a model name rather than a
  // word. A live reply wrote "ThinkPad is built for business travel —
  // lightweight, reliable battery" and escaped the guard on the two-token rule,
  // while the short-token risk it was protecting against is unchanged: `gan`
  // (3 chars, from "Quán Gần") still cannot match inside "chỗ gần".
  if (hits.length === 1 && hits[0].length >= STRONG_TOKEN) return true
  if (toks.length === 1) return haystack.includes(norm(candidateName))
  return false
}

function hasEvidence(c: SpecEvidence, attr: SpecAttr): boolean {
  const v = attr === 'weight' ? c.weightKg : c.batteryHours
  return typeof v === 'number' && Number.isFinite(v) && v > 0
}

/**
 * Delimiter for a vaulted span.
 *
 * This was a literal NUL byte in the source — functional, because the template
 * and the regex agreed, but it made the file read as BINARY to grep and to any
 * tool that classifies by content. A private-use code point written as an escape
 * keeps the file plain UTF-8 and still cannot collide with model prose, which a
 * space-delimited index could (" 27 " appears in real replies).
 */
const MARK = '\uE000'
const RESTORE_RE = /\uE000(\d+)\uE000/g

/** Structured blocks and URLs are never prose and are never rewritten. */
const PROTECTED = /(\[CTA_BUTTONS\][\s\S]*?\[\/CTA_BUTTONS\]|\[FOLLOWUPS\][^\n]*?(?:\[\/FOLLOWUPS\]|$)|\[TAPPY_PLAN\][\s\S]*?\[\/TAPPY_PLAN\]|!?\[[^\]]*\]\([^)]*\)|https?:\/\/\S+)/g

/** Sentence split that never cuts inside a decimal — the C3-B.10.2 lesson. */
function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?…])\s+/)
}

/** Clause split that keeps its delimiters, so removal can be surgical. */
function splitClauses(sentence: string): string[] {
  return sentence.split(/(?<=[,;—–])\s+|\s+(?=\bvà\b|\bnhưng\b|\band\b|\bbut\b)/i)
}

const VI_NOTE = 'Nguồn hiện tại chưa có thông tin về thông số này.'
const EN_NOTE = 'The current source has no data on this specification.'

/**
 * Remove candidate-specific assertions about attributes the evidence does not
 * carry.
 *
 * Returns the guarded text plus the list of blocked `"<candidate>:<attr>"`
 * claims, so callers can log or assert on exactly what was stopped.
 */
export function guardSpecClaimsInText(
  text: string,
  candidates: SpecEvidence[],
): { text: string; removed: string[] } {
  const removed: string[] = []
  const input = String(text ?? '')
  if (!input.trim() || !Array.isArray(candidates) || candidates.length === 0) {
    return { text: input, removed }
  }

  // Lift protected spans out so nothing inside them can be matched or rewritten,
  // then put them back byte-identical.
  const vault: string[] = []
  const masked = input.replace(PROTECTED, m => {
    vault.push(m)
    return `${MARK}${vault.length - 1}${MARK}`
  })
  const restore = (s: string) => s.replace(RESTORE_RE, (_, i) => vault[Number(i)])

  /**
   * The sentence as it reads for IDENTIFICATION only.
   *
   * A real Shopping answer writes each candidate name as a markdown link, so the
   * vault hid the one place the name ever appeared and the guard went inert on
   * every real reply — measured on a deployed build, which asserted "pin khá lâu"
   * with no battery evidence behind it. Never REWRITING inside a link is the
   * invariant; refusing to READ it was a mistake.
   *
   * Only the LABEL comes back, never the URL: a query string is not prose, and
   * matching attribute words inside one would be noise.
   */
  const identityFor = (s: string) => s.replace(RESTORE_RE, (_, i) => {
    const span = vault[Number(i)]
    if (span === undefined) return ' '
    const md = span.match(/^!?\[([^\]]*)\]\([^)]*\)$/)
    return md ? ` ${md[1]} ` : ' '
  })

  /**
   * The candidate the reply is currently talking about.
   *
   * A real answer names the product once, as a linked heading, and describes it
   * in the sentences that follow: "**[HP 14 ep1137TU](…)** — 24.89 triệu" then
   * "Giá rẻ nhất nhóm, … nhẹ & pin lâu". Read sentence-by-sentence in isolation
   * the second one names nobody, so its claims were attributed to nobody and
   * survived. It plainly asserts something about the HP.
   *
   * The subject therefore persists until a different candidate is named, and
   * never starts from nothing — a reply that has not named anyone yet cannot
   * have claims attributed to it.
   */
  let subject: SpecEvidence[] = []

  const guardedSentences = splitSentences(masked).map(sentence => {
    const ns = norm(sentence)
    if (!ns.trim()) return sentence

    const here = candidates.filter(c => names(norm(identityFor(sentence)), c.name))
    if (here.length > 0) subject = here
    const named = here.length > 0 ? here : subject
    if (named.length === 0) return sentence

    // Framing and absence are decided PER CLAUSE, not per sentence.
    //
    // A whole-sentence exemption cuts both ways and got both wrong live: it let
    // "…if you need more power…, and known for decent battery life" through
    // because of the opening clause, while a sentence that merely OPENED with a
    // requirement was exempted even where it went on to assert the product.
    //
    // Framing also CARRIES across a list: "Based on your need for light weight,
    // long battery, and good price" states three requirements, and only the
    // first clause carries the marker. It stops at any clause that names a
    // candidate, because naming a product re-anchors the sentence on it — which
    // is what separates that list from "…if you need more power…, and known for
    // decent battery life", where the claim rides on a named ThinkBook.
    const clauses = splitClauses(sentence)
    let carry = false
    let anchored = false
    const inert = clauses.map(c => {
      const nc = norm(c)
      const own = REQUIREMENT_FRAMING.test(nc) || EVIDENCE_ABSENCE.test(nc)
      // Once the sentence has named a product it is ABOUT that product, so no
      // later clause may inherit framing — "**G5+** — … if you need more
      // power…, and known for decent battery life" must not shield the battery
      // claim. A clause carrying its own framing is still exempt.
      if (candidates.some(cd => names(norm(identityFor(c)), cd.name))) { anchored = true; carry = false; return own }
      if (own && !anchored) carry = true
      return own || carry
    })
    // A sentence made ENTIRELY of framing/absence clauses asserts nothing.
    if (inert.every(Boolean)) return sentence

    // Which attributes does this sentence ASSERT? Only a clause that is neither
    // user framing nor an admission of missing data can assert anything.
    const asserts = (re: RegExp) => clauses.some((c, i) => !inert[i] && re.test(norm(c)))

    const unsupported: SpecAttr[] = []
    for (const [attr, re] of ATTR_PATTERNS) {
      if (!asserts(re)) continue
      // A COMPARISON asserts the attribute of EVERY candidate it names, so all
      // of them must carry evidence. One-sided evidence cannot support
      // "A is lighter than B" — B's weight is exactly what is unknown.
      const mustHaveAll = named.length > 1 && COMPARATIVE.test(ns)
      const lacking = named.filter(c => !hasEvidence(c, attr))
      if (lacking.length === 0) continue
      if (mustHaveAll || lacking.length === named.length || named.length === 1) {
        unsupported.push(attr)
        for (const c of lacking) {
          const label = `${c.name}:${attr}`
          if (!removed.includes(label)) removed.push(label)
        }
      }
    }
    if (unsupported.length === 0) return sentence

    // Surgical removal: drop only the clauses carrying an unsupported claim, so
    // grounded content in the same sentence (price, store, rating) survives.
    const kept = clauses.filter((clause, i) => {
      if (inert[i]) return true          // user framing / "no data" — never a claim
      const nc = norm(clause)
      return !unsupported.some(attr => ATTR_PATTERNS.find(([a]) => a === attr)![1].test(nc))
    })

    if (kept.length === 0) return ''      // whole sentence was the claim

    // Removing a clause must not leave the sentence ungrammatical: dropping the
    // first clause strands the conjunction that joined it ("and the rating is
    // excellent."), and dropping the last takes the full stop with it.
    let joined = kept.join(' ')
      .replace(/\s+([,;.!?])/g, '$1')
      .replace(/[,;]\s*$/, '.')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .replace(/^(?:and|but|or|va|nhung|hoac)\s+/i, '')
      // A dash or colon INTRODUCES what follows. When the clause it introduced was
      // the ungrounded one, it is left pointing at nothing: the deployed build
      // emitted "Nhược điểm là SSD 256GB chật —." Same class as the stranded
      // conjunction, at the other end of the sentence.
      .replace(/\s*[—–:]\s*$/, '')
    if (/[.!?…:]$/.test(sentence.trim()) && !/[.!?…:]$/.test(joined)) joined += '.'
    // Dropping the opening clause promotes whatever followed to the start of the
    // sentence, and it was written mid-sentence: "Máy nhẹ, phù hợp di chuyển."
    // became "phù hợp di chuyển." on a deployed build. Only restored when the
    // ORIGINAL opened with a capital, so prose that was already lower-case stays
    // as the model wrote it.
    if (/^\p{Lu}/u.test(sentence.trim()) && /^\p{Ll}/u.test(joined)) {
      joined = joined[0].toUpperCase() + joined.slice(1)
    }
    return joined
  })

  let out = guardedSentences.filter(s => s.trim()).join(' ').replace(/\s{2,}/g, ' ').trim()

  // Never emit nothing. A reply reduced to silence is the failure mode the money
  // guard shipped once (`if (finalText)` → an empty assistant turn), so if every
  // sentence was a claim, state the evidence limitation instead of inventing a
  // replacement fact.
  if (!out) out = /[À-ỹ]/.test(input) ? VI_NOTE : EN_NOTE

  return { text: restore(out), removed }
}
