// ── Wave 6 · replay of the WRITING step only, from a writer capture (writerCapture.ts) ─────────────────────────────────────────────────────────────────────────────────────────────
//
// PURE and offline: it reads a capture, picks each turn's writing call by a rule registered BEFORE any result (probe2/w6-bien-the.md), builds the request of each pre-registered variant, and packs
// the answers as a run folder make-blind-pairs.mjs can pair with the ChatGPT answers. It sends NOTHING: the paid call is an injected `send` (the paid entry point - through the metered model and
// the bench spend gate, with the key typed by the Owner in a hidden prompt - is NOT built here: it needs Gate 1 / launcher work the Owner has not approved; see probe2/w6-kha-thi.md).
// Nothing here is a rule about a question: the variants change the model or add ONE general writing instruction, the same for every turn.

import type { CapturedCall, WriterCaptureFile } from './writerCapture'

export type VariantId = 'V0' | 'V1' | 'V2' | 'V3'

/**
 * The V1 writing instruction, word for word as registered in probe2/w6-bien-the.md (its SHA-256 is recorded there; a test pins it). General: no question, no keyword, no example from any question set.
 * ASCII without diacritics, like the product's own rule lines (RESEARCH_RULE, TOOL_BY_NEED_RULE).
 */
export const V1_WRITING_NOTE = 'HUONG DAN VIET BO SUNG: Tra loi cu the va day du dua tren du lieu da co trong cuoc tro chuyen va trong ket qua cong cu: neu moc thoi gian, so lieu va nguon khi du lieu co; noi ro phan nao chua chac hoac chua kiem duoc; bo cuc gon, di thang vao dieu nguoi hoi can; khong don chu, khong lap lai cau hoi.'

export interface VariantSpec { id: VariantId; model: 'same' | 'stronger'; note: boolean }
export const VARIANTS: readonly VariantSpec[] = [
  { id: 'V0', model: 'same', note: false },
  { id: 'V1', model: 'same', note: true },
  { id: 'V2', model: 'stronger', note: false },
  { id: 'V3', model: 'stronger', note: true },
]

type Body = { model?: string; messages?: Array<{ role?: string; content?: unknown }>; tools?: unknown[]; tool_choice?: unknown; stream?: unknown; stream_options?: unknown; response_format?: unknown; [k: string]: unknown }

/** Pure. A rough size of what a call sent (characters of its messages): only used to compare the calls of ONE turn with each other. */
export function sentChars(body: unknown): number {
  try { return JSON.stringify((body as Body)?.messages ?? []).length } catch { return 0 }
}

export type WriterPick = { turn: string; n: number; body: Body; sentChars: number } | { turn: string; n: null; reason: string }

/**
 * Pure. The registered rule (w6-bien-the.md §2). Per turn, the writing call is the LAST request that
 *   (a) is not the intent call (no `response_format`),
 *   (b) answered with text: HTTP 200, at least one character of text, no tool call,
 *   (c) sent at least half as much as the largest request of that turn (a small helper call after the answer is not the writer: measured W5, E20 ends with a 679-token call).
 * A turn with no such request is reported with its reason and is not replayed.
 */
export function pickWriterCalls(capture: WriterCaptureFile): WriterPick[] {
  const turns: string[] = []
  for (const c of capture.calls) if (c.turn !== null && !turns.includes(c.turn)) turns.push(c.turn)
  return turns.map(turn => {
    const mine = capture.calls.filter(c => c.turn === turn && c.body !== null && typeof c.body === 'object')
    const largest = Math.max(0, ...mine.map(c => sentChars(c.body)))
    const ok = (c: CapturedCall) => !(c.body as Body).response_format && c.response?.status === 200 && (c.response?.textChars ?? 0) > 0 && (c.response?.toolCalls ?? 0) === 0 && sentChars(c.body) * 2 >= largest
    const pick = [...mine].reverse().find(ok)
    if (!pick) return { turn, n: null, reason: mine.length === 0 ? 'no readable request in this turn' : 'no request answered with text (or only small helper calls did)' }
    return { turn, n: pick.n, body: pick.body as Body, sentChars: sentChars(pick.body) }
  })
}

