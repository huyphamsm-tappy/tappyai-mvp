// @vitest-environment node
// 31/10 (mode "Suy nghĩ"): with LLM_OPENAI_API unset (the chat path), ONE call that asks for the Responses API (providerMetadata.tappy.api,
// set by AI.stream `thinkEffort`) goes to /v1/responses at the effort it asked for, really streamed; every other call stays on chat
// completions; with no Responses spend cap configured the call stays on chat (reserveBudget would refuse it). Local mock upstream on loopback
// (the documented seam LLM_RESPONSES_BASE_URL); the chat endpoint is never reached here because its calls are not made.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { startLocalUpstream, type LocalUpstream } from '@/test/localUpstream'
import { c2FlagsOff } from '@/test/c2FlagsOff'

c2FlagsOff()

let up: LocalUpstream
const requests: Array<{ path: string; body: Record<string, unknown>; accept: string | undefined }> = []
const ev = (type: string, data: Record<string, unknown>) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
const COMPLETED = { id: 'r1', model: 'm', status: 'completed', output: [{ id: 'msg', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Xin chào', annotations: [] }] }], usage: { input_tokens: 10, input_tokens_details: { cached_tokens: 0 }, output_tokens: 5, output_tokens_details: { reasoning_tokens: 3 } } }

beforeAll(async () => {
  up = await startLocalUpstream((req, res, raw) => {
    requests.push({ path: req.url ?? '', body: raw ? JSON.parse(raw) as Record<string, unknown> : {}, accept: req.headers.accept as string | undefined })
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.write(ev('response.output_text.delta', { delta: 'Xin ' }))
    res.write(ev('response.output_text.delta', { delta: 'chào' }))
    res.write(ev('response.completed', { response: COMPLETED }))
    res.end()
  })
  delete process.env.LLM_OPENAI_API
  process.env.OPENAI_API_KEY = 'dummy-key-for-the-local-upstream'
  process.env.LLM_RESPONSES_BASE_URL = up.url
  delete process.env.C2_STREAM_ADAPTER
})
afterAll(async () => {
  delete process.env.OPENAI_API_KEY; delete process.env.LLM_RESPONSES_BASE_URL; delete process.env.LLM_RESPONSES_PROCESS_BUDGET_USD
  await up.close()
})

// `offline`: an already-aborted signal, so a call that stays on chat completions never leaves the machine (no real endpoint, no dummy key on the wire)
const call = (tappy?: Record<string, unknown>, offline = false) => ({ inputFormat: 'messages', mode: { type: 'regular' }, prompt: [{ role: 'user', content: [{ type: 'text', text: 'chào' }] }], ...(tappy ? { providerMetadata: { tappy } } : {}), ...(offline ? { abortSignal: AbortSignal.abort() } : {}) }) as never
const model = async () => (await import('./openai')).createOpenAIProvider({}).model('consult' as never)
async function drain(s: ReadableStream<{ type: string; textDelta?: string }>): Promise<string> {
  let text = ''; const r = s.getReader()
  for (;;) { const { done, value } = await r.read(); if (done) return text; if (value.type === 'text-delta') text += value.textDelta ?? '' }
}

describe('AI.stream asks for it only when the mode does', () => {
  it('thinkEffort → tappy { api: responses, effort }; nothing asked → no provider options; parallel tools unchanged', async () => {
    const { streamProviderOptions } = await import('../ai')
    expect(streamProviderOptions({ thinkEffort: 'medium' })).toEqual({ providerOptions: { tappy: { api: 'responses', effort: 'medium' } } })
    expect(streamProviderOptions({})).toEqual({})
    expect(streamProviderOptions({ parallelTools: true, tools: {} })).toEqual({ providerOptions: { tappy: { parallelTools: true } } })
    expect(streamProviderOptions({ parallelTools: true })).toEqual({})
  })
})

describe('01/11 mode "Tự động": the turn switches to thinking between two steps', () => {
  it('autoThink → the tappy options of the stream ask for nothing until it is on, then for the Responses API at its effort; parallel tools kept', async () => {
    const { streamProviderOptions } = await import('../ai')
    const sw = { on: false, effort: 'medium' as const }
    const o = streamProviderOptions({ parallelTools: true, tools: {}, autoThink: sw }) as { providerOptions: { tappy: Record<string, unknown> } }
    expect(o.providerOptions.tappy.parallelTools).toBe(true)
    expect(o.providerOptions.tappy.api).toBeUndefined()
    expect(o.providerOptions.tappy.effort).toBeUndefined()
    sw.on = true
    expect(o.providerOptions.tappy).toMatchObject({ parallelTools: true, api: 'responses', effort: 'medium' })
    // a turn without tools still gets the switch (no parallelTools)
    const bare = streamProviderOptions({ autoThink: { on: true, effort: 'medium' } }) as { providerOptions: { tappy: Record<string, unknown> } }
    expect(bare.providerOptions.tappy).toMatchObject({ api: 'responses', effort: 'medium' })
  })
  it('the SAME options object on two calls (as streamText passes it to every step): chat completions first, the Responses API once switched on', async () => {
    process.env.LLM_RESPONSES_PROCESS_BUDGET_USD = '1'
    const { streamProviderOptions } = await import('../ai')
    const sw = { on: false, effort: 'medium' as const }
    const tappy = (streamProviderOptions({ autoThink: sw }) as { providerOptions: { tappy: Record<string, unknown> } }).providerOptions.tappy
    const before = requests.length
    await Promise.resolve((await model()).doStream(call(tappy, true))).catch(() => null) // step 1: chat completions (offline)
    expect(requests.slice(before).some(x => x.path === '/v1/responses')).toBe(false)
    sw.on = true
    const r = await (await model()).doStream(call(tappy)) // step 2: the model asked to think
    expect(await drain(r.stream as never)).toBe('Xin chào')
    const last = requests[requests.length - 1]
    expect(last.path).toBe('/v1/responses')
    expect(last.body).toMatchObject({ reasoning: { effort: 'medium' } })
  })
})

describe('mode "Suy nghĩ": one call on the Responses API, streamed, at the asked effort', () => {
  it('a call that asks for it (api: responses, effort: medium) is streamed from /v1/responses with reasoning.effort medium', async () => {
    process.env.LLM_RESPONSES_PROCESS_BUDGET_USD = '1'
    const before = requests.length
    const r = await (await model()).doStream(call({ api: 'responses', effort: 'medium' }))
    expect(await drain(r.stream as never)).toBe('Xin chào')
    const last = requests[requests.length - 1]
    expect(requests.length).toBe(before + 1)
    expect(last.path).toBe('/v1/responses')
    expect(last.body).toMatchObject({ stream: true, reasoning: { effort: 'medium' } })
    expect(last.accept).toContain('text/event-stream')
  })
  it('without a Responses spend cap the same call stays on chat completions (no Responses request is made)', async () => {
    delete process.env.LLM_RESPONSES_PROCESS_BUDGET_USD
    const before = requests.length
    // the Responses path would refuse at once for want of its spend cap; the chat path fails only on the aborted signal
    const err = await (await model()).doStream(call({ api: 'responses', effort: 'medium' }, true)).then(() => null, (e: unknown) => String((e as Error)?.message ?? e))
    expect(err ?? '').not.toMatch(/responses_budget/)
    expect(requests.slice(before).some(x => x.path === '/v1/responses')).toBe(false)
  })
  it('a call that does not ask is never sent to the Responses API', async () => {
    process.env.LLM_RESPONSES_PROCESS_BUDGET_USD = '1'
    const before = requests.length
    await Promise.resolve((await model()).doStream(call(undefined, true))).catch(() => null)
    expect(requests.slice(before).some(x => x.path === '/v1/responses')).toBe(false)
  })
})
