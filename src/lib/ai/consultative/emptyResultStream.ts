// ── The last word on a turn that found nothing, or that is about to repeat the user — chat2 A2 ──────
//
// A transform over the AI-SDK data stream, same shape as `askAfterStream`. Two jobs, both by code:
//
//  1. NO RESULT. When the place search returned nothing reliable after every relaxation
//     (`getEmpty()` non-null), the model's prose is replaced by the honest block: "mình tìm '…'
//     nhưng chưa thấy kết quả đủ tin cậy", a Google Maps button built from the keywords, and chips.
//     The model's own text on such a turn was the measured defect ("Chưa có quán Việt nào… Bạn muốn
//     nói sang khu vực lân cận không?" — a question, and a dead end).
//  2. LOOP. On a turn right after the assistant asked back (`bufferText`), the reply is held and a
//     trailing question that only restates the user's own words is dropped (echoQuestion.ts).
//
// Text is buffered only in those two cases; every other turn streams untouched. A turn that already
// streamed text before the search came back empty (no pre-search) keeps it and gets the block appended.

import { dropEchoQuestions } from './echoQuestion'
import { noResultBlock } from '../placeRelax'

export interface EmptyResult { query: string; area?: string | null }

export function emptyResultStream(
  body: ReadableStream<Uint8Array>,
  opts: {
    getEmpty: () => EmptyResult | null
    bufferText: boolean
    userTexts: readonly string[]
    lang: string
    log?: (e: Record<string, unknown>) => void
  },
): ReadableStream<Uint8Array> {
  const dec = new TextDecoder(), enc = new TextEncoder()
  const log = opts.log ?? ((e: Record<string, unknown>) => console.log(JSON.stringify(e)))
  let rest = '', buffered = '', streamed = false, failed = false
  const held: string[] = []
  const holdingText = () => opts.bufferText || opts.getEmpty() !== null
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, c) {
      rest += dec.decode(chunk, { stream: true })
      const lines = rest.split('\n'); rest = lines.pop() ?? ''
      for (const l of lines) {
        if (l.startsWith('d:')) { held.push(l); continue }
        if (l.startsWith('3:')) failed = true
        if (l.startsWith('0:') && !streamed && holdingText()) {
          try { buffered += JSON.parse(l.slice(2)) } catch { /* not ours */ }
          continue
        }
        if (l.startsWith('0:')) streamed = true
        c.enqueue(enc.encode(l + '\n'))
      }
    },
    flush(c) {
      if (rest) { if (rest.startsWith('d:')) held.push(rest); else c.enqueue(enc.encode(rest + '\n')) }
      const empty = failed ? null : opts.getEmpty()
      if (empty) {
        // The model's prose is replaced when it was held; appended after it when it already streamed.
        const block = noResultBlock({ query: empty.query, area: empty.area, lang: opts.lang })
        const text = streamed ? block : block.replace(/^\n+/, '')
        c.enqueue(enc.encode(`0:${JSON.stringify(text)}\n`))
        log({ type: 'tappyai_empty_result', replaced: !streamed, model_chars: buffered.length, query: empty.query, area: empty.area ?? null })
      } else if (buffered) {
        const cleaned = failed ? { text: buffered, removed: 0 } : dropEchoQuestions(buffered, opts.userTexts)
        c.enqueue(enc.encode(`0:${JSON.stringify(cleaned.text)}\n`))
        if (opts.bufferText) log({ type: 'tappyai_echo_guard', removed: cleaned.removed, chars_in: buffered.length })
      }
      for (const l of held) c.enqueue(enc.encode(l + '\n'))
    },
  }))
}
