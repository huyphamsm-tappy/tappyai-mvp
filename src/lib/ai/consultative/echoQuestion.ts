// ── THE LOOP GUARD — never answer a request with the same request as a question — chat2 A2 ─────────
//
// Owner report (2026-10-01): "muốn tìm cửa hàng dán tại chỗ ở phú nhuận" → the AI asked back, twice,
// exactly what the user had just said ("Bạn muốn tìm cửa hàng dán tại chỗ ở Phú Nhuận phải không?")
// and never searched. Three deterministic pieces, no model involved:
//
//   · `assistantAskedBack`  — the previous assistant turn ended on a question and showed no venue: the
//                             user's reply (an answer, a repeat, a "ừ") is the cue to SEARCH NOW.
//   · `isEchoQuestion`      — a question whose content words are (almost) all the user's own words.
//   · `dropEchoQuestions`   — removes such a trailing question from a reply; at most ONE clarifying
//                             question survives, and only if it asks for something the user has not said.
//   · `wantsWiderArea`      — "tìm cả TP.HCM" / "khu vực lân cận": drop the stated district for this turn.

import { endsWithQuestion } from './askAfter'

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase()

const BLOCK_RE = /\[(FOLLOWUPS|CTA_BUTTONS|TAPPY_[A-Z_]+)\][\s\S]*?\[\/\1\]/g

/** Words that carry no request content: politeness, question frames, pronouns, "do you want …". */
const FILLER = new Set(('ban toi minh em anh chi tui muon can cho nhe nha a ha vay khong co phai la hay hoac va o tai de di tim kiem giup '
  + 'dung khong dung chua nao gi the nua thi duoc nhi ne day do kia cai nhung cac mot nhu muon biet noi ro them xin vui long '
  + 'mong hieu giup nhe dang can phai hoi lai xac nhan the nao ra sao co the duoc khong ok oke de minh').split(' '))

const content = (s: string): string[] => fold(s).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w && !FILLER.has(w))

/** The previous assistant turn asked something and named no venue (no cards behind it). */
export function assistantAskedBack(lastAssistantText: string, hadVenues: boolean): boolean {
  if (!lastAssistantText || hadVenues) return false
  if (/\[TAPPY_(?:PLACES|SHOPPING|PLAN)\]/.test(lastAssistantText)) return false
  return endsWithQuestion(lastAssistantText)
}

/**
 * Is `question` a restatement of what the user already said? True when it has at least two content
 * words and ≥ 70 % of them occur in the user's own turns (folded, any order). A question that brings
 * a NEW word ("màn hình hay mặt lưng?") is a real clarification and is not an echo.
 */
export function isEchoQuestion(question: string, userTexts: readonly string[]): boolean {
  const q = content(question)
  if (q.length < 2) return false
  const said = new Set(userTexts.flatMap(content))
  const hit = q.filter(w => said.has(w)).length
  return hit / q.length >= 0.7
}

const SENTENCE_SPLIT = /(?<=[.!?…])\s+|\n+/

/**
 * Removes every echo question from the END of a reply (blocks are left alone). A reply that is
 * nothing but echo questions comes back empty — the caller then has the honest line to put there.
 */
export function dropEchoQuestions(text: string, userTexts: readonly string[]): { text: string; removed: number } {
  const blocks: string[] = []
  const bare = text.replace(BLOCK_RE, m => { blocks.push(m); return '' }).trimEnd()
  const parts = bare.split(SENTENCE_SPLIT).filter(p => p.trim())
  let removed = 0
  while (parts.length > 0) {
    const last = parts[parts.length - 1]
    if (/\?\s*[^\p{L}\p{N}]*$/u.test(last) && isEchoQuestion(last, userTexts)) { parts.pop(); removed++ } else break
  }
  if (removed === 0) return { text, removed: 0 }
  return { text: [parts.join(' ').trim(), ...blocks].filter(Boolean).join('\n\n'), removed }
}

const WIDER_RE = /\b(?:ca (?:tp|thanh pho|sai gon|hcm)|toan (?:tp|thanh pho)|khu (?:vuc )?(?:lan can|khac)|quan (?:lan can|khac)|rong ra|tim rong|noi khac)\b/

/** "Tìm trên cả TP.HCM" / "khu vực lân cận": the user lifts the district restriction. */
export function wantsWiderArea(text: string): boolean {
  return WIDER_RE.test(fold(text).replace(/tp\.\s*/g, 'tp '))
}

// ── The ask card never asks what the user already said ────────────────────────────────────────────
// Measured 2026-10-02 (dev server, same prompt, run to run): "muốn tìm cửa hàng dán tại chỗ ở phú nhuận"
// sometimes produced an ask card whose first question was "Bạn muốn dán gì và dán ở đâu?" — the area was
// in the request. A question about the AREA when a district is already named, or a question that only
// restates the request, is dropped; no question left → no card, the turn is a pick and the search runs.
// Phase 3A / D2: the card shows exactly one question.

import { statedDistrict } from '../districts'
import type { ConsultDecision } from './consultBrain'

const BUDGET_QUESTION = /\b(?:bao nhieu|ngan sach|tam gia|muc gia)\b/
const PARTY_QUESTION = /\bmay nguoi\b/
/** A money amount the user wrote ("300-500k", "trên 500k", "2 triệu"). */
const MONEY = /\d\s*(?:k|tr|trieu|nghin|ngan)\b/
/** A head-count the user wrote ("4 người", "hai người"). */
const PARTY = /\b(?:\d+|hai|ba|bon|nam|sau|bay|tam|chin|muoi)\s+nguoi\b/
const AREA_QUESTION = /\b(?:o dau|khu vuc|quan nao|dia diem|noi nao|gan dau)\b/

export function refineAsk(d: ConsultDecision | null, userTexts: readonly string[], opts: { localShop: boolean }): ConsultDecision | null {
  if (!d || d.turn !== 'ask' || !d.ask) return d
  // A request for a named local shop / repair service is specific enough to be searched: never an ask card.
  if (opts.localShop) return { ...d, turn: 'pick', ask: undefined }
  const areaKnown = userTexts.some(t => statedDistrict(t) !== null)
  const budgetKnown = userTexts.some(t => MONEY.test(fold(t)))
  const partyKnown = userTexts.some(t => PARTY.test(fold(t)))
  const keep = d.ask.questions.filter(q => {
    if (areaKnown && AREA_QUESTION.test(fold(q.q))) return false
    if (budgetKnown && BUDGET_QUESTION.test(fold(q.q))) return false
    if (partyKnown && PARTY_QUESTION.test(fold(q.q))) return false
    if (isEchoQuestion(q.q, userTexts)) return false
    return true
  })
  // Phase 3A / D2: an ask turn carries exactly ONE question — whoever produced the card (router, intent call or brain), the first
  // question that survived the filters is the only one shown; none left → the turn is a pick and the search runs.
  // The gate is unchanged: a multi-question card that filtering reduced below two was not worth asking (the state was already sufficient).
  const total = d.ask.questions.length
  const one = keep.slice(0, 1)
  if (one.length === 0 || (total >= 2 && keep.length < 2)) return { ...d, turn: 'pick', ask: undefined }
  if (total === 1) return d
  return { ...d, ask: { ...d.ask, questions: one } }
}
