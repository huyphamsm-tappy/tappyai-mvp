// ── A trip plan never invents WHEN, FROM WHERE or HOW (owner 2026-09-28, item B4) ──────────────
//
// "đi du lịch Đà Nẵng 3 ngày 2 đêm" names no date, no origin and no transport. Measured on UAT the
// same evening (3 runs): one plan labelled its days "Ngày 3/10 · 4/10 · 5/10", another opened with a
// "Chuyến bay đến Đà Nẵng — Máy bay từ Hà Nội/TP.HCM" stop. Both are the user's decisions, and the
// reply already closes by asking for them (tripFacts.ts). The prompt says so too, but a prompt rule
// alone has not held a line like this before (project_food_prose_provenance), so this check runs on
// every trip plan before it reaches a client:
//
//   · date not given   → dates leave the day labels and the title; prose sentences stating a
//                        calendar date (dd/mm) are removed.
//   · origin or transport not given → inter-city legs (flights, coaches, trains) leave the plan and
//                        its cost breakdown; prose sentences naming a departure city are removed.
//
// "What is missing" is read from the user's OWN words in the thread (missingTripFacts), never from
// the model. Deterministic, no model call, no network. Edits the PARSED plan and re-serializes, the
// same way the other plan guards do.

import { normalizeVN } from './intent'
import { missingTripFacts, type TripFact } from './consultative/tripFacts'

const OPEN = '[TAPPY_PLAN]'
const CLOSE = '[/TAPPY_PLAN]'

/** A calendar date: 3/10, 03-10, 3/10/2026 — never a rating (4.8/5 is preceded by a digit+dot) or "24/7". */
const CAL_DATE = /(?<![\d.,])(?:0?[1-9]|[12]\d|3[01])\s*[/-]\s*(?:1[0-2]|0?[1-9])(?:\s*[/-]\s*(?:20)?\d{2})?(?![\d/])/u
const OPEN_ALL_DAY = /(?<!\d)24\s*\/\s*7(?!\d)/gu
/** A date as it sits in a label: "(Ngày 3/10)", "- 3/10", "Thứ Sáu 3/10", "(Thứ Sáu)". */
const LABEL_DATE = /\s*[-–—,:]?\s*\(?\s*(?:(?:thứ\s+(?:hai|ba|tư|năm|sáu|bảy|[2-7])|chủ\s+nhật)\s*,?\s*)?(?:ngày\s*)?(?:0?[1-9]|[12]\d|3[01])\s*[/-]\s*(?:1[0-2]|0?[1-9])(?:\s*[/-]\s*(?:20)?\d{2})?\s*\)?/giu
const LABEL_WEEKDAY = /\s*[-–—,:]?\s*\(\s*(?:thứ\s+(?:hai|ba|tư|năm|sáu|bảy|[2-7])|chủ\s+nhật)\s*\)/giu

/** An inter-city leg: the user has not said how, or from where, they travel. */
const INTERCITY = /(?<!\p{L})(?:chuyến bay|máy bay|vé máy bay|bay từ|bay đến|bay ra|bay vào|hạ cánh|cất cánh|xe khách|xe giường nằm|limousine|tàu hỏa|tàu lửa|ga tàu|flight|fly to|train to|bus to|coach)(?!\p{L})/iu
/** A departure city stated as fact: "bay từ Hà Nội", "xuất phát từ TP.HCM" — never "từ đâu". */
// Case-SENSITIVE on purpose: a capital after "từ" is a named place; "từ đâu" is the question.
// (Under the `i` flag \p{Lu} would match lowercase letters too.)
const DEPARTURE_NAMED = /(?<!\p{L})(?:[Bb]ay|[Xx]uất phát|[Kk]hởi hành|[Dd]eparting|[Ll]eaving|[Ff]lying)\s+(?:từ|from)\s+(?:\p{Lu}|[Tt][Pp]\b)/u
// "đi từ" is also how a day moves between stops ("đi từ Cầu Rồng sang…") — only a city counts.
const DEPARTURE_CITY = /(?<!\p{L})(?:đi|di chuyển|ra|vào)\s+từ\s+(?:hà nội|tp\.?\s?hcm|sài gòn|hồ chí minh|hải phòng|cần thơ)(?!\p{L})/iu
const DEPARTURE = { test: (s: string) => DEPARTURE_NAMED.test(s) || DEPARTURE_CITY.test(s) }

const fold = (s: string) => normalizeVN(s.toLowerCase())

export interface PlanTripFactsResult {
  text: string
  missing: TripFact[]
  labelsCleaned: number
  stopsDropped: number
  sentencesDropped: number
}

