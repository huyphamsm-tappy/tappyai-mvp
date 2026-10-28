// @vitest-environment node
// Wave 6 · the pure replay core (writerReplay.ts): the registered writer-call rule, the request of each registered variant, the packed run. FAKE data only (shapes measured in W5: a small helper
// call after the answer, a final write with no tools that sends less than the tool loop, a turn with no text). No network, no key, no model.
import { createHash } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import type { CapturedCall, WriterCaptureFile } from './writerCapture'
import { V1_WRITING_NOTE, VARIANTS, packReplayRun, pickWriterCalls, replayVariant, sentChars, variantRequest } from './writerReplay'

const sys = (t: string) => ({ role: 'system', content: t })
const user = (t: string) => ({ role: 'user', content: t })
const big = (k: number) => 'x'.repeat(k)
const call = (turn: string, n: number, body: Record<string, unknown>, r: Partial<NonNullable<CapturedCall['response']>> | null): CapturedCall => ({ turn, n, body, response: r === null ? null : { status: 200, textChars: 0, toolCalls: 0, finishReason: 'stop', usage: null, ...r } })
const TOOLS = [{ type: 'function', function: { name: 'web_search' } }]
const CAP: WriterCaptureFile = {
  kind: 'tappy-writer-capture', version: 1, stamp: 1, truncated: false,
  calls: [
    // A: intent, a tool step, then the writing step (streamed, with tools offered)
    call('A', 1, { response_format: { type: 'json_schema' }, messages: [sys('intent'), user('q')] }, { textChars: 50 }),
    call('A', 2, { model: 'gpt-6-luna', stream: true, stream_options: { include_usage: true }, tools: TOOLS, messages: [sys(big(5000)), user('q')] }, { toolCalls: 1, finishReason: 'tool_calls' }),
    call('A', 3, { model: 'gpt-6-luna', stream: true, stream_options: { include_usage: true }, tools: TOOLS, messages: [sys(big(5000)), user('q'), { role: 'tool', content: big(800) }] }, { textChars: 900 }),
    // B: intent, the answer, then a SMALL helper call that also answers with text (W5 E20 shape): the helper is not the writer
    call('B', 1, { response_format: {}, messages: [sys('intent')] }, { textChars: 40 }),
    call('B', 2, { model: 'gpt-6-luna', stream: true, tools: TOOLS, messages: [sys(big(5000)), user('q2')] }, { textChars: 400 }),
    call('B', 3, { model: 'gpt-6-luna', messages: [sys('helper'), user(big(100))] }, { textChars: 14 }),
    // C: the tool loop wrote nothing, then the final write (no tools, not streamed) that sends LESS than the loop's last step (W5 E22 shape): it is the writer
    call('C', 1, { response_format: {}, messages: [sys('intent')] }, { textChars: 40 }),
    call('C', 2, { model: 'gpt-6-luna', stream: true, tools: TOOLS, messages: [sys(big(6000)), user('q3'), { role: 'tool', content: big(2000) }] }, { toolCalls: 1, finishReason: 'tool_calls' }),
    call('C', 3, { model: 'gpt-6-luna', messages: [sys(big(5000)), user('q3'), { role: 'user', content: big(1500) }] }, { textChars: 700 }),
    // D: no request answered with text
    call('D', 1, { response_format: {}, messages: [sys('intent')] }, { textChars: 40 }),
    call('D', 2, { model: 'gpt-6-luna', stream: true, tools: TOOLS, messages: [sys(big(5000))] }, { status: 500, textChars: 0 }),
    // E: a LARGE intent call answered with text, the writing call failed: the intent call is never the writer
    call('E', 1, { response_format: {}, messages: [sys(big(6000))] }, { textChars: 60 }),
    call('E', 2, { model: 'gpt-6-luna', stream: true, tools: TOOLS, messages: [sys(big(5000))] }, { status: 500, textChars: 0 }),
    // F: the answer, then a later step that wrote some text AND asked for a tool: that step is not the writer
    call('F', 1, { model: 'gpt-6-luna', stream: true, tools: TOOLS, messages: [sys(big(5000)), user('f')] }, { textChars: 300 }),
    call('F', 2, { model: 'gpt-6-luna', stream: true, tools: TOOLS, messages: [sys(big(5200)), user('f')] }, { textChars: 20, toolCalls: 1, finishReason: 'tool_calls' }),
    // G: the answer, then a later call that came back empty (no text, no tool): not the writer
    call('G', 1, { model: 'gpt-6-luna', stream: true, tools: TOOLS, messages: [sys(big(5000)), user('g')] }, { textChars: 300 }),
    call('G', 2, { model: 'gpt-6-luna', messages: [sys(big(5200)), user('g')] }, { textChars: 0 }),
    // H: two full text answers (a completion after an answer): the LAST one is the writer
    call('H', 1, { model: 'gpt-6-luna', stream: true, tools: TOOLS, messages: [sys(big(5000)), user('h')] }, { textChars: 300 }),
    call('H', 2, { model: 'gpt-6-luna', messages: [sys(big(5000)), user('h'), { role: 'assistant', content: big(300) }] }, { textChars: 500 }),
  ],
}

