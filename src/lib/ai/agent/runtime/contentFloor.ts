// ── CONSULTATIVE_IN_AGENT — a conversational turn that was ANSWERED must carry content (Round 30, part 1) ─────────────────────────────────────────────────────
//
// Live 2026-10-12 (Huy, "biết tesla ko"): turn 1 asked which Tesla (right). Turn 2 "nhà phát minh á" ended as "À, Nikola Tesla chứ gì." + a source button: an acknowledgement, no content.
// Turn 3 "đúng rồi, cha, có biết ko" ended as "Biết chứ.". Two causes in the code and the prompt (diagnosis in the Round 30 report):
//   · loop.ts: ANY text written next to a lookup (or by the answer-first check) becomes a "preface" and from then on every step is told "the user has ALREADY read your advice,
//     add only what the lookup added" (answerFirst.ts prefaceNote). An acknowledgement ("À, Nikola Tesla chứ gì.") is not advice, but it was treated as one, so the answer after the
//     lookup had nothing left to say;
//   · consultativeVoice.ts: the "tên riêng nhiều nghĩa" rule ended with an example that starts "Biết chứ." and said a simple "biết X không" needs no search — the model copied the shape.
// Code backstops (flag only), both deterministic and general (no name, no subject):
//   1. a THIN preface (≤ 8 words, no figure, no question) is not kept as a preface — the answer after the lookup is then written in full;
//   2. when the turn is a "biết X không" question, or the user's answer to our clarification, and the composed answer is still thin (≤ 8 words, no figure, not a question),
//      ONE extra no-tools model call asks for the content (from the sources already read or reliable knowledge). A clarifying QUESTION is never treated as thin.
// Pure: no model, no I/O.

import type { CoreMessage } from 'ai'

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
const wordCount = (t: string): number => (t.match(/[\p{L}\p{N}]+/gu) ?? []).length

const MARKER_BLOCK = /\[(FOLLOWUPS|CTA_BUTTONS|TAPPY_[A-Z_]+)\][\s\S]*?\[\/\1\]/g
const SOURCE_LINE = /^\s*(?:nguồn|sources?|giá theo kết quả tìm kiếm của|prices as listed in the search results of|🔗)/i

/** The prose of a composed answer: without marker blocks, source lines and link syntax. */
export function proseOf(text: string): string {
  return text.replace(MARKER_BLOCK, '').split('\n').filter(l => !SOURCE_LINE.test(l)).join('\n')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*+/g, '').trim()
}

