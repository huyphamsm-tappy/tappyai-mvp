// ── A reply stream that ends WITHOUT its finish frame is a CUT reply (A1, owner 2026-10-02) ─────────────────────────
//
// The chat route always ends a data stream with a `d:` (finish) frame — or a `3:` error frame. A connection that closes
// cleanly before either (a proxy / function cut half-way) used to leave a half message that looked like a normal answer, saved
// and all. `watchStreamCut` passes the bytes through untouched and tells the caller when the body ended that way, so the UI
// can offer «Answer again» instead of presenting half a sentence as the answer. An aborted request (the user pressed Stop)
// or a network error never reaches `flush`, so neither is reported as a cut.

const DECODER_OPTS = { stream: true } as const

/** Wrap a fetch Response so `onCut` runs when its body closes without a `d:`/`3:` frame. Headers/status are kept. */
export function watchStreamCut(res: Response, onCut: () => void): Response {
  if (!res.body || !res.ok) return res
  const ct = res.headers.get('content-type') || ''
  // Only the data-stream replies; JSON error bodies (401/429) and anything else pass through.
  if (!res.headers.get('x-vercel-ai-data-stream') && !/text\/plain/i.test(ct)) return res
  const dec = new TextDecoder()
  let tail = ''
  let finished = false
  let sawAny = false
  const scan = (line: string) => { if (/^(?:d|3):/.test(line)) finished = true }
  const body = res.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, c) {
      sawAny = true
      tail += dec.decode(chunk, DECODER_OPTS)
      const lines = tail.split('\n'); tail = lines.pop() ?? ''
      for (const l of lines) scan(l)
      c.enqueue(chunk)
    },
    flush() {
      if (tail) scan(tail)
      if (sawAny && !finished) { try { onCut() } catch { /* UI hook must not break the stream */ } }
    },
  }))
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers })
}

/** `fetch` that reports cut reply streams. Compose over any base fetch. */
export function withCutWatch(base: typeof fetch, onCut: () => void): typeof fetch {
  return async (input, init) => watchStreamCut(await base(input, init), onCut)
}
