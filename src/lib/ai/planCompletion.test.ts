import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { planCompletionStream, extractPlanBlock, hasCompletePlan, toolResultDigest } from './planCompletion'

// UAT4 P1-f: the stored reply of a planning turn that announced the plan and stopped.
const sample = JSON.parse(readFileSync(join(process.cwd(), 'docs/uat/evidence/uat4-p1-2026-09-27/p1f-plan-announced-not-written.json'), 'utf8')) as { assistant: string }

const PLAN = '[TAPPY_PLAN]{"type":"trip","title":"Vũng Tàu 2 ngày 1 đêm","days":[]}[/TAPPY_PLAN]'

function frames(text: string): string {
  // how the SDK streamed that turn: tool frames, the prose in pieces, step ends, the finish frame
  const pieces = text.match(/[\s\S]{1,120}/g) ?? []
  return [
    '9:{"toolCallId":"t1","toolName":"get_hotel_prices","args":{}}',
    'a:{"toolCallId":"t1","result":{"hotel_list":[]}}',
    'e:{"finishReason":"tool-calls"}',
    ...pieces.map(p => `0:${JSON.stringify(p)}`),
    'e:{"finishReason":"stop"}',
    'd:{"finishReason":"stop"}',
  ].join('\n') + '\n'
}

function streamOf(s: string, chunk = 37): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(s)
  return new ReadableStream({ start(c) { for (let i = 0; i < bytes.length; i += chunk) c.enqueue(bytes.slice(i, i + chunk)); c.close() } })
}

async function read(s: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(s).text()
}

const textOf = (raw: string) => raw.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')

describe('UAT4 P1-f: a planning turn that ends without its plan', () => {
  it('the stored reply has no plan block (the defect)', () => {
    expect(hasCompletePlan(sample.assistant)).toBe(false)
    expect(sample.assistant).toContain('Giờ mình sẽ lập kế hoạch chi tiết')
  })

  it('appends the completed block before the finish frame, and the text streamed so far reaches the call', async () => {
    const complete = vi.fn(async () => `Đây là kế hoạch:\n${PLAN}\nChúc vui!`)
    const out = await read(planCompletionStream(streamOf(frames(sample.assistant)), { needed: true, complete, log: () => {} }))
    expect(complete).toHaveBeenCalledTimes(1)
    expect((complete.mock.calls[0] as unknown as [string])[0]).toBe(sample.assistant)
    const text = textOf(out)
    expect(text.startsWith(sample.assistant)).toBe(true)
    expect(text.endsWith(`\n\n${PLAN}\n`)).toBe(true) // the block only — the call's prose is dropped
    const lines = out.trim().split('\n')
    expect(lines[lines.length - 1]).toBe('d:{"finishReason":"stop"}')
    expect(lines[lines.length - 2].startsWith('0:')).toBe(true)
  })

  it('a reply that already has its plan, and a non-planning turn, make no extra call and pass through unchanged', async () => {
    const complete = vi.fn(async () => PLAN)
    const withPlan = frames(`${sample.assistant}\n${PLAN}`)
    expect(await read(planCompletionStream(streamOf(withPlan), { needed: true, complete, log: () => {} }))).toBe(withPlan)
    const plain = frames(sample.assistant)
    expect(await read(planCompletionStream(streamOf(plain), { needed: false, complete, log: () => {} }))).toBe(plain)
    expect(complete).not.toHaveBeenCalled()
  })

  it('fails open: an error, a timeout or an answer without a block ships the turn as the model left it', async () => {
    const plain = frames(sample.assistant)
    const events: Array<Record<string, unknown>> = []
    const log = (e: Record<string, unknown>) => { events.push(e) }
    expect(await read(planCompletionStream(streamOf(plain), { needed: true, complete: async () => { throw new Error('529') }, log }))).toBe(plain)
    expect(await read(planCompletionStream(streamOf(plain), { needed: true, complete: () => new Promise<string>(() => {}), timeoutMs: 20, log }))).toBe(plain)
    expect(await read(planCompletionStream(streamOf(plain), { needed: true, complete: async () => 'Mình sẽ lập kế hoạch ngay!', log }))).toBe(plain)
    expect(events.map(e => e.outcome)).toEqual(['error', 'timeout', 'no_block'])
  })

  it('a turn that ended in a provider error frame makes no extra call (measured: the usage-limit error)', async () => {
    const complete = vi.fn(async () => PLAN)
    const errored = '3:"You have reached your specified API usage limits."\nd:{"finishReason":"error"}\n'
    expect(await read(planCompletionStream(streamOf(errored), { needed: true, complete, log: () => {} }))).toBe(errored)
    expect(complete).not.toHaveBeenCalled()
  })

  it('helpers: the first complete block only; the tool digest is capped', () => {
    expect(extractPlanBlock(`a ${PLAN} b [TAPPY_PLAN]{}`)).toBe(PLAN)
    expect(extractPlanBlock('[TAPPY_PLAN]{"cut":')).toBeNull()
    const d = toolResultDigest([{ toolName: 'search_places', result: { results: 'x'.repeat(500) } }], 100)
    expect(d.startsWith('### search_places\n')).toBe(true)
    expect(d.length).toBeLessThanOrEqual(102)
  })
})
