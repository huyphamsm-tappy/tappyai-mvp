// @vitest-environment node
// The provider's Responses path over the REAL transport (security/safePost), against a local mock upstream on loopback. The loopback http
// address is the documented test seam (LLM_RESPONSES_BASE_URL, honoured only for loopback). No provider or API is called; the key is a dummy.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { startLocalUpstream, type LocalUpstream } from '@/test/localUpstream'
import { c2FlagsOff } from '@/test/c2FlagsOff'

c2FlagsOff()

let up: LocalUpstream
const requests: Array<{ path: string; auth: string | undefined; body: Record<string, unknown>; accept: string | undefined }> = []
let mode: 'json' | 'stream' | 'error' | 'hold' = 'json'
let heldRes: { destroy: () => void; on: (e: string, f: () => void) => void } | null = null
let closedHeld = false

const COMPLETED = (text: string) => ({
  id: 'resp_1', model: 'mock-model', status: 'completed',
  output: [{ id: 'msg_1', type: 'message', role: 'assistant', content: [{ type: 'output_text', text, annotations: [] }] }],
  usage: { input_tokens: 10, input_tokens_details: { cached_tokens: 0 }, output_tokens: 5, output_tokens_details: { reasoning_tokens: 0 } },
})
const ev = (type: string, data: Record<string, unknown>) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`

beforeAll(async () => {
  up = await startLocalUpstream((req, res, raw) => {
    const body = raw ? JSON.parse(raw) as Record<string, unknown> : {}
    const wantsSse = String(req.headers.accept ?? '').includes('text/event-stream')
    requests.push({ path: req.url ?? '', auth: req.headers.authorization, body, accept: req.headers.accept as string | undefined })
    if (mode === 'error') { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'upstream down' } })); return }
    if (mode === 'hold' && wantsSse) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      res.write(ev('response.output_text.delta', { delta: 'par' }))
      heldRes = res
      res.on('close', () => { closedHeld = true })
      return
    }
    if (wantsSse) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      res.write(ev('response.output_text.delta', { delta: 'Xin ' }))
      res.write(ev('response.output_text.delta', { delta: 'chào' }))
      res.write(ev('response.completed', { response: COMPLETED('Xin chào') }))
      res.end()
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(COMPLETED('hello')))
  })
  process.env.LLM_OPENAI_API = 'responses'
  process.env.OPENAI_API_KEY = 'dummy-key-for-the-local-upstream'
  process.env.LLM_RESPONSES_BASE_URL = up.url
  process.env.LLM_RESPONSES_PROCESS_BUDGET_USD = '5'
  delete process.env.C2_STREAM_ADAPTER
})

afterAll(async () => {
  delete process.env.LLM_OPENAI_API; delete process.env.OPENAI_API_KEY; delete process.env.LLM_RESPONSES_BASE_URL
  delete process.env.LLM_RESPONSES_PROCESS_BUDGET_USD; delete process.env.C2_STREAM_ADAPTER
  await up.close()
})

async function model() {
  const mod = await import('./openai')
  return mod.createOpenAIProvider({}).model('agent' as never)
}
const PROMPT = { inputFormat: 'messages', mode: { type: 'regular' }, prompt: [{ role: 'user', content: [{ type: 'text', text: 'chào' }] }] } as never

describe('Responses provider over the real transport (local mock upstream)', () => {
  it('a generate call POSTs the JSON body with the Bearer key and returns the upstream text', async () => {
    mode = 'json'
    const m = await model()
    const before = requests.length
    const r = await m.doGenerate(PROMPT)
    expect(requests.length).toBe(before + 1)
    const last = requests[requests.length - 1]
    expect(last.path).toBe('/v1/responses')
    expect(last.auth).toBe('Bearer dummy-key-for-the-local-upstream')
    expect(last.body).toMatchObject({ store: false })
    expect(JSON.stringify(r)).toContain('hello')
  })

  it('default (C2_STREAM_ADAPTER off): a streamed call still uses one non-streamed upstream request', async () => {
    mode = 'json'
    const m = await model()
    const r = await m.doStream(PROMPT)
    const reader = r.stream.getReader()
    for (;;) { const n = await reader.read(); if (n.done) break }
    expect(requests[requests.length - 1].accept).not.toBe('text/event-stream')
  })

  it('C2_STREAM_ADAPTER on: a streamed call delivers the text deltas as frames, from the socket, to the caller', async () => {
    mode = 'stream'
    process.env.C2_STREAM_ADAPTER = '1'
    const m = await model()
    const r = await m.doStream(PROMPT)
    const reader = r.stream.getReader()
    let text = ''
    for (;;) {
      const n = await reader.read()
      if (n.done) break
      if (n.value.type === 'text-delta') text += n.value.textDelta
    }
    expect(text).toBe('Xin chào')
    expect(requests[requests.length - 1].accept).toBe('text/event-stream')
  })

  it('an upstream error status surfaces as an error to the caller (no silent success)', async () => {
    mode = 'error'
    const m = await model()
    await expect(m.doGenerate(PROMPT)).rejects.toBeDefined()
  })

  it('cancelling a streamed call closes the upstream connection', async () => {
    mode = 'hold'
    closedHeld = false
    process.env.C2_STREAM_ADAPTER = '1'
    const m = await model()
    const ctrl = new AbortController()
    const r = await m.doStream({ ...(PROMPT as object), abortSignal: ctrl.signal } as never)
    const reader = r.stream.getReader()
    await reader.read()
    ctrl.abort()
    await reader.cancel().catch(() => undefined)
    heldRes?.destroy()
    await new Promise(res => setTimeout(res, 50))
    expect(closedHeld).toBe(true)
  })
})
