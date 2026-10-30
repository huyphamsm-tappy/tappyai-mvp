import { describe, it, expect, vi } from 'vitest'
import { finalWriteStream, finishFrameAfterText, finalWriteSystem, finalWriteSystemNote, finalWriteInstruction, FINAL_WRITE_TIMEOUT_MS, MIN_FINAL_WRITE_MS } from './finalWrite'
import { ONE_BRAIN_CORE } from './consultative/oneBrain'

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

describe('finalWriteSystem / finalWriteSystemNote (Wave 4 fix G4)', () => {
  it('the system prompt is kept whole, the note comes after it', () => {
    const sys = 'MAIN PROMPT\nrule: call read_page when a page is needed'
    expect(finalWriteSystem(sys, 'vi')).toBe(`${sys}\n\n${finalWriteSystemNote('vi')}`)
    expect(finalWriteSystem(sys, 'en').startsWith(sys)).toBe(true)
    expect(finalWriteSystem(undefined, 'en')).toBe(`\n\n${finalWriteSystemNote('en')}`)
  })
  it('the note says: the results are here, no tool exists, earlier tool rules do not apply, write the answer, no tool call / name / promise to look up - in the user\'s language', () => {
    const en = finalWriteSystemNote('en'), vi = finalWriteSystemNote('vi')
    expect(en).toMatch(/tool results of this turn are already/i); expect(en).toMatch(/no tool exists/i); expect(en).toMatch(/does not apply/i)
    expect(en).toMatch(/write the final answer/i); expect(en).toMatch(/do not call a tool/i); expect(en).toMatch(/tool name or a tool call/i); expect(en).toMatch(/do not promise to look/i)
    expect(vi).toMatch(/Kết quả công cụ của lượt này đã có/); expect(vi).toMatch(/không có công cụ nào/); expect(vi).toMatch(/không áp dụng/)
    expect(vi).toMatch(/viết câu trả lời cuối/); expect(vi).toMatch(/Không gọi công cụ/); expect(vi).toMatch(/không viết tên công cụ/); expect(vi).toMatch(/không hứa sẽ tra thêm/)
    expect(en).not.toBe(vi)
  })
})

describe('N2 (30/10): the final writing call answers EVERY part of the request', () => {
  // Measured 30/10 (C3010 T14): the steps ran out on a question about four companies' AI agents; the final write wrote from what it had,
  // and the answer was about one company ("Riêng xAI…") - three of four parts missing, constraint −4 to −5 in the blind grading.
  it('the instruction names every part the person asked about, and a short line for a part the results do not cover', () => {
    const en = finalWriteInstruction('en'), vi = finalWriteInstruction('vi')
    expect(en).toMatch(/every part/i); expect(en).toMatch(/each (?:item|company|product|place)/i); expect(en).toMatch(/not covered/i)
    expect(vi).toMatch(/mọi phần/); expect(vi).toMatch(/từng (?:mục|công ty|sản phẩm|nơi)/); expect(vi).toMatch(/chưa có/)
    expect(en).toMatch(/do not invent/i); expect(vi).toMatch(/không bịa/)
  })
})

describe('N2 (30/10): the one-brain instruction asks for the lookups of a many-part request in the same step', () => {
  it('ONE_BRAIN_CORE says several items are looked up together, in one step', () => {
    expect(ONE_BRAIN_CORE).toMatch(/several (?:items|parts)[^.]*same step/i)
  })
})
