import { normalizeVN } from './intent'
import { sentenceSpans } from './moneyGuard'

// ── THE GROUNDING GATE — detection turned into enforcement ───────────────────
//
// 🚨 THE DEFECT THIS EXISTS FOR, MEASURED ON LOCALHOST. Asked "Tìm nhà hàng
// buffet ở Hà Nội", the reply named four restaurants — Maison Sen Buffet,
// Buffet Poseidon, An Chay - Vegan Buffet, Buffet Chay Veggie Castle — and NONE
// of the four was in the tool result. The provider had returned ten ordinary
// restaurants (no buffet among them), so the model filled the gap from its own
// parametric memory and presented the result as a recommendation.
//
// `ungroundedNamesIn` already FOUND names like these. Its own doc-comment said
// the finding was "never acted on". This module is the acting: the same
// matching rule, applied as a deterministic output gate.
//
// 🔑 WHY DETERMINISTIC AND NOT A PROMPT RULE. A prompt cannot be relied on to
// suppress the very thing the model is motivated to produce — it invents a
// venue precisely because it has been asked for one it cannot find. Only code
// that runs after generation can guarantee the reply names nothing the
// application did not retrieve.
//
// 🔑 WHY IT REMOVES THE CARRYING SENTENCE, NOT A WORD AND NOT A BLOCK. Deleting
// the name alone would leave its claim — "is a great vegetarian buffet option
// with delivery available" — attached to nothing, or read as describing the
// venue above: the claim and its subject go together. Removing the whole block
// (heading → next heading), which this gate did until 2026-09-19, is how a
// single false positive emptied an itinerary and removed the hedge a reply
// existed for — three fixes of the same bug. The action is now proportional:
// exactly the sentence that carries the ungrounded name (owner rule A.1).

/** A marker block is machine content the gate must never cut into. */
const MARKERS = ['[CTA_BUTTONS]', '[FOLLOWUPS]', '[TAPPY_PLAN]', '[TAPPY_SHOPPING]', '[TAPPY_PLACES]']

/** A bolded heading: how the model presents a specific venue as a recommendation. */
const HEADING = /\*\*([^*\n]{3,60})\*\*/g

/**
 * 🚨 A BOLD SEGMENT ENDING IN A COLON IS A LABEL, NEVER A VENUE. Measured 2026-09-19, seven
 * times in one day: "**Lưu ý:** Mình chưa xác nhận được quán nào có phòng riêng…" was read as a
 * venue called "Lưu ý", found in no row, and the whole paragraph — the hedge the reply existed
 * for — was cut; "**Bữa trưa:**" / "**Khám phá phố cổ:**" / "**Thời tiết 26-28/9:**" emptied
 * two itineraries the same way. A label still ENDS the block before it (the text under it is
 * not about the previous venue) but is never itself cut, and it does not count as a grounded
 * venue either — a reply left with only labels still gets the honest fallback line.
 *
 * The colon is the rule. The word list below covers the same labels written WITHOUT a colon
 * ("**Lưu ý**", "**Tổng kết**") — a closed lexicon on purpose, so a real venue that happens to
 * end a line can never be mistaken for a label.
 */
const LABEL_WORDS = /^(?:luu y|goi y|meo|tong ket|ket luan|tom tat|thay the|phuong an(?: thay the| khac)?|lich trinh|chi phi|tong(?: cong| chi phi| uoc tinh)?|thoi tiet|bua (?:sang|trua|toi|xe)|buoi (?:sang|trua|chieu|toi)|(?:sang|trua|chieu|toi)(?: som| muon)?|ngay \d+|note|tips?|summary|alternative|itinerary|budget|weather|day \d+|breakfast|lunch|dinner|morning|afternoon|evening)$/
export function isLabelHeading(shown: string): boolean {
  const s = shown.trim()
  if (/[:：?？!]\s*$/.test(s)) return true
  return LABEL_WORDS.test(normalizeHeading(s))
}

