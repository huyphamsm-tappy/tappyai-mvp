// @vitest-environment node
// CONSULT_REQUEST_CAP · the AI SDK TOOL LOOP. The real `streamText` (ai 4.3.x) runs the tool-calling steps; only the MODEL is fake (ai/test
// MockLanguageModelV1) and only the Serper network is stubbed. The stream is drained by the test, outside any scope — the shape of a consumer
// that pulls the stream after the handler returned. Counts are calls that reach the stubbed fetch to google.serper.dev.
// Scope of the evidence: ai 4.3.19 + a fake model + a stub network. It is NOT the production model wrapper (providers/openai.ts etc.), NOT the
// Next.js runtime and NOT Vercel.
// This file lives in src/lib/ai/llm/ on purpose: the architecture guard (scripts/architecture/check.mjs, rule no-facade-bypass) allows a direct
// streamText() only in the AI layer, and a test that drives the real tool loop needs it.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { streamText, tool, type LanguageModelV1StreamPart } from 'ai'
import { MockLanguageModelV1, simulateReadableStream } from 'ai/test'
import { z } from 'zod'
import { serperPost } from '@/lib/ai/tools/serperClient'
import { __clearToolCache } from '@/lib/ai/tools/common'
import { __resetRequestCap, createRequestCapTurn, requestCapTotals, wrapToolsWithRequestCap, type RequestCapTurn } from '@/lib/ai/tools/serperRequestCap'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
let sent: string[]

beforeEach(() => {
  sent = []
  __resetRequestCap(); __clearToolCache()
  vi.stubEnv('CONSULT_REQUEST_CAP', '1')
  vi.stubEnv('CONSULT_REQUEST_CAP_PER_TURN', '4')
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: { body?: unknown }) => {
    if (!String(input).includes('google.serper.dev')) throw new Error('REAL FETCH CALLED — tests must not reach the network')
    let q = ''
    try { q = String((JSON.parse(String(init?.body ?? '{}')) as { q?: string }).q ?? '') } catch { q = '' }
    sent.push(q)
    await sleep(3)
    return new Response(JSON.stringify({ organic: [{ title: 't', link: 'https://example.com/a', snippet: 's' }], credits: 1 }), { status: 200 })
  }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

/** Step 1: `first` parallel tool calls. Step 2: `second` more. Step 3: the answer. */
function fakeModel(first: number, second: number, prefix: string) {
  let step = 0
  const calls = (n: number, base: string): LanguageModelV1StreamPart[] => Array.from({ length: n }, (_, i) => ({ type: 'tool-call' as const, toolCallType: 'function' as const, toolCallId: `${base}${i}`, toolName: 'search', args: JSON.stringify({ q: `${prefix} ${base}${i}` }) }))
  return new MockLanguageModelV1({
    doStream: async () => {
      step++
      const chunks: LanguageModelV1StreamPart[] = step === 1
        ? [...calls(first, 'a'), { type: 'finish', finishReason: 'tool-calls', usage: { promptTokens: 1, completionTokens: 1 } }]
        : step === 2 && second > 0
          ? [...calls(second, 'b'), { type: 'finish', finishReason: 'tool-calls', usage: { promptTokens: 1, completionTokens: 1 } }]
          : [{ type: 'text-delta', textDelta: 'done' }, { type: 'finish', finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1 } }]
      return { stream: simulateReadableStream({ chunks }), rawCall: { rawPrompt: null, rawSettings: {} } }
    },
  })
}

const searchTool = (results: Array<{ q: string; sent: boolean }>) => ({
  search: tool({
    description: 'search',
    parameters: z.object({ q: z.string() }),
    execute: async ({ q }: { q: string }) => { const r = await serperPost('search', 'k', { q }, 2000); results.push({ q, sent: r !== null }); return { ok: r !== null } },
  }),
})
async function drain(r: { fullStream: AsyncIterable<unknown> }): Promise<void> { for await (const _ of r.fullStream) { void _ } }

describe('the real AI SDK tool loop (fake model, stub network)', () => {
  it('wrapped tools: 3 parallel calls in step 1 + 2 in step 2 against a cap of 4 → exactly 4 reach fetch, 1 is refused', async () => {
    const turn = createRequestCapTurn()!
    const results: Array<{ q: string; sent: boolean }> = []
    const tools = wrapToolsWithRequestCap(searchTool(results), turn)
    await drain(streamText({ model: fakeModel(3, 2, 'w'), tools, maxSteps: 4, prompt: 'x' }))
    expect(results).toHaveLength(5)
    expect(sent).toHaveLength(4)
    expect(results.filter(r => r.sent)).toHaveLength(4)
    expect(turn.sent).toBe(4)
    expect(turn.refused).toBe(1)
    expect(turn.refusals).toEqual({ turn_cap: 1 })
  })

  it('wrapped tools, a cap never reached: nothing is refused', async () => {
    const turn = createRequestCapTurn()!
    const results: Array<{ q: string; sent: boolean }> = []
    await drain(streamText({ model: fakeModel(2, 1, 'n'), tools: wrapToolsWithRequestCap(searchTool(results), turn), maxSteps: 4, prompt: 'x' }))
    expect(sent).toHaveLength(3)
    expect(turn.refused).toBe(0)
  })

  it('UNWRAPPED tools (an entry point nobody wired): every request is refused (fail-closed), none is sent — the loop still finishes', async () => {
    const results: Array<{ q: string; sent: boolean }> = []
    await drain(streamText({ model: fakeModel(3, 2, 'u'), tools: searchTool(results), maxSteps: 4, prompt: 'x' }))
    expect(results).toHaveLength(5)
    expect(sent).toHaveLength(0)
    expect(requestCapTotals().refused.no_turn_scope).toBe(5)
  })

  it('two turns streaming at the same time each keep their own count', async () => {
    const a = createRequestCapTurn()!; const b = createRequestCapTurn()!
    const ra: Array<{ q: string; sent: boolean }> = []; const rb: Array<{ q: string; sent: boolean }> = []
    await Promise.all([
      drain(streamText({ model: fakeModel(3, 3, 'A'), tools: wrapToolsWithRequestCap(searchTool(ra), a), maxSteps: 4, prompt: 'x' })),
      drain(streamText({ model: fakeModel(2, 0, 'B'), tools: wrapToolsWithRequestCap(searchTool(rb), b), maxSteps: 4, prompt: 'y' })),
    ])
    expect(sent.filter(q => q.startsWith('A '))).toHaveLength(4) // 6 attempted, cap 4
    expect(sent.filter(q => q.startsWith('B '))).toHaveLength(2) // 2 attempted, under the cap
    const t = (x: RequestCapTurn) => [x.sent, x.refused]
    expect([t(a), t(b)]).toEqual([[4, 2], [2, 0]])
  })
})
