// ── PRE-SEARCH — the route runs the deterministic first tool call BEFORE the model ─────────────
//
// A1(c), 2026-09-20 (owner opened the architecture lock for exactly this). Measured on 39 gate
// turns and 11 Android turns: a place turn is two model steps — step 1 (≈6–7.7 s, ~3–4k uncached
// tokens) exists only to emit the `search_places` call whose arguments the route already knows
// (searchNow.ts derives them from the frames, and that directive is what the model copies), then
// step 2 writes the prose. With the rows fetched here and handed to the model as a completed
// tool-call / tool-result pair, the turn is ONE model step: the same prose, ~6 s sooner, and the
// step-1 tokens never bought.
//
// THE INVARIANT (consultativeArchitecture.test.ts): still exactly one AI.stream() per turn. The
// route may run at most ONE tool before it, and only the call the search-now directive names —
// arguments derived by code from the frames, never by a model. Nothing else changes: the same
// wrapped tool object runs (gate + timing + ranking + collector side effects), the same result
// reaches the model, and the client stream carries the same `9:` / `a:` frames it always did, so
// every guard, card and telemetry consumer downstream is byte-for-byte on the path it was measured
// on. Logged as `tappyai_presearch`; a failure is a tool error result, never a silent skip.
//
// Scope today: place searches (restaurant / cafe / spa / bar / attraction / cinema). Hotels (dates)
// and shopping (the model sharpens the product query) keep the two-step turn — stated in the report.

import type { SearchNow } from './searchNow'
import type { SituationFrame } from './situationFrame'

export interface PresearchPlan {
  toolName: 'search_places'
  args: { query: string; type?: string; location?: string }
  /** true = the directive's arguments were the call; false = the route used the suggested query. */
  exact: boolean
  /** A1(d): the same search as the previous turn, for "gợi ý thêm" — the venues already shown. */
  reuse?: { shown: string[] }
}

const PLACE_TYPES = new Set(['restaurant', 'cafe', 'spa', 'bar', 'attraction', 'cinema'])

export function planPresearch(searchNow: SearchNow | null, situation: SituationFrame | null, opts: { clip?: boolean; planning?: boolean; movie?: boolean } = {}): PresearchPlan | null {
  if (!searchNow || !situation || opts.clip || opts.planning || opts.movie) return null
  if (!PLACE_TYPES.has(searchNow.type)) return null
  if (!searchNow.query.trim()) return null
  const location = situation.place.text?.trim() || undefined
  return { toolName: 'search_places', args: { query: searchNow.query.trim(), type: searchNow.type, ...(location ? { location } : {}) }, exact: searchNow.exact }
}

export interface PresearchOutcome {
  toolCallId: string
  toolName: string
  args: PresearchPlan['args']
  result: unknown
  ms: number
}

/** The two CoreMessages that put a completed tool call into the model's history. */
export function presearchMessages(o: PresearchOutcome): Array<{ role: 'assistant' | 'tool'; content: unknown }> {
  return [
    { role: 'assistant', content: [{ type: 'tool-call', toolCallId: o.toolCallId, toolName: o.toolName, args: o.args }] },
    { role: 'tool', content: [{ type: 'tool-result', toolCallId: o.toolCallId, toolName: o.toolName, result: o.result }] },
  ]
}

/** The data-stream frames the SDK would have written for the same call — prepended to the model's stream. */
export function presearchFrames(o: PresearchOutcome): string {
  return `9:${JSON.stringify({ toolCallId: o.toolCallId, toolName: o.toolName, args: o.args })}\na:${JSON.stringify({ toolCallId: o.toolCallId, result: o.result })}\n`
}

/** A body that yields `prefix` first, then everything the model streams. */
export function prefixBody(prefix: string, body: ReadableStream<Uint8Array> | null): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(enc.encode(prefix))
      if (!body) { controller.close(); return }
      const reader = body.getReader()
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) controller.enqueue(value)
        }
        controller.close()
      } catch (e) {
        controller.error(e)
      }
    },
    cancel(reason) { return body?.cancel(reason) },
  })
}
