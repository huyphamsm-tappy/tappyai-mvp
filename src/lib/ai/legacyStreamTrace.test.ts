// @vitest-environment node
/**
 * LEGACY_STREAM_TRACE (default OFF) — the default stream path records per-stage counts,
 * never reply text. Driven through the real stream filter (Gate-3 fixture B: a quality claim
 * that takes the whole sentence and its VERIFIED price with it).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { applyPlaceEnrichmentStreamFilter } from './streamEnrichment'
import { createEnrichmentCollector } from './toolResultSplit'
import { createLegacyStreamTrace, legacyStreamTraceEnabled } from './legacyStreamTrace'

const USER_TEXT = 'Tai nghe Sony WH-1000XM5 giá bao nhiêu, có đáng mua không?'
const REPLY = 'Sony WH-1000XM5 được đánh giá cao nên giá 8.000.000đ rất đáng tiền.'

async function run(reply: string): Promise<{ out: string; logs: string[] }> {
  const collector = createEnrichmentCollector(USER_TEXT)
  const frames = ['0:' + JSON.stringify(reply), 'd:{"finishReason":"stop"}']
  const logs: string[] = []
  const orig = console.log
  console.log = (...a: unknown[]) => { logs.push(String(a[0])) }
  try {
    const res = applyPlaceEnrichmentStreamFilter(new Response(frames.join('\n') + '\n'), 'vi', collector, undefined, undefined, undefined, false, USER_TEXT, true)
    const body = await new Response(res.body).text()
    const out = body.split('\n').filter(l => l.startsWith('0:')).map(l => JSON.parse(l.slice(2)) as string).join('')
    return { out, logs }
  } finally { console.log = orig }
}

const guardLines = (logs: string[]) => logs.filter(l => l.includes('"type":"tappyai_guard"')).map(l => JSON.parse(l) as Record<string, unknown>)

describe('LEGACY_STREAM_TRACE', () => {
  afterEach(() => { delete process.env.LEGACY_STREAM_TRACE })

  it('reads the flag at call time: only 1 / true are ON, everything else is OFF', () => {
    const env = (v?: string): NodeJS.ProcessEnv => ({ ...process.env, LEGACY_STREAM_TRACE: v })
    expect(legacyStreamTraceEnabled(env('1'))).toBe(true)
    expect(legacyStreamTraceEnabled(env(' true '))).toBe(true)
    expect(legacyStreamTraceEnabled(env('0'))).toBe(false)
    expect(legacyStreamTraceEnabled(env('yes'))).toBe(false)
    expect(legacyStreamTraceEnabled(env(undefined))).toBe(false)
  })

  it('OFF: the reply is unchanged by the trace and no tappyai_guard line is written', async () => {
    delete process.env.LEGACY_STREAM_TRACE
    const { out, logs } = await run(REPLY)
    expect(logs.some(l => l.includes('legacy_'))).toBe(false)
    expect(out).not.toContain('8.000.000')
  })

  it('ON: the reply is identical to OFF, and the trace records the removing stage with counts only', async () => {
    delete process.env.LEGACY_STREAM_TRACE
    const off = await run(REPLY)
    process.env.LEGACY_STREAM_TRACE = '1'
    const on = await run(REPLY)
    expect(on.out).toBe(off.out)
    const lines = guardLines(on.logs)
    const stage = lines.find(l => l.guard === 'legacy_stage' && l.amount_removed === true)
    expect(stage, JSON.stringify(lines)).toBeDefined()
    expect(stage).toMatchObject({ amounts_before: 1, amounts_after: 0 })
    const turn = lines.find(l => l.guard === 'legacy_turn')
    expect(turn).toMatchObject({ stages_changed: expect.any(Number) })
  })

  it('ON: no log line carries reply text or a price', async () => {
    process.env.LEGACY_STREAM_TRACE = '1'
    const { logs } = await run(REPLY)
    const traced = logs.filter(l => l.includes('legacy_'))
    expect(traced.length).toBeGreaterThan(0)
    for (const l of traced) {
      expect(l).not.toContain('Sony')
      expect(l).not.toContain('8.000.000')
      expect(l).not.toContain('rất đáng tiền')
    }
  })
})

describe('createLegacyStreamTrace', () => {
  it('writes nothing for a turn in which no stage changed the text', () => {
    const lines: string[] = []
    const t = createLegacyStreamTrace(l => lines.push(l))
    t.turn()
    expect(lines).toEqual([])
  })

  it('counts sentences and amounts without copying the text', () => {
    const lines: string[] = []
    const t = createLegacyStreamTrace(l => lines.push(l))
    t.stage('demo', 'Giá 8.000.000đ. Khác 3.000.000đ.', 'Giá 8.000.000đ.')
    t.turn()
    const [stage, turn] = lines.map(l => JSON.parse(l) as Record<string, unknown>)
    expect(stage).toMatchObject({ guard: 'legacy_stage', stage: 'demo', sentences_removed: 1, amounts_before: 2, amounts_after: 1, amount_removed: true })
    expect(turn).toMatchObject({ guard: 'legacy_turn', stages_changed: 1, chars_in: 32, chars_out: 15 })
    expect(lines.join('')).not.toContain('Giá')
  })
})
