import { z } from 'zod'
import type { Candidate, ConversationState } from './conversationState'
import { candidateMatchesRef, isRejected } from './conversationState'
import { buildGroundedCandidateFactSentence, comparableOn, groundCandidate } from './groundedFacts'

/**
 * D3: the decision turn's facts are composed here, not written by the model.
 *
 * WHY. Every earlier attempt left the model holding the pen. It was told which
 * facts existed, then told which were UNKNOWN, then handed pre-written fact
 * sentences — and it still produced "có WiFi", "quán nhỏ", "mở cả ngày" for
 * candidates whose evidence was an address and a map link. Labelling absence
 * never removes the authoring.
 *
 * So on a decision turn the model no longer writes candidate prose at all. It
 * returns IDs and CLOSED reason codes through `submit_recommendation`; this
 * module validates both against the candidate's own evidence and renders every
 * user-visible factual sentence. A code the evidence cannot support is dropped,
 * not softened — so an unsupported claim has no path to the user.
 */

/** Codes the server can verify. Anything else is rejected, never rendered. */
export const REASON_CODES = [
  'SATISFIES_HARD_CONSTRAINT',
  'MATCHES_PREFERENCE',
  'BETTER_OPENING_HOURS',
  'BETTER_RATING',
  'BETTER_PRICE_LEVEL',
  'BETTER_PRICE',
  'BETTER_SPEC',
  'BETTER_CONDITION',
  'CLOSER',
  'PREFERENCE_UNVERIFIED',
] as const
export type ReasonCode = (typeof REASON_CODES)[number]

/** Which evidence dimension each comparative code needs on BOTH candidates. */
const COMPARATIVE_DIMENSION: Partial<Record<ReasonCode, string>> = {
  BETTER_OPENING_HOURS: 'opening_hours',
  BETTER_RATING: 'rating',
  BETTER_PRICE_LEVEL: 'price_level',
  BETTER_PRICE: 'price',
  BETTER_CONDITION: 'condition',
  CLOSER: 'distance_km',
}

/** Preferences that can be asserted of a venue, and the fact that proves it. */
const PREFERENCE_EVIDENCE: Record<string, string> = {
  wifi: 'wifi',
  outdoor: 'outdoor_seating',
  vegetarian: 'vegetarian',
}

/**
 * Preference names PREFERENCE_UNVERIFIED may carry.
 *
 * That code renders its key into a sentence, and an unmapped key renders
 * verbatim — which would be a free-text channel straight through the tool,
 * the one thing this design exists to close. A key is allowed only if we have
 * a phrasing for it, or if the user themselves stated it as a preference.
 */
const NAMED_PREFERENCES = new Set([
  'quiet', 'wifi', 'cheaper', 'closer', 'battery', 'outdoor', 'vegetarian',
])

export interface ReasonEntry { code: string; candidateId?: string; otherId?: string; key?: string }

export interface RecommendationDecision {
  recommendedId: string
  alternativeId?: string
  reasonCodes: ReasonEntry[]
  /** Why the pick is not free — validated exactly like reasonCodes. */
  tradeoffCodes?: ReasonEntry[]
}

/**
 * The tool's parameter schema.
 *
 * Anthropic enforces this one for real: `parameters` becomes `input_schema` on
 * the request AND the arguments are re-validated locally by the SDK's
 * `parseToolCall`, so a code outside the enum cannot arrive as a tool call.
 * `validateDecision` is still the authority — the schema only keeps the shape
 * honest, it knows nothing about which candidate has which evidence.
 *
 * `describe` text is deliberately about IDs and codes only. There is no free
 * string field anywhere in here: a field the model can write prose into is a
 * field whose prose reaches the user.
 */
export const RECOMMENDATION_SCHEMA = z.object({
  recommendedId: z.string().describe('ID cua lua chon ban chot (lay dung tu danh sach)'),
  alternativeId: z.string().optional().describe('ID cua lua chon thay the, neu co'),
  reasonCodes: z.array(z.object({
    code: z.enum(REASON_CODES).describe('Ma ly do'),
    candidateId: z.string().optional().describe('Lua chon ma ly do nay noi ve'),
    otherId: z.string().optional().describe('Lua chon bi so sanh (bat buoc voi cac ma BETTER_*/CLOSER)'),
    key: z.string().optional().describe('Ten truong du lieu hoac ten uu tien'),
  })).describe('Cac ly do chon. De trong neu bang chung khong du.'),
  tradeoffCodes: z.array(z.object({
    code: z.enum(REASON_CODES),
    candidateId: z.string().optional(),
    otherId: z.string().optional(),
    key: z.string().optional(),
  })).optional().describe('Diem danh doi cua lua chon da chot'),
})