function stripLabelDate(label: string): string {
  const out = label.replace(LABEL_DATE, '').replace(LABEL_WEEKDAY, '').replace(/\s*[-–—,:(]\s*$/u, '').replace(/\(\s*\)/gu, '').trim()
  return out || label.replace(/[^\p{L}\s\d]/gu, '').trim()
}

/** A question asking for a trip fact (date / origin / transport). */
const TRIP_QUESTION = /(?<!\p{L})(?:ngày nào|hôm nào|khi nào|lúc nào|thời gian nào|dịp nào|xuất phát|khởi hành|từ đâu|ở đâu đi|bay hay|máy bay|xe khách|tàu|phương tiện|which dates?|when|where .*from|fly|train|bus)(?!\p{L})/iu

function hasCalendarDate(s: string): boolean {
  return CAL_DATE.test(s.replace(OPEN_ALL_DAY, ''))
}

/** Drops the prose sentences that state what the user did not say. Line structure is kept. */
function guardProse(prose: string, missing: Set<TripFact>): { text: string; dropped: number } {
  let dropped = 0
  const lines = prose.split('\n').map(line => {
    const parts = line.split(/(?<=[.!?…])\s+/u)
    let afterDroppedQuestion = false
    const kept = parts.filter(sentence => {
      // The "(để xác nhận …)" aside that followed a dropped question goes with it.
      const aside = afterDroppedQuestion && /^\(.*\)[.!]?$/u.test(sentence.trim())
      afterDroppedQuestion = false
      if (aside) return false
      // At most ONE question (owner-approved rule): the system's closing question (tripFacts.ts, a
      // statement ending "…cho bạn.") already asks for every missing fact, so the model's own
      // question about them goes. Measured on uat @ 826d23b run 3: "Bạn dự định đi vào ngày nào?"
      // sat right above the closing question.
      if (/\?\s*$/u.test(sentence)) {
        const own = TRIP_QUESTION.test(sentence)
        if (own) { dropped++; afterDroppedQuestion = true }
        return !own
      }
      const bad = (missing.has('date') && hasCalendarDate(sentence))
        || ((missing.has('origin') || missing.has('transport')) && DEPARTURE.test(sentence))
      if (bad) dropped++
      return !bad
    })
    return kept.length === parts.length ? line : kept.join(' ')
  })
  return { text: lines.join('\n').replace(/\n{3,}/g, '\n\n'), dropped }
}

/**
 * Strips invented trip facts from a `[TAPPY_PLAN]` of type "trip" and from the prose around it.
 * `userTexts` are the user's own messages in this thread. Returns the text unchanged for any other
 * plan, when the block does not parse, or when the user already gave date, origin and transport.
 */
export function guardPlanTripFacts(fullText: string, userTexts: readonly string[]): PlanTripFactsResult {
  const none: PlanTripFactsResult = { text: fullText, missing: [], labelsCleaned: 0, stopsDropped: 0, sentencesDropped: 0 }
  const start = fullText.indexOf(OPEN)
  const end = fullText.indexOf(CLOSE)
  if (start === -1 || end === -1 || end < start) return none
  let plan: Record<string, unknown>
  try { plan = JSON.parse(fullText.slice(start + OPEN.length, end).trim()) } catch { return none }
  if (!plan || typeof plan !== 'object' || plan.type !== 'trip') return none
  const missing = missingTripFacts(fold(userTexts.join(' \n ')))
  if (missing.length === 0) return none
  const miss = new Set(missing)
  const noLeg = miss.has('origin') || miss.has('transport')

  let labelsCleaned = 0
  let stopsDropped = 0
  if (miss.has('date') && typeof plan.title === 'string') {
    const t = stripLabelDate(plan.title)
    if (t !== plan.title) { plan.title = t; labelsCleaned++ }
  }
  for (const day of (Array.isArray(plan.days) ? plan.days : []) as Array<Record<string, unknown>>) {
    if (!day || typeof day !== 'object') continue
    if (miss.has('date') && typeof day.label === 'string') {
      const l = stripLabelDate(day.label)
      if (l !== day.label) { day.label = l; labelsCleaned++ }
    }
    if (noLeg && Array.isArray(day.items)) {
      const items = day.items as Array<Record<string, unknown>>
      const kept = items.filter(it => {
        const text = `${String(it?.name ?? '')} ${String(it?.description ?? '')}`
        return !INTERCITY.test(text) && !DEPARTURE.test(text)
      })
      stopsDropped += items.length - kept.length
      day.items = kept
    }
  }
  if (noLeg && plan.cost_breakdown && typeof plan.cost_breakdown === 'object') {
    const cb = plan.cost_breakdown as Record<string, unknown>
    for (const k of Object.keys(cb)) if (INTERCITY.test(k) || INTERCITY.test(String(cb[k]))) delete cb[k]
  }

  const before = guardProse(fullText.slice(0, start), miss)
  const after = guardProse(fullText.slice(end + CLOSE.length), miss)
  const block = `${OPEN}\n${JSON.stringify(plan)}\n${CLOSE}`
  return {
    text: before.text + block + after.text,
    missing,
    labelsCleaned,
    stopsDropped,
    sentencesDropped: before.dropped + after.dropped,
  }
}
