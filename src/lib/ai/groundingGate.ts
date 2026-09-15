import { normalizeVN } from './intent'

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
// 🔑 WHY IT REMOVES BLOCKS, NOT WORDS. Deleting a name alone would leave the
// sentences around it — "is a great vegetarian buffet option with delivery
// available" — now attached to nothing, or worse, read as describing the venue
// above. The claim and its subject are removed together.

/** A marker block is machine content the gate must never cut into. */
const MARKERS = ['[CTA_BUTTONS]', '[FOLLOWUPS]', '[TAPPY_PLAN]', '[TAPPY_SHOPPING]', '[TAPPY_PLACES]']

/** A bolded heading: how the model presents a specific venue as a recommendation. */
const HEADING = /\*\*([^*\n]{3,60})\*\*/g

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
  const heads: { shown: string; start: number; end: number }[] = []
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
    heads.push({ shown: m[1], start: lineStart, end: prose.length })
  }
  for (let i = 0; i < heads.length - 1; i++) heads[i].end = heads[i + 1].start
  if (heads.length === 0) return { text, suppressed: [] }

  const suppressed: string[] = []
  const cuts: { start: number; end: number }[] = []
  let groundedRemain = 0
  for (const h of heads) {
    if (isGrounded(normalizeHeading(h.shown), knownNorm)) { groundedRemain++; continue }
    suppressed.push(h.shown.trim())
    cuts.push({ start: h.start, end: h.end })
  }
  if (suppressed.length === 0) return { text, suppressed: [] }

  // Apply back-to-front so earlier offsets stay valid.
  let out = prose
  for (const c of cuts.reverse()) out = out.slice(0, c.start) + out.slice(c.end)
  out = out.replace(/\n{3,}/g, '\n\n').trimEnd()

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
  const body = groundedRemain === 0 ? `${withoutLeadIn}\n\n${notFoundLine(lang)}`.trim() : withoutLeadIn
  return { text: `${body}${cleanedTail}`, suppressed }
}

/** Honest fallback. A local pair, like `relatedVideoLabel` — no new i18n keys. */
function notFoundLine(lang: string): string {
  return lang === 'vi'
    ? 'Mình chưa tìm thấy địa điểm nào đủ dữ liệu để giới thiệu cho yêu cầu này.'
    : "I couldn't find a place with enough verified data to recommend for this request."
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