export interface ValidatedReason {
  code: ReasonCode
  candidate: Candidate
  other?: Candidate
  key?: string
}

export interface ValidatedDecision {
  recommended: Candidate | null
  alternative?: Candidate
  reasons: ValidatedReason[]
  tradeoffs: ValidatedReason[]
  /** Codes thrown away, with why — surfaced so leakage attempts stay measurable. */
  dropped: Array<{ code: string; why: string }>
}

const factOf = (c: Candidate, field: string): string | number | undefined => {
  const v = c.facts[field]
  return v !== undefined && v !== null && String(v).trim() !== '' ? v : undefined
}

/**
 * Turn the model's structured answer into something renderable, dropping
 * anything the evidence does not support.
 *
 * Rejected candidates are refused outright: they may not be recommended and may
 * not supply a fact, which keeps R1/R2 intact on this path too.
 */
export function validateDecision(
  decision: RecommendationDecision,
  state: ConversationState,
  ranked: Candidate[],
): ValidatedDecision {
  const dropped: ValidatedDecision['dropped'] = []
  const eligible = ranked.filter(c => !isRejected(c, state))
  const find = (id?: string) =>
    id ? eligible.find(c => candidateMatchesRef(c, id)) : undefined

  let recommended = find(decision.recommendedId) ?? null
  if (!recommended) {
    dropped.push({ code: 'recommendedId', why: 'unknown, rejected or ineligible id' })
    recommended = eligible[0] ?? null    // fall back to the top ranked, never to nothing
  }

  let alternative = find(decision.alternativeId)
  if (alternative && recommended && alternative.candidateId === recommended.candidateId) {
    alternative = undefined              // duplicate ids collapse
  }

  const seen = new Set<string>()

  // One loop, used for reasons AND trade-offs. A trade-off is a claim about a
  // candidate exactly like a reason is, so it has to clear the same evidence
  // bar; a second, laxer path would be the leak.
  const validateCodes = (entries: ReasonEntry[]): ValidatedReason[] => {
  const reasons: ValidatedReason[] = []
  for (const r of entries) {
    const code = r.code as ReasonCode
    if (!REASON_CODES.includes(code)) { dropped.push({ code: r.code, why: 'not in the closed vocabulary' }); continue }

    if (code === 'PREFERENCE_UNVERIFIED') {
      const key = r.key
      if (!key) { dropped.push({ code, why: 'no preference named' }); continue }
      const stated = state.softPreferences.some(p => p.key === key)
        || state.hardConstraints.some(h => h.key === key)
      if (!NAMED_PREFERENCES.has(key) && !stated) {
        dropped.push({ code, why: `unknown preference "${key}"` })
        continue
      }
      const dedupe = `${code}:${key}`
      if (seen.has(dedupe)) continue
      seen.add(dedupe)
      reasons.push({ code, candidate: recommended!, key })
      continue
    }

    const candidate = find(r.candidateId) ?? recommended
    if (!candidate) { dropped.push({ code, why: 'no candidate' }); continue }

    if (code === 'MATCHES_PREFERENCE') {
      const field = r.key ? PREFERENCE_EVIDENCE[r.key] : undefined
      // A preference is only a venue fact when a field proves it. "quiet" has no
      // field anywhere, so it can never arrive here — it can only ever be
      // PREFERENCE_UNVERIFIED.
      if (!field || factOf(candidate, field) === undefined) {
        dropped.push({ code, why: `no evidence for preference "${r.key}"` })
        continue
      }
    }

    // Both of these render a named field's value. Measured on a live product
    // turn: BETTER_SPEC arrived with key "ram_storage", a field no candidate
    // carries, and rendered as "TGMT có ram_storage ." — a claim with an empty
    // value where the evidence should be. Any code that quotes a field has to
    // prove that field exists on that candidate first.
    if (code === 'SATISFIES_HARD_CONSTRAINT' || code === 'BETTER_SPEC') {
      if (!r.key || factOf(candidate, r.key) === undefined) {
        dropped.push({ code, why: `no evidence for field "${r.key}"` })
        continue
      }
    }

    const dimension = COMPARATIVE_DIMENSION[code]
    let other: Candidate | undefined
    if (dimension) {
      other = find(r.otherId) ?? alternative
      // Comparatives need BOTH sides. comparableOn is the single enforcement
      // point, the same one the facts block already uses.
      if (!other || other.candidateId === candidate.candidateId) {
        dropped.push({ code, why: 'comparison needs a second candidate' })
        continue
      }
      if (!comparableOn(dimension, [candidate, other])) {
        dropped.push({ code, why: `"${dimension}" missing on at least one side` })
        continue
      }
    }

    const dedupe = `${code}:${candidate.candidateId}:${other?.candidateId ?? ''}:${r.key ?? ''}`
    if (seen.has(dedupe)) continue
    seen.add(dedupe)
    reasons.push({ code, candidate, other, key: r.key })
  }
  return reasons
  }

  const reasons = validateCodes(decision.reasonCodes ?? [])
  const tradeoffs = validateCodes(decision.tradeoffCodes ?? [])

  return { recommended, alternative, reasons, tradeoffs, dropped }
}

