// C2 P2 layer 2 — the Responses adapter streams for real (C2_STREAM_ADAPTER=1): SSE parsing, text deltas in order, tool calls / finish / usage from
// the terminal body, errors mid-stream, a stream that never completes, HTTP errors, cancellation, and flag OFF = the old chunked emulation.
// fetch is stubbed with a server-sent-event body; the key is a dummy. No network, no cost.
// The provider's POST goes through the security transport. In these tests that transport forwards to the stubbed global fetch, so the
// stubs and every assertion on them stay as they are (test seam only; the transport itself is covered by safePost.test.ts).
vi.mock('@/lib/security/safePost', () => ({
  safePostResponse: (url: string, opts: { headers: Record<string, string>; body: string; signal?: AbortSignal }) => {
    const stub = (globalThis as { fetch: typeof fetch }).fetch
    return stub(url, { method: 'POST', headers: opts.headers, body: opts.body, signal: opts.signal })
  },
}))
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { LanguageModelV1StreamPart } from 'ai'
import { createOpenAIProvider, sseRecords, buildResponsesRequest, __resetResponsesStateForTests } from './openai'
import { resetRoutingForTests } from '../registry'

const KEY = 'sk-test-DUMMYKEY-0123456789abcdef'
const TOOL = { type: 'function' as const, name: 'lookup_price', description: 'price', parameters: { type: 'object', properties: {} } }
const U = (text: string) => ({ role: 'user' as const, content: [{ type: 'text' as const, text }] })
const opts = (extra: Record<string, unknown> = {}) => ({ inputFormat: 'messages', mode: { type: 'regular', tools: [TOOL], toolChoice: { type: 'auto' } }, prompt: [U('q')], maxTokens: 1500, ...extra }) as never
const ENV = ['LLM_OPENAI_API', 'OPENAI_API_KEY', 'LLM_RESPONSES_PROCESS_BUDGET_USD', 'LLM_FALLBACK_DISABLED', 'C2_STREAM_ADAPTER', 'LLM_AGENT_REASONING']
const ev = (type: string, data: Record<string, unknown>) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
const MSG = (text: string) => ({ id: 'msg_1', type: 'message', role: 'assistant', content: [{ type: 'output_text', text, annotations: [] }] })
const body = (output: unknown[], status = 'completed', extra: Record<string, unknown> = {}) => ({ id: 'resp_1', model: 'gpt-6-luna', status, output, usage: { input_tokens: 900, input_tokens_details: { cached_tokens: 600 }, output_tokens: 120, output_tokens_details: { reasoning_tokens: 40 } }, ...extra })