/**
 * 🚨 THE TEST IS INVERTED (owner 2026-09-19, the third G1 recurrence): a bold segment is a VENUE
 * HEADING only when it is PRESENTED as one — a positive shape, not a list of things it is not.
 * Two labels were patched one after the other (":" then "?") and the next one would have been
 * next week's cut. What a venue heading positively looks like, in the model's own output:
 *
 *   `**Name** — 4.5⭐ (2.106 đánh giá), 12 Lê Lợi`      title, then a separator and facts
 *   `- **Name** – góc ấm cúng.`                        list item, separator, description
 *   `**Name**` alone on its line, facts on the next     title line of a block
 *
 *   `**Maison Sen Buffet** buffet cao cấp với hơn 200 món.`  (the pinned production case)
 *
 * So the bold TEXT must be a PROPER NOUN: no sentence punctuation inside (":", "?", "!"), at
 * most ten words, and written the way Vietnamese and English venue names are written — most
 * words capitalised ("Hải Sản Hoàng Gia", "Nhà hàng Nam Phương", "Đường sách Thành phố Hồ Chí
 * Minh", "The Workshop Coffee": ≥ 60 % of the words start with a capital). A bold SENTENCE or
 * section title is written like prose — one capital, the rest lowercase: "Tổng kết", "Bữa trưa",
 * "Điểm cộng lớn nhất", "Bạn muốn ăn gì" — and fails the shape whatever it says. A ONE-word bold
 * is a name only when presented as a title (a separator after it, or a venue fact on its line
 * or the next): "**Daikin** — 4.7⭐" yes, "**Mẹo** bạn nên…" no. The closed label lexicon stays
 * as a last lock for a Title-Cased section label ("Kết Luận").
 *
 * WHY NOT "matches a fetched row" HERE: this gate exists to find the names the model INVENTED,
 * which by definition match no row; a row-match rule would make the gate a no-op. The positive
 * rule is about SHAPE (is this presented as a venue?), and row-matching stays the grounding test.
 */
const VENUE_FACT_RE = /⭐|★|\bđánh giá\b|\bdanh gia\b|\breviews?\b|\d+(?:[.,]\d+)?\s*km\b|\b\d{1,2}[:h]\d{2}\b|\b\d{1,4}[a-zA-Z]?\s+(?:đường|duong|phố|pho|ngõ|hẻm|hem|street|st\.?)\b|\b\d{1,4}[a-zA-Z]?(?:\/\d+)?\s+\p{Lu}\p{L}+\s+\p{Lu}\p{L}+/u
const SEPARATOR_AFTER_RE = /^\s*(?:[—–\-:,(·|.]|$)/
/** Words that count toward the proper-noun test; connectors ("-", "&", "và", "of") are skipped. */
const NAME_TOKEN_RE = /[\p{L}\p{N}]/u
const CONNECTOR_RE = /^(?:&|và|and|of|the|de|la|le|du|-|–|—|\/|\|)$/iu
/**
 * The TEXT half of the shape — is this bold string written like a venue name? Shared with the
 * parsers that have no row set to match against (referenceResolver, historyCompaction).
 * 'name' = proper noun of ≥2 words · 'single' = one capitalised word (a name only when presented
 * as a title — the caller decides with the line context) · 'prose' = not a name.
 */
export function properNounShape(shown: string): 'name' | 'single' | 'prose' {
  const s = shown.trim().replace(/^\s*\d+[.)]\s*/, '')
  if (!/\p{L}/u.test(s)) return 'prose'
  if (/[:：?？!]/.test(s)) return 'prose'
  const tokens = s.split(/\s+/).filter(t => NAME_TOKEN_RE.test(t) && !CONNECTOR_RE.test(t))
  if (tokens.length === 0 || tokens.length > 10) return 'prose'
  if (LABEL_WORDS.test(normalizeHeading(s))) return 'prose'
  const capitalised = tokens.filter(t => /^[\p{Lu}\p{N}]/u.test(t)).length
  if (tokens.length >= 2) return capitalised / tokens.length >= 0.6 ? 'name' : 'prose'
  return capitalised === 1 ? 'single' : 'prose'
}
export function isVenueHeading(shown: string, restOfLine: string, nextLine = ''): boolean {
  const shape = properNounShape(shown)
  if (shape === 'prose') return false
  if (shape === 'name') return true
  // One word: a name only when presented as a title.
  const rest = restOfLine.replace(/\s+$/, '')
  if (SEPARATOR_AFTER_RE.test(rest)) return rest.trim() !== '' || VENUE_FACT_RE.test(nextLine)
  return VENUE_FACT_RE.test(rest)
}

