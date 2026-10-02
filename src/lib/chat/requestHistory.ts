// ── What the web client sends as history (UAT3 P0, 2026-09-27) ──────────────────────────────────
//
// Measured on the owner's 22-turn thread: every turn after ~20 answered "Mình gặp trục trặc…"
// forever. The client sent the whole transcript verbatim, and an assistant turn carries its
// machine blocks — a [TAPPY_SHOPPING] payload alone was ~10 000 characters — so the thread hit the
// server's 24 000-character input budget (`CLIENT_INPUT_LIMITS.maxMessageTextChars`) and every
// request was a 413 from then on. The server never reads those blocks from history: it strips
// them before the model (and reads only the last ten messages), and ADR-024 listing facts are
// reloaded server-side by key.
//
// So the request carries, for OLDER assistant turns, their prose only; the LAST assistant turn
// stays verbatim (a follow-up like "cái thứ hai" reads it); and if the thread is still over the
// budget, the oldest turns are dropped — the newest user turn always goes. What the user SEES is
// untouched: this shapes the request body only.

/** Below the server's 24 000-character cap, leaving room for the new turn's own growth. */
export const REQUEST_HISTORY_BUDGET = 20_000

type Part = { type?: string; text?: string }
type Msg = { role: string; content: unknown; [k: string]: unknown }

const BLOCK_CLOSED = /\[(TAPPY_[A-Z_]+|CTA_BUTTONS|FOLLOWUPS)\][\s\S]*?\[\/\1\]/gi
const BLOCK_OPEN = /\[(TAPPY_[A-Z_]+|CTA_BUTTONS|FOLLOWUPS)\][\s\S]*$/gi
const STRAY_TAG = /\[\/?(TAPPY_[A-Z_]+|CTA_BUTTONS|FOLLOWUPS)\]/gi
const IMAGE_MD = /!\[[^\]]*\]\([^)]*\)/g

/** An assistant turn's prose, without app markers or image markdown. */
export function proseOnly(text: string): string {
  return text.replace(BLOCK_CLOSED, '').replace(BLOCK_OPEN, '').replace(STRAY_TAG, '').replace(IMAGE_MD, '').replace(/\n{3,}/g, '\n\n').trim()
}

function textLength(m: Msg): number {
  if (typeof m.content === 'string') return m.content.length
  if (Array.isArray(m.content)) return (m.content as Part[]).reduce((n, p) => n + (p && p.type === 'text' && typeof p.text === 'string' ? p.text.length : 0), 0)
  return 0
}

function mapText(m: Msg, f: (s: string) => string): Msg {
  if (typeof m.content === 'string') return { ...m, content: f(m.content) }
  if (Array.isArray(m.content)) return { ...m, content: (m.content as Part[]).map(p => (p && p.type === 'text' && typeof p.text === 'string' ? { ...p, text: f(p.text) } : p)) }
  return m
}

export function compactRequestMessages<M extends Msg>(messages: readonly M[], budget = REQUEST_HISTORY_BUDGET): M[] {
  let lastAssistant = -1
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'assistant') { lastAssistant = i; break }
  let out = messages
    .map((m, i) => (m.role === 'assistant' && i !== lastAssistant ? mapText(m, proseOnly) : m))
    // A turn that was ONLY blocks is now empty; the server drops empty assistant turns anyway.
    .filter(m => !(m.role === 'assistant' && textLength(m) === 0)) as M[]

  const total = () => out.reduce((n, m) => n + textLength(m), 0)
  // Still over: the last assistant turn goes to prose too, then the oldest turns go.
  if (total() > budget) out = out.map(m => (m.role === 'assistant' ? mapText(m, proseOnly) as M : m))
  while (total() > budget && out.length > 1) {
    out = out.slice(1)
    // Never open the history on an assistant turn.
    while (out.length > 1 && out[0].role !== 'user') out = out.slice(1)
  }
  return out
}

/**
 * UI-only fields `useChat` keeps on every message. The server rebuilds each message from `role` +
 * `content` and drops these by construction (`validateClientInput`), so they only ever cost bytes.
 *
 * 🚨 UAT4 P0 (2026-09-27): compaction above rewrites `content`, but `parts` carries the SAME reply
 * again — raw, with its [TAPPY_*] blocks — and every tool invocation WITH its full result (the
 * place/product rows). Measured on web: a 22-turn thread passed the 256 KB raw text ceiling
 * (`readCappedBody`) at turn 12 and every later turn was a 413, before the server could compact.
 */
const UI_ONLY_KEYS = ['parts', 'toolInvocations', 'annotations'] as const

export function stripUiOnlyFields<M extends Msg>(m: M): M {
  if (!UI_ONLY_KEYS.some(k => k in m)) return m
  const copy: Msg = { ...m }
  for (const k of UI_ONLY_KEYS) delete copy[k]
  return copy as M
}

/**
 * `useChat`'s `fetch`: the same request with `messages` compacted and UI-only fields dropped.
 * Anything that is not a JSON body with a `messages` array passes through untouched.
 */
export const withCompactedHistory: typeof fetch = (input, init) => {
  if (init && typeof init.body === 'string') {
    try {
      const body = JSON.parse(init.body) as { messages?: unknown }
      if (Array.isArray(body.messages)) {
        const messages = compactRequestMessages((body.messages as Msg[]).map(stripUiOnlyFields))
        return fetch(input, { ...init, body: JSON.stringify({ ...body, messages }) })
      }
    } catch { /* not JSON — send as is */ }
  }
  return fetch(input, init)
}
