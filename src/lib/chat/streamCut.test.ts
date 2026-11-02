// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { watchStreamCut, withCutWatch } from './streamCut'

const enc = new TextEncoder()
const streamOf = (...parts: string[]) => new ReadableStream<Uint8Array>({ start(c) { for (const p of parts) c.enqueue(enc.encode(p)); c.close() } })
const reply = (body: ReadableStream<Uint8Array>, headers: Record<string, string> = { 'x-vercel-ai-data-stream': 'v1', 'content-type': 'text/plain; charset=utf-8' }, status = 200) => new Response(body, { status, headers })
async function drain(res: Response): Promise<string> { return await res.text() }

describe('watchStreamCut — a data stream that closes without its finish frame is a cut reply', () => {
  it('reports a stream truncated after some text frames, and passes the bytes through untouched', async () => {
    const onCut = vi.fn()
    const out = watchStreamCut(reply(streamOf('0:"Mình chưa có danh sách ', '0:"phim đang chiếu')), onCut)
    expect(await drain(out)).toBe('0:"Mình chưa có danh sách 0:"phim đang chiếu')
    expect(onCut).toHaveBeenCalledTimes(1)
  })
  it('does not report a stream that ends with the d: finish frame (even without a trailing newline or split across chunks)', async () => {
    for (const parts of [['0:"hi"\n', 'd:{"finishReason":"stop"}\n'], ['0:"hi"\nd:{"finishReason":"stop"}'], ['0:"hi"\nd:{"fin', 'ishReason":"stop"}\n']]) {
      const onCut = vi.fn()
      await drain(watchStreamCut(reply(streamOf(...parts)), onCut))
      expect(onCut).not.toHaveBeenCalled()
    }
  })
  it('an error frame (3:) is an ended stream, not a cut', async () => {
    const onCut = vi.fn()
    await drain(watchStreamCut(reply(streamOf('0:"x"\n', '3:"boom"\n')), onCut))
    expect(onCut).not.toHaveBeenCalled()
  })
  it('leaves non-stream replies (JSON error bodies, non-OK) alone', async () => {
    const onCut = vi.fn()
    const json = new Response('{"message":"limit"}', { status: 429, headers: { 'content-type': 'application/json' } })
    expect(watchStreamCut(json, onCut)).toBe(json)
    const ok = new Response('{"a":1}', { status: 200, headers: { 'content-type': 'application/json' } })
    expect(watchStreamCut(ok, onCut)).toBe(ok)
    expect(onCut).not.toHaveBeenCalled()
  })
  it('withCutWatch wraps a base fetch and keeps status and headers', async () => {
    const onCut = vi.fn()
    const base = (async () => reply(streamOf('0:"half'), { 'x-vercel-ai-data-stream': 'v1', 'content-type': 'text/plain', 'x-decision-evidence-id': 'k1' })) as unknown as typeof fetch
    const res = await withCutWatch(base, onCut)('/api/chat')
    expect(res.status).toBe(200)
    expect(res.headers.get('x-decision-evidence-id')).toBe('k1')
    await drain(res)
    expect(onCut).toHaveBeenCalledTimes(1)
  })
})