/**
 * Normalise a displayed heading to the form matching compares on.
 *
 * Strips list numbering and trailing punctuation the heading carries, exactly
 * as `ungroundedNamesIn` does — the two must agree, or the gate would suppress
 * something the detector considers grounded, or vice versa.
 */
export function normalizeHeading(shown: string): string {
  const cleaned = shown
    .replace(/^\s*\d+[.)]\s*/, '')
    // A parenthetical after the name ("(chuyên ẩm thực Việt)") is commentary.
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/[:：,;.!?\-–—\s]+$/, '')
    .trim()
  return normalizeVN(cleaned.toLowerCase())
}

/**
 * The venue-type words a name is written with or without — "Nhà Hàng Au
 * Tresor" is "Au Tresor" is "Restaurant Au Tresor". Measured 2026-09-15: the
 * model wrote the row's name with a different prefix and the whole reply was
 * replaced by the not-found line. Only the LEADING type word is stripped, and
 * only when something of substance remains; "Nhà Hàng" alone still fails.
 */
const VENUE_TYPE_PREFIX = /^(?:nha hang|quan an|quan|tiem|cafe|ca phe|coffee|restaurant|bar|pub|club|spa|salon|khach san|hotel|resort|homestay|the)\s+/
function stripVenueType(norm: string): string {
  const stripped = norm.replace(VENUE_TYPE_PREFIX, '').trim()
  return stripped.length >= 3 ? stripped : norm
}

/**
 * Is this heading backed by something the application actually retrieved?
 *
 * 🔑 SUBSTRING BOTH WAYS, DELIBERATELY, AND IT IS THE LENIENT CHOICE. The model
 * legitimately shortens and re-spells provider names — "Nhà Hàng Chay Phương
 * Nam" written as "Chay Phương Nam", "Quán Ăn Ngon - Phan Bội Châu" as "Quán Ăn
 * Ngon". Exact equality would suppress real venues, which is a worse failure
 * than the one being fixed: this gate must never delete a place the user could
 * actually go to. Anything a reasonable reading ties to a retrieved row stays.
 */
export function isGrounded(headingNorm: string, knownNorm: string[]): boolean {
  if (headingNorm.length < 3) return true   // too short to be a venue claim
  const h = stripVenueType(headingNorm)
  return knownNorm.some(k => {
    const kk = stripVenueType(k)
    return k.includes(headingNorm) || headingNorm.includes(k) || kk.includes(h) || h.includes(kk)
  })
}

/** Where machine content starts, so prose removal can never run into it. */
function proseEnd(text: string): number {
  let end = text.length
  for (const m of MARKERS) {
    const i = text.indexOf(m)
    if (i !== -1 && i < end) end = i
  }
  return end
}

export interface GroundingGateResult {
  text: string
  /** Headings removed, as displayed. Recorded so the turn's evidence still reports them. */
  suppressed: string[]
}

/**
 * Remove every venue block the tool result does not support.
 *
 * `knownNames` are the raw provider names for this turn (places, product titles,
 * held candidates). An empty list disables the gate: with nothing to check
 * against, "ungrounded" is not a finding — the same rule `ungroundedNamesIn`
 * already applies, and it is what keeps chitchat turns untouched.
 */
