import { describe, it, expect, vi, afterEach } from 'vitest'
import { createLatencyMarks, observeResponse, runWithMarks, currentMarks, latencyMarksEnabled } from './marks'
import { responsesUrl } from '@/lib/ai/llm/providers/openai'

const enc = new TextEncoder()
/** A response whose body delivers `parts` with `gapMs` between them (a body that is NOT buffered upstream). */
function slowBody(parts: string[], gapMs: number, status = 200): Response {
  let i = 0
  const body = new ReadableStream<Uint8Array>({
    async pull(c) { if (i >= parts.length) { c.close(); return } if (i > 0) await new Promise(r => setTimeout(r, gapMs)); c.enqueue(enc.encode(parts[i++])) },
  })
  return new Response(body, { status })
}
const read = async (res: Response) => new Uint8Array(await res.arrayBuffer())
const logs = () => { const out: string[] = []; return { out, log: (l: string) => { out.push(l) } } }

describe('C2 latency marks · pure bookkeeping', () => {
  it('M-1 summarises rounds, tools, finish reasons and the hold between the last round and the first text — each number separate', () => {
    let now = 1000; const c = createLatencyMarks(() => now, () => {})
    c.mark('model_round_start', { round: 1 }, 0); c.mark('model_round_end', { round: 1, finish: 'tool-calls', tokens_out: 80 }, 3000)
    c.mark('tool_start', { tool: 'web_search' }, 3010); c.mark('tool_end', { tool: 'web_search', ok: true }, 5400)
    c.mark('model_round_start', { round: 2 }, 5410); c.mark('model_round_end', { round: 2, finish: 'length', tokens_out: 1500 }, 14000)
    now = 1000 + 14300; c.markOnce('first_byte_forwarded'); c.markOnce('first_text_forwarded'); now = 1000 + 14400; c.markOnce('done')
    const s = c.summary()
    expect(s.model_rounds).toBe(2); expect(s.tool_calls).toBe(1)
    expect(s.rounds.map(r => [r.round, r.ms, r.finish])).toEqual([[1, 3000, 'tool-calls'], [2, 8590, 'length']])
    expect(s.tools).toEqual([{ tool: 'web_search', start: 3010, end: 5400, ms: 2390, ok: true }])
    expect(s.last_finish).toBe('length'); expect(s.hit_length_limit).toBe(true)
    expect(s.t_first_text_forwarded).toBe(14300); expect(s.hold_after_last_round_ms).toBe(300)
    expect(s.t_upstream_first_delta).toBeNull() // a non-streaming adapter never produces one — it is not invented
  })
  it('M-2 markOnce keeps the FIRST occurrence; mark(at) back-dates a point known only afterwards', () => {
    let now = 0; const c = createLatencyMarks(() => now, () => {})
    now = 50; c.markOnce('first_byte_forwarded'); now = 90; c.markOnce('first_byte_forwarded')
    expect(c.summary().t_first_byte_forwarded).toBe(50)
    c.mark('model_round_start', { round: 1 }, 7); expect(c.summary().rounds[0].start).toBe(7)
  })
  it('M-3 two tools of one round that overlap are paired by tool name and order, not mixed up', () => {
    const c = createLatencyMarks(() => 0, () => {})
    c.mark('tool_start', { tool: 'a' }, 0); c.mark('tool_start', { tool: 'b' }, 5); c.mark('tool_end', { tool: 'b', ok: true }, 20); c.mark('tool_end', { tool: 'a', ok: false }, 90)
    expect(c.summary().tools).toEqual([{ tool: 'a', start: 0, end: 90, ms: 90, ok: false }, { tool: 'b', start: 5, end: 20, ms: 15, ok: true }])
  })
  it('M-4 the summary carries names, counts and milliseconds only — never message text', () => {
    const c = createLatencyMarks(() => 0, () => {}); c.mark('model_round_end', { round: 1, finish: 'stop', tokens_out: 5 }, 10)
    const line = JSON.stringify(c.summary()); expect(line).toContain('"type":"tappyai_latency_marks"'); expect(line.length).toBeLessThan(1500)
  })
})

