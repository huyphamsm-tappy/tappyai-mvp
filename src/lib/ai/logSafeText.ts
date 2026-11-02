// ── S4 · what a log line may keep of a free text (review S4, probe2/s4-design.md) ───────────────────────────────────────────────────────────────────────────
//
// A production log line must not carry what the user typed (a query built from their words, a place they named, a product they described). It keeps the LENGTH of the
// text and a label of WHERE the text came from, decided by the code's own state - never a character of the text, never a hash of it (a short Vietnamese query could be
// guessed back from a dictionary of places). Always on: no flag (Owner, Wave 5). Pure.

/** Where a logged free text came from: built by the code from the turn, reused from stored state, a tool argument (the model's or the code's), the user's own words. */
export type LogTextSource = 'code' | 'stored' | 'tool_arg' | 'user_words'

/** `{ len, kind }` for a free text; an empty or non-string value is `{ len: 0, kind: 'none' }`. The length is of the trimmed text. */
export function logText(s: unknown, kind: LogTextSource): { len: number; kind: LogTextSource | 'none' } {
  const t = typeof s === 'string' ? s.trim() : ''
  return t ? { len: t.length, kind } : { len: 0, kind: 'none' }
}