/**
 * What the PLACE TOOL did this turn — three states that must never collapse into two.
 *
 * 🚨🚨 `not_run` AND `empty` BOTH ARRIVE HERE WITH ZERO KNOWN NAMES, AND THEY MEAN THE
 * OPPOSITE OF EACH OTHER.
 *
 *   · `not_run`      — no place retrieval happened. A recall turn ("nhắc lại 3 chỗ vừa rồi"),
 *                      a follow-up, or a conversation that is not about places at all. The
 *                      venues in the text are grounded in the HISTORY, and this gate has no
 *                      business touching them.
 *   · `empty`        — retrieval RAN and found nothing. Any venue in the text was invented
 *                      this turn, because there was nothing to invent it from.
 *   · `has_results`  — retrieval returned rows; `knownNames` carries them.
 *
 * Collapsing the first two is exactly the live failure this type exists to close: asked for
 * "spa tốt Hà Nội", the provider returned zero rows, and the reply named four spas with
 * addresses and prices. The gate let it through because its only signal was "no known names",
 * which it correctly reads as "nothing to check against" on a recall turn.
 */
export type PlaceSearchStatus = 'not_run' | 'empty' | 'has_results'

export interface GroundingGateOptions {
  /** Defaults to `not_run`, which preserves the pre-existing behaviour exactly. */
  placeSearch?: PlaceSearchStatus
  /**
   * B4 (S7, 2026-09-20): whether a decision card will actually render for this turn. `false`
   * when rows were fetched but every candidate was rejected (a shopping marker never built):
   * "the options I verified are on the card below" then points at nothing, and the honest line
   * is that no option in the results was a close enough match. Undefined = unknown = as before.
   */
  cardRenders?: boolean
}

