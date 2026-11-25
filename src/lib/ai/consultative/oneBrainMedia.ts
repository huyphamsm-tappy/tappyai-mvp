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
import type { UnderstandResult, TurnUnderstanding } from '@/lib/ai/answerV4/understand'
import { sanitizeMediaBlock } from '@/lib/media/mediaHosts'
import { pickTopicVariant } from '@/lib/media/topicImages'
import { docMediaFrame, sanitizeDocMedia } from '@/lib/answerDoc/media'
import { resolveSubjectImages, resolveGalleryImages, resolveStopImages, planStopsWithoutPhoto, type SubjectToIllustrate, type SubjectImageDeps, type GalleryShot } from '@/lib/ai/answerV4/subjectImages'
import { wikiLangOf } from '@/lib/ai/answerV4/docMedia'
import { SUBJECT_IMAGES_KIND, sanitizeSubjectImages, subjectImagesFrame } from '@/lib/answerDoc/subjectImages'

export interface OneBrainMediaOptions {
  /** The understanding call, started when the answer started. */
  understanding: Promise<UnderstandResult>
  /** True when the turn already shows place / product cards (their own pictures): no item pictures then. */
  cardTurn: () => boolean
  /** Wall-clock budget for the pictures after the answer ends (the understanding included). */
  deadlineMs?: number
  deps?: DocMediaDeps
  /** 16/11: the subjects of the subject cards the model declared (read when the answer ends); each one Wikipedia cannot illustrate gets one web picture. */
  subjects?: () => readonly SubjectToIllustrate[]
  /** 16/11: the shots of a gallery block the model declared (caption + search words); each gets one web picture. */
  gallery?: () => readonly GalleryShot[]
  subjectDeps?: SubjectImageDeps
  /** 16/11: the kinds of block the model declared this turn (trace only: how often a comparison gets its cards). */
  declared?: () => readonly string[]
  /** Which of a topic's pictures is shown: a random number in [0, 1) (default Math.random). */
  random?: () => number
  /** Test seam. */
  resolve?: typeof resolveDocMedia
  log?: (line: Record<string, unknown>) => void
}

/** The understanding's intents for which the turn is ABOUT the entities it names (what / who is it, how do they differ): only these get a subject card. */
export const SUBJECT_CARD_INTENTS: ReadonlySet<TurnUnderstanding['intent']> = new Set<TurnUnderstanding['intent']>(['knowledge', 'comparison'])

/** The whole picture step after the answer ends; the picture search itself gets ONE_BRAIN_MEDIA_SEARCH_MS (measured 28/10 on localhost: four item
 *  pictures of an itinerary did not come back within the V4 default of 4.5 s). The answer text is already on screen while this runs. */
export const ONE_BRAIN_MEDIA_DEADLINE_MS = 9000
export const ONE_BRAIN_MEDIA_SEARCH_MS = 7000

/** Trace only (counts, never words): how long the answer is, how many quote lines and markdown tables it has. Lets the layout be measured on real turns without reading them. Pure. */
export function answerShapeCounts(answer: string): { chars: number; quotes: number; md_tables: number } {
  const lines = answer.split('\n')
  return {
    chars: answer.length,
    quotes: lines.filter(l => /^\s{0,3}>\s?\S/.test(l)).length,
    md_tables: lines.filter(l => /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(l)).length,
  }
}

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
          const subjects = o.subjects?.() ?? []
          const shots = o.gallery?.() ?? []
          // 16/11 (owner's mockup: every stop of the itinerary has its photo): the stops of the answer's plan that no place card could illustrate get a web picture, confirmed by looking at it
          const stops = planStopsWithoutPhoto(answer)
          const [dm, subjectImages, galleryImages, stopImages] = await Promise.all([
            resolve(r.u, answer, { skipItems: o.cardTurn(), subjectIntents: SUBJECT_CARD_INTENTS, confirmSense: true },{ timeoutMs: ONE_BRAIN_MEDIA_SEARCH_MS, ...o.deps }),
            subjects.length ? resolveSubjectImages(subjects, wikiLangOf(r.u), o.subjectDeps).catch(() => []) : Promise.resolve([]),
            shots.length ? resolveGalleryImages(shots, o.subjectDeps).catch(() => []) : Promise.resolve([]),
            stops.length ? resolveStopImages(stops, o.subjectDeps).catch(() => []) : Promise.resolve([]),
          ])
          const subjectAnn = subjectImages.length || galleryImages.length || stopImages.length ? sanitizeSubjectImages({ kind: SUBJECT_IMAGES_KIND, v: 1, images: subjectImages, gallery: galleryImages, stops: stopImages }) : null
          if (subjectAnn) frames += subjectImagesFrame(subjectAnn)
          const block = dm.block ? sanitizeMediaBlock(dm.block) : null
          const ann = dm.annotation ? sanitizeDocMedia(dm.annotation) : null
          // 16/11 (owner's fixed pictures): a LIVE-information topic of the closed list gets its banner, only when the turn has no subject card of its own (the card is the picture then)
          const topicKey = r.u.topic_visual
          const topicBlock = !block && topicKey && topicKey !== 'none' ? sanitizeMediaBlock({ v: 1, kind: 'topic', topic: topicKey, variant: pickTopicVariant(topicKey, o.random) }) : null
          const shown = block ?? topicBlock
          if (shown) frames += '0:' + JSON.stringify(`\n\n[TAPPY_MEDIA]${JSON.stringify(shown)}[/TAPPY_MEDIA]`) + '\n'
          if (ann) frames += docMediaFrame(ann)
          return { understand_ms: r.ms, understand_usd: r.usd, block: shown?.kind ?? null, item_images: ann?.items.length ?? 0, web_images: dm.webImages, subject_images: subjectAnn?.images.length ?? 0, gallery_images: subjectAnn?.gallery?.length ?? 0, stop_images: subjectAnn?.stops?.length ?? 0, stops_asked: stops.length, ...answerShapeCounts(answer), shape: r.u.answer_shape, declared: [...(o.declared?.() ?? [])] }
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