/** Pure. Appends the note to the FIRST system message (string content, or a text part); a request without a system message gets one in front. */
function withNote(messages: NonNullable<Body['messages']>, note: string): NonNullable<Body['messages']> {
  const i = messages.findIndex(m => m.role === 'system')
  if (i < 0) return [{ role: 'system', content: note }, ...messages]
  const m = messages[i]!
  const content = typeof m.content === 'string' ? `${m.content}\n\n${note}` : Array.isArray(m.content) ? [...m.content, { type: 'text', text: note }] : note
  return messages.map((x, k) => (k === i ? { ...x, content } : x))
}

/**
 * Pure. The request a variant sends, from the captured writer call (registered, w6-bien-the.md §3): the same messages and settings, EXCEPT
 *   - one answer, not streamed (`stream` and `stream_options` removed): the text is the same, only the transport differs;
 *   - when the call carried tools, `tool_choice: "none"`: the step under test is writing, a replay must not start a new search;
 *   - V1 / V3: the note appended to the first system message; V2 / V3: `model` replaced by the Owner's choice (refused when none is given).
 */
export function variantRequest(body: Body, variant: VariantSpec, o: { strongerModel?: string } = {}): Body {
  if (variant.model === 'stronger' && !o.strongerModel) throw new Error(`${variant.id}: no stronger model chosen (the Owner picks it from the price table)`)
  const out: Body = { ...body }
  delete out.stream; delete out.stream_options
  if (Array.isArray(body.tools) && body.tools.length > 0) out.tool_choice = 'none'
  if (variant.note) out.messages = withNote(body.messages ?? [], V1_WRITING_NOTE)
  if (variant.model === 'stronger') out.model = o.strongerModel
  return out
}

export interface ReplayAnswer { turn: string; text: string | null; error?: string; usd: number | null }
/** The injected paid call: returns the answer text and its cost. NOT implemented in this file (see the header). */
export type ReplaySend = (request: Body, meta: { turn: string; variant: VariantId }) => Promise<{ text: string; usd: number | null }>

/** Runs one variant over the picked calls, one after the other; a failed call is recorded and the next one still runs. Pure apart from `send`. */
export async function replayVariant(picks: readonly WriterPick[], variant: VariantSpec, send: ReplaySend, o: { strongerModel?: string } = {}): Promise<ReplayAnswer[]> {
  const out: ReplayAnswer[] = []
  for (const p of picks) {
    if (p.n === null) { out.push({ turn: p.turn, text: null, error: `not replayed: ${p.reason}`, usd: 0 }); continue }
    try {
      const r = await send(variantRequest(p.body, variant, o), { turn: p.turn, variant: variant.id })
      out.push({ turn: p.turn, text: r.text, usd: r.usd })
    } catch (e) {
      out.push({ turn: p.turn, text: null, error: String(e instanceof Error ? e.message : e).slice(0, 200), usd: null })
    }
  }
  return out
}

/**
 * Pure. The run file make-blind-pairs.mjs reads (it needs `turns[].id` and `turns[].answer`), plus what tells "deeper" from "longer" apart: the characters of every answer and their total.
 * A turn that was not replayed keeps an empty answer and says why (the pairing tool then reports it, never pairs it).
 */
export function packReplayRun(answers: readonly ReplayAnswer[], meta: { variant: VariantId; captureFile: string; questionSha256: string | null; model: string | null; at: string }) {
  const turns = answers.map(a => ({ id: a.turn, answer: a.text ?? '', chars: (a.text ?? '').length, ...(a.error ? { replayError: a.error } : {}), usd: a.usd }))
  const known = answers.filter(a => typeof a.usd === 'number').reduce((s, a) => s + (a.usd as number), 0)
  return {
    kind: 'tappy-writer-replay', version: 1, variant: meta.variant, model: meta.model, at: meta.at, captureFile: meta.captureFile,
    questionFile: { sha256: meta.questionSha256 },
    turns,
    summary: { turns: turns.length, answered: turns.filter(t => t.chars > 0).length, notReplayed: turns.filter(t => t.replayError).length, totalChars: turns.reduce((s, t) => s + t.chars, 0), knownUsd: Math.round(known * 1e6) / 1e6, unknownCostTurns: answers.filter(a => a.usd === null).length },
  }
}
