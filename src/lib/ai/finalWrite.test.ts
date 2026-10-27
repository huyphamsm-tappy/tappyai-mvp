import { describe, it, expect, vi } from 'vitest'
import { finalWriteStream, finishFrameAfterText, FINAL_WRITE_TIMEOUT_MS, MIN_FINAL_WRITE_MS } from './finalWrite'

const enc = new TextEncoder()
const streamOf = (chunks: string[]) => new ReadableStream<Uint8Array>({ start(c) { for (const x of chunks) c.enqueue(enc.encode(x)); c.close() } })
const read = async (s: ReadableStream<Uint8Array>) => { const r = s.getReader(); const d = new TextDecoder(); let out = ''; for (;;) { const n = await r.read(); if (n.done) break; out += d.decode(n.value, { stream: true }) } return out }
const TOOLS_ONLY = ['9:{"toolCallId":"c1","toolName":"web_search","args":{}}\n', 'a:{"toolCallId":"c1","result":{"x":1}}\n', 'd:{"finishReason":"tool-calls","usage":{"promptTokens":1,"completionTokens":1}}\n']

describe('finalWriteStream (C-PRE-1)', () => {
  it('needed:false returns the very same stream', () => {
    const s = streamOf(TOOLS_ONLY)
    expect(finalWriteStream(s, { needed: false, complete: async () => 'x' })).toBe(s)
  })
  it('no text + a tool result + no error frame: the answer is appended BEFORE the finish frame, which now says stop', async () => {
    const log = vi.fn()
    const out = await read(finalWriteStream(streamOf(TOOLS_ONLY), { needed: true, complete: async () => '  Câu trả lời.  ', log }))
    const lines = out.split('\n').filter(Boolean)
    expect(lines[lines.length - 2]).toBe('0:"Câu trả lời."')
    expect(lines[lines.length - 1]).toBe('d:{"finishReason":"stop","usage":{"promptTokens":1,"completionTokens":1}}')
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ type: 'tappyai_final_write', outcome: 'appended', toolResults: 1 }))
  })
  it('chunks cut anywhere (even inside a frame) give the same result', async () => {
    const whole = TOOLS_ONLY.join('')
    const cut = [whole.slice(0, 17), whole.slice(17, 80), whole.slice(80)]
    const out = await read(finalWriteStream(streamOf(cut), { needed: true, complete: async () => 'ok' }))
    expect(out).toContain('0:"ok"\n'); expect(out.indexOf('0:"ok"')).toBeLessThan(out.indexOf('d:'))
  })
  it('text already streamed: complete() is never called and the bytes are untouched', async () => {
    const complete = vi.fn(async () => 'x')
    const body = ['0:"Đã có chữ"\n', ...TOOLS_ONLY]
    const out = await read(finalWriteStream(streamOf(body), { needed: true, complete }))
    expect(complete).not.toHaveBeenCalled()
    expect(out).toBe(['0:"Đã có chữ"\n', TOOLS_ONLY[0], TOOLS_ONLY[1], TOOLS_ONLY[2]].join(''))
  })
  it('only white space streamed counts as no text', async () => {
    const complete = vi.fn(async () => 'ok')
    await read(finalWriteStream(streamOf(['0:"  "\n', ...TOOLS_ONLY]), { needed: true, complete }))
    expect(complete).toHaveBeenCalledTimes(1)
  })
  it('an error frame: complete() is never called', async () => {
    const complete = vi.fn(async () => 'x')
    const out = await read(finalWriteStream(streamOf([...TOOLS_ONLY.slice(0, 2), '3:"boom"\n', TOOLS_ONLY[2]!]), { needed: true, complete }))
    expect(complete).not.toHaveBeenCalled(); expect(out).toContain('"finishReason":"tool-calls"')
  })
  it('no tool-result frame: complete() is never called', async () => {
    const complete = vi.fn(async () => 'x')
    await read(finalWriteStream(streamOf([TOOLS_ONLY[2]!]), { needed: true, complete }))
    expect(complete).not.toHaveBeenCalled()
  })
  it('complete() returning null (nothing to write from), empty text, throwing or timing out: the stream is as the model left it', async () => {
    for (const complete of [async () => null, async () => '   ', async () => { throw new Error('down') }, () => new Promise<string>(() => undefined)]) {
      const log = vi.fn()
      const out = await read(finalWriteStream(streamOf(TOOLS_ONLY), { needed: true, complete, timeoutMs: 20, log }))
      expect(out).toBe(TOOLS_ONLY.join('')); expect(log).toHaveBeenCalledTimes(1)
    }
  })
  it('too little time left before the turn deadline: no call, no_time logged', async () => {
    const complete = vi.fn(async () => 'x'); const log = vi.fn()
    await read(finalWriteStream(streamOf(TOOLS_ONLY), { needed: true, complete, log, deadlineAt: Date.now() + MIN_FINAL_WRITE_MS }))
    expect(complete).not.toHaveBeenCalled(); expect(log).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'no_time' }))
  })
  it('constants', () => { expect(FINAL_WRITE_TIMEOUT_MS).toBe(30_000); expect(MIN_FINAL_WRITE_MS).toBe(8_000) })
})

describe('finishFrameAfterText', () => {
  it('rewrites only a tool-calls reason; anything else (a stop, a length, an unparseable or another frame) is returned as it was', () => {
    expect(finishFrameAfterText('d:{"finishReason":"tool-calls","u":1}')).toBe('d:{"finishReason":"stop","u":1}')
    for (const l of ['d:{"finishReason":"stop"}', 'd:{"finishReason":"length"}', 'd:not json', '0:"x"', 'e:{"finishReason":"tool-calls"}']) expect(finishFrameAfterText(l)).toBe(l)
  })
})
