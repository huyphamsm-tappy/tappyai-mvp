// ── One brain · pictures (CONSULT_ONE_BRAIN_MEDIA, 28/10/2026) ────────────────────────────────────────────────────────────────────────
//
// Owner 28/10 (screenshots of ChatGPT Go, no Think): the answers carry pictures of what they talk about — the subject, the dishes, the places.
// The one-brain turn gets the V4 picture layer (answerV4/docMedia.ts, built 19/10 for the agent runtime): subject cards from Wikipedia and one
// picture per item of a list answer (Wikipedia first, then the image search; at most 6 billable images, 4.5 s in all). What the pictures show
// is read by the V4 understanding call (answerV4/understand.ts) — for the PICTURES only: it never routes the turn, never reaches the answer
// model, and it runs beside the answer, not before it.
// This stream passes the answer through untouched and holds only the finish frame: when the answer is complete, the subject card goes out as
// a [TAPPY_MEDIA] block (kept with the message, like the V3 card) and the item pictures as the tappy.doc_media.v1 annotation (live-only, never
// stored: web images are not persisted). Any failure or the deadline: no picture, the finish frame as it was.

import { resolveDocMedia, type DocMediaDeps } from '@/lib/ai/answerV4/docMedia'
import type { UnderstandResult } from '@/lib/ai/answerV4/understand'
import { sanitizeMediaBlock } from '@/lib/media/mediaHosts'
import { docMediaFrame, sanitizeDocMedia } from '@/lib/answerDoc/media'

export interface OneBrainMediaOptions {
  /** The understanding call, started when the answer started. */
  understanding: Promise<UnderstandResult>
  /** True when the turn already shows place / product cards (their own pictures): no item pictures then. */
  cardTurn: () => boolean
  /** Wall-clock budget for the pictures after the answer ends (the understanding included). */
  deadlineMs?: number
  deps?: DocMediaDeps
  /** Test seam. */
  resolve?: typeof resolveDocMedia
  log?: (line: Record<string, unknown>) => void
}

/** The whole picture step after the answer ends; the picture search itself gets ONE_BRAIN_MEDIA_SEARCH_MS (measured 28/10 on localhost: four item
 *  pictures of an itinerary did not come back within the V4 default of 4.5 s). The answer text is already on screen while this runs. */
export const ONE_BRAIN_MEDIA_DEADLINE_MS = 9000
export const ONE_BRAIN_MEDIA_SEARCH_MS = 7000

/** The answer text of a data-stream body so far: the "0:" text parts, decoded. */
function textPart(line: string): string {
  if (!line.startsWith('0:')) return ''
  try { const v = JSON.parse(line.slice(2)); return typeof v === 'string' ? v : '' } catch { return '' }
}

export function oneBrainMediaStream(body: ReadableStream<Uint8Array>, o: OneBrainMediaOptions): ReadableStream<Uint8Array> {
  const dec = new TextDecoder()
  const enc = new TextEncoder()
  let partial = ''
  let answer = ''
  // From the first finish frame on, every line is held until the pictures are known (the finish frame must stay last).
  let held: string[] | null = null
  const resolve = o.resolve ?? resolveDocMedia
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctrl) {
      partial += dec.decode(chunk, { stream: true })
      const lines = partial.split('\n')
      partial = lines.pop() ?? ''
      for (const line of lines) {
        if (held) { held.push(line); continue }
        if (line.startsWith('d:')) { held = [line]; continue }
        answer += textPart(line)
        ctrl.enqueue(enc.encode(line + '\n'))
      }
    },
    async flush(ctrl) {
      const t0 = Date.now()
      let frames = ''
      let trace: Record<string, unknown> = { type: 'tappyai_one_brain_media' }
      try {
        const work = (async () => {
          const r = await o.understanding
          if (!r.u) return { skipped: r.error ?? 'no_understanding' }
          const dm = await resolve(r.u, answer, { skipItems: o.cardTurn() }, { timeoutMs: ONE_BRAIN_MEDIA_SEARCH_MS, ...o.deps })
          const block = dm.block ? sanitizeMediaBlock(dm.block) : null
          const ann = dm.annotation ? sanitizeDocMedia(dm.annotation) : null
          if (block) frames += '0:' + JSON.stringify(`\n\n[TAPPY_MEDIA]${JSON.stringify(block)}[/TAPPY_MEDIA]`) + '\n'
          if (ann) frames += docMediaFrame(ann)
          return { understand_ms: r.ms, understand_usd: r.usd, block: block?.kind ?? null, item_images: ann?.items.length ?? 0, web_images: dm.webImages }
        })()
        const out = await Promise.race([work, new Promise<{ skipped: string }>(res => setTimeout(() => res({ skipped: 'deadline' }), o.deadlineMs ?? ONE_BRAIN_MEDIA_DEADLINE_MS))])
        if ('skipped' in out) frames = ''
        trace = { ...trace, ...out, ms: Date.now() - t0 }
      } catch (e) {
        frames = ''
        trace = { ...trace, skipped: 'error', error: e instanceof Error ? e.name : 'unknown', ms: Date.now() - t0 }
      }
      o.log?.(trace)
      ctrl.enqueue(enc.encode(frames + (held ? held.map(l => l + '\n').join('') : '') + partial))
    },
  }))
}