export function suppressUngroundedVenues(
  text: string,
  knownNames: string[],
  lang = 'vi',
  opts: GroundingGateOptions = {},
): GroundingGateResult {
  if (!text) return { text, suppressed: [] }
  const knownNorm = knownNames
    .map(n => normalizeVN((n || '').trim().toLowerCase()))
    .filter(Boolean)
  /**
   * 🚨 THE EARLY RETURN IS CONDITIONAL NOW, AND THAT IS THE WHOLE FIX.
   *
   * "No names to check against" is a reason to stand down ONLY when nothing was retrieved
   * this turn. When retrieval ran and came back empty, an empty `knownNorm` is not absence
   * of evidence — it IS the evidence, and every venue heading below is ungrounded by
   * construction. Falling through with `knownNorm` empty makes `isGrounded` false for every
   * heading, so they are all cut and `notFoundLine` replaces them.
   */
  if (knownNorm.length === 0 && opts.placeSearch !== 'empty') return { text, suppressed: [] }

  const limit = proseEnd(text)
  const prose = text.slice(0, limit)
  const tail = text.slice(limit)

  // Every heading with its offset, in order — the block boundaries.
  const heads: { shown: string; at: number; start: number; end: number; grounded: boolean; label: boolean }[] = []
  for (const m of prose.matchAll(HEADING)) {
    const at = m.index ?? 0
    // A block starts at the beginning of the heading's own line, so the removal
    // does not leave a dangling fragment of whatever preceded it.
    const lineStart = prose.lastIndexOf('\n', at) + 1
    // 🚨 ONLY A LINE-LEADING BOLD SPAN IS A VENUE HEADING. Bold used for emphasis
    // inside a sentence — "Quán này **rất ngon** nhé" — is not a recommendation,
    // and treating it as one deleted the sentence around it. Caught by
    // `bold used for emphasis` in the tests, which failed against the first
    // version of this loop. Only a list bullet or numbering may precede it.
    const before = prose.slice(lineStart, at)
    if (!/^\s*(?:[-*+•]\s*|\d+[.)]\s*)?$/.test(before)) continue
    const lineEnd = prose.indexOf('\n', at) === -1 ? prose.length : prose.indexOf('\n', at)
    const restOfLine = prose.slice(at + m[0].length, lineEnd)
    const nextLine = prose.slice(lineEnd + 1).split('\n').find(l => l.trim() !== '') ?? ''
    // POSITIVE MATCH FIRST (owner 2026-09-19): a bold that matches a fetched row is a venue name
    // whatever its spelling ("**bún bò Huế cô Ba**" lowercase is still the row). Only an
    // UNMATCHED bold is judged by the presentation shape — and a bold that is not presented as a
    // venue is prose: it still ends the block before it and is never cut.
    const grounded = isGrounded(normalizeHeading(m[1]), knownNorm)
    heads.push({ shown: m[1], at, start: lineStart, end: prose.length, grounded, label: !grounded && !isVenueHeading(m[1], restOfLine, nextLine) })
  }
  for (let i = 0; i < heads.length - 1; i++) heads[i].end = heads[i + 1].start
  if (heads.length === 0) return { text, suppressed: [] }

  /**
   * 🚨 THE ACTION IS PROPORTIONAL (owner 2026-09-19, after three fixes of the same bug): an
   * ungrounded name removes ONLY the sentence that carries it — never the paragraph, never the
   * block down to the next heading. A false positive (a Title-Cased section label the shape rule
   * reads as a name) now costs at most that one sentence instead of the rest of the reply
   * (measured T6: an entire itinerary; F8 memory pass: the hedge the reply existed for). When the
   * carrying sentence cannot be determined the text is KEPT and the case is logged — never cut
   * wide.
   */
  const spans = sentenceSpans(prose)
  const suppressed: string[] = []
  const cuts: { start: number; end: number }[] = []
  let groundedRemain = 0
  for (const h of heads) {
    if (h.label) continue
    if (h.grounded) { groundedRemain++; continue }
    const span = spans.find(([a, b]) => h.at >= a && h.at < b)
    if (!span) {
      console.log(JSON.stringify({ type: 'tappyai_guard', guard: 'grounding_gate', step: 'kept_no_sentence', heading: h.shown.trim() }))
      continue
    }
    suppressed.push(h.shown.trim())
    // The carrying sentence, from the start of its line (a list bullet goes with it) to its end —
    // and never past the block boundary the next heading starts.
    const lineStart = prose.lastIndexOf('\n', span[0]) + 1
    cuts.push({ start: Math.min(h.start, lineStart), end: Math.min(span[1], h.end) })
  }
  if (suppressed.length === 0) return { text, suppressed: [] }

  // Apply back-to-front so earlier offsets stay valid.
  let out = prose
  for (const c of cuts.reverse()) out = out.slice(0, c.start) + out.slice(c.end)
  out = out.replace(/[ \t]+\n/g, '\n').replace(/(^|\n)[ \t]+/g, '$1').replace(/\n{3,}/g, '\n\n').trimEnd()
  // With sentence-level cuts a grounded venue can be named mid-sentence rather than as a
  // heading ("Mình chọn **Cơm Niêu** …"); the honest fallback line is for a reply with NO
  // grounded venue left anywhere, not for one whose pick simply was not a heading.
  const outNorm = normalizeVN(out.toLowerCase())
  if (groundedRemain === 0 && knownNorm.some(k => k.length >= 4 && outNorm.includes(k))) groundedRemain = 1

  // 🚨 A BUTTON FOR A VENUE THAT DOES NOT EXIST IS THE SAME LIE AS A SENTENCE.
  // While the model still authors [CTA_BUTTONS] (SERVER_AUTHORED_CTA is off), a
  // suppressed venue would otherwise keep its ordering buttons.
  const cleanedTail = stripCtaButtonsFor(tail, suppressed)

  // Nothing verifiable left to show: say so rather than leave an answer that
  // promised recommendations and now has none. Never invent a substitute.
  /**
   * 🚨 A LEAD-IN WITHOUT ITS LIST IS A PROMISE THE REPLY NO LONGER KEEPS.
   *
   * A block starts at its HEADING's line, which is what stops a cut from eating
   * the fragment before it — but that also means a line INTRODUCING the list sits
   * outside every cut and survives it. Measured on the phone UAT 2026-09-09:
   *
   *     Tuy nhiên, quán này hiện chưa có số điện thoại công khai trong hệ thống.
   *     Bạn có thể:
   *     <venue headings — all suppressed>
   *
   * left the reply reading "Bạn có thể:" and then the not-found line: a colon
   * promising options, followed by the news that there are none.
   *
   * 🔑 THE `$` ANCHOR IS THE WHOLE CONDITION. A colon line is stripped only
   * when it now ENDS the prose — i.e. everything it introduced is gone. A
   * lead-in that still has a grounded venue under it does not match, so no
   * separate `groundedRemain` test is needed.
   *
   * 🚨 AND SUCH A GUARD WOULD BE WRONG, NOT MERELY REDUNDANT. A reply can keep
   * an earlier grounded venue and still END on a lead-in whose only item was
   * cut; scoping to "nothing survived" would leave that one dangling. The
   * first version of this code had that guard and it SURVIVED mutation because
   * it was equivalent — the case that distinguishes it is now a test.
   */
  const withoutLeadIn = out.replace(/(?:^|\n)[^\n]*:[ \t]*$/, '').trimEnd()
  // CCP Phase 8 (owner-like UAT R1, P2-5): when the prose named venues the tool did not return
  // but the tool DID return venues, "found nothing" contradicts the card rendered right under
  // it. The truthful line is then that the verified places are on the card — the not-found
  // line is kept for the case it was written for: retrieval came back empty.
  const fallback = knownNorm.length > 0 ? (opts.cardRenders === false ? noMatchLine(lang) : seeCardLine(lang)) : notFoundLine(lang)
  const body = groundedRemain === 0 ? `${withoutLeadIn}\n\n${fallback}`.trim() : withoutLeadIn
  return { text: `${body}${cleanedTail}`, suppressed }
}