/** Little or nothing to read: ≤ 8 words, no figure, and not a question (a clarifying question is a legitimate short answer). */
export function isThin(text: string): boolean {
  const p = proseOf(text)
  if (/[?？]["')\]*_]*\s*$/.test(p)) return false
  return wordCount(p) <= 8 && !/\d/.test(p)
}

/** A preface that only acknowledges ("À, Nikola Tesla chứ gì."): short, no figure, one or two sentences, no structure. */
export function isThinPreface(text: string): boolean {
  const t = (text ?? '').trim()
  if (!t || /^\s*(?:\[|\||#|```|[-*•]\s|\d{1,2}[.)]\s)/m.test(t)) return false
  return wordCount(t) <= 8 && !/\d/.test(t) && (t.match(/[.!?…]+(?:\s|$)/g) ?? []).length <= 2
}

/** "biết X không" / "có biết ko" / "do you know X": asks whether the assistant knows something. */
export function isKnowQuestion(userText: string): boolean {
  const f = fold(userText).replace(/[^a-z0-9\s?]/g, ' ').replace(/\s+/g, ' ').trim()
  if (/\b(?:do|did|can) you know\b|^know\b/.test(f)) return true
  return /(?:^|\s)biet\s/.test(` ${f} `) && /(?:khong|ko|hok|hong|hem|chua|k)\s*\??$/.test(f)
}

const textOf = (m: CoreMessage | undefined): string => !m ? '' : typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? (m.content as Array<{ text?: string }>).map(p => p.text ?? '').join(' ') : ''

/** The user's current message is short and answers a question the assistant asked in its last message. */
export function afterClarification(messages: readonly CoreMessage[]): boolean {
  let lastUser = -1
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') { lastUser = i; break }
  if (lastUser < 1) return false
  const prev = messages.slice(0, lastUser).reverse().find(m => m.role === 'assistant')
  if (!prev) return false
  const asked = textOf(prev).replace(MARKER_BLOCK, '').trim()
  return /[?？]["')\]*_]*\s*$/.test(asked) && wordCount(textOf(messages[lastUser])) <= 8
}

/** The retry: the turn is a "know" question or the answer to our clarification, and what the user would read is thin. */
export function needsContent(o: { messages: readonly CoreMessage[]; composed: string }): boolean {
  let last = ''
  for (let i = o.messages.length - 1; i >= 0; i--) if (o.messages[i].role === 'user') { last = textOf(o.messages[i]); break }
  return (isKnowQuestion(last) || afterClarification(o.messages)) && isThin(o.composed)
}

// ── CONSULT_V3 (UAT 17/10, "biết elon ko" / "cái ông cầm đầu đức quốc xã á"): a knowledge answer that is not thin (> 8 words) but is still
// two sentences — ChatGPT answers the same question with a summary, 3–6 points and a closing question. Under V3 the floor is a FULL answer:
// a knowledge question (or the user's answer to our clarification) whose answer has < FULL_ANSWER_MIN_WORDS words and no list gets ONE no-tools
// retry asking for the full structured answer. A clarifying question is never forced into an answer here.

/** "biết X không", "X là ai / là gì", "tại sao…", "who / what / why is…": the user asks for knowledge about something. */
export function isKnowledgeQuestion(userText: string): boolean {
  if (isKnowQuestion(userText)) return true
  const f = ` ${fold(userText).replace(/[^a-z0-9\s?]/g, ' ').replace(/\s+/g, ' ').trim()} `
  return /\s(?:la ai|la gi|ai la|tai sao|vi sao|the nao|nhu the nao|khac nhau|ke ve|gioi thieu ve|cho biet ve|co gi hay ve|nghia la sao|y nghia|giai thich|y la gi)\s/.test(f)
    || /^\s(?:who|what|why|how)\s(?:is|was|are|were|did|does|do)\s/.test(f) || /\stell me about\s/.test(f)
}

/**
 * Under 100 words of prose, no list or headed points, and not a question back to the user. (UAT 17/10: a 70-word, two-paragraph explanation of a
 * Chinese meme passed the first 60-word floor; ChatGPT's answer to the same question had ~230 words with a part-by-part breakdown.)
 */
export const FULL_ANSWER_MIN_WORDS = 100
export function isShortKnowledgeAnswer(text: string): boolean {
  const p = proseOf(text)
  if (!p || /[?？]["')\]*_]*\s*$/.test(p)) return false
  const structured = (text.match(/^\s*(?:[-*•]\s|\d{1,2}[.)]\s|#{1,4}\s|\*\*[^*\n]{2,60}\*\*\s*[:：])/gm) ?? []).length >= 2
  return !structured && wordCount(p) < FULL_ANSWER_MIN_WORDS
}

/** CONSULT_V3: the full-answer retry is due. */
export function needsFullAnswer(o: { messages: readonly CoreMessage[]; composed: string }): boolean {
  let last = ''
  for (let i = o.messages.length - 1; i >= 0; i--) if (o.messages[i].role === 'user') { last = textOf(o.messages[i]); break }
  return (isKnowledgeQuestion(last) || afterClarification(o.messages)) && isShortKnowledgeAnswer(o.composed)
}

export function fullAnswerRetryNote(lang: string): string {
  return lang === 'en'
    ? '\n\nYour last answer is too short for what the user asked. Rewrite it as a full answer, ChatGPT-style: one direct sentence, then 3–6 key points each with a bold heading, one interesting fact or common misconception, and a closing question. Use the sources already read above or reliable general knowledge; keep any [S#] / [N#] markers; add no figures that are not in them. Do not ask what they mean when the subject is already clear.'
    : '\n\nCâu trả lời vừa rồi quá ngắn so với điều người dùng hỏi. Viết lại thành câu trả lời đầy đủ như ChatGPT: một câu trả lời thẳng, rồi 3–6 ý chính có tiêu đề in đậm (với meme, chơi chữ, tiếng lóng: tách từng yếu tố, cách đọc và nghĩa), một chuyện thú vị hoặc hiểu lầm phổ biến, kết bằng một câu gợi mở. Nói rõ đâu là điều nguồn xác nhận, đâu là cách hiểu phổ biến trên mạng. Dùng nguồn đã đọc ở trên hoặc kiến thức đáng tin; giữ các mã [S#] / [N#] chỉ cho câu mà nguồn đó nói; không thêm con số không có trong đó. Chủ đề đã rõ thì đừng hỏi lại.'
}

export function contentRetryNote(lang: string): string {
  return lang === 'en'
    ? '\n\nYour last answer has no content for what the user asked. Answer it now: confirm in a few words, then give 2–3 useful sentences about the subject the conversation has settled on (from the sources already read above or reliable general knowledge; no new figures that are not in them). Do not ask again what they mean when they have already told you; do not restate the name only. If it is genuinely still unclear WHAT the subject is, ask ONE short clarifying question instead of guessing.'
    : '\n\nCâu trả lời vừa rồi chưa có nội dung cho điều người dùng hỏi. Trả lời ngay: xác nhận bằng vài chữ rồi nói 2–3 câu hữu ích về chủ đề cuộc trò chuyện đã chốt (từ nguồn đã đọc ở trên hoặc kiến thức đáng tin; không thêm con số không có trong đó). Họ đã nói rõ rồi thì đừng hỏi lại họ muốn hỏi gì, đừng chỉ nhắc lại cái tên. Nếu thật sự vẫn chưa rõ chủ đề là gì thì hỏi MỘT câu làm rõ ngắn thay vì đoán.'
}

// ── CONSULT_V3 (owner 17/10: "luật lập lịch luôn khi đủ thông tin"; A/B eval: tp-5 asked the month, sw-4#2 the month, uat-4 the departure city
// although each request named the trip and its length). The prompt rule alone left uat-4 asking. A trip request that states its LENGTH ("3 ngày
// 2 đêm", "2N1Đ", "a 4-day trip") is enough to plan with stated assumptions; when the whole answer is a short question (≤ 30 words, ends with
// "?"), ONE no-tools retry asks for the plan. A subject the user left unclear ("biết hit le ko") has no length and is never retried here.
const TRIP_LENGTH = /(?<![\p{L}\p{N}])\d{1,2}\s*(?:ngay|ngày|dem|đêm|n\s*\d\s*đ|n\s*\d\s*d|days?|nights?)(?![\p{L}])|(?<![\p{L}\p{N}])\d{1,2}n\d{1,2}[dđ](?![\p{L}])|(?<![\p{L}\p{N}])\d{1,2}[- ]day\b/iu

/**
 * The answer is nothing but ONE short question back to the user (its numbered answer options, if any, below it). A reply that carries a card
 * block ([TAPPY_PLAN] …) has its content in the card, never "a question only" (consultV3.route.test: the plan with "**Hai bạn đi từ đâu?**").
 */
export function isAskOnly(text: string): boolean {
  if (/\[(?:TAPPY_PLAN|TAPPY_SHOPPING|TAPPY_PLACES)\]/.test(text)) return false
  const lines = proseOf(text).split('\n')
  while (lines.length && (!lines[lines.length - 1].trim() || /^\s*\d{1,2}[.)]\s*\S/.test(lines[lines.length - 1]))) lines.pop()
  const p = lines.join('\n').trim()
  const sentences = (p.match(/[.!?？…](?=["')\]*_]*(?:\s|$))/g) ?? []).length
  return !!p && /[?？]["')\]*_]*\s*$/.test(p) && sentences <= 1 && wordCount(p) <= 30 && !/^\s*(?:[-*•]\s|\d{1,2}[.)]\s|#{1,4}\s)/m.test(p)
}

/** CONSULT_V3: the user asked for a trip of a stated length and the answer only asked a question. */
export function needsPlanNotQuestion(o: { messages: readonly CoreMessage[]; composed: string }): boolean {
  let last = ''
  for (let i = o.messages.length - 1; i >= 0; i--) if (o.messages[i].role === 'user') { last = textOf(o.messages[i]); break }
  return TRIP_LENGTH.test(last) && isAskOnly(o.composed)
}

// ── CONSULT_V3 TURN CONTRACT (owner 17/10, TURN-CONTRACT-PLAN approved): every turn resolves something ───────────────────────────────
// The resolution of a turn is read from the STRUCTURE of the text the user receives — never from words of a language, so it holds for any
// phrasing, region or language:
//   answered            content, no closing question
//   answered_and_asked  content, then a closing question (the normal V3 shape)
//   clarify             ONLY a question, and the model declared ESSENTIAL information missing (`missing` in its task line) — allowed
//   unresolved          only a question with nothing declared missing, or no text at all — the turn gave the user nothing (refunded)
// A declared turn whose answer is only a question gets ONE no-tools retry first (contractRetryNote): with essential information missing it
// keeps the question but must say why and give the general help it can (never a guess); otherwise it answers on stated assumptions.
export type TurnResolution = 'answered' | 'answered_and_asked' | 'clarify' | 'unresolved'

/** True when the prose (markers and the closing options removed) ends with a question. */
export function endsWithQuestion(text: string): boolean {
  const lines = proseOf(text).split('\n')
  while (lines.length && (!lines[lines.length - 1].trim() || /^\s*\d{1,2}[.)]\s*\S/.test(lines[lines.length - 1]))) lines.pop()
  return /[?？]["')\]*_]*\s*$/.test(lines.join('\n').trim())
}

export function turnResolution(text: string, declaredMissing: readonly string[] | undefined): TurnResolution {
  if (!proseOf(text).trim()) return 'unresolved'
  if (isAskOnly(text)) return declaredMissing && declaredMissing.length ? 'clarify' : 'unresolved'
  return endsWithQuestion(text) ? 'answered_and_asked' : 'answered'
}

export function contractRetryNote(lang: string, declaredMissing: readonly string[] | undefined): string {
  const missing = declaredMissing && declaredMissing.length ? declaredMissing.join('; ') : ''
  if (missing) {
    return lang === 'en'
      ? `\n\nYour reply is only a question. Essential information is missing (${missing}), so you may ask — but first, in 1–3 sentences, say why you need it and give the general help you CAN give without it (no guessing the missing part). Then ask the one question at the end.`
      : `\n\nCâu trả lời vừa rồi chỉ là một câu hỏi. Đang thiếu thông tin thiết yếu (${missing}) nên được hỏi — nhưng trước đó, trong 1–3 câu, nói vì sao cần thông tin này và đưa phần giúp chung làm được ngay khi chưa có nó (không đoán phần còn thiếu). Rồi mới hỏi một câu ở cuối.`
  }
  return lang === 'en'
    ? '\n\nYour reply is only a question, but the user has a limited number of questions: answer now on reasonable assumptions stated in one sentence (or briefly cover the 2–3 likely cases), and put at most one question at the END.'
    : '\n\nCâu trả lời vừa rồi chỉ là một câu hỏi, mà người dùng có số lượt hỏi giới hạn: trả lời ngay với giả định hợp lý nói rõ trong một câu (hoặc trả lời gọn 2–3 khả năng chính), rồi mới đặt tối đa một câu hỏi ở CUỐI.'
}

/**
 * CONSULT_V3 (rerun 3, uat-4): the same question came through the ask_user TOOL, which ends the turn before any answer check runs. The runtime's
 * refusal seam (loop.ts refuseAsk, at most two per turn) answers that call with this note when the user's message states the trip's length.
 * Wired in runtime/index.ts under CONSULT_V3 (owner approved ASK-RULE-REQUEST 17/10; the V3 route test's expectation changed with it).
 */
export function planFirstAskRefusal(userText: string, lang: string): { note: string; kind: string } | null {
  if (!TRIP_LENGTH.test(userText)) return null
  return { note: planNotQuestionRetryNote(lang).trim(), kind: 'v3_plan_first' }
}

export function planNotQuestionRetryNote(lang: string): string {
  return lang === 'en'
    ? '\n\nThe user already gave the trip and its length. Do not ask first: write the full day-by-day plan now with reasonable assumptions stated in one sentence (departure city, dates/season, travel style), estimates labelled as estimates; put at most one question at the END, after the plan.'
    : '\n\nNgười dùng đã nói chuyến đi và số ngày. Đừng hỏi trước: lập NGAY lịch đầy đủ từng ngày với giả định hợp lý nói rõ trong một câu (nơi xuất phát, thời điểm/mùa, kiểu đi), số tiền ước tính ghi rõ là ước tính; nếu cần hỏi thì hỏi tối đa một câu ở CUỐI, sau lịch.'
}
