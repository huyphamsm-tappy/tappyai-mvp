import type { Candidate, ConversationState } from './conversationState'
import { candidateMatchesRef, isRejected } from './conversationState'
import { comparableOn, groundCandidate } from './groundedFacts'

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

export interface RecommendationDecision {
  recommendedId: string
  alternativeId?: string
  reasonCodes: Array<{ code: string; candidateId?: string; otherId?: string; key?: string }>
}

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

  const reasons: ValidatedReason[] = []
  const seen = new Set<string>()

  for (const r of decision.reasonCodes ?? []) {
    const code = r.code as ReasonCode
    if (!REASON_CODES.includes(code)) { dropped.push({ code: r.code, why: 'not in the closed vocabulary' }); continue }

    if (code === 'PREFERENCE_UNVERIFIED') {
      const key = r.key
      if (!key) { dropped.push({ code, why: 'no preference named' }); continue }
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

    if (code === 'SATISFIES_HARD_CONSTRAINT') {
      if (!r.key || factOf(candidate, r.key) === undefined) {
        dropped.push({ code, why: `no evidence for constraint "${r.key}"` })
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

  return { recommended, alternative, reasons, dropped }
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

function renderReason(r: ValidatedReason, vi: boolean): string | null {
  const n = r.candidate.name
  const o = r.other?.name
  const f = (c: Candidate, k: string) => String(factOf(c, k) ?? '')
  const pref = (k?: string) => (vi ? VI_PREF[k ?? ''] ?? k : EN_PREF[k ?? ''] ?? k)

  switch (r.code) {
    case 'SATISFIES_HARD_CONSTRAINT':
      return vi
        ? `${n} đáp ứng yêu cầu ${r.key} của bạn (${f(r.candidate, r.key!)}).`
        : `${n} meets your ${r.key} requirement (${f(r.candidate, r.key!)}).`
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
        ? `${n} có ${r.key} = ${f(r.candidate, r.key!)}.`
        : `${n} has ${r.key} = ${f(r.candidate, r.key!)}.`
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

  const body = v.reasons.map(r => renderReason(r, vi)).filter(Boolean) as string[]

  // Facts-only fallback: no reason survived validation, so state what is known
  // about the pick rather than inventing a justification for it.
  if (body.length === 0) {
    const g = groundCandidate(v.recommended, lang)
    const facts = g.verifiedFacts.map(f => `${f.label}: ${f.value}`).join('; ')
    body.push(facts
      ? (vi ? `Dữ liệu mình có về quán này: ${facts}.` : `What I can verify: ${facts}.`)
      : (vi ? 'Mình chưa xác minh được thêm thông tin nào về lựa chọn này.' : 'I could not verify further details about this option.'))
  }

  const alt = v.alternative
    ? (vi
      ? `\n\nNếu muốn cân nhắc thêm, **${v.alternative.name}** là lựa chọn thay thế.`
      : `\n\nIf you want another option, **${v.alternative.name}** is the alternative.`)
    : ''

  return `${lead}\n\n${body.join(' ')}${alt}`
}
