// The hotline claim guard as a stream step over the AI SDK data stream (`0:<json string>` text frames, one frame per line). Text is released one sentence behind the model, so a claim that is
// split across frames is still seen whole; every other frame (tool calls, step ends, the finish frame) goes through in order, after the text that preceded it. Behind HOTLINE_CLAIM_GUARD only;
// the caller never builds this with the flag off, which keeps the route byte for byte as it was.

import { guardHotlineClaims, splitSentences } from '@/lib/safety/hotlineClaimGuard'

export function hotlineClaimGuardStream(onChange?: (r: { removedSentences: number; editedSentences: number }) => void): TransformStream<Uint8Array, Uint8Array> {
  const dec = new TextDecoder()
  const enc = new TextEncoder()
  let carry = ''
  let pending = ''

  const emit = (c: TransformStreamDefaultController<Uint8Array>, text: string) => { if (text) c.enqueue(enc.encode('0:' + JSON.stringify(text) + '\n')) }
  const guarded = (text: string) => {
    const r = guardHotlineClaims(text)
    if (r.changed) onChange?.({ removedSentences: r.removedSentences, editedSentences: r.editedSentences })
    return r.text
  }
  /** release every complete sentence; the last segment (no sure end yet) stays unless `all` */
  const release = (c: TransformStreamDefaultController<Uint8Array>, all: boolean) => {
    if (!pending) return
    if (all) { emit(c, guarded(pending)); pending = ''; return }
    const segs = splitSentences(pending)
    if (segs.length < 2) return
    const last = segs[segs.length - 1]
    const head = pending.slice(0, pending.length - (last.body.length + last.trail.length))
    emit(c, guarded(head))
    pending = last.body + last.trail
  }
  const handle = (c: TransformStreamDefaultController<Uint8Array>, line: string) => {
    if (line.startsWith('0:')) {
      let t: string | null = null
      try { const v = JSON.parse(line.slice(2)); if (typeof v === 'string') t = v } catch { /* not text */ }
      if (t !== null) { pending += t; release(c, false); return }
    }
    release(c, true)
    c.enqueue(enc.encode(line + '\n'))
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
      release(c, true)
    },
  })
}