let sent: Array<Record<string, any>>
let script: { status?: number; chunks?: string[]; json?: unknown; hang?: boolean; gapMs?: number }
let lastSignal: AbortSignal | undefined
beforeEach(() => {
  __resetResponsesStateForTests(); resetRoutingForTests()
  sent = []; script = { chunks: [] }; lastSignal = undefined
  for (const k of ENV) delete process.env[k]
  Object.assign(process.env, { LLM_OPENAI_API: 'responses', OPENAI_API_KEY: KEY, LLM_RESPONSES_PROCESS_BUDGET_USD: '1', LLM_FALLBACK_DISABLED: '1', C2_STREAM_ADAPTER: '1' })
  vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init: { body?: string; signal?: AbortSignal }) => {
    sent.push(init?.body ? JSON.parse(init.body) : {})
    lastSignal = init?.signal
    if (script.status && script.status !== 200) return new Response(JSON.stringify(script.json ?? { error: { message: 'bad' } }), { status: script.status, headers: { 'content-type': 'application/json' } })
    const chunks = [...(script.chunks ?? [])]
    const hang = script.hang
    const gapMs = script.gapMs
    return new Response(new ReadableStream({
      async pull(c) {
        if (gapMs) await new Promise(r => setTimeout(r, gapMs))
        // a real fetch body fails once its request is aborted
        if (init?.signal?.aborted) throw new Error('aborted')
        const next = chunks.shift()
        if (next !== undefined) { c.enqueue(new TextEncoder().encode(next)); return }
        if (hang) { await new Promise((_, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted')))); return }
        c.close()
      },
    }), { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }))
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); for (const k of ENV) delete process.env[k] })

const model = () => createOpenAIProvider({}).model('agent' as never)
async function drain(s: ReadableStream<LanguageModelV1StreamPart>): Promise<LanguageModelV1StreamPart[]> {
  const out: LanguageModelV1StreamPart[] = []; const r = s.getReader()
  for (;;) { const n = await r.read(); if (n.done) return out; out.push(n.value) }
}

describe('S1 · SSE parsing', () => {
  it('records split across chunk boundaries, CRLF separators and comments are handled; unparsable data is skipped', async () => {
    const parts = ['event: a\nda', 'ta: {"x":1}\n\n', 'event: b\r\ndata: {"y":2}\r\n\r\n', ': keep-alive\n\n', 'data: not-json\n\n', 'data: {"z":3}']
    const s = new ReadableStream<string>({ start(c) { for (const p of parts) c.enqueue(p); c.close() } }).pipeThrough(sseRecords())
    const out: unknown[] = []; const r = s.getReader(); for (;;) { const n = await r.read(); if (n.done) break; out.push(n.value) }
    expect(out).toEqual([{ event: 'a', data: { x: 1 } }, { event: 'b', data: { y: 2 } }, { event: 'message', data: { z: 3 } }])
  })
})

describe('S2 · a streamed answer', () => {
  it('sends stream:true; text deltas leave IN ORDER as they arrive; finish carries usage and the priced cost', async () => {
    script.chunks = [ev('response.created', {}), ev('response.output_text.delta', { delta: 'Xin ' }), ev('response.output_text.delta', { delta: 'chào ' }), ev('response.output_text.delta', { delta: 'bạn.' }), ev('response.completed', { response: body([MSG('Xin chào bạn.')]) })]
    const r = await model().doStream(opts())
    expect(sent[0]).toMatchObject({ stream: true, store: false, max_output_tokens: 1500 })
    const parts = await drain(r.stream)
    expect(parts.filter(p => p.type === 'text-delta').map(p => (p as { textDelta: string }).textDelta)).toEqual(['Xin ', 'chào ', 'bạn.'])
    const fin = parts.find(p => p.type === 'finish') as any
    expect(fin).toMatchObject({ finishReason: 'stop', usage: { promptTokens: 900, completionTokens: 120 } })
    expect(fin.providerMetadata.tappy.cost).toMatchObject({ inputTokens: 900, cachedInputTokens: 600, outputTokens: 120, reasoningTokens: 40, streamed: true })
    expect(parts.some(p => p.type === 'error')).toBe(false)
  })
  it('reasoning never becomes streamed text (summary / reasoning deltas are not answer text)', async () => {
    script.chunks = [ev('response.reasoning_summary_text.delta', { delta: 'SECRET-REASONING-1' }), ev('response.reasoning_text.delta', { delta: 'SECRET-REASONING-2' }), ev('response.output_text.delta', { delta: 'Đáp.' }), ev('response.completed', { response: body([{ id: 'rs_1', type: 'reasoning', summary: [{ type: 'summary_text', text: 'SECRET-REASONING-3' }], encrypted_content: 'ENC' }, MSG('Đáp.')]) })]
    const parts = await drain((await model().doStream(opts())).stream)
    const text = parts.filter(p => p.type === 'text-delta').map(p => (p as any).textDelta).join('')
    expect(text).toBe('Đáp.')
    expect(JSON.stringify(parts.filter(p => p.type !== 'finish'))).not.toContain('SECRET-REASONING')
  })
  it('a tool call streams NO text; the call comes from the terminal body; its reasoning is kept for the store:false replay', async () => {
    const rs = { id: 'rs_9', type: 'reasoning', summary: [], encrypted_content: 'ENC' }
    const fc = { id: 'fc_9', type: 'function_call', status: 'completed', call_id: 'call_9', name: 'lookup_price', arguments: '{"a":1}' }
    script.chunks = [ev('response.created', {}), ev('response.output_item.done', { item: fc }), ev('response.completed', { response: body([rs, fc]) })]
    const parts = await drain((await model().doStream(opts())).stream)
    expect(parts.filter(p => p.type === 'text-delta')).toEqual([])
    expect(parts.find(p => p.type === 'tool-call')).toMatchObject({ toolCallId: 'call_9', toolName: 'lookup_price', args: '{"a":1}' })
    expect((parts.find(p => p.type === 'finish') as any).finishReason).toBe('tool-calls')
    const next = buildResponsesRequest('m', 'medium', opts({ prompt: [U('q'), { role: 'assistant', content: [{ type: 'tool-call', toolCallType: 'function', toolCallId: 'call_9', toolName: 'lookup_price', args: {} }] }, { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'call_9', toolName: 'lookup_price', result: 1 }] }] })).body
    expect((next.input as any[]).find(i => i.type === 'reasoning')).toMatchObject({ id: 'rs_9', encrypted_content: 'ENC' })
  })
  it('a cut answer (`response.incomplete`, max_output_tokens) finishes with `length`', async () => {
    script.chunks = [ev('response.output_text.delta', { delta: 'Phần đầu' }), ev('response.incomplete', { response: body([MSG('Phần đầu')], 'incomplete', { incomplete_details: { reason: 'max_output_tokens' } }) })]
    const parts = await drain((await model().doStream(opts())).stream)
    expect((parts.find(p => p.type === 'finish') as any).finishReason).toBe('length')
  })
})

