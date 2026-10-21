// Responses API prototype (scratch only): request shape, reasoning replay with store:false, usage → cost mapping, error handling, the in-process
// budget, and the fallback instrumentation. No network: fetch is stubbed. The API key used here is a dummy and must never appear in any log or error.
// The provider's POST goes through the security transport. In these tests that transport forwards to the stubbed global fetch, so the
// stubs and every assertion on them stay as they are (test seam only; the transport itself is covered by safePost.test.ts).
vi.mock('@/lib/security/safePost', () => ({
  safePostResponse: (url: string, opts: { headers: Record<string, string>; body: string; signal?: AbortSignal }) => {
    const stub = (globalThis as { fetch: typeof fetch }).fetch
    return stub(url, { method: 'POST', headers: opts.headers, body: opts.body, signal: opts.signal })
  },
}))
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { APICallError } from 'ai'
import {
  createOpenAIProvider, buildResponsesRequest, promptToResponsesInput, parseResponsesBody, usageOfResponses, effortForCall, openaiCallCost,
  ResponsesBudgetError, responsesProcessSpend, __resetResponsesStateForTests, UNKNOWN_CALL_USD,
} from './openai'
import { modelForRole, resetRoutingForTests } from '../registry'
import { c2FlagsOff } from '@/test/c2FlagsOff'
c2FlagsOff() // C2 P2: this suite (incl. the R1 request-shape pin) tests the DEFAULT behaviour, also when a run sets the C2 flags globally (setup only)

const KEY = 'sk-test-DUMMYKEY-0123456789abcdef'
const TOOL = { type: 'function' as const, name: 'lookup_price', description: 'price', parameters: { type: 'object', properties: { product: { type: 'string' } }, required: ['product'] } }
const U = (text: string) => ({ role: 'user' as const, content: [{ type: 'text' as const, text }] })
const opts = (prompt: unknown[], extra: Record<string, unknown> = {}) => ({ inputFormat: 'messages', mode: { type: 'regular', tools: [TOOL], toolChoice: { type: 'auto' } }, prompt, ...extra }) as never

const REASONING = { id: 'rs_1', type: 'reasoning', summary: [], content: null, encrypted_content: 'ENC-BLOB-SHOULD-NEVER-BE-LOGGED' }
const FC = (id: string, args = '{"product":"A"}') => ({ id: 'fc_' + id, type: 'function_call', status: 'completed', call_id: 'call_' + id, name: 'lookup_price', arguments: args })
const MSG = (text: string) => ({ id: 'msg_1', type: 'message', role: 'assistant', content: [{ type: 'output_text', text, annotations: [] }] })
const body = (output: unknown[], usage: unknown = { input_tokens: 1000, input_tokens_details: { cached_tokens: 0 }, output_tokens: 200, output_tokens_details: { reasoning_tokens: 120 } }, extra: Record<string, unknown> = {}) => ({ id: 'resp_1', model: 'gpt-6-luna', status: 'completed', output, usage, ...extra })

let calls: Array<{ url: string; body: Record<string, any> }>
let queue: Array<{ status?: number; json?: unknown; text?: string; delayMs?: number; throws?: Error }>
const logs: string[] = []

beforeEach(() => {
  __resetResponsesStateForTests(); resetRoutingForTests()
  calls = []; queue = []; logs.length = 0
  process.env.LLM_OPENAI_API = 'responses'
  process.env.OPENAI_API_KEY = KEY
  process.env.LLM_RESPONSES_PROCESS_BUDGET_USD = '1'
  delete process.env.LLM_FALLBACK_DISABLED; delete process.env.LLM_RESPONSES_TIMEOUT_MS; delete process.env.LLM_AGENT_REASONING
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')) })
  vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')) })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: { body?: string; signal?: AbortSignal }) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : {} })
    const n = queue.shift() ?? { json: body([MSG('ok')]) }
    if (n.throws) throw n.throws
    if (n.delayMs) await new Promise((res, rej) => { const t = setTimeout(res, n.delayMs); init?.signal?.addEventListener('abort', () => { clearTimeout(t); rej(Object.assign(new Error('aborted'), { name: 'AbortError' })) }) })
    return new Response(n.text ?? JSON.stringify(n.json ?? {}), { status: n.status ?? 200, headers: { 'content-type': 'application/json' } })
  }))
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); for (const k of ['LLM_OPENAI_API', 'OPENAI_API_KEY', 'LLM_RESPONSES_PROCESS_BUDGET_USD', 'LLM_FALLBACK_DISABLED', 'LLM_RESPONSES_TIMEOUT_MS', 'LLM_AGENT_REASONING']) delete process.env[k] })