// ── Rendering ───────────────────────────────────────────────────────────────
// Every sentence below is built from a candidate's own evidence. There is no
// branch that emits model text.

const VI_PREF: Record<string, string> = {
  quiet: 'yên tĩnh', wifi: 'WiFi', cheaper: 'giá mềm', closer: 'gần',
  battery: 'pin', outdoor: 'chỗ ngồi ngoài trời', vegetarian: 'đồ chay',
}
const EN_PREF: Record<string, string> = {
  quiet: 'quiet', wifi: 'Wi-Fi', cheaper: 'price', closer: 'distance',
  battery: 'battery life', outdoor: 'outdoor seating', vegetarian: 'vegetarian food',
}

/**
 * Product listings carry seller-written titles — "Macbook Air - M2 / 16Gb /
 * 512Gb - 13'6 inch 2022 - Likenew - Midnight". Repeating that once per sentence
 * is unreadable, so the lead states it in full and the reasons use the head of
 * it. Cut on the listing separators only; never invent a shorter name.
 */
function shortName(c: Candidate): string {
  const parts = c.name.split(/\s*[-–—|]\s*|\s*\(/).map(p => p.trim()).filter(Boolean)
  let head = ''
  // Listings often open with a seller code — "TGMT - Laptop MacBook Neo …".
  // Keep taking segments until the name actually identifies the thing.
  for (const p of parts) {
    head = head ? `${head} ${p}` : p
    if (head.length >= 12) break
  }
  return head.length >= 4 && head.length < c.name.length ? head : c.name
}

/** Field keys are storage names. These are what a reader should see instead. */
const FIELD_LABEL: Record<string, { vi: string; en: string }> = {
  ram_gb: { vi: 'RAM', en: 'RAM' },
  storage_gb: { vi: 'ổ cứng', en: 'storage' },
  price_vnd: { vi: 'ngân sách', en: 'budget' },
  price: { vi: 'giá', en: 'price' },
  condition: { vi: 'tình trạng', en: 'condition' },
  screen_inch: { vi: 'màn hình', en: 'screen' },
  rating: { vi: 'đánh giá', en: 'rating' },
  opening_hours: { vi: 'giờ mở cửa', en: 'opening hours' },
  wifi: { vi: 'WiFi', en: 'Wi-Fi' },
}

/**
 * Present a stored value the way a person writes it — grouped thousands for
 * money, a unit on the sizes. The value itself is never changed, only spaced:
 * 24800000 must still read as 24.800.000, never as "khoảng 25 triệu".
 */
function formatFact(key: string, raw: string, vi: boolean): string {
  const n = Number(String(raw).replace(/[^\d.]/g, ''))
  if (!Number.isFinite(n) || String(raw).trim() === '') return raw
  if (/(_vnd|price)$/.test(key) && !/[₫đ]/.test(raw)) {
    return `${n.toLocaleString(vi ? 'vi-VN' : 'en-US')}${vi ? ' ₫' : ' VND'}`
  }
  if (key === 'ram_gb' || key === 'storage_gb') return `${n}GB`
  if (key === 'screen_inch') return `${n}"`
  return raw
}

function renderReason(r: ValidatedReason, vi: boolean, repeatSubject = false): string | null {
  // An unmapped key is still a storage name, so at least stop it reading like
  // one. It can only get here having proved it carries a value.
  const label = (k?: string) =>
    (vi ? FIELD_LABEL[k ?? '']?.vi : FIELD_LABEL[k ?? '']?.en) ?? (k ?? '').replace(/_/g, ' ')
  // Same candidate two sentences running: name it once, then refer back.
  const backRef = vi
    ? (r.candidate.type === 'place' ? 'Quán này' : 'Sản phẩm này')
    : 'It'
  const n = repeatSubject ? backRef : shortName(r.candidate)
  const o = r.other ? shortName(r.other) : undefined
  const f = (c: Candidate, k: string) => formatFact(k, String(factOf(c, k) ?? ''), vi)
  const pref = (k?: string) => (vi ? VI_PREF[k ?? ''] ?? k : EN_PREF[k ?? ''] ?? k)

  switch (r.code) {
    case 'SATISFIES_HARD_CONSTRAINT':
      return vi
        ? `${n} nằm trong ${label(r.key)} bạn đặt ra (${f(r.candidate, r.key!)}).`
        : `${n} fits the ${label(r.key)} you set (${f(r.candidate, r.key!)}).`
    case 'MATCHES_PREFERENCE': {
      const field = PREFERENCE_EVIDENCE[r.key ?? '']
      return vi
        ? `${n} có ${pref(r.key)} (theo dữ liệu: ${f(r.candidate, field)}).`
        : `${n} has ${pref(r.key)} (evidence: ${f(r.candidate, field)}).`
    }
    case 'BETTER_OPENING_HOURS':
      return vi
        ? `${n} mở ${f(r.candidate, 'opening_hours')}, so với ${o} mở ${f(r.other!, 'opening_hours')}.`
        : `${n} opens ${f(r.candidate, 'opening_hours')}, versus ${o} at ${f(r.other!, 'opening_hours')}.`
    case 'BETTER_RATING':
      return vi
        ? `${n} được đánh giá ${f(r.candidate, 'rating')} so với ${f(r.other!, 'rating')} của ${o}.`
        : `${n} is rated ${f(r.candidate, 'rating')} against ${o}'s ${f(r.other!, 'rating')}.`
    case 'BETTER_PRICE_LEVEL':
      // Ordinal only. Never rendered as an amount.
      return vi
        ? `Google xếp ${n} ở mức giá ${f(r.candidate, 'price_level')}, thấp hơn ${o} (${f(r.other!, 'price_level')}).`
        : `Google places ${n} at price level ${f(r.candidate, 'price_level')}, below ${o} (${f(r.other!, 'price_level')}).`
    case 'BETTER_PRICE':
      return vi
        ? `${n} có giá ${f(r.candidate, 'price')}, so với ${f(r.other!, 'price')} của ${o}.`
        : `${n} is listed at ${f(r.candidate, 'price')}, versus ${o} at ${f(r.other!, 'price')}.`
    case 'BETTER_SPEC':
      return vi
        ? `${n} có ${label(r.key)} ${f(r.candidate, r.key!)}.`
        : `${n} has ${f(r.candidate, r.key!)} of ${label(r.key)}.`
    case 'BETTER_CONDITION':
      return vi
        ? `${n} ở tình trạng ${f(r.candidate, 'condition')}, so với ${f(r.other!, 'condition')} của ${o}.`
        : `${n} is ${f(r.candidate, 'condition')}, versus ${o} at ${f(r.other!, 'condition')}.`
    case 'CLOSER':
      return vi
        ? `${n} cách bạn ${f(r.candidate, 'distance_km')} km, gần hơn ${o} (${f(r.other!, 'distance_km')} km).`
        : `${n} is ${f(r.candidate, 'distance_km')} km away, closer than ${o} (${f(r.other!, 'distance_km')} km).`
    case 'PREFERENCE_UNVERIFIED':
      return vi
        ? `Về ${pref(r.key)}, mình chưa có dữ liệu xác minh nên không dám khẳng định.`
        : `On ${pref(r.key)}, I have no verified data, so I won't claim either way.`
    default:
      return null
  }
}

/**
 * The whole user-visible decision reply, composed from validated reasons.
 *
 * The only strings that reach the user are this function's templates and values
 * taken verbatim from candidate evidence.
 */
export function renderRecommendation(v: ValidatedDecision, lang = 'vi'): string {
  const vi = lang === 'vi'
  if (!v.recommended) {
    return vi
      ? 'Mình chưa có lựa chọn nào đủ dữ liệu để giới thiệu.'
      : "I don't have an option with enough verified data to recommend yet."
  }

  const lead = vi
    ? `Nếu là mình thì mình chọn **${v.recommended.name}**.`
    : `If it were me, I'd choose **${v.recommended.name}**.`

  // Track the running subject so a chain of facts about one option does not
  // restate its (often very long) listing title in every sentence.
  const asSentences = (rs: ValidatedReason[], startsAfter?: string): string[] => {
    let prev = startsAfter
    const out: string[] = []
    for (const r of rs) {
      const s = renderReason(r, vi, prev === r.candidate.candidateId && !r.other)
      prev = r.candidate.candidateId
      if (s) out.push(s)
    }
    return out
  }

  const body = asSentences(v.reasons, v.recommended.candidateId)

  // Facts-only fallback: no reason survived validation, so state what is known
  // about the pick rather than inventing a justification for it.
  if (body.length === 0) {
    const g = groundCandidate(v.recommended, lang)
    const facts = g.verifiedFacts.map(f => `${f.label}: ${f.value}`).join('; ')
    // "quán" is a venue. Saying it about a laptop was measured on a live turn.
    const noun = v.recommended.type === 'place' ? 'quán này' : 'sản phẩm này'
    body.push(facts
      ? (vi ? `Dữ liệu mình có về ${noun}: ${facts}.` : `What I can verify: ${facts}.`)
      : (vi ? 'Mình chưa xác minh được thêm thông tin nào về lựa chọn này.' : 'I could not verify further details about this option.'))
  }

  const traded = asSentences(v.tradeoffs)
  const tradeoff = traded.length > 0
    ? (vi ? `\n\nĐánh đổi: ${traded.join(' ')}` : `\n\nTrade-off: ${traded.join(' ')}`)
    : ''

  const alt = v.alternative
    ? (vi
      ? `\n\nNếu muốn cân nhắc thêm, **${v.alternative.name}** là lựa chọn thay thế.`
      : `\n\nIf you want another option, **${v.alternative.name}** is the alternative.`)
    : ''

  return `${lead}\n\n${body.join(' ')}${tradeoff}${alt}`
}

/**
 * What the model sees on a decision turn.
 *
 * It gets the candidate IDs, each candidate's verified facts, and the code
 * vocabulary — and it is told plainly that its prose is discarded. That last
 * part is not a politeness: the tool has no free-text field, so there is
 * nowhere for prose to go even if it writes some.
 */
export function buildDecisionToolBlock(
  ranked: Candidate[],
  state: ConversationState,
  lang = 'vi',
): string {
  const list = ranked
    .filter(c => !isRejected(c, state))
    .slice(0, 6)
    .map(c => `  - id=${c.candidateId} | ${buildGroundedCandidateFactSentence(c, lang)}`)
    .join('\n')

  return `\n\n===== LUOT CHOT: TRA LOI BANG TOOL submit_recommendation =====
Luot nay ban KHONG viet cau tra loi. He thong se soan cau tra loi tu ID va ma ly do ban gui.
Goi dung MOT lan tool submit_recommendation.

CAC LUA CHON (dung dung id o duoi):
${list || '  (khong con lua chon nao)'}

MA LY DO duoc phep: ${REASON_CODES.join(', ')}
- BETTER_* va CLOSER: PHAI co ca candidateId lan otherId, va ca hai ben phai co du lieu cho chieu do.
- SATISFIES_HARD_CONSTRAINT: key = ten truong du lieu co that o tren.
- MATCHES_PREFERENCE: chi dung khi co du lieu chung minh (vd wifi).
- PREFERENCE_UNVERIFIED: dung khi user muon dieu gi do ma khong co du lieu (vd yen tinh).
Ma nao khong duoc bang chung chung minh se bi BO, khong duoc hien thi.
Neu khong co ma nao dung, gui reasonCodes rong — he thong se chi neu su that da xac minh.
==============================================================`
}