describe('S3 · failures are never a success', () => {
  it('an `error` event mid-stream → the text already sent stays, then an `error` part, no finish', async () => {
    script.chunks = [ev('response.output_text.delta', { delta: 'Một nửa ' }), ev('error', { message: 'server_error sk-should-not-leak-1234567890' })]
    const parts = await drain((await model().doStream(opts())).stream)
    expect(parts.map(p => p.type)).toEqual(['response-metadata', 'text-delta', 'error'])
    expect(String((parts[2] as any).error.message)).not.toContain('sk-should-not-leak')
  })
  it('`response.failed` → error part', async () => {
    script.chunks = [ev('response.failed', { response: { status: 'failed', error: { message: 'model_error' } } })]
    const parts = await drain((await model().doStream(opts())).stream)
    expect(parts.at(-1)?.type).toBe('error')
  })
  it('a stream that ends WITHOUT a terminal event (dropped connection) → error part', async () => {
    script.chunks = [ev('response.output_text.delta', { delta: 'bị ' })]
    const parts = await drain((await model().doStream(opts())).stream)
    expect(parts.map(p => p.type)).toEqual(['response-metadata', 'text-delta', 'error'])
  })
  it('HTTP 400 → APICallError with the status, not retryable; HTTP 500 → retryable; the key never appears', async () => {
    script = { status: 400, json: { error: { message: `bad request ${KEY}` } } }
    const e = await Promise.resolve(model().doStream(opts())).catch((x: any) => x)
    expect(e).toMatchObject({ statusCode: 400, isRetryable: false })
    expect(String(e.message)).not.toContain(KEY)
    script = { status: 500 }
    expect(await Promise.resolve(model().doStream(opts())).catch((x: any) => x)).toMatchObject({ statusCode: 500, isRetryable: true })
  })
  it('cancelling the stream (client gone) aborts the upstream request at once', async () => {
    script = { chunks: [ev('response.output_text.delta', { delta: 'đang ' })], hang: true }
    const r = await model().doStream(opts())
    const reader = r.stream.getReader()
    await reader.read(); await reader.read()
    await reader.cancel('client gone')
    expect(lastSignal?.aborted).toBe(true)
  })
  // review 02/11: the timeout bounded the WHOLE streamed body, so a long report or Think answer still streaming at 60 s was cut mid-sentence.
  // It is a silence timeout now: the stream may run longer while records keep arriving; a stream that goes quiet still ends.
  it('LLM_RESPONSES_TIMEOUT_MS is a silence timeout: a stream that keeps sending runs past it; one that goes quiet ends with the timeout error', async () => {
    process.env.LLM_RESPONSES_TIMEOUT_MS = '120'
    script = { chunks: [ev('response.output_text.delta', { delta: 'a ' }), ev('response.output_text.delta', { delta: 'b ' }), ev('response.output_text.delta', { delta: 'c ' }), ev('response.output_text.delta', { delta: 'd ' }), ev('response.output_text.delta', { delta: 'e.' }), ev('response.completed', { response: body([MSG('a b c d e.')]) })], gapMs: 50 }
    const ok = await drain((await model().doStream(opts())).stream)
    expect(ok.some(p => p.type === 'error')).toBe(false)
    expect(ok.find(p => p.type === 'finish')).toBeTruthy()
    script = { chunks: [ev('response.output_text.delta', { delta: 'đang ' })], hang: true }
    const quiet = await drain((await model().doStream(opts())).stream)
    expect(String((quiet.at(-1) as any).error?.message)).toContain('responses_timeout_120ms')
    delete process.env.LLM_RESPONSES_TIMEOUT_MS
  })
  it('an already-aborted caller signal never sends the request', async () => {
    const ctrl = new AbortController(); ctrl.abort(new Error('gone'))
    await expect(model().doStream(opts({ abortSignal: ctrl.signal }))).rejects.toBeTruthy()
    expect(sent).toHaveLength(0)
  })
})

describe('S4 · flag OFF = the old emulation', () => {
  it('no stream:true; the finished answer is chunked from one JSON response', async () => {
    delete process.env.C2_STREAM_ADAPTER
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: { body?: string }) => { sent.push(JSON.parse(init.body!)); return new Response(JSON.stringify(body([MSG('Toàn bộ câu trả lời.')])), { status: 200, headers: { 'content-type': 'application/json' } }) }))
    const parts = await drain((await model().doStream(opts())).stream)
    expect(sent[0]).not.toHaveProperty('stream')
    expect(parts.filter(p => p.type === 'text-delta').map(p => (p as any).textDelta).join('')).toBe('Toàn bộ câu trả lời.')
  })
})
