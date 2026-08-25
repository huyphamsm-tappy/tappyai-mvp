import { describe, it, expect } from 'vitest'
import { timeClientEmit, type ClientEmitTiming } from './emitTiming'

const enc = (s: string) => new TextEncoder().encode(s)

/**
 * Drives the transform: writes each chunk at a distinct clock tick, then closes.
 * Returns what the reader saw (to prove byte-identity), the timing, and how many
 * times onComplete fired.
 */
async function drive(chunks: string[]): Promise<{ out: string; timing: ClientEmitTiming | null; completions: number }> {
  let clock = 0
  let timing: ClientEmitTiming | null = null
  let completions = 0
  const ts = timeClientEmit(0, () => clock, (t) => { timing = t; completions++ })
  const writer = ts.writable.getWriter()
  const reader = ts.readable.getReader()
  const seen: Uint8Array[] = []
  const pump = (async () => {
    for (;;) {
      const r = await reader.read()
      if (r.done) break
      seen.push(r.value)
    }
  })()
  for (const c of chunks) { clock += 10; await writer.write(enc(c)) }
  clock += 5
  await writer.close()
  await pump
  const out = new TextDecoder().decode(
    seen.reduce((acc, u) => { const m = new Uint8Array(acc.length + u.length); m.set(acc); m.set(u, acc.length); return m }, new Uint8Array()),
  )
  return { out, timing, completions }
}

describe('timeClientEmit — a byte-identical timing pass-through', () => {
  it('passes every byte through unchanged', async () => {
    const chunks = ['0:"Xin ', '0:"chào"', '\n', 'd:{"finishReason":"stop"}\n']
    const { out } = await drive(chunks)
    expect(out).toBe(chunks.join(''))
  })

  it('marks TTUA at the first `0:` text frame, and the final byte on close', async () => {
    // chunk 1 (t=10) is a tool-call frame — not content; chunk 2 (t=20) is the
    // first text frame; close at t=25.
    const { timing } = await drive(['9:{"toolName":"search_products"}\n', '0:"Đây là"\n', 'd:{}\n'])
    expect(timing?.ttuaMs).toBe(20)
    expect(timing?.finalMs).toBe(35) // 3 chunks (10,20,30) + close (+5)
  })

  it('leaves TTUA null when the turn emits no text frame at all', async () => {
    const { timing } = await drive(['9:{"toolName":"x"}\n', 'a:{"result":1}\n', 'd:{}\n'])
    expect(timing?.ttuaMs).toBeNull()
  })

  it('detects a `0:` frame split across a chunk boundary', async () => {
    // '0' ends chunk 1 (t=10); ':' opens chunk 2 (t=20). TTUA must be the moment
    // the frame is completed, not missed entirely.
    const { timing } = await drive(['...\n0', ':"hi"\n', 'd:{}\n'])
    expect(timing?.ttuaMs).toBe(20)
  })

  it('detects `0:` when a newline ends one chunk and the frame opens the next', async () => {
    const { timing } = await drive(['e:{"x":1}\n', '0:"hi"\n', 'd:{}\n'])
    expect(timing?.ttuaMs).toBe(20)
  })

  it('records the FIRST text frame, never a later one', async () => {
    const { timing } = await drive(['0:"a"\n', '0:"b"\n', '0:"c"\n', 'd:{}\n'])
    expect(timing?.ttuaMs).toBe(10)
  })

  it('fires onComplete exactly once', async () => {
    const { completions } = await drive(['0:"a"\n', 'd:{}\n'])
    expect(completions).toBe(1)
  })

  it('never treats a `0:` INSIDE a frame body as the start of one', async () => {
    // A tool-result body can contain the text "0:" — only a line-start `0:` counts.
    const { timing } = await drive(['a:{"note":"ratio 10:0:2"}\n', 'd:{}\n'])
    expect(timing?.ttuaMs).toBeNull()
  })
})
