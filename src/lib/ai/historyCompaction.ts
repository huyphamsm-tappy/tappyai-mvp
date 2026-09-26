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
  return messages.map((m, i) => {
    if (i >= cut || m.role !== 'assistant') return m
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
  })
}