describe('C2 latency marks · observeResponse is a pure observer', () => {
  it('M-5 the body is passed through BYTE FOR BYTE, status and headers unchanged', async () => {
    const parts = ['9:{"a":1}\n', '0:"Xin chào, đây là câu trả lời."\n', 'd:{"finishReason":"stop"}\n']
    const { out, log } = logs(); const m = createLatencyMarks(Date.now, log)
    const res = observeResponse(new Response(parts.join(''), { status: 201, headers: { 'x-test': 'yes', 'content-type': 'text/plain' } }), m)
    expect(res.status).toBe(201); expect(res.headers.get('x-test')).toBe('yes')
    expect(new TextDecoder().decode(await read(res))).toBe(parts.join(''))
    expect(out).toHaveLength(1)
  })
  it('M-6 time-to-first-visible-text is the first NON-EMPTY 0: frame, later than the first byte (a tool frame) and than an empty 0:"" frame', async () => {
    const { out, log } = logs(); const m = createLatencyMarks(Date.now, log)
    const res = observeResponse(slowBody(['9:{"toolCallId":"1"}\n', '0:""\n', '0:"Chữ đầu tiên"\n', 'd:{}\n'], 120), m)
    await read(res)
    const s = JSON.parse(out[0])
    expect(s.t_first_byte_forwarded).toBeLessThan(80)
    expect(s.t_first_text_forwarded).toBeGreaterThanOrEqual(200) // after the 9: frame (120 ms) and the empty text frame (240 ms) — i.e. at the third frame
    expect(s.t_first_text_forwarded).toBeLessThanOrEqual(s.t_done)
    expect(s.t_first_byte_forwarded).toBeLessThan(s.t_first_text_forwarded)
  })
  it('M-7 a text frame split across two network chunks is still recognised once the line is complete', async () => {
    const { out, log } = logs(); const m = createLatencyMarks(Date.now, log)
    await read(observeResponse(slowBody(['0:"Ch', 'ào bạn"\nd:{}\n'], 60), m))
    expect(JSON.parse(out[0]).t_first_text_forwarded).toBeGreaterThanOrEqual(50)
  })
  it('M-8 a client that cancels the body is marked client_aborted, and the summary is emitted exactly once', async () => {
    const { out, log } = logs(); const m = createLatencyMarks(Date.now, log)
    const res = observeResponse(slowBody(['0:"a"\n', '0:"b"\n', '0:"c"\n', '0:"d"\n'], 100), m)
    const reader = res.body!.getReader(); await reader.read(); await reader.cancel()
    await new Promise(r => setTimeout(r, 60))
    expect(out).toHaveLength(1); expect(JSON.parse(out[0]).aborted).toBe(true)
  })
  it('M-12 the observer is LAZY: it reads the source only when the consumer reads (no read-ahead — an observer must not change the pace or order of what it watches)', async () => {
    let pulls = 0
    const src = new ReadableStream<Uint8Array>({ pull(c) { pulls++; if (pulls > 5) c.close(); else c.enqueue(enc.encode(`0:"${pulls}"\n`)) } }, { highWaterMark: 0 })
    const { log } = logs(); const res = observeResponse(new Response(src), createLatencyMarks(Date.now, log))
    await new Promise(r => setTimeout(r, 30)); expect(pulls).toBe(0)           // nobody asked yet
    const reader = res.body!.getReader(); await reader.read(); expect(pulls).toBe(1)  // one read → one pull
    await new Promise(r => setTimeout(r, 30)); expect(pulls).toBe(1)           // and nothing more on its own
    await reader.cancel()
  })
  it('M-9 a response with no body still yields one summary', () => {
    const { out, log } = logs(); const m = createLatencyMarks(Date.now, log)
    const res = observeResponse(new Response(null, { status: 204 }), m); expect(res.status).toBe(204); expect(out).toHaveLength(1)
  })
})

describe('C2 latency marks · scope and flag', () => {
  const saved = process.env.C2_LATENCY_MARKS
  afterEach(() => { if (saved === undefined) delete process.env.C2_LATENCY_MARKS; else process.env.C2_LATENCY_MARKS = saved })
  it('M-10 off by default; on only for the exact value 1; the current marks exist only inside runWithMarks (also across awaits)', async () => {
    delete process.env.C2_LATENCY_MARKS // a suite may run with the flag on in its environment; "default" means unset
    expect(latencyMarksEnabled()).toBe(false); process.env.C2_LATENCY_MARKS = 'true'; expect(latencyMarksEnabled()).toBe(false); process.env.C2_LATENCY_MARKS = '1'; expect(latencyMarksEnabled()).toBe(true)
    expect(currentMarks()).toBeNull()
    const m = createLatencyMarks(() => 0, () => {})
    await runWithMarks(m, async () => { await new Promise(r => setTimeout(r, 5)); expect(currentMarks()).toBe(m) })
    expect(currentMarks()).toBeNull()
  })
})

describe('C2 test seam · LLM_RESPONSES_BASE_URL can never send the key to another machine', () => {
  it('M-11 only an http loopback host is honoured; anything else falls back to api.openai.com', () => {
    const def = 'https://api.openai.com/v1/responses'
    expect(responsesUrl({})).toBe(def)
    expect(responsesUrl({ LLM_RESPONSES_BASE_URL: 'http://127.0.0.1:3037' })).toBe('http://127.0.0.1:3037/v1/responses')
    expect(responsesUrl({ LLM_RESPONSES_BASE_URL: 'http://localhost:3037/' })).toBe('http://localhost:3037/v1/responses')
    for (const bad of ['https://evil.example', 'http://evil.example:3037', 'http://127.0.0.1.evil.example', 'http://10.0.0.5:3037', 'https://127.0.0.1:3037', 'ftp://127.0.0.1', 'not a url', 'http://[::2]:1']) expect(responsesUrl({ LLM_RESPONSES_BASE_URL: bad }), bad).toBe(def)
  })
})

vi.setConfig({ testTimeout: 15_000 })
