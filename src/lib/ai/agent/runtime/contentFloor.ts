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

export function contentRetryNote(lang: string): string {
  return lang === 'en'
    ? '\n\nYour last answer has no content for what the user asked. Answer it now: confirm in a few words, then give 2–3 useful sentences about the subject the conversation has settled on (from the sources already read above or reliable general knowledge; no new figures that are not in them). Do not ask again what they mean when they have already told you; do not restate the name only. If it is genuinely still unclear WHAT the subject is, ask ONE short clarifying question instead of guessing.'
    : '\n\nCâu trả lời vừa rồi chưa có nội dung cho điều người dùng hỏi. Trả lời ngay: xác nhận bằng vài chữ rồi nói 2–3 câu hữu ích về chủ đề cuộc trò chuyện đã chốt (từ nguồn đã đọc ở trên hoặc kiến thức đáng tin; không thêm con số không có trong đó). Họ đã nói rõ rồi thì đừng hỏi lại họ muốn hỏi gì, đừng chỉ nhắc lại cái tên. Nếu thật sự vẫn chưa rõ chủ đề là gì thì hỏi MỘT câu làm rõ ngắn thay vì đoán.'
}