/** Honest fallback. A local pair, like `relatedVideoLabel` — no new i18n keys. */
function notFoundLine(lang: string): string {
  return lang === 'vi'
    ? 'Mình chưa tìm thấy địa điểm nào đủ dữ liệu để giới thiệu cho yêu cầu này.'
    : "I couldn't find a place with enough verified data to recommend for this request."
}

/** B4: rows came back, the prose named none of them, and no card will render — say what would help next, invent nothing. */
function noMatchLine(lang: string): string {
  return lang === 'vi'
    ? 'Mình chưa tìm được lựa chọn nào trong kết quả đủ khớp để giới thiệu — bạn cho mình biết thêm hãng hoặc tầm giá, mình tìm lại ngay.'
    : 'I could not find an option in the results that matches closely enough to recommend — tell me the brand or the budget and I will search again.'
}

/** The prose named venues/products the search did not return; what it DID return is on the card (places or products). */
function seeCardLine(lang: string): string {
  return lang === 'vi'
    ? 'Những lựa chọn mình xác minh được cho yêu cầu này nằm ở thẻ bên dưới.'
    : 'The options I could verify for this request are on the card below.'
}

/**
 * Drop CTA buttons whose label names a suppressed venue.
 *
 * Conservative by construction: a malformed or unparseable block is returned
 * untouched rather than mangled, and only the `buttons` array is rewritten —
 * the wire shape all three clients parse is preserved exactly.
 */
export function stripCtaButtonsFor(tail: string, suppressed: string[]): string {
  if (!tail || suppressed.length === 0) return tail
  const open = tail.indexOf('[CTA_BUTTONS]')
  if (open === -1) return tail
  const from = open + '[CTA_BUTTONS]'.length
  const close = tail.indexOf('[/CTA_BUTTONS]', from)
  const end = close === -1 ? tail.length : close
  const raw = tail.slice(from, end).trim()
  const bad = suppressed.map(s => normalizeVN(s.toLowerCase())).filter(s => s.length >= 3)
  try {
    const parsed = JSON.parse(raw) as { buttons?: Array<{ label?: string; url?: string }> }
    if (!Array.isArray(parsed.buttons)) return tail
    const kept = parsed.buttons.filter(b => {
      const hay = normalizeVN(`${b?.label ?? ''} ${decodeURIComponent(b?.url ?? '')}`.toLowerCase())
      return !bad.some(s => hay.includes(s))
    })
    if (kept.length === parsed.buttons.length) return tail
    // Every button belonged to a suppressed venue — drop the block entirely
    // rather than emit an empty one the clients would render as a bare row.
    const replacement = kept.length === 0
      ? ''
      : `[CTA_BUTTONS]${JSON.stringify({ ...parsed, buttons: kept })}[/CTA_BUTTONS]`
    return tail.slice(0, open) + replacement + (close === -1 ? '' : tail.slice(close + '[/CTA_BUTTONS]'.length))
  } catch {
    return tail
  }
}
