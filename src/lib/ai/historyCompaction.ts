// ── History compaction (cost optimization item 6, 2026-09-18) ────────────────
//
// The model reads the last ten messages verbatim. On a long thread every older
// assistant reply (≈700–1 100 chars of prose each, after marker stripping) is
// re-sent uncached on every step. Deterministic — no summarising call — because
// the facts a follow-up needs are already carried elsewhere: the V1 reference
// resolver and the carried evidence read the LAST assistant reply in full (it is
// never touched here), ADR-024 shopping evidence is server-side, and the
// situation frame folds the user's own turns (all user turns stay verbatim —
// they are short and they are the ground truth of what was asked).
//
// An OLDER assistant reply keeps: its first paragraph (the decision sentence)
// and the list of venues it bolded — the two things a later "quán số 2 …" or
// "so với quán đầu tiên" can refer back to — capped at `MAX_OLD_ASSISTANT_CHARS`.

import { properNounShape } from './groundingGate'
import { REQUEST_HISTORY_BUDGET } from '@/lib/chat/requestHistory'

export const MAX_OLD_ASSISTANT_CHARS = 420
/** How many most-recent messages stay verbatim (the current user turn + the last exchange). */
export const VERBATIM_TAIL = 3

const BOLD_RE = /\*\*([^*\n]{2,60}?)\*\*/g

export function compactOldAssistant(text: string): string {
  if (!text || text.length <= MAX_OLD_ASSISTANT_CHARS) return text
  const first = text.split(/\n\s*\n/)[0].trim()
  const names: string[] = []
  for (const m of text.matchAll(BOLD_RE)) {
    const n = m[1].trim()
    // Only a bold PROPER NOUN is a venue the reply suggested (the gate's positive shape, A.1).
    // No row set exists for an older reply (markers already stripped), so the shape is the test.
    if (!/^\d|⭐|đánh giá|reviews?/i.test(n) && properNounShape(n) !== 'prose' && !names.includes(n)) names.push(n)
  }
  const head = first.length > MAX_OLD_ASSISTANT_CHARS ? first.slice(0, MAX_OLD_ASSISTANT_CHARS).replace(/\s+\S*$/, '') + '…' : first
  const tail = names.length > 0 ? `\n(đã gợi ý: ${names.map(n => `**${n}**`).join(', ')})` : ''
  return `${head}${tail}`
}

/**
 * Compact every assistant message except those in the verbatim tail. Messages
 * are the sanitized model-facing copies (markers already stripped).
 */
export function compactHistory<M extends { role: string; content: unknown }>(messages: M[]): M[] {
  const cut = Math.max(0, messages.length - VERBATIM_TAIL)
  return messages.map((m, i) => (i >= cut || m.role !== 'assistant' ? m : compactAssistantMessage(m)))
}

/** One assistant message with its text compacted (string content or text parts; other parts pass through). */
function compactAssistantMessage<M extends { role: string; content: unknown }>(m: M): M {
  if (typeof m.content === 'string') return { ...m, content: compactOldAssistant(m.content) }
  if (Array.isArray(m.content)) {
    const parts = (m.content as unknown[]).map(part => {
      if (part && typeof part === 'object' && (part as { type?: string }).type === 'text') {
        const p = part as { type: 'text'; text: string }
        return { ...p, text: compactOldAssistant(p.text) }
      }
      return part
    })
    return { ...m, content: parts as unknown as M['content'] }
  }
  return m
}

const textChars = (m: { content: unknown }): number => {
  if (typeof m.content === 'string') return m.content.length
  if (Array.isArray(m.content)) return (m.content as unknown[]).reduce<number>((n, p) => n + (p && typeof p === 'object' && (p as { type?: string }).type === 'text' ? String((p as { text?: string }).text ?? '').length : 0), 0)
  return 0
}

/**
 * ONE BRAIN (P0-1, 29/10 audit): the model reads the conversation it is answering. While the messages fit `budget` (the web client's own request
 * budget, `REQUEST_HISTORY_BUDGET`: no budget is raised) every message stays whole. Over it, assistant replies are compacted with the same
 * `compactOldAssistant` the other routes use, OLDEST FIRST, one at a time, until the text fits. The last assistant reply (the one "cái thứ hai" /
 * "bảng ở trên" points at), every user turn, the roles and the order are never touched. When even that does not fit, the compacted history is
 * returned as it is (the 24 000-character input cap of `validateClientInput` already bounds what a client can send). Pure; the input is not mutated.
 */
export function compactHistoryToBudget<M extends { role: string; content: unknown }>(messages: M[], budget = REQUEST_HISTORY_BUDGET): M[] {
  let total = messages.reduce((n, m) => n + textChars(m), 0)
  if (total <= budget) return messages
  let lastAssistant = -1
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'assistant') { lastAssistant = i; break }
  const out = [...messages]
  for (let i = 0; i < out.length && total > budget; i++) {
    if (out[i].role !== 'assistant' || i === lastAssistant) continue
    const before = textChars(out[i])
    out[i] = compactAssistantMessage(out[i])
    total -= before - textChars(out[i])
  }
  return out
}
