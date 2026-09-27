import { REPEAT_SIMILARITY, MIN_PROSE, similarity, dropRepeatedReply } from '@/lib/chat/replyRepeat'

export { REPEAT_SIMILARITY, similarity, dropRepeatedReply }

// ── One reply, not two (UAT3, 2026-09-27) ────────────────────────────────────────────────────────
//
// Measured on Android (evidence/uat3-location-prompt-2026-09-27/finding-duplicated-reply-turn7.json):
// a clarify turn was stored as two slightly different versions of the same reply back to back —
// "…Mình sẽ tìm những quán ăn ngon gần vị trí của bạn ngay!Mình cần biết bạn đang ở khu vực nào…".
// A multi-step turn wrote its answer in step 1, called a tool, and wrote it again in step 2; every
// step's `0:` text reaches the client, which concatenates and saves it. Not deterministic (two
// replays of the same turn produced one reply), so the guard is on the STREAM, for every client:
//
//  1. Streamed steps: once a step has put real prose on the wire, the NEXT step's frames are held
//     (order preserved) until that step ends; if its text repeats the previous prose (≥ 80% similar)
//     the text is dropped, the other frames go through. A step that emitted no prose (the normal
//     "call a tool, then answer" turn) holds nothing, so ordinary answers still stream.
//  2. Buffered replies arrive as ONE text frame; if its opening recurs later and the two halves are
//     ≥ 80% similar, only the LAST version (the final step's) is kept.

type Frame = { line: string; text: string | null }

/** The stream guard. Frames are `<prefix>:<json>\n` lines (AI SDK data stream). */
export function stepRepeatGuard(): TransformStream<Uint8Array, Uint8Array> {
  const dec = new TextDecoder()
  const enc = new TextEncoder()
  let carry = ''
  let prevProse = ''      // prose of the last step that emitted any
  let stepProse = ''      // prose of the current step
  let holding = false     // the current step's frames are held
  let held: Frame[] = []

  const parse = (line: string): Frame => {
    if (!line.startsWith('0:')) return { line, text: null }
    try { return { line, text: JSON.parse(line.slice(2)) as string } } catch { return { line, text: null } }
  }
  const out = (c: TransformStreamDefaultController<Uint8Array>, line: string) => c.enqueue(enc.encode(line + '\n'))
  const emitText = (c: TransformStreamDefaultController<Uint8Array>, text: string) => { if (text) out(c, '0:' + JSON.stringify(text)) }

  const endStep = (c: TransformStreamDefaultController<Uint8Array>) => {
    if (holding) {
      const heldText = held.map(f => f.text ?? '').join('')
      const repeat = heldText.trim().length > 0 && similarity(prevProse, heldText) >= REPEAT_SIMILARITY
      if (repeat) console.warn(JSON.stringify({ type: 'tappyai_guard', guard: 'step_repeat', kind: 'dropped_step_text', chars: heldText.length }))
      for (const f of held) if (f.text === null) out(c, f.line); else if (!repeat) out(c, f.line)
      if (!repeat && heldText.trim()) stepProse = heldText
      held = []
      holding = false
    }
    if (stepProse.trim().length >= MIN_PROSE) prevProse = stepProse
    stepProse = ''
  }

  const handle = (c: TransformStreamDefaultController<Uint8Array>, raw: string) => {
    const f = parse(raw)
    if (raw.startsWith('e:') || raw.startsWith('d:')) {
      endStep(c)
      out(c, raw)
      // A new step starts after `e:`; hold it only if the step before put real prose out.
      if (raw.startsWith('e:')) holding = prevProse.trim().length >= MIN_PROSE
      return
    }
    if (holding) { held.push(f); return }
    if (f.text !== null) {
      // A buffered reply lands as one long frame — collapse a self-repeat inside it.
      const text = f.text.length >= MIN_PROSE * 2 ? dropRepeatedReply(f.text) : f.text
      if (text !== f.text) console.warn(JSON.stringify({ type: 'tappyai_guard', guard: 'step_repeat', kind: 'collapsed_in_frame', chars: f.text.length - text.length }))
      stepProse += text
      emitText(c, text)
      return
    }
    out(c, raw)
  }

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, c) {
      carry += dec.decode(chunk, { stream: true })
      let nl: number
      while ((nl = carry.indexOf('\n')) !== -1) {
        const line = carry.slice(0, nl)
        carry = carry.slice(nl + 1)
        if (line) handle(c, line)
      }
    },
    flush(c) {
      carry += dec.decode()
      if (carry) handle(c, carry)
      carry = ''
      if (holding) endStep(c)
    },
  })
}