const model = (role = 'agent') => createOpenAIProvider({}).model(role as never)

describe('R1 · request shape', () => {
  it('sends model, store:false, encrypted-reasoning include, the configured effort, strict:false function tools and parallel_tool_calls:false by default', () => {
    const { body: b } = buildResponsesRequest('gpt-6-luna', 'medium', opts([{ role: 'system', content: 'S1' }, { role: 'system', content: 'S2' }, U('hi')], { maxTokens: 1500, temperature: 0.7 }))
    expect(b).toMatchObject({ model: 'gpt-6-luna', store: false, include: ['reasoning.encrypted_content'], reasoning: { effort: 'medium' }, instructions: 'S1\n\nS2', max_output_tokens: 1500, parallel_tool_calls: false })
    expect(b.tools).toEqual([{ type: 'function', name: 'lookup_price', description: 'price', parameters: TOOL.parameters, strict: false }])
    expect(b).not.toHaveProperty('temperature')
    expect(b.input).toEqual([{ role: 'user', content: [{ type: 'input_text', text: 'hi' }] }])
  })
  it('honours the tappy.parallelTools request and maps toolChoice', () => {
    const a = buildResponsesRequest('m', 'low', opts([U('x')], { providerMetadata: { tappy: { parallelTools: true } } })).body
    expect(a.parallel_tool_calls).toBe(true)
    const b = buildResponsesRequest('m', 'low', { ...(opts([U('x')]) as object), mode: { type: 'regular', tools: [TOOL], toolChoice: { type: 'tool', toolName: 'lookup_price' } } } as never).body
    expect(b.tool_choice).toEqual({ type: 'function', name: 'lookup_price' })
    const c = buildResponsesRequest('m', 'low', { ...(opts([U('x')]) as object), mode: { type: 'regular', tools: [TOOL], toolChoice: { type: 'none' } } } as never).body
    expect(c.tool_choice).toBe('none')
  })
  it('no tools → no tools / tool_choice / parallel_tool_calls fields (the API rejects parallel_tool_calls without tools)', () => {
    const b = buildResponsesRequest('m', 'none', { inputFormat: 'messages', mode: { type: 'regular' }, prompt: [U('x')] } as never).body
    expect(b).not.toHaveProperty('tools'); expect(b).not.toHaveProperty('parallel_tool_calls'); expect(b).not.toHaveProperty('tool_choice')
  })
  it('an image part becomes a data URL; an unsupported part is warned about, not sent', () => {
    const { input, warnings } = promptToResponsesInput([{ role: 'user', content: [{ type: 'text', text: 'see' }, { type: 'image', image: new Uint8Array([1, 2, 3]), mimeType: 'image/png' }, { type: 'file', data: 'x', mimeType: 'application/pdf' }] }] as never)
    expect((input[0] as any).content[1]).toEqual({ type: 'input_image', image_url: 'data:image/png;base64,AQID' })
    expect(warnings.join()).toMatch(/unsupported user part: file/)
  })
  it('effortForCall: chat forces none with tools; responses sends the configured effort', () => {
    const withTools = { mode: { type: 'regular', tools: [TOOL] } }
    expect(effortForCall('medium', withTools)).toBe('none')
    expect(effortForCall('medium', withTools, 'responses')).toBe('medium')
    expect(effortForCall('low', { mode: { type: 'regular' } })).toBe('low')
  })
})

