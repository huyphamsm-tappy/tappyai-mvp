// ── A hard ceiling on the RAW request body, enforced before anything is parsed (UAT3 D2) ────────
//
// `await req.json()` buffers and parses whatever arrives; the input budget in
// `lib/ai/security/clientInput.ts` only runs AFTER that. This reads the stream itself and stops at
// the ceiling, so an oversized body costs at most the ceiling in memory and never reaches
// JSON.parse.
//
// Two ceilings, because chat accepts photos (up to 4 × 8 MB data URLs by the input contract, and
// the serverless platform refuses anything above 4.5 MB anyway):
//   · RAW_BODY_MAX_BYTES (4.5 MB)  — every request, the platform's own limit made explicit;
//   · TEXT_BODY_MAX_BYTES (256 KB) — a request with no image part. The text budget is 28 000
//     characters (≈ 112 KB as UTF-8 even at 4 bytes each), so 256 KB is generous and no valid
//     text request comes near it.

export const RAW_BODY_MAX_BYTES = 4_500_000
export const TEXT_BODY_MAX_BYTES = 256 * 1024

export type CappedBody = { ok: true; text: string } | { ok: false; reason: 'too_large' | 'unreadable' }

/** Reads `req`'s body as UTF-8 text, refusing once it exceeds `max` bytes. */
export async function readCappedBody(req: Request, max = RAW_BODY_MAX_BYTES): Promise<CappedBody> {
  const declared = Number(req.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > max) return { ok: false, reason: 'too_large' }
  if (!req.body) {
    // A duck-typed request (route tests build `{ headers, json() }` objects) has no stream; read it
    // the way it offers, and hold it to the same ceiling. A real Request always has `body`.
    const r = req as unknown as { text?: () => Promise<string>; json?: () => Promise<unknown> }
    try {
      const text = typeof r.text === 'function' ? await r.text() : typeof r.json === 'function' ? JSON.stringify(await r.json()) : ''
      return Buffer.byteLength(text, 'utf8') > max ? { ok: false, reason: 'too_large' } : { ok: true, text }
    } catch {
      return { ok: false, reason: 'unreadable' }
    }
  }
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > max) {
        await reader.cancel().catch(() => {})
        return { ok: false, reason: 'too_large' }
      }
      chunks.push(value)
    }
  } catch {
    return { ok: false, reason: 'unreadable' }
  }
  const all = new Uint8Array(total)
  let at = 0
  for (const c of chunks) { all.set(c, at); at += c.byteLength }
  return { ok: true, text: new TextDecoder().decode(all) }
}

/** A chat body with no image part must fit the text ceiling. Checked on the raw text, pre-parse. */
export function exceedsTextCeiling(raw: string): boolean {
  if (Buffer.byteLength(raw, 'utf8') <= TEXT_BODY_MAX_BYTES) return false
  return !/"type"\s*:\s*"image"/.test(raw)
}
