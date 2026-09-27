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

import { buildProgressAnnotation } from '@/lib/recommendation/progressAnnotation'
import type { SearchNow } from './searchNow'
import type { SituationFrame } from './situationFrame'
import { routeInText } from '@/lib/ai/tools/travel'

export interface PresearchPlan {
  toolName: 'search_places'
  args: { query: string; type?: string; location?: string }
  /** true = the directive's arguments were the call; false = the route used the suggested query. */
  exact: boolean
  /** A1(d): the same search as the previous turn, for "gợi ý thêm" — the venues already shown. */
  reuse?: { shown: string[] }
}

const PLACE_TYPES = new Set(['restaurant', 'cafe', 'spa', 'bar', 'attraction', 'cinema'])

// UAT4 consultative-40 A/B (27 Sep 2026, flags ON, head vs 19 Sep): the pre-search ran the SUGGESTED
// query too — `exact: false` means "the model may sharpen it" — so a specified request lost its
// subject and its area before the model ever saw it. Measured live: "tim quan bun bo ngon o q1 duoi
// 80k" → `quán ăn khuya @ null` (2 rows), "Karaoke … Gò Vấp" → `quán karaoke @ null`, "spa massage
// chan gan q1" → `spa massage @ null`; the 19 Sep model wrote "bún bò ngon Quận 1 @ Quận 1". Now only
// an EXACT directive (vague request, clarify answer, named venue) is pre-searched; a suggested one
// goes back to the model as the directive it sharpens. A "more" turn repeats the previous search
// and keeps its pre-search (`more`). An exact call with no place in the situation takes the district
// the user stated earlier in the same subject (`statedArea`), not nothing.
export function planPresearch(searchNow: SearchNow | null, situation: SituationFrame | null, opts: { clip?: boolean; planning?: boolean; movie?: boolean; more?: boolean; statedArea?: string | null } = {}): PresearchPlan | null {
  if (!searchNow || !situation || opts.clip || opts.planning || opts.movie) return null
  if (!searchNow.exact && !opts.more) return null
  if (!PLACE_TYPES.has(searchNow.type)) return null
  if (!searchNow.query.trim()) return null
  const location = situation.place.text?.trim() || opts.statedArea?.trim() || undefined
  return { toolName: 'search_places', args: { query: searchNow.query.trim(), type: searchNow.type, ...(location ? { location } : {}) }, exact: searchNow.exact }
}

/**
 * Owner 2026-09-28 (c40 T7): a flight request is the fare tool's call, and the fare tool needs no
 * date. When the request names two airports, the route runs that call before the model, exactly as
 * it runs a place search, so the turn is one model step. Measured without it: the model still wrote
 * "Để tìm vé rẻ nhất, mình cần biết: … Sau khi bạn nói ngày…" before calling. A date written as
 * dd/mm (or dd/mm/yyyy) becomes departDate; anything vaguer ("tuần sau") leaves it out.
 */
export interface FlightPresearchPlan {
  toolName: 'get_flight_prices'
  args: { origin: string; destination: string; departDate?: string }
}

export function planFlightPresearch(searchNow: SearchNow | null, text: string, now: Date, opts: { planning?: boolean } = {}): FlightPresearchPlan | null {
  if (searchNow?.type !== 'flight' || opts.planning) return null
  const route = routeInText(text)
  if (!route) return null
  const m = text.match(/(?<!\d)(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{4}))?(?!\d)/)
  let departDate: string | undefined
  if (m) {
    const day = Number(m[1]), month = Number(m[2])
    const vnToday = new Date(now.getTime() + 7 * 3600 * 1000)
    let year = m[3] ? Number(m[3]) : vnToday.getUTCFullYear()
    const d = new Date(Date.UTC(year, month - 1, day))
    if (!m[3] && d.getTime() < Date.UTC(vnToday.getUTCFullYear(), vnToday.getUTCMonth(), vnToday.getUTCDate())) year++
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) departDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  return { toolName: 'get_flight_prices', args: { ...route, ...(departDate ? { departDate } : {}) } }
}

export interface PresearchOutcome {
  toolCallId: string
  toolName: string
  args: PresearchPlan['args'] | FlightPresearchPlan['args']
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

/** A1(b): the progress frame that leads a pre-search turn — written before the search runs. */
export function searchingFrame(lang: string): string {
  return '8:' + JSON.stringify([buildProgressAnnotation('searching', lang)]) + '\n'
}

/**
 * A1(b): a body that yields `prefix` NOW and the turn's own stream once `produce` resolves — the
 * first byte no longer waits for the pre-search. `produce` is the rest of the route, unchanged;
 * a non-OK response or a throw inside it becomes the SDK's error part (`3:`) and a finish frame,
 * so the client ends the turn with an error instead of a hung stream.
 */
export function deferredBody(prefix: string, produce: () => Promise<Response>): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  let inner: ReadableStream<Uint8Array> | null = null
  let cancelled = false
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(enc.encode(prefix))
      let res: Response
      try {
        res = await produce()
      } catch (e) {
        console.error('[chat] deferred turn failed:', e)
        controller.enqueue(enc.encode('3:' + JSON.stringify('ai_error') + '\nd:' + JSON.stringify({ finishReason: 'error' }) + '\n'))
        controller.close()
        return
      }
      if (!res.ok || !res.body) {
        controller.enqueue(enc.encode('3:' + JSON.stringify('ai_error') + '\nd:' + JSON.stringify({ finishReason: 'error' }) + '\n'))
        controller.close()
        return
      }
      if (cancelled) { await res.body.cancel('client_gone').catch(() => {}); return }
      inner = res.body
      const reader = inner.getReader()
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
    cancel(reason) { cancelled = true; return inner?.cancel(reason) },
  })
}