describe('W6 replay · the registered writer-call rule', () => {
  it('per turn: the last text answer that is not the intent call and not a small helper; a turn with none is reported', () => {
    const p = pickWriterCalls(CAP)
    expect(p.map(x => [x.turn, x.n])).toEqual([['A', 3], ['B', 2], ['C', 3], ['D', null], ['E', null], ['F', 1], ['G', 1], ['H', 2]])
    expect(p[3]).toMatchObject({ reason: expect.stringContaining('no request answered with text') })
    expect(p[4]).toMatchObject({ reason: expect.stringContaining('no request answered with text') })
    expect((p[0] as { sentChars: number }).sentChars).toBe(sentChars(CAP.calls[2]!.body))
  })
})

describe('W6 replay · the request of each registered variant', () => {
  const body = (pickWriterCalls(CAP)[0] as { body: Record<string, unknown> }).body
  it('the note is pinned word for word (its SHA-256 is the one recorded in probe2/w6-bien-the.md) and is general (no digit, no question text)', () => {
    expect(createHash('sha256').update(V1_WRITING_NOTE, 'utf8').digest('hex')).toBe(NOTE_SHA)
    expect(V1_WRITING_NOTE).not.toMatch(/\d/)
  })
  it('V0: the same messages and model; one answer, not streamed; tools kept with tool_choice "none"', () => {
    const r = variantRequest(body, VARIANTS[0]!)
    expect(r.messages).toEqual(body.messages); expect(r.model).toBe('gpt-6-luna'); expect(r.tools).toEqual(TOOLS)
    expect(r.tool_choice).toBe('none'); expect('stream' in r).toBe(false); expect('stream_options' in r).toBe(false)
    expect(body.stream).toBe(true) // the captured body is not changed
    const noTools = variantRequest((pickWriterCalls(CAP)[2] as { body: Record<string, unknown> }).body, VARIANTS[0]!)
    expect('tool_choice' in noTools).toBe(false)
  })
  it('V1: the note is appended to the FIRST system message only; nothing else changes (string content and text-part content)', () => {
    const r = variantRequest(body, VARIANTS[1]!)
    const msgs = r.messages as Array<{ role: string; content: unknown }>
    expect(msgs[0]!.content).toBe(`${big(5000)}\n\n${V1_WRITING_NOTE}`)
    expect(msgs.slice(1)).toEqual((body.messages as unknown[]).slice(1))
    const parts = variantRequest({ messages: [{ role: 'system', content: [{ type: 'text', text: 'a' }] }, user('q')] }, VARIANTS[1]!)
    expect((parts.messages as Array<{ content: unknown }>)[0]!.content).toEqual([{ type: 'text', text: 'a' }, { type: 'text', text: V1_WRITING_NOTE }])
    const none = variantRequest({ messages: [user('q')] }, VARIANTS[1]!)
    expect(none.messages).toEqual([{ role: 'system', content: V1_WRITING_NOTE }, user('q')])
    // two system messages (the shared part and the turn's own part): only the first one gets the note
    const two = variantRequest({ messages: [sys('shared'), sys('own'), user('q')] }, VARIANTS[1]!)
    expect(two.messages).toEqual([sys(`shared\n\n${V1_WRITING_NOTE}`), sys('own'), user('q')])
  })
  it('V2 / V3: the model the Owner chose (refused without one); V3 also has the note', () => {
    expect(() => variantRequest(body, VARIANTS[2]!)).toThrow('no stronger model chosen')
    const v2 = variantRequest(body, VARIANTS[2]!, { strongerModel: 'owner-choice' })
    expect(v2.model).toBe('owner-choice'); expect(v2.messages).toEqual(body.messages)
    const v3 = variantRequest(body, VARIANTS[3]!, { strongerModel: 'owner-choice' })
    expect(v3.model).toBe('owner-choice'); expect((v3.messages as Array<{ content: unknown }>)[0]!.content).toContain(V1_WRITING_NOTE)
  })
})

describe('W6 replay · running and packing (fake send)', () => {
  it('every picked turn is sent once with its variant request; a failure is recorded and the next turn still runs; a turn that was not picked is not sent', async () => {
    const sent: string[] = []
    const answers = await replayVariant(pickWriterCalls(CAP).slice(0, 4), VARIANTS[1]!, async (req, m) => {
      sent.push(m.turn)
      expect(req.tool_choice === 'none' || !req.tools).toBe(true)
      if (m.turn === 'B') throw new Error('provider 503')
      return { text: `tra loi ${m.turn}`, usd: 0.001 }
    })
    expect(sent).toEqual(['A', 'B', 'C'])
    expect(answers.map(a => [a.turn, a.text])).toEqual([['A', 'tra loi A'], ['B', null], ['C', 'tra loi C'], ['D', null]])
    expect(answers[1]!.error).toContain('provider 503'); expect(answers[3]!.error).toContain('not replayed')
    const run = packReplayRun(answers, { variant: 'V1', captureFile: 'capture-1.json', questionSha256: 'ab'.repeat(32), model: 'gpt-6-luna', at: '2026-10-28T00:00:00Z' })
    expect(run.turns.map(t => [t.id, t.answer])).toEqual([['A', 'tra loi A'], ['B', ''], ['C', 'tra loi C'], ['D', '']]) // what make-blind-pairs.mjs reads
    expect(run.turns.map(t => t.chars)).toEqual([9, 0, 9, 0])
    expect(run.summary).toEqual({ turns: 4, answered: 2, notReplayed: 2, totalChars: 18, knownUsd: 0.002, unknownCostTurns: 1 })
  })
})

/** Recorded in probe2/w6-bien-the.md before any replay result exists. */
const NOTE_SHA = '590489470a926f3cd4ef9092b026345163b2e3e55a6a33f88506281b2e21bc4c'