describe('R2 · parsing and usage → cost', () => {
  it('text, refusal, function_call, reasoning items; finish reasons', () => {
    const p = parseResponsesBody(body([REASONING, FC('1'), MSG('xong')]) as never)
    expect(p).toMatchObject({ text: 'xong', finishReason: 'tool-calls', itemTypes: ['reasoning', 'function_call', 'message'] })
    expect(p.toolCalls).toEqual([{ toolCallType: 'function', toolCallId: 'call_1', toolName: 'lookup_price', args: '{"product":"A"}' }])
    expect(parseResponsesBody(body([MSG('a')]) as never).finishReason).toBe('stop')
    expect(parseResponsesBody({ ...body([MSG('cut')]), status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } } as never).finishReason).toBe('length')
    expect(parseResponsesBody({ ...body([]), status: 'incomplete', incomplete_details: { reason: 'content_filter' } } as never).finishReason).toBe('content-filter')
    expect(() => parseResponsesBody({ status: 'failed', error: { message: 'boom' } } as never)).toThrow(/responses_failed: boom/)
    expect(parseResponsesBody(body([{ type: 'message', content: [{ type: 'refusal', refusal: 'không thể' }] }]) as never).text).toBe('không thể')
  })
  it('usage mapping: Responses field names, reasoning tokens inside output tokens (priced once), uncached input at the cache-write rate', () => {
    const raw = usageOfResponses({ input_tokens: 1000, input_tokens_details: { cached_tokens: 400 }, output_tokens: 200, output_tokens_details: { reasoning_tokens: 120 } })!
    expect(raw).toMatchObject({ prompt_tokens: 1000, completion_tokens: 200, prompt_tokens_details: { cached_tokens: 400, cache_write_tokens: 600 }, completion_tokens_details: { reasoning_tokens: 120 } })
    const c = openaiCallCost('gpt-6-luna', raw)!
    // fresh = 1000 - 400 - 600 = 0; cached 400 * 0.01 + cache-write 600 * 0.125 + out 200 * 0.5 (reasoning NOT added again)
    expect(c.usd).toBeCloseTo((400 * 0.01 + 600 * 0.125 + 200 * 0.5) / 1e6, 9)
    expect(c.reasoningTokens).toBe(120); expect(c.outputTokens).toBe(200)
    expect(usageOfResponses(undefined)).toBeUndefined(); expect(usageOfResponses({ input_tokens: 5 })).toBeUndefined()
  })
})

