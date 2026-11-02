// @vitest-environment node
// TURN_WEB_TICKET · step 2a — does the per-turn ticket (AsyncLocalStorage) reach the inside of tool.execute() when the tool runs under the
// repo's REAL `streamText` (ai 4.3.x), including nested awaits, Promise.all and timers, and do two concurrent turns keep their own?
// The model is a fake (ai/test MockLanguageModelV1): no network, no provider. A real fetch would throw and fail the test.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { streamText, tool, type LanguageModelV1StreamPart } from 'ai'
import { MockLanguageModelV1, simulateReadableStream } from 'ai/test'
import { z } from 'zod'
import { createTurnWebTicket, currentTurnWebTicket, runWithTurnWebTicket, wrapToolsWithTurnWebTicket, type TurnWebTicket } from './serperToolBudget'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

beforeEach(() => { vi.stubGlobal('fetch', vi.fn(() => { throw new Error('REAL FETCH CALLED — tests must not reach the network') })) })
afterEach(() => { vi.unstubAllGlobals() })

/** A model that asks for two tool calls in step 1 (run in parallel by the SDK) and answers in step 2. */
function fakeModel() {
  let step = 0
  return new MockLanguageModelV1({
    doStream: async () => {
      step++
      const chunks: LanguageModelV1StreamPart[] = step === 1
        ? [
            { type: 'tool-call' as const, toolCallType: 'function' as const, toolCallId: 'c1', toolName: 'probe', args: JSON.stringify({ q: 'a' }) },
            { type: 'tool-call' as const, toolCallType: 'function' as const, toolCallId: 'c2', toolName: 'probe', args: JSON.stringify({ q: 'b' }) },
            { type: 'finish' as const, finishReason: 'tool-calls' as const, usage: { promptTokens: 1, completionTokens: 1 } },
          ]
        : [
            { type: 'text-delta' as const, textDelta: 'done' },
            { type: 'finish' as const, finishReason: 'stop' as const, usage: { promptTokens: 1, completionTokens: 1 } },
          ]
      return { stream: simulateReadableStream({ chunks }), rawCall: { rawPrompt: null, rawSettings: {} } }
    },
  })
}

/** Records the ticket seen at four depths inside execute(): direct, after an await, inside Promise.all, inside a timer. */
function probeTools(seen: Array<{ q: string; where: string; ticket: TurnWebTicket | undefined }>) {
  return {
    probe: tool({
      description: 'probe',
      parameters: z.object({ q: z.string() }),
      execute: async ({ q }: { q: string }) => {
        seen.push({ q, where: 'direct', ticket: currentTurnWebTicket() })
        await sleep(5)
        seen.push({ q, where: 'after_await', ticket: currentTurnWebTicket() })
        await Promise.all([sleep(1).then(() => seen.push({ q, where: 'promise_all', ticket: currentTurnWebTicket() })), sleep(2)])
        await new Promise<void>(res => setTimeout(() => { seen.push({ q, where: 'timer', ticket: currentTurnWebTicket() }); res() }, 1))
        return { ok: true }
      },
    }),
  }
}

async function drain(r: { fullStream: AsyncIterable<unknown> }): Promise<void> {
  for await (const _ of r.fullStream) { void _ }
}

describe('TURN_WEB_TICKET · AsyncLocalStorage under the real streamText', () => {
  it('a ticket wrapped around execute() is the current ticket at every depth, for both parallel tool calls of the step', async () => {
    const ticket = createTurnWebTicket()
    const seen: Array<{ q: string; where: string; ticket: TurnWebTicket | undefined }> = []
    const tools = wrapToolsWithTurnWebTicket(probeTools(seen), ticket)
    await drain(streamText({ model: fakeModel(), tools, maxSteps: 3, prompt: 'x' }))
    expect(seen).toHaveLength(8) // 2 calls × 4 depths
    expect(new Set(seen.map(s => s.where))).toEqual(new Set(['direct', 'after_await', 'promise_all', 'timer']))
    expect(seen.every(s => s.ticket === ticket)).toBe(true)
  })

  it('two concurrent streamText turns each see only their own ticket', async () => {
    const tA = createTurnWebTicket()
    const tB = createTurnWebTicket()
    const seenA: Array<{ q: string; where: string; ticket: TurnWebTicket | undefined }> = []
    const seenB: Array<{ q: string; where: string; ticket: TurnWebTicket | undefined }> = []
    await Promise.all([
      drain(streamText({ model: fakeModel(), tools: wrapToolsWithTurnWebTicket(probeTools(seenA), tA), maxSteps: 3, prompt: 'x' })),
      drain(streamText({ model: fakeModel(), tools: wrapToolsWithTurnWebTicket(probeTools(seenB), tB), maxSteps: 3, prompt: 'y' })),
    ])
    expect(seenA).toHaveLength(8)
    expect(seenB).toHaveLength(8)
    expect(seenA.every(s => s.ticket === tA)).toBe(true)
    expect(seenB.every(s => s.ticket === tB)).toBe(true)
  })

  it('outside any ticket scope (an unwrapped tool) there is no ticket — nothing is limited', async () => {
    const seen: Array<{ q: string; where: string; ticket: TurnWebTicket | undefined }> = []
    await drain(streamText({ model: fakeModel(), tools: probeTools(seen), maxSteps: 3, prompt: 'x' }))
    expect(seen).toHaveLength(8)
    expect(seen.every(s => s.ticket === undefined)).toBe(true)
  })

  it('a scope opened AROUND streamText() (not around execute) also reaches execute — observed, not relied on: the route wraps execute', async () => {
    const ticket = createTurnWebTicket()
    const seen: Array<{ q: string; where: string; ticket: TurnWebTicket | undefined }> = []
    await runWithTurnWebTicket(ticket, () => drain(streamText({ model: fakeModel(), tools: probeTools(seen), maxSteps: 3, prompt: 'x' })))
    expect(seen).toHaveLength(8)
    // Recorded as observed on ai 4.3.19; the implementation does not depend on it.
    expect(seen.every(s => s.ticket === ticket)).toBe(true)
  })
})