describe('R3 · tool round-trip with reasoning continuation (store:false)', () => {
  it('replays the reasoning item (id + encrypted_content) before its function_call, links function_call_output by call_id, sends effort with tools', async () => {
    queue.push({ json: body([REASONING, FC('1')]) }, { json: body([MSG('Bánh C rẻ hơn 3.000đ')], { input_tokens: 1300, input_tokens_details: { cached_tokens: 1000 }, output_tokens: 60, output_tokens_details: { reasoning_tokens: 25 } }) })
    process.env.LLM_AGENT_REASONING = 'medium'
    const m = model()
    const first = await m.doGenerate(opts([{ role: 'system', content: 'sys' }, U('tra giá A')]))
    expect(first.toolCalls).toEqual([{ toolCallType: 'function', toolCallId: 'call_1', toolName: 'lookup_price', args: '{"product":"A"}' }])
    expect(first.finishReason).toBe('tool-calls')
    expect(calls[0].body.reasoning).toEqual({ effort: 'medium' }) // sent WITH tools
    const meta1 = (first.providerMetadata as any).tappy.cost
    expect(meta1).toMatchObject({ api: 'responses', effort: 'medium', reasoningTokens: 120, replayedReasoningItems: 0 })

    const second = await m.doGenerate(opts([
      { role: 'system', content: 'sys' }, U('tra giá A'),
      { role: 'assistant', content: [{ type: 'tool-call', toolCallType: 'function', toolCallId: 'call_1', toolName: 'lookup_price', args: { product: 'A' } }] },
      { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'call_1', toolName: 'lookup_price', result: { price: 25000 } }] },
    ]))
    expect(second.text).toBe('Bánh C rẻ hơn 3.000đ')
    const sent = calls[1].body.input
    expect(sent.map((i: any) => i.type ?? i.role)).toEqual(['user', 'reasoning', 'function_call', 'function_call_output'])
    expect(sent[1]).toEqual({ type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: REASONING.encrypted_content })
    expect(sent[2]).toEqual({ type: 'function_call', call_id: 'call_1', name: 'lookup_price', arguments: '{"product":"A"}' })
    expect(sent[3]).toEqual({ type: 'function_call_output', call_id: 'call_1', output: '{"price":25000}' })
    expect((second.providerMetadata as any).tappy.cost).toMatchObject({ api: 'responses', replayedReasoningItems: 1, reasoningTokens: 25 })
    expect(second.usage).toEqual({ promptTokens: 1300, completionTokens: 60 })
  })
  it('a call_id the process does not know (restart, history from the client) is sent WITHOUT reasoning — the API accepts it — and the turn still works', async () => {
    const m = model()
    await m.doGenerate(opts([U('q'), { role: 'assistant', content: [{ type: 'tool-call', toolCallType: 'function', toolCallId: 'call_unknown', toolName: 'lookup_price', args: {} }] }, { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'call_unknown', toolName: 'lookup_price', result: 'x' }] }]))
    expect(calls[0].body.input.map((i: any) => i.type ?? i.role)).toEqual(['user', 'function_call', 'function_call_output'])
    expect(calls[0].body.input[2].output).toBe('x')
  })
  it('a tool error result is passed on as an error object, not as a success', () => {
    const { input } = promptToResponsesInput([{ role: 'tool', content: [{ type: 'tool-result', toolCallId: 'c', toolName: 't', result: 'timeout', isError: true }] }] as never)
    expect(input[0]).toEqual({ type: 'function_call_output', call_id: 'c', output: '{"error":"timeout"}' })
  })
  it('doStream emits metadata, text chunks, tool calls and a finish part carrying the cost', async () => {
    queue.push({ json: body([MSG('x'.repeat(400))]) })
    const r = await model().doStream(opts([U('q')]))
    const parts: any[] = []; const reader = r.stream.getReader()
    for (;;) { const n = await reader.read(); if (n.done) break; parts.push(n.value) }
    expect(parts[0].type).toBe('response-metadata')
    expect(parts.filter(p => p.type === 'text-delta').map(p => p.textDelta).join('')).toBe('x'.repeat(400))
    const fin = parts.at(-1); expect(fin.type).toBe('finish'); expect(fin.usage).toEqual({ promptTokens: 1000, completionTokens: 200 }); expect(fin.providerMetadata.tappy.cost.api).toBe('responses')
  })
  it('object modes stay on the chat model and are logged as served by chat (never as a responses turn)', async () => {
    queue.push({ json: { id: 'c1', object: 'chat.completion', created: 1, model: 'gpt-6-luna', choices: [{ index: 0, message: { role: 'assistant', content: '{"a":1}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } } })
    await model().doGenerate({ inputFormat: 'messages', mode: { type: 'object-json' }, prompt: [U('json')] } as never)
    expect(calls[0].url).toMatch(/chat\/completions/)
    expect(logs.some(l => l.includes('"served_api":"chat"'))).toBe(true)
  })
})

describe('R4 · errors never leak the key and are classified like the SDK does', () => {
  it('HTTP 400 → APICallError, not retryable; message carries no key / bearer', async () => {
    queue.push({ status: 400, json: { error: { message: `bad request for ${KEY} with Bearer ${KEY}` } } })
    const e = await Promise.resolve(model().doGenerate(opts([U('q')]))).catch((x: any) => x)
    expect(e).toBeInstanceOf(APICallError); expect(e.statusCode).toBe(400); expect(e.isRetryable).toBe(false)
    expect(String(e.message) + String(e.responseBody)).not.toContain(KEY)
  })
  it.each([[429, true], [500, true], [503, true], [401, false], [404, false]])('HTTP %i → retryable=%s', async (status, retryable) => {
    queue.push({ status, json: { error: { message: 'x' } } })
    const e = await Promise.resolve(model().doGenerate(opts([U('q')]))).catch((x: any) => x)
    expect(e.statusCode).toBe(status); expect(e.isRetryable).toBe(retryable)
  })
  it('malformed JSON, a failed response status and a network error all throw (no silent success)', async () => {
    queue.push({ text: '<html>nope</html>' }); expect(await Promise.resolve(model().doGenerate(opts([U('q')]))).catch((x: any) => x)).toBeInstanceOf(APICallError)
    queue.push({ json: { status: 'failed', error: { message: 'model_error' } } }); await expect(model().doGenerate(opts([U('q')]))).rejects.toThrow(/responses_failed/)
    queue.push({ throws: new Error(`socket hang up ${KEY}`) }); const e = await Promise.resolve(model().doGenerate(opts([U('q')]))).catch((x: any) => x)
    expect(String(e.message)).toMatch(/responses_network_error/); expect(String(e.message)).not.toContain(KEY)
  })
  it('a hung API ends at LLM_RESPONSES_TIMEOUT_MS with a timeout error', async () => {
    process.env.LLM_RESPONSES_TIMEOUT_MS = '60'
    queue.push({ delayMs: 5000, json: body([MSG('late')]) })
    await expect(model().doGenerate(opts([U('q')]))).rejects.toThrow(/responses_timeout_60ms/)
  })
  it('the caller\'s abort signal stops the call', async () => {
    const ctrl = new AbortController(); queue.push({ delayMs: 5000, json: body([MSG('late')]) })
    const p = model().doGenerate(opts([U('q')], { abortSignal: ctrl.signal })); setTimeout(() => ctrl.abort(new Error('user_cancelled')), 30)
    await expect(p).rejects.toThrow(/user_cancelled/)
  })
})

describe('R5 · no secrets or reasoning content in logs', () => {
  it('after a full round trip no log line contains the key, an Authorization header, the encrypted blob or the prompt text', async () => {
    queue.push({ json: body([REASONING, FC('1')]) }, { json: body([MSG('đáp án')]) })
    const m = model()
    await m.doGenerate(opts([U('PROMPT-TEXT-SECRET-123')]))
    await m.doGenerate(opts([U('PROMPT-TEXT-SECRET-123'), { role: 'assistant', content: [{ type: 'tool-call', toolCallType: 'function', toolCallId: 'call_1', toolName: 'lookup_price', args: {} }] }, { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'call_1', toolName: 'lookup_price', result: 1 }] }]))
    const all = logs.join('\n')
    expect(all).toContain('tappyai_llm_call')
    for (const bad of [KEY, 'Authorization', 'Bearer', REASONING.encrypted_content, 'PROMPT-TEXT-SECRET-123', 'đáp án']) expect(all).not.toContain(bad)
  })
})

describe('R6 · in-process budget (hard stop)', () => {
  it('refuses to run at all without a configured cap', async () => {
    delete process.env.LLM_RESPONSES_PROCESS_BUDGET_USD
    await expect(model().doGenerate(opts([U('q')]))).rejects.toBeInstanceOf(ResponsesBudgetError)
    expect(calls.length).toBe(0)
  })
  it('stops BEFORE the cap can be exceeded (forecast 0.02 per call) and sends no request once refused', async () => {
    process.env.LLM_RESPONSES_PROCESS_BUDGET_USD = '0.05'
    queue.push({ json: body([MSG('a')], { input_tokens: 40000, input_tokens_details: { cached_tokens: 0 }, output_tokens: 20000, output_tokens_details: { reasoning_tokens: 0 } }) }) // 0.005 + 0.01 = 0.015
    const m = model()
    await m.doGenerate(opts([U('q')])); expect(responsesProcessSpend()).toBeCloseTo(0.015, 6)
    await m.doGenerate(opts([U('q')])); // second call (default tiny usage) → spend ~0.015
    await m.doGenerate(opts([U('q')]))  // 0.015 + forecast 0.02 = 0.035 ≤ 0.05 → allowed
    const before = calls.length
    await expect(m.doGenerate(opts([U('q')]))).resolves.toBeDefined() // 0.0150x + 0.02 ≤ 0.05 still true
    process.env.LLM_RESPONSES_PROCESS_BUDGET_USD = '0.03'
    await expect(m.doGenerate(opts([U('q')]))).rejects.toBeInstanceOf(ResponsesBudgetError)
    expect(calls.length).toBe(before + 1) // the refused call never reached fetch
  })
  it('concurrent calls reserve the forecast up front: with a 0.05 cap at most 2 of 5 simultaneous calls are sent', async () => {
    process.env.LLM_RESPONSES_PROCESS_BUDGET_USD = '0.05'
    for (let i = 0; i < 5; i++) queue.push({ delayMs: 30, json: body([MSG('ok')]) })
    const m = model()
    const r = await Promise.allSettled(Array.from({ length: 5 }, () => m.doGenerate(opts([U('q')]))))
    expect(r.filter(x => x.status === 'fulfilled').length).toBe(2)
    expect(r.filter(x => x.status === 'rejected' && (x as PromiseRejectedResult).reason instanceof ResponsesBudgetError).length).toBe(3)
    expect(calls.length).toBe(2)
  })
  it('LLM_RESPONSES_FORECAST_USD lowers the per-call reservation (a small probe), never removes it: cap 0.01 with forecast 0.004 admits 2 simultaneous calls, not 3', async () => {
    process.env.LLM_RESPONSES_PROCESS_BUDGET_USD = '0.01'; process.env.LLM_RESPONSES_FORECAST_USD = '0.004'
    for (let i = 0; i < 3; i++) queue.push({ delayMs: 30, json: body([MSG('ok')]) })
    const m = model()
    const r = await Promise.allSettled(Array.from({ length: 3 }, () => m.doGenerate(opts([U('q')]))))
    delete process.env.LLM_RESPONSES_FORECAST_USD
    expect(r.filter(x => x.status === 'fulfilled').length).toBe(2); expect(calls.length).toBe(2)
  })
  it('a response without usage is charged the conservative estimate and flagged costUnknown', async () => {
    queue.push({ json: body([MSG('no usage')], null as never) })
    const r = await model().doGenerate(opts([U('q')]))
    expect((r.providerMetadata as any).tappy.cost).toMatchObject({ costUnknown: true, api: 'responses', usd: UNKNOWN_CALL_USD })
    expect(responsesProcessSpend()).toBeCloseTo(UNKNOWN_CALL_USD, 6)
  })
  it('failures count: a refused 4xx costs nothing, a timeout or 5xx is charged a quarter of the forecast, and retries are separate calls', async () => {
    queue.push({ status: 400, json: { error: { message: 'bad' } } }, { status: 500, json: { error: { message: 'oops' } } })
    const m = model()
    await Promise.resolve(m.doGenerate(opts([U('q')]))).catch(() => {}); expect(responsesProcessSpend()).toBe(0)
    await Promise.resolve(m.doGenerate(opts([U('q')]))).catch(() => {}); expect(responsesProcessSpend()).toBeCloseTo(UNKNOWN_CALL_USD / 4, 6)
  })
})

describe('R7 · fallback instrumentation (no silent second answer)', () => {
  it('default registry: a failing Responses call is retried once (the production behaviour) — the retry is visible as a second request', async () => {
    queue.push({ status: 500, json: { error: { message: 'oops' } } }, { json: body([MSG('second try')]) })
    const r = await modelForRole('plan' as never).doGenerate(opts([U('q')]))
    expect(r.text).toBe('second try'); expect(calls.length).toBe(2)
    expect(logs.filter(l => l.includes('"status":"error"')).length).toBe(1)
  })
  // SKIPPED in this integration: it covers the LLM_FALLBACK_DISABLED prototype (marked "scratch only" in its source), which was not
  // taken into canonical. Production behaviour is unchanged; the owner decides whether the prototype knob is wanted.
  it.skip('LLM_FALLBACK_DISABLED=1: the same failure surfaces as the call\'s error, exactly one request, and the log marks it as an error', async () => {
    process.env.LLM_FALLBACK_DISABLED = '1'
    queue.push({ status: 500, json: { error: { message: 'oops' } } }, { json: body([MSG('must never be served')]) })
    await expect(modelForRole('plan' as never).doGenerate(opts([U('q')]))).rejects.toBeInstanceOf(APICallError)
    expect(calls.length).toBe(1)
    expect(logs.some(l => l.includes('"served_api":"responses"') && l.includes('"status":"error"') && l.includes('"http":500'))).toBe(true)
  })
  it('every successful call is attributed: served_provider openai, served_api responses, model, status ok', async () => {
    process.env.LLM_FALLBACK_DISABLED = '1'
    await modelForRole('plan' as never).doGenerate(opts([U('q')]))
    const line = logs.find(l => l.includes('tappyai_llm_call'))!
    expect(JSON.parse(line)).toMatchObject({ type: 'tappyai_llm_call', served_provider: 'openai', served_api: 'responses', model: 'gpt-6-luna', status: 'ok', costUnknown: false })
  })
  it('without the switch the adapter is the chat path, unchanged (no Responses request, provider name untouched)', async () => {
    delete process.env.LLM_OPENAI_API
    const m = model()
    expect(m.provider).not.toBe('openai.responses')
  })
})
